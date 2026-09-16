-- BallWise: authenticated AI scanner, per-user quota and health-note minimisation.
-- Run only after migrations through 20260916190000 have succeeded.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.fuel_photo_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket_start)
);

revoke all on private.fuel_photo_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on private.fuel_photo_rate_limits to service_role;

create or replace function public.consume_fuel_photo_quota(p_user_id uuid)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_bucket timestamptz := date_bin(
    interval '10 minutes',
    clock_timestamp(),
    timestamptz '2001-01-01 00:00:00+00'
  );
  request_total integer;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  -- Keep only short-lived quota metadata. No image, prompt or health content is stored.
  delete from private.fuel_photo_rate_limits
   where user_id = p_user_id
     and bucket_start < current_bucket - interval '24 hours';

  insert into private.fuel_photo_rate_limits (
    user_id,
    bucket_start,
    request_count,
    updated_at
  ) values (
    p_user_id,
    current_bucket,
    1,
    now()
  )
  on conflict (user_id, bucket_start)
  do update set
    request_count = private.fuel_photo_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into request_total;

  allowed := request_total <= 8;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (current_bucket + interval '10 minutes' - clock_timestamp())))::integer
    )
  end;
  return next;
end;
$$;

revoke execute on function public.consume_fuel_photo_quota(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_fuel_photo_quota(uuid)
  to service_role;

comment on function public.consume_fuel_photo_quota(uuid) is
  'Service-role-only quota: 8 meal-photo analyses per authenticated user per 10 minutes.';

create or replace function public.enforce_session_notes_health_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  -- Trusted maintenance and migrations have no end-user JWT.
  if current_user_id is null then
    return new;
  end if;

  new.user_id := current_user_id;
  if public.latest_consent_is_accepted(current_user_id, 'health_data') is not true then
    new.notes := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_session_notes_health_consent()
  from public, anon, authenticated;
grant execute on function public.enforce_session_notes_health_consent()
  to service_role;

drop trigger if exists session_logs_require_health_consent_for_notes
  on public.session_logs;
create trigger session_logs_require_health_consent_for_notes
before insert or update on public.session_logs
for each row execute function public.enforce_session_notes_health_consent();

create or replace function public.clear_session_notes_after_health_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.consent_type = 'health_data' and new.accepted is false then
    update public.session_logs
       set notes = null,
           updated_at = now()
     where user_id = new.user_id
       and notes is not null;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_session_notes_after_health_withdrawal()
  from public, anon, authenticated;
grant execute on function public.clear_session_notes_after_health_withdrawal()
  to service_role;

drop trigger if exists consent_logs_clear_notes_after_health_withdrawal
  on public.consent_logs;
create trigger consent_logs_clear_notes_after_health_withdrawal
after insert on public.consent_logs
for each row execute function public.clear_session_notes_after_health_withdrawal();

-- Existing free-text notes are treated as potentially health-related. Keep them
-- only where the latest health consent is active.
update public.session_logs sl
   set notes = null,
       updated_at = now()
 where notes is not null
   and public.latest_consent_is_accepted(sl.user_id, 'health_data') is not true;

commit;
