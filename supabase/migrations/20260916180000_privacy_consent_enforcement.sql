-- BallWise privacy hardening.
-- Apply first on a staging database. This migration does not delete accounts,
-- plans or training history. It removes health-category fields only when a user
-- explicitly withdraws the health-data consent.

create index if not exists consent_logs_latest_lookup_idx
  on public.consent_logs (user_id, consent_type, accepted_at desc, id desc);

create or replace function public.latest_consent_is_accepted(
  p_user_id uuid,
  p_consent_type text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select accepted
      from public.consent_logs
      where user_id = p_user_id
        and consent_type = p_consent_type
      order by accepted_at desc, id desc
      limit 1
    ),
    false
  );
$$;

revoke execute on function public.latest_consent_is_accepted(uuid, text)
  from public, anon, authenticated;
grant execute on function public.latest_consent_is_accepted(uuid, text)
  to service_role;

create or replace function public.enforce_health_consent_for_logs()
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

  if public.latest_consent_is_accepted(current_user_id, 'health_data') is not true then
    raise exception 'Active health-data consent is required';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_health_consent_for_logs()
  from public, anon, authenticated;
grant execute on function public.enforce_health_consent_for_logs()
  to service_role;

drop trigger if exists readiness_logs_require_health_consent on public.readiness_logs;
create trigger readiness_logs_require_health_consent
before insert or update on public.readiness_logs
for each row execute function public.enforce_health_consent_for_logs();

drop trigger if exists pain_logs_require_health_consent on public.pain_logs;
create trigger pain_logs_require_health_consent
before insert or update on public.pain_logs
for each row execute function public.enforce_health_consent_for_logs();

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
begin
  if current_user_id is null then
    return new;
  end if;

  new.user_id := current_user_id;
  health_allowed := public.latest_consent_is_accepted(current_user_id, 'health_data');
  fuel_precision_allowed := public.latest_consent_is_accepted(current_user_id, 'fuel_precision');

  if health_allowed is not true then
    if new.health_personalization_enabled is true
       or new.pain_injury is true
       or new.fuel_allergy_status <> 'unconfirmed'
       or cardinality(new.food_allergies) > 0
       or cardinality(new.food_intolerances) > 0 then
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

drop trigger if exists athlete_profiles_enforce_optional_health_fields
  on public.athlete_profiles;
create trigger athlete_profiles_enforce_optional_health_fields
before insert or update on public.athlete_profiles
for each row execute function public.enforce_optional_health_profile_fields();

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
         food_allergies = '{}',
         food_intolerances = '{}'
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

-- The function already rejects a null auth.uid(); the grant should still follow
-- least privilege and not advertise an anonymous callable surface.
revoke execute on function public.persist_training_plan_atomic(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.persist_training_plan_atomic(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb
) to authenticated, service_role;

-- These checks already pass for current rows in the audited database. Validate
-- them so future release checks can distinguish enforced and legacy-only rules.
alter table public.athlete_profiles
  validate constraint athlete_profiles_adult_owner_check;
alter table public.athlete_profiles
  validate constraint athlete_profiles_age_policy_check;
alter table public.athlete_profiles
  validate constraint athlete_profiles_minor_payer_check;
alter table public.session_logs
  validate constraint session_logs_lifecycle_check;

