-- Test migracji 0010 na prawdziwym Postgresie (uruchamia supabase/tests/run.sh). Każdy błąd przerywa skrypt.
\set ON_ERROR_STOP 1
\set U1 '''11111111-1111-1111-1111-111111111111'''
\set U2 '''22222222-2222-2222-2222-222222222222'''
\set C1 '''c1c1c1c1-0000-0000-0000-000000000001'''
\set C2 '''c2c2c2c2-0000-0000-0000-000000000002'''
\set ADMIN '''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'''

insert into auth.users (id) values (:U1), (:U2), (:C1), (:C2), (:ADMIN);
insert into app_admins (user_id) values (:ADMIN);
insert into profiles (user_id, data) select :U1, '{"name":"Kuba","age":17,"ageAsOf":"2026-11-19","strengthYears":1,"weightKg":70,"position":"pomocnik","equipment":["gym"],"clubWeekdays":[1],"matchWeekdays":[5],"limitedGymAccess":false}';

create function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('role', 'authenticated', false), set_config('request.jwt.claim.sub', u::text, false) $$;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$ begin if not ok then raise exception 'TEST NIEUDANY: %', msg; end if; raise notice 'ok: %', msg; end $$;
create function pg_temp.log(id text, status text, sets int, total int, fin text, cu text) returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'day', '2026-11-25', 'sessionKey', 'strength', 'status', status, 'setsDone', sets, 'setsTotal', total,
    'startedAt', '2026-11-25T17:00:00Z', 'finishedAt', fin, 'durationS', 1800, 'clientUpdatedAt', cu) $$;

-- 1. zapis wykonania: idempotencja i konflikty --------------------------------------------------------------------------
set role authenticated; select set_config('request.jwt.claim.sub', :U1, false);
select record_consent('health_sync', 'grant', 'szkic-0.1');
select pg_temp.check((select record_session_log(pg_temp.log('00000000-0000-4000-8000-000000000001', 'partial', 3, 10, '2026-11-25T17:40:00Z', '2026-11-25T17:40:00Z'))->>'outcome') = 'inserted', 'pierwszy zapis = inserted');
select pg_temp.check((select record_session_log(pg_temp.log('00000000-0000-4000-8000-000000000001', 'partial', 3, 10, '2026-11-25T17:40:00Z', '2026-11-25T17:40:00Z'))->>'outcome') = 'duplicate', 'ponowna wysyłka tego samego = duplicate, bez duplikatu');
select pg_temp.check((select record_session_log(pg_temp.log('00000000-0000-4000-8000-000000000001', 'partial', 5, 10, '2026-11-25T17:45:00Z', '2026-11-25T17:45:00Z'))->>'outcome') = 'updated', 'nowsza wersja tego samego zapisu = updated');
select pg_temp.check((select record_session_log(pg_temp.log('00000000-0000-4000-8000-000000000002', 'partial', 2, 10, '2026-11-25T18:00:00Z', '2026-11-25T18:00:00Z'))->>'outcome') = 'kept_server', 'słabszy zapis z drugiego urządzenia = kept_server');
select pg_temp.check((select record_session_log(pg_temp.log('00000000-0000-4000-8000-000000000003', 'done', 10, 10, '2026-11-25T18:10:00Z', '2026-11-25T18:10:00Z'))->>'outcome') = 'replaced', 'pełny zapis z drugiego urządzenia = replaced');
select pg_temp.check((select count(*) from session_logs) = 1, 'jeden wpis na trening dnia');
select pg_temp.check((select replaced->>'setsDone' from session_logs) = '5' and (select id::text from session_logs) like '%0003', 'zastąpiony zapis zachowany w polu replaced');
select pg_temp.check((select record_session_log(pg_temp.log('00000000-0000-4000-8000-000000000003', 'done', 10, 10, '2026-11-25T18:10:00Z', '2026-11-25T18:10:00Z'))->>'outcome') = 'duplicate', 'ponowna wysyłka zwycięzcy = duplicate');
do $$ begin
  begin insert into session_logs (id, user_id, day, session_key, status, sets_done, sets_total, started_at, finished_at, duration_s, client_updated_at)
        values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '2026-11-24', 'sprint', 'done', 1, 1, now(), now(), 1, now());
        raise exception 'TEST NIEUDANY: bezpośredni insert przeszedł';
  exception when insufficient_privilege then raise notice 'ok: bezpośredni zapis z pominięciem RPC zablokowany'; end;
  begin perform record_session_log(jsonb_build_object('id', 'x')); raise exception 'TEST NIEUDANY: zły zapis przeszedł';
  exception when invalid_parameter_value then raise notice 'ok: nieprawidłowy zapis odrzucony'; end;
  begin perform record_session_log(pg_temp.log('00000000-0000-4000-8000-000000000004', 'done', 11, 10, '2026-11-25T18:10:00Z', '2026-11-25T18:10:00Z')); raise exception 'TEST NIEUDANY: sets_done > total';
  exception when check_violation then raise notice 'ok: więcej serii niż zaplanowano odrzucone'; end;
