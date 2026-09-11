-- Release foundation: age/guardian model, data minimisation, running summaries,
-- complete account deletion support and final Vision Lab shutdown.

-- This file is intentionally self-contained for the current Lovable Cloud
-- database. The 2026-08-19 exercise-replacement migration and the 2026-09-06
-- feedback repair were not applied there, so their safe/idempotent parts are
-- included below. One transaction prevents a partially upgraded schema.
begin;
set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Missing prerequisite: persistent exercise replacements
-- ---------------------------------------------------------------------------
alter table public.athlete_profiles
  add column if not exists unavailable_equipment_ids text[] not null default '{}';

create table if not exists public.exercise_replacements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  exercise_id text not null,
  original_json jsonb not null,
  replacement_json jsonb not null,
  equipment_ids text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists exercise_replacements_user_date_idx
  on public.exercise_replacements (user_id, date);

alter table public.exercise_replacements enable row level security;
drop policy if exists "Users manage their own exercise replacements"
  on public.exercise_replacements;
drop policy if exists "exercise_replacements_select_own"
  on public.exercise_replacements;
drop policy if exists "exercise_replacements_insert_own"
  on public.exercise_replacements;
drop policy if exists "exercise_replacements_update_own"
  on public.exercise_replacements;
drop policy if exists "exercise_replacements_delete_own"
  on public.exercise_replacements;

create policy "exercise_replacements_select_own"
  on public.exercise_replacements for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "exercise_replacements_insert_own"
  on public.exercise_replacements for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "exercise_replacements_update_own"
  on public.exercise_replacements for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "exercise_replacements_delete_own"
  on public.exercise_replacements for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.exercise_replacements from anon, authenticated;
grant select, insert, update, delete on public.exercise_replacements to authenticated;
grant all on public.exercise_replacements to service_role;

-- ---------------------------------------------------------------------------
-- Account ownership and age thresholds (13 / 16 / 18)
-- ---------------------------------------------------------------------------
alter table public.athlete_profiles
  add column if not exists account_owner_type text not null default 'athlete',
  add column if not exists subscription_payer_type text not null default 'self',
  add column if not exists guardian_name text,
  add column if not exists guardian_email text,
  add column if not exists guardian_verified_at timestamptz,
  add column if not exists guardian_consent_at timestamptz,
  add column if not exists ownership_transfer_status text not null default 'not_applicable',
  add column if not exists ownership_transfer_email text,
  add column if not exists ownership_transfer_requested_at timestamptz,
  add column if not exists ownership_transferred_at timestamptz,
  add column if not exists health_personalization_enabled boolean not null default false,
  add column if not exists field_mas_kmh numeric,
  add column if not exists field_mas_tested_at date,
  add column if not exists running_progression_level integer not null default 0,
  add column if not exists running_progression_updated_at timestamptz;

-- Honour the explicit health consent collected by the previous release.
update public.athlete_profiles athlete
   set health_personalization_enabled = true
 where (
   select consent.accepted
     from public.consent_logs consent
    where consent.user_id = athlete.user_id
      and consent.consent_type = 'health_data'
    order by consent.accepted_at desc, consent.id desc
    limit 1
 ) is true;

