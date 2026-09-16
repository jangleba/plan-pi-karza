-- Fuel Precision is separate from readiness/health personalization. The app
-- works without it and removes body mass when consent is withdrawn.
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
  -- Migrations and trusted server-side maintenance do not carry a user JWT.
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

drop trigger if exists athlete_profiles_enforce_fuel_precision on public.athlete_profiles;
create trigger athlete_profiles_enforce_fuel_precision
before insert or update on public.athlete_profiles
for each row execute function public.enforce_fuel_precision_consent();

comment on column public.athlete_profiles.fuel_precision_enabled is
  'Separate opt-in for pre-session fuel ranges based on age and optional body mass.';
