# Audyt BallWise — commit `69b905cd` („iq 14.09”), tryb tylko odczyt

Nie zmieniono żadnego pliku aplikacji, nie utworzono migracji, nie opublikowano.

## 1. Diagnostyka (uruchomiona teraz)

| Komenda | Wynik |
|---|---|
| `npx tsc --noEmit` | 0 błędów |
| `npx eslint .` | 0 uwag |
| `npx vitest run --testTimeout=30000` | **62 pliki, 660 testów — wszystkie zielone**, 27,8 s |
| `npx vite build` | sukces, 16,0 s |
| `npx vitest run` (domyślny limit 5 s) | `allProfilesSmokeMatrix` trwa **21,0 s** → przy domyślnym limicie ten test pada |

`npm run verify` wymusza `--testTimeout=30000`, więc bramka wydania jest zielona; samo `npm test` nie.

## 2. Co działa i ma dowód w kodzie

- **Minimum tygodniowe** — `weeklyRequirements.ts` (`getRequiredGymSessions` 272, `getRequiredSpeedSessions` 321, `getRequiredEnduranceSessions` 288, `getRequiredBallSessions` 338) jest jedynym źródłem prawdy; klub i mecz podnoszą tylko `congestionLevel`, nigdy nie zaliczają się jako siłownia/sprint/wydolność. Testy: `weeklyRequirements.test.ts`, `weekFinalizationMatrix.test.ts`.
- **Brak sprintu dzień przed meczem** — twarda blokada `speedPlanning.ts:436,459` + degradacja do primera `sessionVariants.ts:583,753`.
- **Kolejka offline działa** — `offlineTrainingQueue.ts` jest realnie podpięta w `store.tsx:1519,1594,1626,1698`, flush na zdarzeniu `online` (`store.tsx:726–767`).
- **Logi serii trwałe** — `setLogs.ts:114–174` zapisuje do bazy z upsertem, fallbackiem i kolejką offline; `formatLastSet` pokazuje poprzednią serię. Progresja ciężaru `strengthProgression.ts:35–98` bez zgadywania 1RM.
- **Dane biegowe bez GPS** — zapisywany jest tylko czas/dystans/tempo (`store.tsx:1678–1687`), zgodnie z zapisem polityki.
- **Wiek i opiekun** — progi 13/16/18 w `agePolicy.ts` egzekwowane w `auth.tsx:92–104` i dodatkowo serwerowo przez trigger `enforce_trusted_athlete_profile_fields`.
- **Usunięcie konta** — `delete-account/index.ts` waliduje token i kasuje użytkownika; wszystkie tabele mają `ON DELETE CASCADE`.

## 3. Tabela błędów i ryzyk

