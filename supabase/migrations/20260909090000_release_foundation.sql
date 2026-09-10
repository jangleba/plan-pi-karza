-- Release foundation: age/guardian model, data minimisation, running summaries,
-- complete account deletion support and final Vision Lab shutdown.

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
      or age < 13
      or age >= 16
      or (
        account_owner_type = 'guardian'
        and guardian_name is not null
        and guardian_email is not null
        and guardian_verified_at is not null
        and guardian_consent_at is not null
      )
    ) not valid,
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

alter table public.session_logs
  add column if not exists completion_status text not null default 'completed',
  add column if not exists duration_minutes integer,
  add column if not exists activity_type text,
  add column if not exists updated_at timestamptz not null default now();

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
  constraint running_activities_duration_check check (duration_sec >= 0),
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

revoke all on public.running_activities from anon;
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
