alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

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
    coalesce(current_actor_type, 'athlete'), current_actor_email,
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
       'injuryHistory',
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
  from public, anon, authenticated;
grant execute on function public.withdraw_health_data_consent(text, text)
  to service_role;