-- Existing test profiles that do not meet the new minimum-age/guardian rule
-- keep their data, but must not remain marked as fully onboarded. No account or
-- training history is deleted here.
update public.profiles profile
   set onboarding_completed = false
 where exists (
   select 1
     from public.athlete_profiles athlete
    where athlete.user_id = profile.user_id
      and (
        athlete.age < 13
        or (
          athlete.age between 13 and 15
          and (
            athlete.guardian_consent is not true
            or athlete.account_owner_type <> 'guardian'
            or athlete.guardian_name is null
            or athlete.guardian_email is null
            or athlete.guardian_verified_at is null
            or athlete.guardian_consent_at is null
          )
        )
      )
 );

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_account_owner_type_check,
  add constraint athlete_profiles_account_owner_type_check
    check (account_owner_type in ('athlete', 'guardian')),
  drop constraint if exists athlete_profiles_subscription_payer_type_check,
  add constraint athlete_profiles_subscription_payer_type_check
    check (subscription_payer_type in ('self', 'guardian')),
  drop constraint if exists athlete_profiles_ownership_transfer_status_check,
  add constraint athlete_profiles_ownership_transfer_status_check
    check (ownership_transfer_status in ('not_applicable', 'not_requested', 'pending', 'completed')),
  drop constraint if exists athlete_profiles_age_policy_check,
  add constraint athlete_profiles_age_policy_check
    check (
      age is null
      or age between 16 and 120
      or (
        age between 13 and 15
        and account_owner_type = 'guardian'
        and subscription_payer_type = 'guardian'
        and guardian_consent is true
        and guardian_name is not null
        and guardian_email is not null
        and guardian_verified_at is not null
        and guardian_consent_at is not null
      )
    ) not valid,
  drop constraint if exists athlete_profiles_minor_payer_check,
  add constraint athlete_profiles_minor_payer_check
    check (age is null or age >= 18 or subscription_payer_type = 'guardian') not valid,
  drop constraint if exists athlete_profiles_field_mas_check,
  add constraint athlete_profiles_field_mas_check
    check (field_mas_kmh is null or field_mas_kmh between 5 and 30),
  drop constraint if exists athlete_profiles_running_progression_check,
  add constraint athlete_profiles_running_progression_check
    check (running_progression_level between 0 and 3);

-- Keep the account role created from verified signup metadata. This does not
-- grant privileged application roles; it only describes who owns the account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case
      when new.raw_user_meta_data ->> 'account_owner_type' = 'guardian' then 'guardian'
      else 'athlete'
    end
  )
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        role = excluded.role;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Add the audit fields before installing the Auth trigger that writes them.
alter table public.consent_logs
  add column if not exists actor_type text not null default 'self',
  add column if not exists actor_email text,
  add column if not exists scope text,
  add column if not exists withdrawn_at timestamptz;

