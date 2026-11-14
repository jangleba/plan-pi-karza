# BallWise — status poprawek integracji

Gałąź: `claude/eloquent-brown-b5sfyf` (baza `ec531c7`, V2.5). Wznawiaj od tej tabeli.
Legenda: **zrobione** = kod + test uruchomiony w tej sesji; **częściowo**; **niewykonane**.
Migracje: *przygotowane* (plik w repo) ≠ *zastosowane lokalnie* (PGlite w testach) ≠ *potwierdzone na zdalnej bazie* (niewykonane).

| Etap | Stan | Wykonane | Dowód testu | Bloker |
|---|---|---|---|---|
| 1 Baza | kod i instrukcja gotowe, **baza niewdrożona** | Cztery migracje w repo, skrypt gotowości (15 sprawdzeń), `docs/ballwise-wdrozenie-bazy.md`. Brak poświadczeń i dostępu sieciowego do projektu `bdfatyynxbzspjzkrjgg` w tym środowisku. | `sessionFeedback.sql.test.ts`, `runtimeContracts.sql.test.ts` (PGlite) | Potrzebne: dostęp do bazy (connection string lub token Supabase z dostępem do projektu) albo wykonanie SQL przez właściciela. |
| 2 Zakres planu, korekty, ciasny tydzień | zrobione w kodzie | Podgląd nazywa zakres zapisu (od dziś do końca planu) i zmiany w najbliższych 7 dniach oraz w dalszych tygodniach; korekty po feedbacku zmieniają tylko wymienione sesje (reszta planu i wykonane bez zmian, sprawdzone testem); cel główny w ciasnym tygodniu. | `TrainingPlanScreen`, `feedbackAdjustment`, `mainGoalPriority`, `weekRobustness`, `fullFlow` | Zapis nadal zastępuje plan od dziś (ograniczenie aktywacji); zmiana dotyczy tylko pokazanych dni. |
| 3 Bieganie, kolejność synchronizacji | zrobione w SQL (lokalnie) | `recompute_running_progression`: poziom z chronologii dowodów (czas wykonania, stabilny id), przeliczany przy zapisie wyniku, RPE, korekcie i usunięciu; poprzedni poziom zostaje bazą. | `runningReplay.sql.test.ts` | Niewdrożone na zdalnej bazie. Zmiana semantyki: dozwolona korekta wyniku (wcześniej „niezmienny”). |
| 4 Test MAS „Ustal tempo” | zrobione w kodzie | Receptura V2 (10+5+5 min), przyjmowana przez walidator tylko jako własna receptura silnika, zastępuje jeden nierozpoczęty spokojny bieg po akceptacji, klasyfikacja `field_mas_test` dla licznika; zapis przez istniejący RPC; wynik używany przez silnik tylko ze źródłową sesją i do 28 dni. | `masTest.test.ts`, `MasTestAction.test.tsx`, `runningReplay.sql.test.ts` (zapis i odczyt profilu) | Bieg testu w terenie z GPS niewykonany. |
| 5 Sprint | zrobione w kodzie i SQL (lokalnie) | Dystans, rodzaj startu, metoda pomiaru przy próbie; porównania tylko przy zgodnych warunkach; historyczne próby bez metadanych nie są porównywalne; poprawka aktualizuje ten sam wiersz. | `sprintTrials.test.ts`, `SprintTimingPanel.test.tsx`, `sessionFeedback.sql.test.ts` | Niewdrożone na zdalnej bazie. |
| Klub / mecz / Progres / Fuel | zrobione w kodzie | Jak w poprzednich wersjach statusu. | `fullFlow.test.ts` i testy modułów | — |
| Pełny przepływ | testy na poziomie modułów | Plan → start → wznowienie → feedback → korekta → Progres → koniec → wywiad → kolejny plan (cykl kontynuowany, budżet 60 min, historia nietknięta). | `fullFlow.test.ts` | Brak testu w przeglądarce/na telefonie. |
