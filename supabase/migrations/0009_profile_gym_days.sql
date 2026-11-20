-- Ballwise: kontrakt profilu rozszerzony o dni z dostępem do siłowni (pole `gymWeekdays`).
-- Dla zawodnika, który ma siłownię „tylko kilka razy w tygodniu”: dni tygodnia 0 = poniedziałek … 6 = niedziela.
-- To jedyna zmiana: nowe dozwolone pole + sprawdzenie kształtu. Pozostałe reguły (wiek >= 16, brak daty urodzenia) bez zmian.
-- Migracja jest odwracalna: przywrócenie definicji z 0005 (bez `gymWeekdays`) nie usuwa istniejących danych, tylko znów
-- odrzuci zapisy zawierające to pole.

create or replace function public.profile_contract_check() returns trigger
language plpgsql set search_path = public as
$$
declare
  allowed text[] := array['name','season','goal','goal2','league','age','ageAsOf','strengthYears','weightKg','position','equipment','clubWeekdays','matchWeekdays','offWeekdays','limitedGymAccess','gymWeekdays','startDate'];
  forbidden text[] := array['birthDate','birthYear','dob','dateOfBirth','birthday'];
  k text;
  g jsonb;
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
  -- dni z siłownią: tablica różnych liczb całkowitych 0–6 (najwyżej 7); kolejność sprawdzeń jest jawna (bez zależności od optymalizatora)
  if new.data ? 'gymWeekdays' then
    g := new.data->'gymWeekdays';
    if jsonb_typeof(g) <> 'array' then raise exception 'gymWeekdays musi być listą dni tygodnia 0–6'; end if;
    if jsonb_array_length(g) > 7 then raise exception 'gymWeekdays: najwyżej 7 dni'; end if;
    if exists (
      select 1 from jsonb_array_elements(g) e
      where case when jsonb_typeof(e) = 'number' then (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric) or (e #>> '{}')::numeric not between 0 and 6 else true end
    ) then raise exception 'gymWeekdays: dozwolone tylko liczby całkowite 0–6'; end if;
    if (select count(distinct e) from jsonb_array_elements(g) e) <> jsonb_array_length(g) then raise exception 'gymWeekdays: dni nie mogą się powtarzać'; end if;
  end if;
  return new;
end
$$;
