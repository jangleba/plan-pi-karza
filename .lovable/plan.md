# Audyt BallWise — commit `b7a3c043` („Zdefiniowano rejestr ćwiczeń”)

Tryb: tylko odczyt. Nie zmieniono żadnego pliku aplikacji, nie budowano wydania, nie wdrażano.

## 0. Pomiary (uruchomione teraz, nie z dokumentów)

- Typy (`tsc/tsgo --noEmit`): **0 błędów**. Poprzednie 36 błędów w `store.tsx` już nie występuje.
- Testy (`vitest run --testTimeout=30000`): **58 plików, 640 testów — wszystkie zielone**, 25 s.
- Lint (`eslint .`): **bez uwag**.
- Build (`vite build`): **sukces**, 10,9 s.
- Cały `npm run verify` z domyślnymi ustawieniami jest jednak ryzykowny — patrz P1-1.

## 1. Działa i ma dowód

- **Minimum tygodniowe** — `src/lib/loadwise/weeklyRequirements.ts` (`calculateWeeklyMinimumRequirements`): 2 siłownie (1 przy 4+ klubowych), ≥1 wydolność, ≥1 szybkość, ≥1 własna piłka; klub nie zastępuje minimum. Potwierdzone testami `planRules.test.ts` (m.in. „każdy pełny tydzień ma minimum 1 wydolność”).
- **Generator i gate'y tygodnia** — `planEngine.ts`, `globalPlanRules.ts`, `weekFinalization*.ts`, `dayPlacementScoring.ts`: pełna macierz testów (`weekFinalizationMatrix`, `allProfilesSmokeMatrix`, `planEngineRegression`) przechodzi.
- **Readiness i ból zmieniają tylko dziś** — `applyReadiness` w `planEngine.ts`, pokryte `readinessPainAdaptation.test.ts` dla sprintu, wydolności, siły i piłki (progi 8–10 / 6–7 / 4–5 / 1–3 oraz blokada przy bólu).
- **Druga sesja dnia** — `runtimeSpeedRepair.ts` + `planExerciseContract.ts` obsługują `secondSession` i cofają ją przy złej gotowości (`runtimeSpeedRepair.test.ts`).
- **Trwałość danych** — wszystkie tabele używane przez `store.tsx` istnieją w bazie: `running_activities`, `exercise_replacements`, `pain_logs`, `readiness_logs`, `session_logs`, `exercise_set_logs`. Poprzedni rozjazd schematu (P0 z poprzedniego audytu) jest zamknięty.
- **Ból jako trwały log** — `store.tsx:2018` realnie zapisuje/usuwa `pain_logs`, a wycofanie zgody zdrowotnej czyści je (`store.tsx:1335`).
- **RLS** — każda tabela użytkownika ma RLS włączone i politykę `auth.uid() = user_id`; `exercise_library` i `session_templates` tylko do odczytu dla zalogowanych.
- **Zgody małoletnich** — trigger `enforce_trusted_athlete_profile_fields` wymusza serwerowo: wiek ≥13, konto opiekuna i potwierdzony e-mail dla 13–15, blokadę personalizacji zdrowotnej bez aktywnej zgody; `consent_logs` ma zakaz UPDATE/DELETE. Klient (`onboarding.tsx`, `agePolicy.ts`) jest z tym zgodny.
- **Usunięcie konta** — `supabase/functions/delete-account/index.ts`: wymaga tokenu, waliduje go przez `auth.getUser`, kasuje użytkownika kluczem serwisowym; `verify_jwt = true`. Funkcja wdrożona.
- **Eksport danych** — `data-rights.tsx` eksportuje 17 tabel użytkownika do JSON.

## 2. Działa częściowo

- **Sprzężenie zwrotne wykonanie → kolejny plan**: logi (`session_logs`, `exercise_set_logs`, RPE, minuty) są zapisywane i pokazywane w Postępie, ale nie ma testu dowodzącego, że wpływają na dobór kolejnego mikrocyklu. Progresja opiera się głównie na `progressionWeek`, nie na realnym wykonaniu.
- **Regeneracja**: istnieje jako warianty `recovery_prehab` / `recovery_run` i jako zejście z obciążenia (`sessionVariants.ts`, `dailyScheduling.ts`). To nadal reguła awaryjna, nie moduł dobierający regenerację do zawodnika.
- **Football IQ**: `football-iq/evaluate.ts` ocenia optimal / safe / risky / wrong wobec jednego celu; brak zależności oceny od kontekstu fazy, mimo że decyzja produktowa tego wymaga. Sprzeczność reguł.
- **Offline**: `bootCache.ts` pozwala wystartować z ostatniego planu (7 dni), ale nie ma kolejki zapisów. Check-in, ukończenie sesji i logi serii wykonane bez sieci są tracone.
- **Rejestr mediów ćwiczeń**: `src/lib/loadwise/exerciseMediaRegistry.ts` istnieje, ale **nie jest importowany nigdzie** — martwy kod; ekran sesji nadal korzysta ze starego mapowania.

