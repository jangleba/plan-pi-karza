-- BallWise: server-owned consent evidence and explicit authenticated RLS roles.
-- Run after 20260916200000_secure_fuel_photo_and_health_notes.sql.

begin;

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

  if new.consent_type = 'guardian_authorization' and new.accepted is true then
    trusted_actor_type := 'guardian';
  elsif trusted_actor_type is null and coalesce(
    (
      select accepted
      from public.consent_logs
      where user_id = current_user_id
        and consent_type = 'guardian_authorization'
      order by accepted_at desc, id desc
      limit 1
    ),
    false
  ) is true then
    trusted_actor_type := 'guardian';
  end if;

  new.user_id := current_user_id;
  new.accepted_at := now();
  new.actor_type := coalesce(trusted_actor_type, 'athlete');
  new.actor_email := auth.jwt() ->> 'email';
  new.withdrawn_at := case when new.accepted then null else now() end;
  return new;
end;
$$;

revoke execute on function public.sanitize_client_consent_log()
  from public, anon, authenticated;
grant execute on function public.sanitize_client_consent_log()
  to service_role;

create or replace function public.record_consent(
  p_consent_type text,
  p_accepted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  canonical_text text;
  canonical_scope text;
  canonical_version constant text := '2.2';
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_accepted is null then
    raise exception 'Consent decision is required';
  end if;

  select
    case p_consent_type
      when 'terms' then
        'Akceptuję Regulamin korzystania z aplikacji BallWise.'
      when 'privacy' then
        'Potwierdzam zapoznanie się z Polityką prywatności BallWise.'
      when 'health_data' then
        'Wyrażam wyraźną zgodę na przetwarzanie danych o gotowości i zdrowiu: snu, energii, zmęczenia, bolesności, stresu, motywacji, bólu oraz — jeśli sam je podam — alergii i nietolerancji żywnościowych. Dane służą wyłącznie personalizacji treningu i bezpieczeństwu Fuel. Brak zgody nie blokuje aplikacji; plan pozostanie ostrożny, a Fuel poprosi o każdorazowe potwierdzenie składników.'
      when 'marketing' then
        'Chcę otrzymywać informacje marketingowe dotyczące BallWise. Zgodę mogę wycofać w dowolnym momencie.'
      when 'fuel_precision' then
        'Wyrażam wyraźną zgodę na używanie wieku i opcjonalnej masy ciała wyłącznie do obliczania orientacyjnych zakresów paliwa przed treningiem. Fuel działa także bez tej zgody. Zgodę mogę wycofać w aplikacji, a masa ciała zostanie usunięta.'
      when 'guardian_authorization' then
        'Oświadczam, że jestem rodzicem lub opiekunem zawodnika i mogę prowadzić jego profil oraz podejmować decyzje dotyczące danych tego konta.'
      else null
    end,
    case p_consent_type
      when 'terms' then 'terms_of_service'
      when 'privacy' then 'privacy_notice'
      when 'health_data' then 'readiness_and_fuel_safety'
      when 'marketing' then 'marketing'
      when 'fuel_precision' then 'fuel_personalization'
      when 'guardian_authorization' then 'child_profile'
      else null
    end
  into canonical_text, canonical_scope;

  if canonical_text is null or canonical_scope is null then
    raise exception 'Unsupported consent type';
  end if;

  if p_consent_type = 'health_data' and p_accepted is false then
    perform public.withdraw_health_data_consent(canonical_version, canonical_text);
    return;
  end if;

  insert into public.consent_logs (
    user_id,
    consent_type,
    accepted,
    version,
    text_snapshot,
    actor_type,
    actor_email,
    scope,
    withdrawn_at
  ) values (
    current_user_id,
    p_consent_type,
    p_accepted,
    canonical_version,
    canonical_text,
    'athlete',
    auth.jwt() ->> 'email',
    canonical_scope,
    case when p_accepted then null else now() end
  );

  if p_consent_type = 'fuel_precision' and p_accepted is false then
    update public.athlete_profiles
       set fuel_precision_enabled = false,
           weight_optional = null
     where user_id = current_user_id;
  end if;
end;
$$;

revoke execute on function public.record_consent(text, boolean)
  from public, anon;
grant execute on function public.record_consent(text, boolean)
  to authenticated, service_role;

-- The browser can read its audit trail, but all new evidence must pass through
-- record_consent(), which owns the legal version, wording, scope and timestamp.
revoke insert, update, delete on public.consent_logs from authenticated;
grant select on public.consent_logs to authenticated;
drop policy if exists "consent_logs_insert_own" on public.consent_logs;

-- The legacy withdrawal RPC accepts caller-supplied text/version. Keep it as an
-- internal primitive only; record_consent() supplies canonical values.
revoke execute on function public.withdraw_health_data_consent(text, text)
  from public, anon, authenticated;
grant execute on function public.withdraw_health_data_consent(text, text)
  to service_role;

-- has_role() is not used by current RLS policies. Do not expose arbitrary role
-- lookups to every signed-in user.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

revoke execute on function public.has_role(uuid, public.app_role)
  from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role)
  to service_role;

-- Make the intended audience explicit. Ownership predicates remain unchanged.
alter policy "own athlete_profiles" on public.athlete_profiles
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own onboarding_answers" on public.onboarding_answers
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own pain_logs" on public.pain_logs
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own profiles" on public.profiles
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own readiness_logs" on public.readiness_logs
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own session_exercises" on public.session_exercises
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own session_logs" on public.session_logs
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users manage their own session modifications" on public.session_modifications
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own training_days" on public.training_days
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own training_plans" on public.training_plans
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own training_sessions" on public.training_sessions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can manage their own weekly transitions" on public.weekly_transitions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
