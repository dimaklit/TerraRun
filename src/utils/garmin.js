const workerUrl = (import.meta.env.VITE_GARMIN_WORKER_URL ?? '').replace(/\/$/, '');
const neonBaseUrl = import.meta.env.VITE_NEON_DATABASE_URL ?? '';

export const garminEnabled = Boolean(workerUrl && neonBaseUrl);

// Mirrors how @neon/neon-js derives the auth host from the base URL.
function authTokenUrl() {
  const url = new URL(neonBaseUrl);
  const [first, ...rest] = url.hostname.split('.');
  return `${url.protocol}//${[first, 'neonauth', ...rest].join('.')}${url.pathname}/auth/token`;
}

async function getJwt() {
  const response = await fetch(authTokenUrl(), { credentials: 'include' });
  const { token } = response.ok ? await response.json() : {};
  if (!token) throw new Error('You are signed out.');
  return token;
}

async function workerFetch(client, path, init = {}) {
  const token = await getJwt();
  const response = await fetch(`${workerUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Garmin service error (${response.status}).`);
  return response.json();
}

export async function startGarminConnect(client) {
  const { url } = await workerFetch(client, '/garmin/connect', { method: 'POST' });
  window.location.assign(url);
}

export function disconnectGarmin(client) {
  return workerFetch(client, '/garmin/connection', { method: 'DELETE' });
}

export async function isGarminLinked(client) {
  const { data, error } = await client.from('garmin_link_status').select('user_id').limit(1);
  if (error) throw error;
  return data.length > 0;
}

export async function loadPendingExternalActivities(client, userId) {
  const { data, error } = await client.from('external_activities')
    .select('id, name, geojson')
    .eq('user_id', userId)
    .is('imported_at', null)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function markExternalActivitiesImported(client, userId, ids) {
  if (!ids.length) return;
  const { error } = await client.from('external_activities')
    .update({ imported_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', ids);
  if (error) throw error;
}

export function activityToFile(activity) {
  return new File([JSON.stringify(activity.geojson)], `${activity.name}.geojson`, { type: 'application/geo+json' });
}
