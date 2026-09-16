-- Forward-only repair after 20260916180000_privacy_consent_enforcement.sql.
-- Safe to run more than once. The transaction rolls back the whole repair on error.

begin;

-- The application and generated Supabase types already use this field, but the
-- production database may not contain it when older migrations were uploaded
-- to GitHub without being executed against Lovable Cloud.
alter table public.athlete_profiles
  add column if not exists fuel_precision_enabled boolean not null default false;

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_fuel_weight_range_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_fuel_weight_range_check
  check (
    fuel_precision_enabled is false
    or (
      fuel_precision_enabled is true
      and weight_optional between 25 and 250
    )
  ) not valid;

-- Keep body mass only while Fuel Precision is active and backed by the latest
-- accepted consent record.
create or replace function public.enforce_fuel_precision_consent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  latest_fuel_consent boolean;
begin
  -- Trusted migrations and server-side maintenance do not carry a user JWT.
  if current_user_id is null then
    return new;
  end if;

  new.user_id := current_user_id;

  if new.fuel_precision_enabled is true then
    select accepted
      into latest_fuel_consent
      from public.consent_logs
     where user_id = current_user_id
       and consent_type = 'fuel_precision'
     order by accepted_at desc, id desc
     limit 1;

    if latest_fuel_consent is distinct from true then
      raise exception 'Fuel Precision requires an active consent record';
    end if;
  else
    new.weight_optional := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_fuel_precision_consent()
  from public, anon;
grant execute on function public.enforce_fuel_precision_consent()
  to authenticated, service_role;

drop trigger if exists athlete_profiles_enforce_fuel_precision
  on public.athlete_profiles;
create trigger athlete_profiles_enforce_fuel_precision
before insert or update on public.athlete_profiles
for each row execute function public.enforce_fuel_precision_consent();

comment on column public.athlete_profiles.fuel_precision_enabled is
  'Separate opt-in for pre-session fuel ranges based on age and optional body mass.';

-- Repair JSONB checks. food_allergies and food_intolerances are JSONB, not
-- native PostgreSQL arrays, so cardinality(jsonb) must not be used.
create or replace function public.enforce_optional_health_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  health_allowed boolean;
  fuel_precision_allowed boolean;
  allergies_present boolean;
  intolerances_present boolean;
begin
  if current_user_id is null then
    return new;
  end if;

  new.user_id := current_user_id;
  health_allowed := public.latest_consent_is_accepted(current_user_id, 'health_data');
  fuel_precision_allowed := public.latest_consent_is_accepted(current_user_id, 'fuel_precision');

  allergies_present := coalesce(new.food_allergies, '[]'::jsonb)
    not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb);
  intolerances_present := coalesce(new.food_intolerances, '[]'::jsonb)
    not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb);

  if health_allowed is not true then
    if new.health_personalization_enabled is true
       or new.pain_injury is true
       or coalesce(new.fuel_allergy_status, 'unconfirmed') <> 'unconfirmed'
       or allergies_present
       or intolerances_present then
      raise exception 'Health profile fields require active health-data consent';
    end if;
  end if;

  if fuel_precision_allowed is not true
     and (new.fuel_precision_enabled is true or new.weight_optional is not null) then
    raise exception 'Fuel Precision fields require active Fuel Precision consent';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_optional_health_profile_fields()
  from public, anon, authenticated;
grant execute on function public.enforce_optional_health_profile_fields()
  to service_role;

-- Preserve JSON array shape when health consent is withdrawn.
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
    'readiness_and_fuel_safety', now()
  );

  update public.athlete_profiles
     set health_personalization_enabled = false,
         pain_injury = false,
         fuel_allergy_status = 'unconfirmed',
         food_allergies = '[]'::jsonb,
         food_intolerances = '[]'::jsonb
   where user_id = current_user_id;

  delete from public.readiness_logs where user_id = current_user_id;
  delete from public.pain_logs where user_id = current_user_id;

  update public.onboarding_answers
     set answers_json = answers_json - array[
       'healthPersonalizationEnabled',
       'painInjury',
       'painLocations',
       'fuelAllergyStatus',
       'foodAllergies',
       'foodIntolerances'
     ]::text[]
   where user_id = current_user_id;

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

alter table public.athlete_profiles
  validate constraint athlete_profiles_fuel_weight_range_check;

commit;