end $$;
-- bez zgody: błąd z podpowiedzią no_consent (klient zostawia zapis na urządzeniu)
select set_config('request.jwt.claim.sub', :U2, false);
do $$ begin
  begin perform record_session_log(pg_temp.log('00000000-0000-4000-8000-0000000000b1', 'done', 1, 1, '2026-11-25T18:10:00Z', '2026-11-25T18:10:00Z')); raise exception 'TEST NIEUDANY: brak zgody przepuszczony';
  exception when raise_exception then
    if sqlerrm like 'TEST%' then raise; end if;
    raise notice 'ok: bez zgody na synchronizację zapis odrzucony (%)', sqlerrm; end;
end $$;
-- cudzy identyfikator
select record_consent('health_sync', 'grant', 'szkic-0.1');
do $$ begin
  begin perform record_session_log(pg_temp.log('00000000-0000-4000-8000-000000000003', 'done', 10, 10, '2026-11-25T19:00:00Z', '2026-11-25T19:00:00Z')); raise exception 'TEST NIEUDANY: cudzy identyfikator';
  exception when insufficient_privilege then raise notice 'ok: nie można nadpisać cudzego zapisu tym samym identyfikatorem'; end;
end $$;
select pg_temp.check((select count(*) from session_logs) = 0, 'U2 nie widzi zapisów U1');

