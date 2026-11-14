# Wdrożenie migracji bazy przed nowym frontendem

Status w tej sesji: **baza docelowa: niewdrożone / niezweryfikowane.** Środowisko, w którym przygotowano zmiany, nie ma dostępu
do projektu Supabase `bdfatyynxbzspjzkrjgg` ani do lokalnego Postgresa. Migracje sprawdzono tylko w PGlite (testy w repo).
Sukces lokalny nie potwierdza stanu zdalnego.

## Kolejność (frontend dopiero po kroku 4)
1. **Wskaż właściwy projekt.** Wszystkie polecenia poniżej muszą dotyczyć projektu `bdfatyynxbzspjzkrjgg` (lub wskazanego
   środowiska testowego). Supabase CLI v3 domyślnie działa na bazie lokalnej; dla zdalnej użyj jawnego celu
   (`supabase db push --help` pokazuje aktualne flagi w zainstalowanej wersji) albo wklej SQL w SQL Editorze wybranego projektu.
2. **Sprawdź stan wyjściowy** (read-only): uruchom `supabase/verification/engine_v24_session_feedback_readiness.sql`.
   Przed migracją spodziewane są wiersze `false` dla funkcji i kolumn V2.4 / feedbacku.
3. **Zastosuj w kolejności nazw**, każdy plik w całości:
   - `supabase/migrations/20261113202126_engine_v24_running_feedback.sql` (polityka `next_running_level_for_session`, `save_training_log`, `save_running_result`);
   - `supabase/migrations/20261114100000_session_feedback_v1.sql` (kolumny `activity_tags`, `duration_source`, `match_minutes_played`, `feedback_version`, ograniczenia, `save_training_log`).
   Oba pliki są idempotentne (`create or replace`, `add column if not exists`). Jeśli docelowa funkcja jest już nowsza niż w pliku, nie nadpisuj jej starszą — porównaj `pg_get_functiondef` i przenieś tylko brakujące zmiany.
4. **Ponownie uruchom skrypt gotowości.** Wszystkie 11 wierszy musi mieć `ok = true`. Dopiero wtedy wdrażaj frontend.

## Scenariusze funkcjonalne na koncie testowym (po kroku 4)
Wykonaj na izolowanym koncie testowym, nie na koncie produkcyjnym:
- Zapisz bieg, ukończ sesję bez RPE, dodaj RPE: poziom biegowy zmienia się **raz** (odwróć kolejność i powtórz te same operacje: bez podwójnej progresji).
- Klub: zapisz ukończenie z `activity_tags` i `duration_source = club_default`, odczytaj po ponownym zalogowaniu; ponów to samo żądanie (ten sam `operationId`): jeden wiersz, ta sama `write_version`.
- Mecz: zapis bez `match_minutes_played` zostaje odrzucony; 0 i 80 są przyjęte; 181 odrzucone.
- Późne RPE ze starego klienta (bez nowych kluczy) nie zeruje zapisanych tagów ani minut.
- „Dziś nie mogę”: wiersz `completion_status = 'missed'`, `completed = false`; późniejsze ukończenie z aktualną wersją przechodzi.
- Drugie urządzenie: zastąp plan przed pierwszym startem starej sesji — serwer odmawia; rozpoczęta wcześniej sesja nadal przyjmuje ukończenie.

Pokrycie lokalne (PGlite): `runtimeContracts.sql.test.ts` (kolejność RPE, ponowienia, HIIT, jednokrotność) oraz
`sessionFeedback.sql.test.ts` (pola feedbacku, wymagane minuty meczu, zachowanie wartości, opuszczenie, skrypt gotowości).
