-- Fuel (fuel-targets-1): athletes under 16 get portion guidance only. The server never stores a
-- body mass for them, whatever a client sends, so no body-mass based number can be derived.
-- Applies to existing younger accounts kept after the 16+ change; it does not touch 16–17.
begin;

create or replace function public.enforce_fuel_youth_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.age is not null and new.age < 16 then
    new.weight_optional := null;
    new.fuel_precision_enabled := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_fuel_youth_rules() from public, anon, authenticated;
grant execute on function public.enforce_fuel_youth_rules() to service_role;

drop trigger if exists athlete_profiles_fuel_youth_rules on public.athlete_profiles;
create trigger athlete_profiles_fuel_youth_rules
before insert or update on public.athlete_profiles
for each row execute function public.enforce_fuel_youth_rules();

-- Rows stored before this rule.
update public.athlete_profiles
   set weight_optional = null,
       fuel_precision_enabled = false
 where age < 16
   and (weight_optional is not null or fuel_precision_enabled);

commit;
