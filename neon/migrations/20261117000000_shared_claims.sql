-- Anonymous shared territory claims: every player publishes claim polygons,
-- everyone can read them, but never the owner's identity.
create table if not exists public.shared_claims (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default auth.user_id(),
  claim_key text not null,
  claim jsonb not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint shared_claims_unique unique (user_id, claim_key),
  constraint shared_claims_claim_object check (jsonb_typeof(claim) = 'object')
);

alter table public.shared_claims enable row level security;
grant insert (claim_key, claim, recorded_at) on public.shared_claims to authenticated;

drop policy if exists shared_claims_insert_own on public.shared_claims;
create policy shared_claims_insert_own
  on public.shared_claims for insert to authenticated
  with check (auth.user_id() = user_id);

-- No select grant on the table itself: reads go through the anonymized view.
-- owner_token lets the combat model tell rivals apart without exposing identity.
create or replace view public.shared_claims_feed with (security_invoker = false) as
  select id,
         md5(user_id) as owner_token,
         (user_id = auth.user_id()) as mine,
         claim,
         recorded_at
  from public.shared_claims;
grant select on public.shared_claims_feed to authenticated;
