-- Release blockers: trusted guardian evidence, consent-gated health mode and
-- an explicit lifecycle for scheduled matches.

alter table public.session_logs
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

alter table public.session_logs
  drop constraint if exists session_logs_completion_status_check,
  add constraint session_logs_completion_status_check
    check (completion_status in ('started', 'completed', 'missed')),
  drop constraint if exists session_logs_lifecycle_check,
  add constraint session_logs_lifecycle_check check (
    (completion_status = 'started' and completed is false and started_at is not null and ended_at is null)
    or (completion_status = 'completed' and completed is true and ended_at is not null)
    or (completion_status = 'missed' and completed is false)
  ) not valid;

create or replace function public.sanitize_session_log_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return new;
  end if;

  new.user_id := current_user_id;
  new.updated_at := now();

  if new.completion_status = 'started' then
    new.completed := false;
    new.started_at := case
      when tg_op = 'UPDATE' then coalesce(old.started_at, now())
      else now()
    end;
    new.ended_at := null;
  elsif new.completion_status = 'completed' then
    new.completed := true;
    new.started_at := case
      when tg_op = 'UPDATE' then coalesce(old.started_at, now())
      else coalesce(new.started_at, now())
    end;
    new.ended_at := now();
  else
    new.completed := false;
    new.started_at := case when tg_op = 'UPDATE' then old.started_at else null end;
    new.ended_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.sanitize_session_log_lifecycle()
  from public, anon, authenticated;
grant execute on function public.sanitize_session_log_lifecycle()
  to service_role;

drop trigger if exists session_logs_sanitize_lifecycle on public.session_logs;
create trigger session_logs_sanitize_lifecycle
before insert or update on public.session_logs
for each row execute function public.sanitize_session_log_lifecycle();

create or replace function public.enforce_trusted_athlete_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  trusted_email text;
  trusted_email_confirmed_at timestamptz;
  trusted_birth_date date;
  trusted_age integer;
  latest_health_consent boolean;
begin
  -- Admin/service operations are used by migrations and account handover.
  if current_user_id is null then
    return new;
  end if;

  new.user_id := current_user_id;

  select email, email_confirmed_at
    into trusted_email, trusted_email_confirmed_at
    from auth.users
   where id = current_user_id;

  select birth_date
    into trusted_birth_date
    from public.profiles
   where user_id = current_user_id;

  if trusted_birth_date is not null then
    trusted_age := extract(year from age(current_date, trusted_birth_date))::integer;
    new.age := trusted_age;
  else
    trusted_age := new.age;
  end if;

  if trusted_age is null or trusted_age < 13 then
    raise exception 'A saved athlete profile requires age 13 or older';
  end if;

  if trusted_age >= 18 then
    new.account_owner_type := 'athlete';
    new.subscription_payer_type := 'self';
    new.guardian_name := null;
    new.guardian_email := null;
    new.guardian_verified_at := null;
    new.guardian_consent_at := null;
  elsif trusted_age < 16 then
    if new.account_owner_type <> 'guardian'
       or coalesce(length(btrim(new.guardian_name)), 0) < 2
       or new.guardian_consent is not true
       or trusted_email is null
       or trusted_email_confirmed_at is null then
      raise exception 'Ages 13-15 require a verified guardian-owned account and guardian declaration';
    end if;
    new.subscription_payer_type := 'guardian';
    new.guardian_email := trusted_email;
    new.guardian_verified_at := trusted_email_confirmed_at;
    new.guardian_consent_at := case
      when tg_op = 'UPDATE' and old.guardian_consent is true and old.guardian_consent_at is not null
        then old.guardian_consent_at
      else now()
    end;
  else
    new.subscription_payer_type := 'guardian';
    if new.account_owner_type = 'guardian' then
      if coalesce(length(btrim(new.guardian_name)), 0) < 2
         or new.guardian_consent is not true
         or trusted_email is null
         or trusted_email_confirmed_at is null then
        raise exception 'A guardian-owned account requires verified guardian email and declaration';
      end if;
      new.guardian_email := trusted_email;
      new.guardian_verified_at := trusted_email_confirmed_at;
      new.guardian_consent_at := case
        when tg_op = 'UPDATE' and old.guardian_consent is true and old.guardian_consent_at is not null
          then old.guardian_consent_at
        else now()
      end;
    else
      new.guardian_name := null;
      new.guardian_email := null;
      new.guardian_verified_at := null;
      new.guardian_consent_at := null;
    end if;
  end if;

  if new.health_personalization_enabled is true then
    select accepted
      into latest_health_consent
      from public.consent_logs
     where user_id = current_user_id
       and consent_type = 'health_data'
     order by accepted_at desc, id desc
     limit 1;

    if latest_health_consent is distinct from true then
      raise exception 'Health personalization requires an active health-data consent record';
    end if;
  else
    new.pain_injury := false;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_trusted_athlete_profile_fields()
  from public, anon, authenticated;
grant execute on function public.enforce_trusted_athlete_profile_fields()
  to service_role;

drop trigger if exists athlete_profiles_enforce_trusted_fields on public.athlete_profiles;
create trigger athlete_profiles_enforce_trusted_fields
before insert or update on public.athlete_profiles
for each row execute function public.enforce_trusted_athlete_profile_fields();

-- Browser clients must not be able to rewrite audit history even through a
-- future broad table grant.
revoke update, delete, truncate on public.consent_logs from anon, authenticated;