-- A 16–17-year-old can receive the existing account without moving any rows:
-- the guardian requests an Auth email change and confirmation of that new email
-- completes the handover while preserving auth.users.id.
create or replace function public.finalize_athlete_account_handover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer := 0;
begin
  if new.email is null or new.email is not distinct from old.email then
    return new;
  end if;

  update public.athlete_profiles
     set account_owner_type = 'athlete',
         subscription_payer_type = case when age >= 18 then 'self' else 'guardian' end,
         ownership_transfer_status = 'completed',
         ownership_transferred_at = now(),
         guardian_consent = true
   where user_id = new.id
     and age >= 16
     and ownership_transfer_status = 'pending'
     and lower(ownership_transfer_email) = lower(new.email);

  get diagnostics changed_rows = row_count;
  if changed_rows > 0 then
    update public.profiles
       set role = 'athlete',
           onboarding_completed = false
     where user_id = new.id;

    insert into public.consent_logs (
      user_id,
      consent_type,
      accepted,
      version,
      text_snapshot,
      actor_type,
      actor_email,
      scope
    ) values (
      new.id,
      'account_handover',
      true,
      '2.0',
      'Przekazanie konta zawodnikowi po potwierdzeniu nowego adresu e-mail.',
      'athlete',
      new.email,
      'account_ownership'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed_finalize_handover on auth.users;
create trigger on_auth_user_email_changed_finalize_handover
after update of email on auth.users
for each row execute function public.finalize_athlete_account_handover();

revoke execute on function public.finalize_athlete_account_handover() from public, anon, authenticated;
grant execute on function public.finalize_athlete_account_handover() to service_role;

-- ---------------------------------------------------------------------------
-- Auditable, separate consents
-- ---------------------------------------------------------------------------
alter table public.consent_logs
  drop constraint if exists consent_logs_actor_type_check,
  add constraint consent_logs_actor_type_check
    check (actor_type in ('self', 'guardian', 'athlete', 'system'));

create index if not exists consent_logs_user_type_time_idx
  on public.consent_logs (user_id, consent_type, accepted_at desc);

-- ---------------------------------------------------------------------------
-- Readiness/session schema repair (safe if the prior repair already ran)
-- ---------------------------------------------------------------------------
alter table public.readiness_logs
  add column if not exists pain_level integer,
  add column if not exists overall integer,
  add column if not exists updated_at timestamptz not null default now();

delete from public.readiness_logs newer
using public.readiness_logs older
where newer.user_id = older.user_id
  and newer.date = older.date
  and (newer.created_at, newer.id) < (older.created_at, older.id);

create unique index if not exists readiness_logs_user_date_key
  on public.readiness_logs (user_id, date);

alter table public.readiness_logs
  drop constraint if exists readiness_logs_pain_level_check,
  add constraint readiness_logs_pain_level_check
    check (pain_level is null or pain_level between 0 and 10),
  drop constraint if exists readiness_logs_overall_check,
  add constraint readiness_logs_overall_check
    check (overall is null or overall between 1 and 10);

alter table public.session_logs
  add column if not exists completion_status text not null default 'completed',
  add column if not exists duration_minutes integer,
  add column if not exists activity_type text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.session_logs
  drop constraint if exists session_logs_completion_status_check,
  add constraint session_logs_completion_status_check
    check (completion_status in ('completed', 'missed')),
  drop constraint if exists session_logs_duration_minutes_check,
  add constraint session_logs_duration_minutes_check
    check (duration_minutes is null or duration_minutes between 0 and 300),
  drop constraint if exists session_logs_activity_type_check,
  add constraint session_logs_activity_type_check
    check (activity_type is null or activity_type in ('technical', 'mixed', 'running_endurance'));

delete from public.pain_logs newer
using public.pain_logs older
where newer.user_id = older.user_id
  and newer.date = older.date
  and (newer.created_at, newer.id) < (older.created_at, older.id);

create unique index if not exists pain_logs_user_date_key
  on public.pain_logs (user_id, date);

-- ---------------------------------------------------------------------------
-- Running: store only the result needed by the user (distance, time, pace).
-- IDs/date and the test flag are operational metadata, not a GPS trace.
-- ---------------------------------------------------------------------------
create table if not exists public.running_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  date date not null,
  duration_sec integer not null,
  distance_m numeric not null,
  avg_pace_sec_per_km integer,
  is_field_mas_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint running_activities_duration_check check (duration_sec > 0),
  constraint running_activities_distance_check check (distance_m >= 0),
  constraint running_activities_pace_check check (
    avg_pace_sec_per_km is null or avg_pace_sec_per_km > 0
  )
);

alter table public.running_activities
  add column if not exists is_field_mas_test boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- An older preview could contain more than one row for a session. Keep the
-- newest result before enforcing the one-result-per-session invariant.
delete from public.running_activities older
using public.running_activities newer
where older.user_id = newer.user_id
  and older.session_id = newer.session_id
  and (older.updated_at, older.id) < (newer.updated_at, newer.id);

create unique index if not exists running_activities_user_session_key
  on public.running_activities (user_id, session_id);

-- Remove any route-level data left by an older unpublished schema.
alter table public.running_activities
  drop column if exists route_points,
  drop column if exists splits,
  drop column if exists interval_results,
  drop column if exists started_at,
  drop column if exists ended_at,
  drop column if exists source;

alter table public.running_activities enable row level security;
drop policy if exists "Users manage their own running activities" on public.running_activities;
drop policy if exists "own running_activities" on public.running_activities;
drop policy if exists "running_activities_select_own" on public.running_activities;
drop policy if exists "running_activities_insert_own" on public.running_activities;
drop policy if exists "running_activities_update_own" on public.running_activities;
drop policy if exists "running_activities_delete_own" on public.running_activities;

create policy "running_activities_select_own"
  on public.running_activities for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "running_activities_insert_own"
  on public.running_activities for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "running_activities_update_own"
  on public.running_activities for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "running_activities_delete_own"
  on public.running_activities for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.running_activities from anon, authenticated;
grant select, insert, update, delete on public.running_activities to authenticated;
grant all on public.running_activities to service_role;

drop trigger if exists trg_running_activities_updated on public.running_activities;
create trigger trg_running_activities_updated
before update on public.running_activities
for each row execute function public.update_updated_at_column();

