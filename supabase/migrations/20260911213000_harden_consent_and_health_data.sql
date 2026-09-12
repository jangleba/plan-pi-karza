-- Consent history is append-only for the browser client. Health-consent
-- withdrawal is one atomic server-side operation, including legacy monitoring
-- values embedded in session notes.

revoke update, delete on public.consent_logs from authenticated;
grant select, insert on public.consent_logs to authenticated;

drop policy if exists "own consent_logs" on public.consent_logs;
drop policy if exists "consent_logs_select_own" on public.consent_logs;
drop policy if exists "consent_logs_insert_own" on public.consent_logs;

create policy "consent_logs_select_own"
on public.consent_logs
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "consent_logs_insert_own"
on public.consent_logs
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create or replace function public.sanitize_client_consent_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  trusted_actor_type text;
begin
  -- Server-side jobs and Auth triggers keep their explicitly supplied audit
  -- metadata. Browser writes are bound to the current authenticated user.
  if current_user_id is null then
    return new;
  end if;

  select case
           when account_owner_type = 'guardian' then 'guardian'
           else 'athlete'
         end
    into trusted_actor_type
   from public.athlete_profiles
   where user_id = current_user_id;

  if trusted_actor_type is null then
    trusted_actor_type := case
      when auth.jwt() -> 'user_metadata' ->> 'account_owner_type' = 'guardian' then 'guardian'
      else 'athlete'
    end;
  end if;

  new.user_id := current_user_id;
  new.accepted_at := now();
  new.actor_type := trusted_actor_type;
  new.actor_email := auth.jwt() ->> 'email';
  new.withdrawn_at := case when new.accepted then null else now() end;
  return new;
end;
$$;

revoke execute on function public.sanitize_client_consent_log()
  from public, anon, authenticated;
grant execute on function public.sanitize_client_consent_log()
  to service_role;

drop trigger if exists consent_logs_sanitize_client_write on public.consent_logs;
create trigger consent_logs_sanitize_client_write
before insert on public.consent_logs
for each row execute function public.sanitize_client_consent_log();

create or replace function public.withdraw_health_data_consent(
  p_version text,
  p_text_snapshot text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_actor_type text;
  current_actor_email text := auth.jwt() ->> 'email';
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select case
           when account_owner_type = 'guardian' then 'guardian'
           else 'athlete'
         end
    into current_actor_type
    from public.athlete_profiles
   where user_id = current_user_id;

  insert into public.consent_logs (
    user_id, consent_type, accepted, version, text_snapshot,
    actor_type, actor_email, scope, withdrawn_at
  ) values (
    current_user_id, 'health_data', false, p_version, p_text_snapshot,
    coalesce(current_actor_type, 'self'), current_actor_email,
    'readiness_personalization', now()
  );

  update public.athlete_profiles
     set health_personalization_enabled = false,
         pain_injury = false
   where user_id = current_user_id;

  delete from public.readiness_logs where user_id = current_user_id;
  delete from public.pain_logs where user_id = current_user_id;

  update public.session_logs
     set notes = nullif(
       btrim(
         regexp_replace(
           coalesce(notes, ''),
           E'^\\[Monitoring\\]\\s*pain=[0-9]+;\\s*legFatigue=[0-9]+\\n?',
           '',
           'i'
         )
       ),
       ''
     )
   where user_id = current_user_id
     and notes ~* E'^\\[Monitoring\\]';
end;
$$;

revoke execute on function public.withdraw_health_data_consent(text, text)
  from public, anon;
grant execute on function public.withdraw_health_data_consent(text, text)
  to authenticated, service_role;

-- New adult writes must be self-owned. Existing historical rows can be
-- migrated through the account-handover flow without blocking this release.
alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_adult_owner_check;
alter table public.athlete_profiles
  add constraint athlete_profiles_adult_owner_check
  check (
    age < 18
    or (
      account_owner_type = 'athlete'
      and subscription_payer_type = 'self'
    )
  ) not valid;
