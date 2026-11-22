-- Ballwise: pole profilu `missingGear` (sprzęt, którego zawodnik nie ma na siłowni) dołączone do kontraktu profilu.
-- Trigger z migracji 0005 pozostaje; zmienia się tylko lista dozwolonych pól.
create or replace function public.profile_contract_check() returns trigger
language plpgsql set search_path = public as
$$
declare
  allowed text[] := array['name','season','goal','goal2','league','age','ageAsOf','strengthYears','weightKg','position','equipment','clubWeekdays','matchWeekdays','offWeekdays','limitedGymAccess','missingGear','startDate'];
  forbidden text[] := array['birthDate','birthYear','dob','dateOfBirth','birthday'];
  k text;
begin
  if jsonb_typeof(new.data) <> 'object' then raise exception 'profil musi być obiektem'; end if;
  for k in select jsonb_object_keys(new.data) loop
    if k = any (forbidden) then raise exception 'pole % nie może być zapisane na serwerze (data urodzenia zostaje na urządzeniu)', k; end if;
    if not (k = any (allowed)) then raise exception 'pole % jest poza kontraktem profilu', k; end if;
  end loop;
  if jsonb_typeof(new.data->'age') <> 'number' or (new.data->>'age')::numeric <> trunc((new.data->>'age')::numeric)
     or (new.data->>'age')::int < 16 or (new.data->>'age')::int > 110 then
    raise exception 'wiek poniżej 16 lat lub nieprawidłowy – profil nie może zostać zapisany';
  end if;
  return new;
end
$$;
