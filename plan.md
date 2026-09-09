# Audyt BallWise / LoadWise — stan na dziś

Uwaga: podany commit `3791fc1b…` nie jest bieżącym HEAD. Audyt wykonano na HEAD `3586cfc6300d60d7b7ad2037100433dd0b72fc1a`.

## F. Wyniki testów, typów i builda (zmierzone)

- Testy: `bunx vitest run` → **54 pliki (49 zielonych, 5 czerwonych), 625 testów (618 zielonych, 7 czerwonych)**, czas 57,8 s.
  Wszystkie 7 porażek to `Test timed out in 5000ms` (planEngine jest wolny, ~0,4–1,9 s na jeden `generatePlan`). Po ponownym uruchomieniu tych samych plików z `--testTimeout=120000`: **48/48 zielonych**. To niestabilność wydajnościowa, nie błąd logiki.
  Pliki dotknięte: `globalPlanRules.test.ts`, `planEngineRegression.test.ts`, `planExerciseContract.test.ts`, `planRules.test.ts`, `weekFinalizationMatrix.test.ts`, `sprintEngineRouting.regression.test.ts`.
- Typecheck: `tsgo --noEmit` → **36 linii błędów, wszystkie w `src/lib/loadwise/store.tsx`** (linie 758, 760, 1097–1102, 1364–1369, 1424–1439, 1481–1484, 1837–1840).
- Build: `vite build` → **sukces w 20,79 s** (typy nie blokują builda, więc błąd trafia na produkcję).

## B. Potwierdzone błędy (dowód w kodzie i w bazie)

### P0-1 Baza produkcyjna nie ma tabel i kolumn, których używa kod
Zapytanie do `information_schema` pokazuje w `public`: brak `running_activities` i brak `exercise_replacements`.
`readiness_logs` nie ma kolumn `pain_level`, `overall`, `updated_at` ani unikalnego indeksu `(user_id, date)`.
`session_logs` nie ma `completion_status`, `duration_minutes`, `activity_type`, `updated_at`.
Czyli migracje `20260819190400_add_exercise_replacement_persistence.sql` i `20260906131544_repair_plan_engine_feedback.sql` nie są odzwierciedlone w bazie.

Skutki dla użytkownika (wszystkie ścieżki mają `assertNoSupabaseError`, więc twardo rzucają):
- `store.tsx:1827` — zapis check-inu (`readiness_logs.upsert` z `pain_level/overall/updated_at`, `onConflict: user_id,date`) kończy się błędem → gotowość i ból nie zapisują się na koncie.
- `store.tsx:1359` i `1092` — zapis ukończenia oraz oznaczanie pominiętych sesji (`completion_status`, `duration_minutes`, `activity_type`) → błąd → brak sprzężenia zwrotnego do kolejnego planu.
- `store.tsx:1424/1481` — zapis i usuwanie biegu → błąd „tabela nie istnieje”.
- `store.tsx:752/1539/1599` — podmiany ćwiczeń nie utrwalają się między sesjami.
Minimalny test reprodukujący: zalogowany użytkownik → check-in → zapis; oraz `select 1 from public.running_activities limit 1` (błąd relacji).

### P0-2 36 błędów typów w `store.tsx`
Bezpośrednia konsekwencja P0-1: `Database` nie zna tych tabel/kolumn, więc PostgREST zawęża typ do `never`. Część zapytań obchodzi to przez `as never` (`session_modifications`, `weekly_transitions`, `exercise_replacements`), co wyłącza kontrolę typów i ukrywa realne rozjazdy ze schematem.

### P1-1 Test suite czerwony na czystym repo
Brak `testTimeout` w konfiguracji Vitest przy generatorze planu kosztującym ~1 s na wywołanie. Każde CI będzie losowo czerwone; audyt regresji planu przestaje być wiarygodny.

### P1-2 Kopia `WGRYWAJ-DO-GITHUBA/` w drzewie źródeł
16 plików, m.in. druga wersja `src/lib/loadwise/store.tsx`, `weekFinalization.ts`, `onboarding.tsx`, `_tabs.*`. Nie są to pliki budowane, ale są indeksowane przez wyszukiwanie i lint, i zawierają rozbieżne kopie logiki (np. własne `onboardingValidation.ts`). To źródło sprzecznych „prawd” przy każdej kolejnej zmianie.

## A. Co jest realnie zrobione dobrze (potwierdzone kodem i zielonymi testami)

