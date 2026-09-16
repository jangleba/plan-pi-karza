-- Legal version 2.2 re-consent support.
-- Old health consent remains valid for its original readiness/pain scope, but
-- the expanded allergy/intolerance scope requires an explicit 2.2 consent.

begin;

create or replace function public.latest_consent_is_accepted_for_version(
  p_user_id uuid,
  p_consent_type text,
  p_version text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select accepted is true and version = p_version
      from public.consent_logs
      where user_id = p_user_id
        and consent_type = p_consent_type
      order by accepted_at desc, id desc
      limit 1
    ),
    false
  );
$$;

revoke execute on function public.latest_consent_is_accepted_for_version(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.latest_consent_is_accepted_for_version(uuid, text, text)
  to service_role;

create or replace function public.enforce_optional_health_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  health_allowed boolean;
  health_scope_22_allowed boolean;
  fuel_precision_allowed boolean;
  allergies_present boolean;
  intolerances_present boolean;
begin
  if current_user_id is null then
    return new;
  end if;

  new.user_id := current_user_id;
  health_allowed := public.latest_consent_is_accepted(current_user_id, 'health_data');
  health_scope_22_allowed := public.latest_consent_is_accepted_for_version(
    current_user_id,
    'health_data',
    '2.2'
  );
  fuel_precision_allowed := public.latest_consent_is_accepted(current_user_id, 'fuel_precision');

  allergies_present := coalesce(new.food_allergies, '[]'::jsonb)
    not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb);
  intolerances_present := coalesce(new.food_intolerances, '[]'::jsonb)
    not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb);

  -- A browser write without active health consent is reduced to the safe,
  -- non-health profile instead of persisting special-category data.
  if health_allowed is not true then
    new.health_personalization_enabled := false;
    new.pain_injury := false;
    new.fuel_allergy_status := 'unconfirmed';
    new.food_allergies := '[]'::jsonb;
    new.food_intolerances := '[]'::jsonb;
  elsif health_scope_22_allowed is not true
    and (
      coalesce(new.fuel_allergy_status, 'unconfirmed') <> 'unconfirmed'
      or allergies_present
      or intolerances_present
    ) then
    -- Consent versions before 2.2 did not name allergy/intolerance processing.
    new.fuel_allergy_status := 'unconfirmed';
    new.food_allergies := '[]'::jsonb;
    new.food_intolerances := '[]'::jsonb;
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

commit;
