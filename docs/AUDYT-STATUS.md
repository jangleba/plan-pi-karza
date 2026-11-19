# Wdrożenie poprawek po audycie prawnym i technicznym – status

To zestawienie opisuje, co zostało zrobione w kodzie, a co wymaga decyzji, danych lub zatwierdzenia przez człowieka. **Aplikacja nie jest oznaczona jako „w pełni zgodna z prawem”** i nie powinna być tak opisywana: dokumenty są szkicami, dane operatora nie są uzupełnione, a model sprzedaży nie istnieje.

## 1. Co zrobiono (z miejscem w kodzie i testami)

| Sekcja audytu | Zmiana | Gdzie | Testy |
|---|---|---|---|
| 1. Granica 16+ | Jedna funkcja `assessAge`; bramka przy onboardingu, zmianie daty i odczycie zapisanego profilu; sprzeczności wiek/rocznik/data; wiek „starzeje się”; sam rocznik nie wystarcza, gdy wynik zależy od dnia urodzin; walidacja po stronie bazy | `src/lib/age.ts`, `profileGuard.ts`, `AgeGate.tsx`, migracja 0005 (wyzwalacz profilu) | `src/lib/profileGuard.test.ts`, `src/legal/db.test.ts` |
| 2. Data urodzenia lokalnie | Pełna data w osobnym magazynie lokalnym; jawna lista pól synchronizowanych (klient + baza); procedura porządkowania istniejących rekordów | `src/lib/private.ts`, `sync-map.ts`, `profiles_birth_audit()`, `strip_profile_birth_fields()` | j.w. |
| 3. Izolacja konto/gość | Przestrzenie `bw:guest:*` i `bw:u:<id>:*`; migracja starych kluczy tylko do gościa; jawny import; test zakazujący surowego `localStorage` | `src/lib/store.ts` | `store.test.ts`, `no-raw-storage.test.ts` |
| 4. Konto, dokumenty, zgody | Centralna konfiguracja operatora/dokumentów (braki oznaczone), osobne dowody: umowa, zasady bezpieczeństwa, zgoda na synchronizację zdrowia (RLS, wycofanie usuwa dane); brak „ogólnej zgody RODO” | `src/legal/*`, migracja 0005 | `src/legal/db.test.ts` |
| 5. Opiekun 16–17 | Token jednorazowy, skrót SHA-256, wygasa po 72 h, wersja umowy, oświadczenie; dziecko nie potwierdza samo; brak płatnej aktywacji bez potwierdzenia | migracja 0005, `src/Guardian.tsx` | `src/legal/db.test.ts` |
| 6. Usuwanie/eksport | Ustawienia; eksport; usunięcie konta (Edge Function, id tylko z JWT, idempotentne, prawdziwy raport kroków) | `src/Settings.tsx`, `supabase/functions/delete-account`, `erase_user_data()` | `src/legal/account-fn.test.ts`, `db.test.ts` |
| 7. Trening/Fuel/Lab | Progresja: planowane ≠ zgłoszone; zwiększenie tylko po potwierdzeniu wszystkich powtórzeń; wybór: zostań/zwiększ/obniż/zmień ćwiczenie/pomiń; 1RM tylko z potwierdzenia. Fuel: alergeny/dieta/własne wykluczenia, brak danych ≠ bezpieczny, cele opisane jako orientacyjne. Lab: oszacowanie z nagrania ≠ walidowany pomiar, ograniczenia, ręczna korekta. Zasady bezpieczeństwa dostępne z Startu | `src/engine/progress.ts`, `allergens.ts`, `lab.ts`, `SessionSheet.tsx`, `Fuel.tsx` | `progress.test.ts`, `allergens.test.ts`, `lab.test.ts` |
| 8. Radar | Wyjątek zgody nie daje MATCH; kategoria rozgrywek (wybór zawodnika, cytat w źródle, brak ≠ „dla wszystkich”); strona zaktualizowana ≠ potwierdzone przez organizatora (dowód wymagany też w bazie); karty klubów jako informacja kontaktowa, widoczny adresat; e-maile i telefony usuwane z tekstu wysyłanego do AI | `supabase/functions/_shared/radar/*`, migracja 0006, `src/radar/*` | `eligibility.test.ts`, `extract.test.ts`, `db.test.ts`, `jobs.test.ts`, `ui-logic.test.ts` |
| 9. Licencje / sprzedaż | Rejestr źródeł (`src/legal/licenses.ts`, generowany `docs/REJESTR-LICENCJI.md`) i zależności (`docs/zaleznosci-licencje.md`); konfiguracja handlowa bez fikcyjnego checkoutu; zakup niedostępny bez kompletnej konfiguracji | `src/legal/commerce.ts` | `src/legal/*.test.ts` |
| 10. Testy | Granice wieku, zmiana daty, sprzeczny profil, brak daty w żądaniach synchronizacji, A→B→A, opiekun/token/wygaśnięcie, eksport/usunięcie, progresja bez potwierdzenia, wyjątek zgody, strona vs organizator | patrz wyżej | cały zestaw `npx vitest run` |

