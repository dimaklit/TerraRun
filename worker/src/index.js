import { createRemoteJWKSet, jwtVerify } from 'jose';
import { neon } from '@neondatabase/serverless';
import FitParser from 'fit-file-parser';
import { createPkcePair, openState, sealState } from './state.js';
import { recordsToFeature } from './fit.js';

const GARMIN_AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm';
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const GARMIN_USER_ID_URL = 'https://apis.garmin.com/wellness-api/rest/user/id';

let jwks;

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin');
  const allowed = origin && origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    Vary: 'Origin',
  };
}

function json(env, request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, request) },
  });
}

async function authenticate(env, request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Response('Unauthorized', { status: 401 });
  jwks ??= createRemoteJWKSet(new URL(env.NEON_AUTH_JWKS_URL));
  try {
    const { payload } = await jwtVerify(token, jwks);
    if (!payload.sub) throw new Error('No subject');
    return payload.sub;
  } catch {
    throw new Response('Unauthorized', { status: 401 });
  }
}

async function requestToken(env, params) {
  const response = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GARMIN_CLIENT_ID, client_secret: env.GARMIN_CLIENT_SECRET, ...params }),
  });
  if (!response.ok) throw new Error(`Garmin token request failed (${response.status}).`);
  return response.json();
}

async function saveConnection(sql, userId, garminUserId, token) {
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString();
  await sql`
    insert into public.garmin_connections (user_id, garmin_user_id, access_token, refresh_token, expires_at)
    values (${userId}, ${garminUserId}, ${token.access_token}, ${token.refresh_token}, ${expiresAt})
    on conflict (user_id) do update set garmin_user_id = excluded.garmin_user_id,
      access_token = excluded.access_token, refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at, updated_at = now()`;
}

async function getAccessToken(env, sql, connection) {
  if (Date.parse(connection.expires_at) - Date.now() > 60_000) return connection.access_token;
  const token = await requestToken(env, { grant_type: 'refresh_token', refresh_token: connection.refresh_token });
  await saveConnection(sql, connection.user_id, connection.garmin_user_id, token);
  return token.access_token;
}

async function startConnect(env, request) {
  const userId = await authenticate(env, request);
  const { verifier, challenge } = await createPkcePair();
  const state = await sealState({ userId, verifier }, env.STATE_SECRET);
  const url = new URL(GARMIN_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.GARMIN_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/garmin/callback`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return json(env, request, { url: url.toString() });
}

async function finishConnect(env, request) {
  const params = new URL(request.url).searchParams;
  const back = (status) => Response.redirect(`${env.SITE_URL}?garmin=${status}`, 302);
  try {
    const { userId, verifier } = await openState(params.get('state'), env.STATE_SECRET);
    if (!params.get('code')) return back('denied');
    const token = await requestToken(env, {
      grant_type: 'authorization_code',
      code: params.get('code'),
      code_verifier: verifier,
      redirect_uri: `${env.WORKER_URL}/garmin/callback`,
    });
    const idResponse = await fetch(GARMIN_USER_ID_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!idResponse.ok) throw new Error('Unable to read the Garmin user id.');
    const { userId: garminUserId } = await idResponse.json();
    await saveConnection(neon(env.DATABASE_URL), userId, String(garminUserId), token);
    return back('connected');
  } catch (error) {
    console.error('Garmin callback failed', error);
    return back('error');
  }
}

async function importActivityFile(env, sql, file) {
  if (file.fileType && file.fileType !== 'FIT') return;
  const [connection] = await sql`select * from public.garmin_connections where garmin_user_id = ${String(file.userId)}`;
  if (!connection) return;
  const accessToken = await getAccessToken(env, sql, connection);
  const response = await fetch(file.callbackURL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Garmin file download failed (${response.status}).`);
  const data = await new FitParser({ force: true }).parseAsync(await response.arrayBuffer());
  const startedAt = new Date((file.startTimeInSeconds ?? Date.now() / 1000) * 1000);
  const name = `Garmin ${startedAt.toISOString().slice(0, 16).replace('T', ' ')}`;
  const geojson = recordsToFeature(data.records ?? [], name);
  if (!geojson) return;
  const externalId = String(file.summaryId ?? file.activityId);
  await sql`
    insert into public.external_activities (user_id, provider, external_id, name, geojson, recorded_at)
    values (${connection.user_id}, 'garmin', ${externalId}, ${name}, ${JSON.stringify(geojson)}::jsonb, ${startedAt.toISOString()})
    on conflict (user_id, provider, external_id) do nothing`;
}

function webhookAuthorized(env, request, pathname, prefix) {
  const fromPath = pathname.startsWith(`${prefix}/`) ? decodeURIComponent(pathname.slice(prefix.length + 1)) : null;
  const key = fromPath ?? new URL(request.url).searchParams.get('key');
  return key === env.WEBHOOK_SECRET;
}

async function handleWebhook(env, request, ctx, pathname) {
  if (!webhookAuthorized(env, request, pathname, '/garmin/webhook')) return new Response('Forbidden', { status: 403 });
  const body = await request.json().catch(() => ({}));
  const sql = neon(env.DATABASE_URL);
  // Garmin expects a fast 200; downloads continue after the response.
  ctx.waitUntil(Promise.all((body.activityFiles ?? []).map((file) =>
    importActivityFile(env, sql, file).catch((error) => console.error('Garmin import failed', error)))));
  return new Response('OK');
}

async function handleDeregistration(env, request, pathname) {
  if (!webhookAuthorized(env, request, pathname, '/garmin/deregister')) return new Response('Forbidden', { status: 403 });
  const body = await request.json().catch(() => ({}));
  const sql = neon(env.DATABASE_URL);
  for (const item of body.deregistrations ?? []) {
    await sql`delete from public.garmin_connections where garmin_user_id = ${String(item.userId)}`;
  }
  return new Response('OK');
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    try {
      if (pathname === '/garmin/connect' && request.method === 'POST') return await startConnect(env, request);
      if (pathname === '/garmin/callback' && request.method === 'GET') return await finishConnect(env, request);
      if ((pathname === '/garmin/webhook' || pathname.startsWith('/garmin/webhook/')) && request.method === 'POST') return await handleWebhook(env, request, ctx, pathname);
      if ((pathname === '/garmin/deregister' || pathname.startsWith('/garmin/deregister/')) && request.method === 'POST') return await handleDeregistration(env, request, pathname);
      if (pathname === '/garmin/connection' && request.method === 'DELETE') {
        const userId = await authenticate(env, request);
        await neon(env.DATABASE_URL)`delete from public.garmin_connections where user_id = ${userId}`;
        return json(env, request, { ok: true });
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(error);
      return json(env, request, { error: 'Internal error' }, 500);
    }
  },
};
