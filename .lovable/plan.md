# Audyt przepływu: Biblioteka → Plan → Sesja → Log → Adaptacja → Vision

## Mapa etapów (pliki produkcyjne)

| Etap | Pliki | Stan |
| --- | --- | --- |
| Biblioteka ćwiczeń | `src/lib/loadwise/exerciseLibrary.ts`, `strengthExerciseLibrary.ts`, `sessionContent.ts` | działa E2E (kanoniczne ID, walidacja, aliasy) |
| Silnik planu | `src/lib/loadwise/planEngine.ts`, `weekFinalization.ts`, `footballSpeedSessionEngine.ts`, `strengthBlocks.ts`, `planExerciseContract.ts` | działa E2E (kontrakt ćwiczeń wymusza pełne sesje) |
| Wygenerowana sesja + persystencja | `src/lib/loadwise/persist.ts`, `store.tsx`, `persistedPlanValidation.ts` | działa E2E |
| Wykonanie sesji | `src/routes/sesja.$date.tsx`, `src/routes/_tabs.plan.tsx`, `_tabs.start.tsx`, `src/lib/loadwise/dailyCheckin.ts` | działa; brak logowania na poziomie ćwiczenia |
| Log ukończenia | `store.tsx: completeSession` → tabela `session_logs` | działa częściowo (RPE + notatki); ból i zmęczenie nóg zapisane tylko jako tekst w `notes` |
| Adaptacja LoadWise | `store.tsx: refreshPlanIfNeeded`, `confirmWeeklyTransition`, `planEngine.generatePlan` | **niedomknięte** — historia ukończeń/RPE nie jest wejściem generatora |
| Vision Lab → progres | `src/lib/vision/visionRepo.ts`, `visionResultService.ts`, `src/components/loadwise/PlayerAnalysis.tsx` | **niedomknięte** — brak powiązania z planem, `saved_to_progress` nigdy nie ustawiane |

## Główne luki

1. `generatePlan(profile, start, days, weekOffset)` nie przyjmuje historii treningowej: brak sRPE, brak liczby ukończonych/pominiętych sesji, brak trendu bólu. Reguła „progresja na podstawie ukończonych sesji, RPE, bólu” z rdzenia produktu nie ma kanału danych.
2. `progressionWeek` w `footballSpeedSessionEngine` liczony jest z indeksu tygodnia i gotowości, nie z realnej realizacji.
3. Ból z panelu ukończenia trafia do `session_logs.notes` jako tekst, mimo istnienia tabeli `pain_logs`; nie może więc blokować sprintu/plyo w kolejnych dniach.
4. `session_exercises` istnieje w bazie, ale wykonanie pojedynczych ćwiczeń nie jest zapisywane — brak danych o realnej realizacji bloku.
5. `confirmWeeklyTransition` regeneruje tydzień z `tempProfile` bez historii i nadpisuje cały plan (`persistMonthlyPlan`), regenerując identyfikatory sesji — to rozjeżdża `session_logs.session_id` z nowymi sesjami (utrata historii ukończeń dla przebudowanego tygodnia).
6. Vision: `linkedPlanId`, `linkedWorkoutId`, `linkedExerciseId` są zawsze `null`; `markSavedToProgress` istnieje w repo, ale nie jest wywoływane z UI wyniku. `PlayerAnalysis` liczy `testsCount`, ale nie pokazuje trendu wyników per test.
7. Duplikacja zapisu wyników Vision: `visionRepo.ts` i `visionResultService.ts` mają dwie ścieżki insertu (baza + localStorage) z rozbieżnym mapowaniem pól.

## Zadania (12, kolejność wdrożenia)

1. Wprowadzić typ `TrainingHistory` (ukończenia, RPE, daty, ból) w `src/lib/loadwise/types.ts` i selektor budujący go ze `state.completions` + `readiness`.
2. Rozszerzyć `generatePlan` o opcjonalny argument `history` (bez zmiany istniejących sygnatur wywołań) i przekazać go do `planBlock`/`weekFinalization`.
3. Wykorzystać `history` w regule progresji: utrzymanie głównych ćwiczeń 3–5 tygodni, zmiana jednej zmiennej naraz; źródło `progressionWeek` = liczba ukończonych sesji danego typu, nie indeks kalendarza.
4. Dodać deload/redukcję objętości przy utrzymującym się wysokim sRPE lub serii pominiętych sesji; brak automatycznych tygodni regeneracyjnych bez sygnału.
5. Zapisywać ból z panelu ukończenia do `pain_logs` (data, lokalizacja, poziom) obok `session_logs`, migrując parser `parseCompletionNotes`.
6. Podłączyć `pain_logs` do `applyReadiness`/`dailyCheckin` jako twardą blokadę sprintu, plyo i ciężkiego dolnego ciała w kolejnych 48 h.
7. Zapisywać wykonanie ćwiczeń do `session_exercises` (ukończone/pominięte/zamienione) z `sesja.$date.tsx` przez jedną akcję w `store.tsx`.
8. Naprawić `confirmWeeklyTransition`: przepisywać tylko regenerowany zakres dni, zachowywać `dbId` sesji już zalogowanych i nie usuwać historii ukończeń.
9. Przekazać `history` również do `refreshPlanIfNeeded` i `savePlanToDb`, aby regeneracja po zmianie profilu nie gubiła progresji.
10. Ustawiać w Vision `linkedPlanId`/`linkedTrainingDay`/`linkedExerciseId` przy uruchomieniu testu z kontekstu aktywnego planu (jednokierunkowo: Vision czyta Plan, zgodnie z `PLAN_PROTECTED.md`).
11. Skonsolidować zapis wyników Vision do jednej ścieżki (`visionRepo`), pozostawiając `visionResultService` jako cienką fasadę; wywołać `markSavedToProgress` z ekranu wyniku.
12. Rozszerzyć `PlayerAnalysis` o trend najlepszych wyników per test (Vision) i wskaźnik realizacji planu (ukończone/zaplanowane, średnie RPE), z testami regresji dla zadań 2–8.

## Uwagi techniczne

- Zadania 1–4 i 9 dotykają `planEngine.ts` (5131 linii) — wejście historii powinno być jednym obiektem, aby nie mnożyć parametrów.
- Zadanie 8 wymaga zmiany `persistMonthlyPlan` na zapis zakresowy albo zachowania mapowania stary→nowy `dbId`.
- Zadania 10–11 nie mogą wprowadzać importu z `src/lib/vision/**` do modułu Plan (test `planBoundary.test.ts`).
