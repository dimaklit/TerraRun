create table if not exists public.private_activities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default auth.user_id(),
  activity_key text not null,
  route jsonb not null,
  claim jsonb,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint private_activities_unique_activity unique (user_id, activity_key),
  constraint private_activities_route_object check (jsonb_typeof(route) = 'object'),
  constraint private_activities_claim_object check (claim is null or jsonb_typeof(claim) = 'object')
);

alter table public.private_activities enable row level security;
grant usage on schema public to authenticated;
grant select, insert on public.private_activities to authenticated;

drop policy if exists private_activities_select_own on public.private_activities;
create policy private_activities_select_own
  on public.private_activities for select to authenticated
  using (auth.user_id() = user_id);

drop policy if exists private_activities_insert_own on public.private_activities;
create policy private_activities_insert_own
  on public.private_activities for insert to authenticated
  with check (auth.user_id() = user_id);