- `weeklyRequirements.ts` jest jedynym źródłem minimum tygodniowego i implementuje przyjętą decyzję produktową: 2 siłownie, ≥1 wydolność, ≥1 sprint, klub nie zastępuje minimum, wiek/poziom zmieniają treść, nie kategorię.
- Warstwa reguł tygodnia (`planRules.ts`, `globalPlanRules.ts`, `weekFinalization*.ts`) ma bogaty zestaw testów macierzowych (m.in. 14-latek beginner + 4 dni klubu) i po podniesieniu limitu czasu przechodzi w całości.
- Klasyfikacja obciążeń szybkościowych (`speedLoad.ts`) traktuje RSA jako pełny load szybkościowy — zgodnie z decyzją produktową o blokowaniu dublowania twardego sprintu.
- Walidacja utrwalonego planu (`persistedPlanValidation.ts`) faktycznie sprawdza: dzień klubowy, dwie sesje o tym samym bodźcu, sprinty dzień po dniu, minimum tygodniowe, zgodność daty meczu.
- Build produkcyjny przechodzi; Vision/Performance Lab są usunięte i nie wracają w importach.

## C. Elementy częściowe lub pozorne

- **Sprzężenie zwrotne wykonania → kolejny plan**: kod jest napisany, ale zapisuje do nieistniejących kolumn (P0-1), więc w praktyce nie działa.
- **Ból / dyskomfort**: istnieje osobna tabela `pain_logs`, ale aplikacja jej nie używa (jedyne odwołanie to lista czyszczenia danych w `data-rights.tsx`). Ból żyje wyłącznie w profilu i w check-inie, którego zapis obecnie pada.
- **Regeneracja**: `recovery_prehab` / `recovery_run` istnieją jako warianty sesji i jako zejście z obciążenia, ale nie ma modułu dobierającego regenerację do zawodnika — to nadal fallback, nie dział.
- **Football IQ**: `evaluate.ts` ma cztery oceny (optimal / safe / risky / wrong), czyli częściowo realizuje „odpowiedź preferowana + akceptowalne alternatywy”, ale nie ma zależności od kontekstu fazy — ocena wynika wyłącznie z trafionego celu.
- **Bieganie**: `running_activities` to funkcja bez tabeli — cała ścieżka istnieje w UI i w store, ale nie ma warstwy danych.

## D. Najmniejsze sensowne rozwinięcia

- Doprowadzić schemat bazy do zgodności z kodem zamiast dopisywać `as never`.
- Przenieść ból z check-inu do `pain_logs` (tabela już jest) i użyć jej jako wejścia adaptacji dnia.
- Regenerację oprzeć na już istniejących sygnałach (RPE, minuty, ból, gęstość klubu) — bez nowego modułu.
- Dołożyć w Football IQ jedno pole kontekstu fazy do oceny alternatyw.

## E. Kolejność paczek naprawczych (każda zamknięta, bez mieszania warstw)

1. Migracja: `running_activities` (tabela + GRANT + RLS) — odblokowanie zapisu biegów.
2. Migracja: uzupełnienie `readiness_logs` (pain_level, overall, updated_at, unikalny indeks user+date).
3. Migracja: uzupełnienie `session_logs` (completion_status, duration_minutes, activity_type, updated_at).
4. Migracja: `exercise_replacements` — utrwalenie podmian ćwiczeń.
5. Regeneracja typów bazy i usunięcie wszystkich `as never` w `store.tsx`; typecheck do zera.
6. Test end-to-end zapisu: check-in → ukończenie → bieg, na realnym schemacie.
7. Stabilizacja testów: globalny `testTimeout` + memoizacja/przyspieszenie `generatePlan` w testach.
8. Usunięcie katalogu `WGRYWAJ-DO-GITHUBA` i wyrównanie różnic, jeśli któraś kopia zawiera nowszą logikę.
9. Podpięcie `pain_logs` jako trwałego źródła bólu i wejścia dla adaptacji dzisiejszego dnia.
10. Sprzężenie zwrotne: RPE i status ukończenia realnie wpływające na kolejny mikrocykl (jedna zmienna naraz).
11. Moduł regeneracji dobieranej do zawodnika, oparty na danych z pkt 9–10.
12. Football IQ: kontekst fazy w ocenie alternatyw, bez nowych scenariuszy.

## Rozgraniczenie

Błędy wykonania: P0-1, P0-2, P1-1, P1-2. Braki funkcji: regeneracja dobierana do zawodnika, ból jako trwały log, kontekst w IQ. Decyzje produktowe (nie błędy): RSA w wydolności, bieganie bez piłki, brak Vision Lab.