| Sev | Plik / funkcja | Dowód | Wpływ | Minimalna poprawka |
|---|---|---|---|---|
| **P0** | `src/lib/fuel/engine.ts:115` | `(req.athlete.age ?? 99) < 18` | Gdy wiek nieznany, ochrona przed kofeiną dla niepełnoletnich jest **wyłączona** — domyślnie „dorosły” | Zmienić domyślną na blokadę: `age == null` → traktuj jak niepełnoletniego |
| **P0** | `src/lib/fuel/engine.ts:95–113` | Czyta tylko `allergyStatus` i `allergies`; `intolerances`, `exclusions` i `restrictions` (budowane w `planAdapter.ts:91–95`) nie są nigdzie odczytane | Zadeklarowana nietolerancja laktozy lub wykluczenie są zbierane i pokazywane jako dane bezpieczeństwa, ale nic nie blokują | Objąć blokadą całą tablicę `restrictions` |
| **P0** | `legal.ts:80–85` vs `store.tsx:1307–1310` | `food_allergies` / `food_intolerances` / `food_exclusions` zbierane, ale **nieujawnione** w wykazie danych w polityce | Rozbieżność polityka ↔ kod w kategorii danych wrażliwych żywieniowo | Dopisać dane żywieniowe (i dane opiekuna) do §3 polityki |
| **P1** | `legal.ts:17,27,100` | `retentionPeriod` domyślnie `"[OKRES PRZECHOWYWANIA]"`; brak jakiegokolwiek zadania czyszczącego | Polityka deklaruje okres przechowywania, którego nic nie egzekwuje; przy braku env użytkownik widzi placeholdery i baner „WERSJA TESTOWA” | Ustawić `VITE_LEGAL_*` przed wydaniem i opisać retencję jako „do usunięcia konta” |
| **P1** | `delete-account/index.ts:37–39` vs `legal.ts:101` | Kasowanie działa tylko przez kaskadę DB; `consent_logs` też znika | Polityka sugeruje zachowanie dziennika zgód dla wykazania zgodności — kod go usuwa | Uzgodnić tekst z zachowaniem kodu (najprościej: zmienić tekst) |
| **P1** | `store.tsx:2140–2144` | Check-in rzuca wyjątek przy `navigator.onLine === false`, brak `enqueueTrainingWrite` | Niespójność: logi sesji są odporne na brak sieci, check-in nie — dane przepadają | Objąć `readiness_logs` tą samą kolejką offline |
| **P1** | `store.tsx:848–888`, `1289–1419` | `assertNoSupabaseError` twardo rzuca; brak fallbacku dla ładowania startowego i zapisu onboardingu | Chwilowy błąd sieci przerywa start aplikacji lub zapis onboardingu bez ponowienia | Ponowienie + komunikat zamiast wyjątku na tych dwóch ścieżkach |
| **P1** | `exerciseIllustrations.tsx:268–285` | Tylko **4** prawdziwe ilustracje (`cmj`, `broad_jump`, `squat`, `hinge`) na ~79 ćwiczeń; `NAME_MATCHERS` to 4 regexy po nazwie | Wszystkie warianty przysiadu dostają jedną generyczną grafikę; reszta ćwiczeń nie ma żadnej. Ryzyko pokazania **cudzego ruchu** podczas wykonywania | Usunąć fuzzy fallback i użyć polityki „dokładne dopasowanie albo placeholder” z `MovementBlueprint.tsx:44–46` |
| **P1** | `src/lib/loadwise/exerciseMediaRegistry.ts` | 601 linii, 0 importów w `src/` | Martwy kod udający „jedyne źródło prawdy” o grafikach; trzecie równoległe źródło obok `exerciseIllustrations` i `MovementBlueprint` | Usunąć plik albo podłączyć do runnera |
| **P2** | brak `test.testTimeout` w `vite.config.ts` | `allProfilesSmokeMatrix` 21 s > domyślne 5 s | `npm test` bez flagi jest czerwony na zdrowym kodzie | Ustawić `testTimeout: 30000` w konfiguracji Vitest |
| **P2** | `_tabs.fuel.tsx` (623 linie) | 0 trafień na `supabase|localStorage|insert|upsert` | Cały wynik Fuel ginie przy nawigacji/odświeżeniu; brak historii posiłków | Zapis do `sessionStorage` albo świadoma decyzja „kalkulator bez historii” |
| **P2** | `persist.ts:22` i `store.tsx:168` | Dwie prawie identyczne definicje `assertNoSupabaseError` | Rozjazd zachowania przy przyszłej zmianie | Jedna wspólna implementacja |
| **P2** | `data-rights.tsx:15–47` | Eksport 17 tabel; nie obejmuje `auth.users.raw_user_meta_data` (data urodzenia z rejestracji) | Eksport niepełny wobec deklaracji „pełne dane” | Dodać metadane rejestracji do paczki JSON |
| **P2** | `legal.ts:104` | Deklaruje „poprawienie” i „ograniczenie przetwarzania” w aplikacji | Brak osobnego UI poza ponownym onboardingiem i wycofaniem zgody | Doprecyzować tekst albo dodać wskazanie ścieżki |
| **P3** | `mealParser.ts:17–83` | ~28 reguł regex, brak gramatur; `heaviness` to ręczne liczby 0–4 | Wąskie pokrycie polskich posiłków, wynik „nierozpoznane” przy typowych opisach | Rozszerzyć słownik; bez zmiany silnika |
| **P3** | `planAdapter.ts:26–38,68,72` | `kind` z regexu po tytule; `minutesToStart` i `startClock` zawsze `null` | Dopasowanie pory do sesji opiera się wyłącznie na ręcznie wybranym przedziale czasu | Przekazać realny czas sesji z planu |
| **P3** | `exerciseMetrics.ts:14–21` | Typ pomiaru z regexu po nazwie/opisie | Źle nazwane ćwiczenie dostaje złe pola wprowadzania | Przypisać `metricKind` jawnie w bibliotece |

