-- Check-in: pytanie o sen zastąpiła „regeneracja po wczoraj” (1 = słabo, 3 = dobrze).
-- Kolumna dostaje nową nazwę; dane i ograniczenie (1–3) zostają. Wdrażać razem z wersją aplikacji, która zapisuje `recovery`
-- (starsze wersje zapisujące `sleep` przestaną synchronizować check-in, dopóki się nie odświeżą).
alter table public.check_ins rename column sleep to recovery;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'check_ins_sleep_check' and conrelid = 'public.check_ins'::regclass) then
    alter table public.check_ins rename constraint check_ins_sleep_check to check_ins_recovery_check;
  end if;
end $$;