-- Explicit Data API privileges for tables used by the repaired client.
revoke all on public.exercise_replacements from anon;
grant select, insert, update, delete on public.exercise_replacements to authenticated;
grant all on public.exercise_replacements to service_role;
revoke all on public.consent_logs from anon;
grant select, insert, update, delete on public.consent_logs to authenticated;
grant all on public.consent_logs to service_role;

-- ---------------------------------------------------------------------------
-- Vision Lab shutdown. Storage objects are intentionally NOT deleted with SQL;
-- scripts/remove-vision-lab.mjs removes them through the Storage API first.
-- ---------------------------------------------------------------------------
drop policy if exists "Vision videos are readable by owner" on storage.objects;
drop policy if exists "Vision videos are insertable by owner" on storage.objects;
drop policy if exists "Vision videos are updatable by owner" on storage.objects;
drop policy if exists "Vision videos are deletable by owner" on storage.objects;

update storage.buckets
   set public = false
 where id = 'vision-videos';

drop table if exists public.vision_tests cascade;

-- ---------------------------------------------------------------------------
-- Transactional verification. Any missing critical object aborts everything.
-- ---------------------------------------------------------------------------
do $$
declare
  missing_columns text;
  running_policy_count integer;
  replacement_policy_count integer;
begin
  if to_regclass('public.exercise_replacements') is null then
    raise exception 'Verification failed: exercise_replacements is missing';
  end if;
  if to_regclass('public.running_activities') is null then
    raise exception 'Verification failed: running_activities is missing';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ')
    into missing_columns
    from (values
      ('athlete_profiles', 'account_owner_type'),
      ('athlete_profiles', 'subscription_payer_type'),
      ('athlete_profiles', 'guardian_consent_at'),
      ('athlete_profiles', 'health_personalization_enabled'),
      ('athlete_profiles', 'unavailable_equipment_ids'),
      ('consent_logs', 'actor_type'),
      ('consent_logs', 'withdrawn_at'),
      ('readiness_logs', 'overall'),
      ('readiness_logs', 'pain_level'),
      ('session_logs', 'completion_status'),
      ('session_logs', 'activity_type'),
      ('running_activities', 'distance_m'),
      ('running_activities', 'duration_sec')
    ) as required(table_name, column_name)
   where not exists (
     select 1
       from information_schema.columns present
      where present.table_schema = 'public'
        and present.table_name = required.table_name
        and present.column_name = required.column_name
   );

  if missing_columns is not null then
    raise exception 'Verification failed, missing columns: %', missing_columns;
  end if;

  select count(*) into running_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'running_activities'
     and policyname in (
       'running_activities_select_own',
       'running_activities_insert_own',
       'running_activities_update_own',
       'running_activities_delete_own'
     );
  if running_policy_count <> 4 then
    raise exception 'Verification failed: expected 4 running policies, found %', running_policy_count;
  end if;

  select count(*) into replacement_policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'exercise_replacements'
     and policyname in (
       'exercise_replacements_select_own',
       'exercise_replacements_insert_own',
       'exercise_replacements_update_own',
       'exercise_replacements_delete_own'
     );
  if replacement_policy_count <> 4 then
    raise exception 'Verification failed: expected 4 replacement policies, found %', replacement_policy_count;
  end if;

  if to_regprocedure('public.finalize_athlete_account_handover()') is null then
    raise exception 'Verification failed: account handover function is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'on_auth_user_email_changed_finalize_handover'
       and not tgisinternal
  ) then
    raise exception 'Verification failed: account handover trigger is missing';
  end if;
end;
$$;

commit;

select
  'OK — fundament BallWise wdrożony'::text as status,
  19::integer as wymagane_tabele_obecne,
  (
    select count(*)::integer
      from public.athlete_profiles athlete
     where athlete.age < 13
        or (
          athlete.age between 13 and 15
          and (
            athlete.guardian_consent is not true
            or athlete.account_owner_type <> 'guardian'
            or athlete.guardian_name is null
            or athlete.guardian_email is null
            or athlete.guardian_verified_at is null
            or athlete.guardian_consent_at is null
          )
        )
  ) as profile_wymagajace_ponownego_onboardingu;
