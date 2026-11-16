-- Written by the Garmin worker with the owner connection; never exposed to the browser roles.
create table if not exists public.garmin_connections (
  user_id text primary key,
  garmin_user_id text not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.garmin_connections enable row level security;

create table if not exists public.external_activities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null,
  external_id text not null,
  name text not null,
  geojson jsonb not null,
  recorded_at timestamptz not null,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  constraint external_activities_unique unique (user_id, provider, external_id),
  constraint external_activities_geojson_object check (jsonb_typeof(geojson) = 'object')
);

alter table public.external_activities enable row level security;
grant select on public.external_activities to authenticated;
grant update (imported_at) on public.external_activities to authenticated;

drop policy if exists external_activities_select_own on public.external_activities;
create policy external_activities_select_own
  on public.external_activities for select to authenticated
  using (auth.user_id() = user_id);

drop policy if exists external_activities_mark_imported on public.external_activities;
create policy external_activities_mark_imported
  on public.external_activities for update to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

-- The client only needs to know whether Garmin is linked, not the tokens.
create or replace view public.garmin_link_status with (security_invoker = false) as
  select user_id, created_at from public.garmin_connections where user_id = auth.user_id();
grant select on public.garmin_link_status to authenticated;