## 2. Migracje i wdrożenie (kolejność)

Nic z poniższego nie zostało wykonane na prawdziwym Supabase: migracje i funkcje były uruchamiane tylko na lokalnym Postgresie (PGlite).

1. **Kopia zapasowa bazy** przed jakąkolwiek migracją.
2. Zastosuj migracje po kolei: `0005_privacy_account.sql`, `0006_radar_confirmation.sql`.
   - 0006 **celowo zeruje** dotychczasowe `organizer_confirmed_at` (przenosi je do `page_updated_at`), bo mogły pochodzić z daty aktualizacji strony. Skutek: nabory bezterminowe wygasną po 7 dniach, dopóki organizator jawnie ich nie potwierdzi (oświadczenie na stronie albo akcja administratora z notatką-dowodem).
3. Wdróż funkcję: `supabase functions deploy delete-account` (wymaga `SUPABASE_SERVICE_ROLE_KEY` w sekretach funkcji – nigdy w kliencie). Wdróż też zaktualizowane funkcje radaru (`_shared/radar/*`).
4. **Porządkowanie istniejących profili** (jako administrator, krok po kroku, bez operacji w ciemno):
   1. `select profiles_birth_audit();` – same liczby (profile z polami daty urodzenia, profile < 16 lat),
   2. `select strip_profile_birth_fields();` – domyślnie **dry-run** (nic nie zmienia),
   3. po kopii zapasowej: `select strip_profile_birth_fields(false);`.
   Profile z wiekiem < 16 lat wymagają osobnej decyzji operatora (np. usunięcie konta przez `delete-account`), kod ich nie usuwa sam.
5. Zmienne środowiskowe: `VITE_REQUIRE_LOGIN` (logowanie opcjonalne, gdy `false`), `VITE_ALLOW_UNAPPROVED_LEGAL` (tylko środowiska testowe), `VITE_MAPBOX_TOKEN` (opcjonalnie).
6. Po stronie panelu Supabase: wyłącz otwarte rejestracje, dopóki operator nie uzupełni danych (aplikacja i tak blokuje zakładanie kont w produkcji bez kompletnej konfiguracji).

## 3. Do decyzji i zatwierdzenia (brakuje danych – niczego nie wymyślono)

**Dane operatora** (`src/legal/config.ts`, `OPERATOR`): nazwa, forma prawna, adres do doręczeń, KRS/CEIDG, NIP, e-mail kontaktowy (także w sprawie praw osób). Telefon opcjonalny.

**Dokumenty** (`DOCS`): regulamin, informacja o prywatności, zasady bezpiecznego korzystania mają status `draft`. Zatwierdza je odpowiedzialna osoba (status `approved` + osoba + data). Kod nigdy sam nie uznaje szkicu za zatwierdzony.

**Decyzje prawne / merytoryczne:**
- podstawy prawne poszczególnych operacji (patrz `docs/MAPA-DANYCH.md`, sekcja 6) i okresy retencji (w tym dziennik dowodów, dziennik usunięć, logi),
- region i umowy powierzenia z dostawcami (Supabase, hosting, Anthropic, Brave, Mapbox); okno wygasania kopii zapasowych,
- model sprzedaży i konfiguracja płatności (`src/legal/commerce.ts`: cena, odnowienia, rezygnacja, reklamacje, odstąpienie, dostawca) – wszystko puste; bez fikcyjnego checkoutu i bez klauzuli o „utracie prawa odstąpienia po zalogowaniu”,
- polityka dostępu bezpłatnego dla 16–17 lat i metoda weryfikacji opiekuna (`minors` w konfiguracji handlowej); obecnie deklaracja opiekuna przez link, **nie weryfikacja tożsamości**,
- warunki Mixamo (pliki w `public/iq`), model pozy MediaPipe, Brave (przechowywanie wyników), Anthropic (retencja) – `docs/REJESTR-LICENCJI.md`, pozycje „do ustalenia”,
- przegląd treści treningowych i żywieniowych dla 16–17 lat przez trenera/dietetyka: `docs/DO-PRZEGLADU-SPECJALISTY.md` (**nie wykonany**).

## 4. Znane ograniczenia

- Wiek to deklaracja użytkownika (bez weryfikacji tożsamości); poniżej 16 lat dostęp jest blokowany na podstawie deklaracji.
- Link opiekuna może technicznie otworzyć także dziecko poza swoją sesją; to deklaracja, nie weryfikacja. Jeśli to za mało, trzeba wybrać metodę zewnętrzną (decyzja operatora).
- Dane gościa i konta są lokalne dla przeglądarki; wyczyszczenie danych witryny usuwa je bez możliwości odzyskania (poza synchronizacją, jeśli użytkownik wyraził zgodę).
- Edge Functions (Deno), pg_cron i pg_net nie były uruchamiane na prawdziwej infrastrukturze; ekrany bramki wieku, ustawień i opiekuna były sprawdzane tylko testami logiki.
- Zakres alergenów w `FOOD_TAGS` dotyczy ogólnych produktów z wbudowanej bazy; to informacja pomocnicza, a nie ocena bezpieczeństwa.