-- 2. uprawnienia: klient nie nadaje sobie usług ani trenera --------------------------------------------------------------
do $$ begin
  begin insert into entitlements (user_id, product) values ('22222222-2222-2222-2222-222222222222', 'loadwise'); raise exception 'TEST NIEUDANY: samodzielne uprawnienie';
  exception when insufficient_privilege then raise notice 'ok: zawodnik nie nada sobie LoadWise'; end;
  begin insert into coach_assignments (coach_id, player_id, scope) values ('c2c2c2c2-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'loadwise'); raise exception 'TEST NIEUDANY: samodzielne przypisanie';
  exception when insufficient_privilege then raise notice 'ok: nie da się samemu przypisać trenera'; end;
end $$;

-- 3. trener LoadWise: dostęp tylko do przypisanych i tylko przy aktywnej usłudze ------------------------------------------
reset role;
insert into coach_assignments (coach_id, player_id, scope) values (:C1, :U1, 'loadwise');
select pg_temp.as_user(:C1);
select pg_temp.check((select count(*) from session_logs) = 0, 'przypisanie bez aktywnego LoadWise zawodnika = brak dostępu');
reset role;
insert into entitlements (user_id, product, valid_until) values (:U1, 'loadwise', now() + interval '30 days');
select pg_temp.as_user(:C1);
select pg_temp.check((select count(*) from session_logs) = 1, 'trener widzi trening przypisanego zawodnika z LoadWise');
select pg_temp.check((select count(*) from coach_players()) = 1 and (select name from coach_players()) = 'Kuba', 'lista zawodników trenera: tylko przypisany, z imieniem');
select pg_temp.check((select count(*) from profiles) = 0, 'trener NIE czyta pełnego profilu zawodnika');
insert into coach_messages (player_id, coach_id, body) values (:U1, :C1, 'Dobra robota, jutro lżej.');
do $$ begin
  begin insert into coach_messages (player_id, coach_id, body) values ('22222222-2222-2222-2222-222222222222', 'c1c1c1c1-0000-0000-0000-000000000001', 'x'); raise exception 'TEST NIEUDANY: wiadomość do nieprzypisanego';
  exception when insufficient_privilege then raise notice 'ok: trener nie pisze do nieprzypisanego zawodnika'; end;
  begin insert into coach_messages (player_id, coach_id, body) values ('11111111-1111-1111-1111-111111111111', 'c2c2c2c2-0000-0000-0000-000000000002', 'x'); raise exception 'TEST NIEUDANY: podszycie się pod innego trenera';
  exception when insufficient_privilege then raise notice 'ok: nie można wysłać wiadomości jako inny trener'; end;
end $$;
select pg_temp.as_user(:C2);
select pg_temp.check((select count(*) from session_logs) = 0 and (select count(*) from coach_players()) = 0 and (select count(*) from coach_messages) = 0, 'inny trener nie widzi niczego');
reset role;
update entitlements set valid_from = now() - interval '60 days', valid_until = now() - interval '1 day' where user_id = :U1 and product = 'loadwise';
select pg_temp.as_user(:C1);
select pg_temp.check((select count(*) from session_logs) = 0 and (select count(*) from coach_players()) = 0, 'po wygaśnięciu LoadWise trener traci dostęp');

-- 4. trener klubowy: wymaga sztabu klubu i usługi klubowej zawodnika ------------------------------------------------------
reset role;
insert into clubs (id, name) values ('0c0c0c0c-0000-0000-0000-00000000000c', 'KS Test');
insert into entitlements (user_id, product, club_id) values (:U1, 'club', '0c0c0c0c-0000-0000-0000-00000000000c');
insert into coach_assignments (coach_id, player_id, scope, club_id) values (:C2, :U1, 'club', '0c0c0c0c-0000-0000-0000-00000000000c');
select pg_temp.as_user(:C2);
select pg_temp.check((select count(*) from session_logs) = 0, 'trener spoza sztabu klubu nie ma dostępu mimo przypisania');
reset role;
insert into club_staff (club_id, user_id, role) values ('0c0c0c0c-0000-0000-0000-00000000000c', :C2, 'coach');
select pg_temp.as_user(:C2);
select pg_temp.check((select count(*) from session_logs) = 1, 'trener klubu ze sztabu widzi zawodnika klubu');
select pg_temp.check((select count(*) from club_staff) = 1 and (select count(*) from clubs) = 1, 'sztab widzi swój klub (bez rekurencji RLS)');
select pg_temp.check((select count(*) from coach_messages) = 0, 'trener klubu nie czyta wiadomości trenera LoadWise');

-- 5. wiadomości i odczyt przez zawodnika -----------------------------------------------------------------------------------
select pg_temp.as_user(:U1);
select pg_temp.check((select count(*) from coach_messages where read_at is null) = 1, 'zawodnik widzi wiadomość od trenera');
select mark_coach_message_read((select id from coach_messages limit 1));
select pg_temp.check((select count(*) from coach_messages where read_at is not null) = 1, 'oznaczenie jako przeczytane');
update coach_messages set body = 'zmienione';
select pg_temp.check((select body from coach_messages) = 'Dobra robota, jutro lżej.', 'zawodnik nie edytuje treści wiadomości');
select pg_temp.check((select count(*) from entitlements) = 2, 'zawodnik widzi swoje uprawnienia (LoadWise i klub)');

-- 6. powiadomienia: urządzenie po zmianie konta ----------------------------------------------------------------------------
select save_push_subscription('https://push.example/abc', repeat('k', 87), repeat('a', 22));
select pg_temp.check((select count(*) from push_subscriptions) = 1, 'zapis subskrypcji');
select pg_temp.as_user(:U2);
select save_push_subscription('https://push.example/abc', repeat('k', 87), repeat('a', 22), array['message']);
select pg_temp.as_user(:U1);
select pg_temp.check((select count(*) from push_subscriptions) = 0, 'po zalogowaniu innego konta na tym urządzeniu poprzednie konto nie dostaje powiadomień');
do $$ begin
  begin perform save_push_subscription('http://insecure', repeat('k', 87), repeat('a', 22)); raise exception 'TEST NIEUDANY: http';
  exception when check_violation then raise notice 'ok: tylko adresy https'; end;
end $$;

-- 7. eksport, wycofanie zgody, usunięcie konta ------------------------------------------------------------------------------
select pg_temp.check(jsonb_array_length(export_my_data()->'sessionLogs') = 1 and jsonb_array_length(export_my_data()->'coachMessages') = 1, 'eksport obejmuje treningi i wiadomości');
select record_consent('health_sync', 'withdraw', 'szkic-0.1');
select pg_temp.check((select count(*) from session_logs) = 0, 'wycofanie zgody usuwa zapisy treningów z serwera');
reset role;
select erase_user_data(:U1);
select pg_temp.check((select count(*) from coach_messages where player_id = :U1) = 0 and (select count(*) from coach_assignments where player_id = :U1) = 0 and (select count(*) from entitlements where user_id = :U1) = 0, 'usunięcie konta czyści wiadomości, przypisania i uprawnienia');
select 'WSZYSTKIE TESTY 0010 ZALICZONE' as wynik;