## 3. Błędy i ryzyka

### P1-1 — `npm run verify` jest niestabilny
`vite.config.ts` nie ustawia `test.testTimeout`, więc obowiązuje domyślne 5 s. Zmierzone czasy: `allProfilesSmokeMatrix` 19,5 s, `planRules` 9,0 s, pojedyncze przypadki 1,3–2,1 s. Przy 30 s wszystko jest zielone, przy domyślnych ustawieniach ten sam kod potrafi być czerwony. Skutek: bramka wydania nie odróżnia regresji od wolnego generatora.
Naprawa: ustawić globalny `testTimeout` (np. 30 000) w konfiguracji Vitest.

### P1-2 — 29 rzutowań `as never` w `store.tsx`
`rg -c "as never" src/lib/loadwise/store.tsx` → 29 (m.in. `session_modifications`, `weekly_transitions`, `exercise_replacements`). Typy tych tabel **są** obecne w `src/integrations/supabase/types.ts` (linie 287, 673, 905), więc rzutowania są zbędne i wyłączają kontrolę zgodności ze schematem. Zielony typecheck nie jest tu dowodem poprawności.
Naprawa: usunąć `as never` i naprawić realne różnice, jeśli wyjdą.

### P1-3 — twarde `throw` przy każdym błędzie zapisu
`assertNoSupabaseError` (`store.tsx:164`) rzuca wyjątek dla dowolnego błędu Supabase. Przy chwilowym braku sieci lub błędzie 5xx kończy się to przerwanym check-inem lub nieukończoną sesją, zamiast lokalnym zapisem i ponowieniem. To najpoważniejsze ryzyko dla użytkownika mobilnego.
Naprawa: rozdzielić błędy krytyczne od przejściowych i dodać ponowienie zapisu.

### P2-1 — zbędne uprawnienia `anon`
Uprawnienie SELECT dla roli `anon` obowiązuje m.in. na `profiles`, `athlete_profiles`, `readiness_logs`, `pain_logs`, `session_logs`, `user_roles`. Danych to dziś nie ujawnia, bo polityki wymagają `auth.uid() = user_id`, a `anon` ma `uid` puste. Mimo to część polityk ma rolę `{public}` zamiast `{authenticated}` — pojedyncza pomyłka w przyszłej polityce wystarczy, by odsłonić dane.
Naprawa: cofnąć GRANT dla `anon` na tabelach użytkownika i zawęzić polityki do `authenticated`.

### P2-2 — `user_roles` bez realnego zastosowania
Tabela i funkcja `has_role` istnieją, ale żadna polityka ani kod aplikacji z nich nie korzysta. Martwa warstwa uprawnień, myląca przy kolejnych zmianach.

### P2-3 — martwy rejestr mediów
`exerciseMediaRegistry.ts` (45 identyfikatorów) nie ma żadnego konsumenta. Albo należy go podłączyć, albo usunąć — inaczej powstaną dwa źródła prawdy o grafikach ćwiczeń.

## 4. Sprzeczności między regułami

1. **Football IQ** — wiedza produktowa wymaga zależności oceny od kontekstu fazy; `evaluate.ts` ocenia wyłącznie trafienie w cel.
2. **Regeneracja** — reguła „nie wypełniaj pustych dni regeneracją, jeśli nie jest potrzebna” jest egzekwowana testem, ale brak jest doboru regeneracji do zawodnika, co opisuje wiedza produktowa.
3. **Trwałość vs. niezawodność** — wymóg „bez fikcyjnych danych” jest spełniony, ale brak kolejki offline oznacza, że realne dane bywają po cichu tracone; to ta sama wartość widziana z drugiej strony.

## 5. Konieczne poprawki przed wydaniem (bez nowych funkcji)

1. `testTimeout` w konfiguracji Vitest — wiarygodna bramka `verify`.
2. Usunięcie `as never` w `store.tsx` i weryfikacja zgodności ze schematem.
3. Odporne zapisy: brak twardego `throw` dla błędów przejściowych, ponowienie check-inu i ukończenia sesji.
4. Cofnięcie GRANT `anon` i zawężenie polityk do `authenticated`.
5. Decyzja o `exerciseMediaRegistry.ts`: podłączyć albo usunąć.

Poza tą listą nie proponuję żadnych nowych funkcji.
