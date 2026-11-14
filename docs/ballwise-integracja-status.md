# BallWise — status poprawek integracji

Gałąź: `claude/eloquent-brown-b5sfyf` (baza `ec531c7`, V2.5). Wznawiaj od tej tabeli.
Legenda: **zrobione** = kod + test uruchomiony w tej sesji; **częściowo**; **niewykonane**.
Migracje: *przygotowane* (plik w repo) ≠ *zastosowane lokalnie* (PGlite w testach) ≠ *potwierdzone na zdalnej bazie* (niewykonane).

| Etap | Stan | Wykonane | Dowód testu | Bloker |
|---|---|---|---|---|
| 1 Baza i zapis biegania | kod i instrukcja gotowe, baza niewdrożona | Migracje w repo i w łańcuchu testów; skrypt gotowości (11 sprawdzeń) i `docs/ballwise-wdrozenie-bazy.md` z kolejnością, scenariuszami i zastrzeżeniem lokalny ≠ zdalny. | `runtimeContracts.sql.test.ts` (RPE w obu kolejnościach, ponowienia, HIIT), `sessionFeedback.sql.test.ts` (7, w tym opuszczenie i skrypt gotowości) | **Baza docelowa: niewdrożone / niezweryfikowane** (brak dostępu). Migracje muszą wejść przed frontendem. |
| 2 Tydzień, priorytety, zmiany | zrobione w kodzie | Ranking celu głównego; testy granic i kalendarzy; opis zmian po zmianie meczu/dni/klubu/czasu/sprzętu (`planInputs`), różnica 7 dni w podglądzie, budżet czasu otwiera podgląd; „Dziś nie mogę” bez kumulowania zaległości. | `scheduling`, `mainGoalPriority`, `weekRobustness`, `todayIso`, `scheduleChange`, `skipToday`, `StartSkip`, `TrainingPlanScreen` | Zapis zmiany ustawień obejmuje cały plan (ograniczenie aktywacji), nie tylko 7 dni. |
| 3 Ta sama sesja | częściowo | Test spójności struktury: ćwiczenia, kolejność, serie, strony, przerwy, klucze wykonania, czas i licznik z jednej receptury; plan po zapisie/odczycie ma tę samą recepturę. | `sessionConsistency.test.ts` + istniejące testy runnera | Brak testu UI wznowienia rozpoczętej sesji w przeglądarce. |
| 4 Klub, mecz, korekty | zrobione w kodzie | Jak wcześniej; mecz bez czasu całej sesji, minuty gry wymagane (0 poprawne), korekta z minut × RPE. | `feedbackAdjustment`, `SessionCompletion`, `sessionFeedback*` | Konflikt drugiego urządzenia tylko jednostkowo. |
| 5 Progres, wywiad, kolejny plan | zrobione w kodzie | Jak wcześniej; podsumowanie siły z rzeczywistych serii. | `planSummary`, `strengthSets`, `PlanEndSummary`, `TrainingPlanScreen` | — |
| 6 MAS, chronologia, sprint | częściowo | Sprint: czas przypisany do wybranego powtórzenia, bez przenumerowania, ponowny zapis poprawia wpis. | `SprintTimingPanel.test.tsx` | **Niewykonane:** test MAS „Ustal tempo” (receptura V2, tracker i RPC), deterministyczne serwerowe przeliczanie biegów, rodzaj startu/dystansu w porównaniach sprintu. |
| 7 Spójność ekranów, Fuel, całość | częściowo | Fuel: 90 min klubu jako szacunek, kontekst dnia po korekcie; dokumentacja zaktualizowana. | `clubContext.test.ts` | Test pełnego scenariusza kont/offline i czas do użytecznego Startu; telefon/GPS niewykonane. |
