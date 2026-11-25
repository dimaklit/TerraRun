-- Save the edited private activity and replace its public claim atomically.
create or replace function public.close_activity_loop(
  activity_key_to_close text,
  updated_route jsonb,
  updated_claim jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id text := auth.user_id();
  activity_time timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(updated_route) is distinct from 'object'
     or jsonb_typeof(updated_claim) is distinct from 'object'
     or updated_route ->> 'closedByUser' is distinct from 'true' then
    raise exception 'A closed route and territory claim are required' using errcode = '22023';
  end if;

  update public.private_activities
    set route = updated_route, claim = updated_claim
    where user_id = caller_id and activity_key = activity_key_to_close
    returning recorded_at into activity_time;
  if not found then
    raise exception 'Activity not found' using errcode = 'P0002';
  end if;

  insert into public.shared_claims (user_id, claim_key, claim, recorded_at)
    values (
      caller_id,
      activity_key_to_close,
      jsonb_build_object(
        'polygon', updated_claim -> 'polygon',
        'areaSqKm', updated_claim -> 'areaSqKm',
        'activityType', updated_claim -> 'activityType'
      ),
      activity_time
    )
    on conflict (user_id, claim_key) do update
      set claim = excluded.claim;
end;
$$;

revoke all on function public.close_activity_loop(text, jsonb, jsonb) from public;
grant execute on function public.close_activity_loop(text, jsonb, jsonb) to authenticated;
