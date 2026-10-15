begin;

create schema if not exists private;
grant usage on schema private to service_role;

create table if not exists private.training_coach_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('short', 'day')),
  bucket_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, scope, bucket_start)
);
alter table private.training_coach_rate_limits enable row level security;
revoke all on private.training_coach_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on private.training_coach_rate_limits to service_role;

-- Only the authenticated endpoint, using its private service role key, may consume quota.
-- No prompts, answers, audio, video or health information are stored here.
create or replace function public.consume_training_coach_quota(p_user_id uuid)
returns table (allowed boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  instant timestamptz := clock_timestamp();
  short_start timestamptz := date_bin(interval '10 minutes', instant, timestamptz '2001-01-01 00:00:00+00');
  day_start timestamptz := date_trunc('day', instant at time zone 'UTC') at time zone 'UTC';
  short_count integer;
  day_count integer;
begin
  if p_user_id is null then raise exception 'User id is required'; end if;
  delete from private.training_coach_rate_limits
    where user_id = p_user_id and bucket_start < day_start - interval '2 days';
  insert into private.training_coach_rate_limits values (p_user_id, 'short', short_start, 1)
  on conflict (user_id, scope, bucket_start) do update
    set request_count = least(private.training_coach_rate_limits.request_count + 1, 9)
  returning request_count into short_count;
  insert into private.training_coach_rate_limits values (p_user_id, 'day', day_start, 1)
  on conflict (user_id, scope, bucket_start) do update
    set request_count = least(private.training_coach_rate_limits.request_count + 1, 31)
  returning request_count into day_count;
  allowed := short_count <= 8 and day_count <= 30;
  return next;
end;
$$;

revoke all on function public.consume_training_coach_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_training_coach_quota(uuid) to service_role;
comment on function public.consume_training_coach_quota(uuid) is
  'Service-role-only quota: 8 requests per 10 minutes and 30 per UTC day per user. Stores counters only.';

commit;
