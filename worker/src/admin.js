import { neon } from '@neondatabase/serverless';

async function sendEmail(env, subject, html) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) {
    console.log('Email skipped (RESEND_API_KEY or NOTIFY_EMAIL not set):', subject);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'TerraRun <onboarding@resend.dev>',
      to: [env.NOTIFY_EMAIL],
      subject,
      html,
    }),
  });
  if (!response.ok) throw new Error(`Resend failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
}

export async function notifyNewUsers(env) {
  const sql = neon(env.DATABASE_URL);
  await sql`create table if not exists public.admin_state (key text primary key, value text not null)`;
  const [state] = await sql`select value from public.admin_state where key = 'last_user_notified_at'`;
  const since = state?.value ?? new Date(Date.now() - 24 * 3600_000).toISOString();
  const users = await sql`
    select email, name, "createdAt" from neon_auth."user"
    where "createdAt" > ${since} order by "createdAt"`;
  if (!users.length) return 0;
  const rows = users.map((user) =>
    `<tr><td style="padding:4px 12px">${user.name ?? ''}</td><td style="padding:4px 12px">${user.email}</td><td style="padding:4px 12px">${new Date(user.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC</td></tr>`).join('');
  await sendEmail(env, `TerraRun: ${users.length} new ${users.length === 1 ? 'user' : 'users'}`, `
    <h2>New TerraRun ${users.length === 1 ? 'signup' : 'signups'} 🎉</h2>
    <table border="0" style="border-collapse:collapse;font-family:sans-serif">
      <tr><th style="padding:4px 12px;text-align:left">Nickname</th><th style="padding:4px 12px;text-align:left">Email</th><th style="padding:4px 12px;text-align:left">Joined</th></tr>
      ${rows}
    </table>`);
  const latest = users[users.length - 1].createdAt;
  await sql`
    insert into public.admin_state (key, value) values ('last_user_notified_at', ${new Date(latest).toISOString()})
    on conflict (key) do update set value = excluded.value`;
  return users.length;
}

export async function sendDailyStats(env) {
  const sql = neon(env.DATABASE_URL);
  const [stats] = await sql`select
    (select count(*) from neon_auth."user") as users,
    (select count(*) from neon_auth."user" where "createdAt" > now() - interval '24 hours') as users_24h,
    (select count(*) from public.private_activities) as activities,
    (select count(*) from public.private_activities where created_at > now() - interval '24 hours') as activities_24h,
    (select count(*) from public.shared_claims) as shared_claims,
    (select count(*) from public.garmin_connections) as garmin_links,
    (select count(*) from public.external_activities where created_at > now() - interval '24 hours') as garmin_activities_24h,
    (select coalesce(round(sum((claim->>'areaSqKm')::numeric), 3), 0) from public.shared_claims) as total_area`;
  const line = (label, value) => `<tr><td style="padding:4px 12px">${label}</td><td style="padding:4px 12px;text-align:right"><b>${value}</b></td></tr>`;
  await sendEmail(env, `TerraRun daily stats: ${stats.users} users, ${stats.activities} activities`, `
    <h2>TerraRun — daily report 📊</h2>
    <table border="0" style="border-collapse:collapse;font-family:sans-serif">
      ${line('Users (total)', stats.users)}
      ${line('New users (24h)', stats.users_24h)}
      ${line('Activities (total)', stats.activities)}
      ${line('Activities imported (24h)', stats.activities_24h)}
      ${line('Garmin activities received (24h)', stats.garmin_activities_24h)}
      ${line('Garmin accounts linked', stats.garmin_links)}
      ${line('Shared territory claims', stats.shared_claims)}
      ${line('Total claimed area (km²)', stats.total_area)}
    </table>`);
}