## 4. Reguły planu — stan faktyczny

| Reguła | Stan |
|---|---|
| 2 siłownie + sprint + wydolność | **Egzekwowana** (`weeklyRequirements.ts`), z zamierzonym obniżeniem przy zagęszczeniu i przy nadrzędności zdrowia |
| Klub/mecz nie zastępują minimum | **Egzekwowana** |
| Brak sprintu MD-1 | **Egzekwowana** twardo |
| Brak sprintu MD+1 | **Częściowa** — MD+1 domyślnie schodzi do sesji kompensacyjnej (`planEngine.ts:943`) i blokuje siłę (`strengthBlocks.ts:322`), ale **nie ma jawnej reguły zakazującej sprintu**; brak testu |
| Zakaz dwóch identycznych sesji dziennie | **Proxy, nie dosłowna** — `persistedPlanValidation.ts:113–143` blokuje ten sam `classification.category` i zdublowaną ekspozycję szybkościową; identyczna treść w różnych kategoriach przejdzie |
| 1 dzień wolny w tygodniu | **Nieegzekwowana** — dzień wolny jest resztą (`planEngine.ts:3452`); żaden test nie sprawdza `restDays.length === 1` |
| Check-in raz przed główną sesją | **Nieegzekwowana** — `upsert onConflict: user_id,date` (`store.tsx:2148`) daje jeden wiersz dziennie, ale nic nie wymaga check-inu przed sesją ani nie blokuje ponownej edycji |
| 3 dni przed meczem | **Częściowa** — w kodzie istnieją tylko MD-2 i MD-1 (`strengthBlocks.ts:668,1026`); brak jakiejkolwiek logiki MD-3 |

## 5. Do potwierdzenia testem ręcznym (hipotezy, nie fakty)

- Wyścig między odtwarzaniem kolejki offline a równoległym zapisem na żywo do tej samej sesji — oba idą przez `upsert` z `onConflict`, więc prawdopodobnie idempotentne, ale nie udowodnione statycznie.
- Stan wpisywanych serii w `sesja.$date.tsx` (1823 linie) przed zapisem — czy odświeżenie w trakcie ćwiczenia gubi niezapisane pola.
- Skala fuzzy-fallbacku ilustracji: dokładna liczba ćwiczeń trafiających w 4 regexy vs. bez żadnej grafiki.
- Czy `window.__lovableEvents` (`lovable-error-reporting.ts:21–35`) przekazuje cokolwiek poza błąd i ścieżkę — wstrzykiwane spoza repozytorium.

## 6. Kolejność najmniejszych bezpiecznych poprawek

1. Fuel: bezpieczna domyślna dla nieznanego wieku + egzekwowanie `restrictions`.
2. Polityka: dopisać dane żywieniowe i dane opiekuna, uzgodnić zapis o dzienniku zgód, uzupełnić dane administratora i retencję.
3. Check-in do kolejki offline; ponowienie zamiast wyjątku przy starcie i onboardingu.
4. Ilustracje: jedna polityka „dokładne dopasowanie albo placeholder”; decyzja o `exerciseMediaRegistry.ts`.
5. `testTimeout` w konfiguracji Vitest.
6. Jawne reguły + testy dla: sprintu na MD+1, jednego dnia wolnego, check-inu przed główną sesją.

Bez przebudowy silnika i bez nowych modułów.
