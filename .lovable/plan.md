# Audyt silnika planowania BallWise/Loadwise

## 0. Stan wersji — przeczytaj najpierw

Analizowałem `HEAD = 534704b "Dodano FuelWise w moduł Fuel"`, który jest **identyczny z `origin/main` repozytorium Lovable**. To repozytorium Lovable, nie GitHub — nie mam dostępu do GitHuba ani do informacji o PR #7. **Nie mogę potwierdzić, że projekt Lovable zawiera scalony PR #7.** Jeśli PR #7 był scalony po stronie GitHuba i sync nie przeszedł, poniższe wnioski dotyczą wersji sprzed niego. Zweryfikuj to przed wdrażaniem napraw.

Ostatnie commity w Lovable: `534704b`, `ff4623c`, `93f85a5`, `8eec434` — wszystkie z nazwami "Changes"/FuelWise, brak śladu merge commita PR.

---

## 1. Mapa pipeline'u

`generatePlan()` — `planEngine.ts:3856-4649`. Kolejność:

1. `effectiveSeasonPhase` — nadpisanie fazy sezonu (`planEngine.ts:3865`).
2. Pętla dzienna `3958-4326` — `md1Session`, `recoverySession`, `buildStimulus`/`buildByGoal`, `buildSecondSession`, `applyGymPlan` (`3927`), `decorateSession`, `enforceSessionCategory`. **Klasyfikacja jeszcze nie istnieje.**
3. `enforceConsecutiveLowerBodySafety` (`4330` → `3074`) — downgrade intensywności in place.
4. `enforceNoConsecutiveGymDays` (`4333` → `3128`) — degradacja treści dnia siłowego.
5. `validateEndurancePlacement` (`4336` → `3343`) → `enforceSingleEndurancePerDay` (`3243`, usuwa `secondSession`), `enforceNoConsecutiveEnduranceDays` (`3261`, relokacja `3318` lub podmiana `3207`).
6. `validateRecoveryPrehabPlacement` (`4339` → `3421`) → `makeRestDay` (`3367`), `replaceMainRecoveryPrehab` (`3390`).
7. Podmiana bodyweight przy `hasGym=false` (`4344-4358`).
8. `repairUnsafeExercisesForAthleteProfile` (`4364` → `athleteProfileRepair.ts:170`).
9. **Pierwsza klasyfikacja**: `normalizeSessionCategory` (`4367` → `sessionClassification.ts:475`).
10. `finalizeWeekPlan` (`4371` → `weekFinalization.ts:1208`) → `validateAndRepairWeekPlan` (`1121`): `repairDuplicateSpeedSameDay` (297), `repairBackToBackSpeedSessions` (412), `validateNoEnduranceOnClubDays` (270), `addMissingEnduranceSessions` (517), `addMissingGymSessions` (740), potem powtórka trzech pierwszych (1140-1143), `assertFinalPlanMeetsMinimums` (1023). `weekMeta` — tylko status (1155-1174), liczniki nie przeliczane.
11. `applyRuleBasedWeekLayer` (`4374` → `3757`): `validateGeneratedWeek`+`repairWeekErrors` ×4 (3550), `enforceBlockProgression` (3699), **pierwszy pełny zapis `weekMeta`** (3822-3830), `validateGlobalPlan` (read-only).
12. **Powtórka twardych bramek** (`4378-4384`): `enforceNoConsecutiveGymDays`, `validateEndurancePlacement`, `validateRecoveryPrehabPlacement` — już po zapisaniu `weekMeta`.
13. Reklasyfikacja (`4385-4387`).
14. Pętla naprawcza ×3 (`4392-4413`) — `validateAndRepairWeekPlan` po raz trzeci.
15. `finalizeWeekPlan` po raz czwarty (`4425-4429`).
16. Reklasyfikacja (`4431-4435`).
17. Finalne `weekMeta` (`4436-4477`) — **pomijane, gdy tydzień nie ma żadnego `weekMeta`** (`if (!previousMeta) return;`, 4455).
18. `assertPlanExerciseContract` (`4478`), `return`.

### Pasy, które cofają się nawzajem
- `addMissingEnduranceSessions` (krok 10) dodaje wydolność → krok 12 `enforceNoConsecutiveEnduranceDays`/`makeRestDay` może ją skasować → krok 14/15 dodaje ją ponownie. Oscylacja ograniczona wyłącznie licznikiem pętli.
- `addMissingGymSessions` vs `enforceNoConsecutiveGymDays` — ten sam wzorzec.
- `enforceBlockProgression` skaluje `durationMin`; sesje dodane później mają sztywne 25/45 min (`weekFinalization.ts:230`) i nie są skalowane → progresja w1<w2<w3 może zostać zepsuta po fakcie.
- `weekMeta` jest odświeżane 2× i przez kroki 12-16 pozostaje nieaktualne względem treści.

### Martwy kod (potwierdzone gr epem)
`speedPlanning.ts` (1006 linii) i `dayPlacementScoring.ts` (602 linie) **nie są importowane przez żaden plik produkcyjny — tylko przez własne testy**. Zawierają `countSpeedSessions`, `wouldCreateDuplicateSpeedDay`, `canAddSessionToDay` — czyli dokładnie te bramki, których brakuje w realnym pipeline. Z `dailyScheduling.ts` produkcja używa tylko `getMaxSessionsPerDay`, `isYouthOrBeginner`, `SchedLoadLevel`. **To jest główna przyczyna wrażenia „mamy reguły, a plan i tak jest zły": zielone testy `speedPlanning.test.ts` (679 linii) i `dayPlacementScoring.test.ts` nie testują silnika, który generuje plan użytkownika.**

---

## 2. Duplikaty i konflikty szybkości

Realne drogi do dwóch ekspozycji sprintu:

| # | Droga | Dowód |
|---|---|---|
| A | `buildSharpness()` MD-2 zawiera `4 × 15 m przyspieszeń`, a `sessionType: "Ostrość / lekka szybkość"` łapie `RE_SPEED` → staje się `speed_sprint` obok właściwego dnia sprintu | `planEngine.ts:784-830`, wywołanie `4164`, `sessionClassification.ts:66` |
| B | RSA (`"Powtarzalne sprinty (RSA)"`) jest **wymuszenie** klasyfikowane jako `endurance_conditioning/repeated_tempo` → niewidoczne dla wszystkich liczników szybkości | `planEngine.ts:1569-1604`, `sessionClassification.ts:222-229, 269-275` |
| C | Dzień klubowy wraca wcześnie z gałęzi `club_general`/`club_speed_focus` i **nigdy nie dochodzi do fallbacku `RE_SPEED`** — klub ze sprintem w treści jest niewidoczny | `sessionClassification.ts:162-177` vs `276-282` |
| D | Naprawy działają wyłącznie w obrębie tygodnia pon–ndz; niedziela/poniedziałek nigdy nie porównane | `weekFinalization.ts:390-401`, `1177-1190` |
| E | Tygodnie niepełne pomijane w całości: `if (!isFullCalendarWeek(week)) continue;` → zero napraw sprintu | `weekFinalization.ts:1212` |
| F | Regeneracja pojedynczego tygodnia wkleja slice do `current` bez rewalidacji dni granicznych | `store.tsx:664-681` |
| G | `modifications.ts` proponuje kategorię `"sprint"` (`4 × 10 m`, `3 × 20 m`) bez jakiegokolwiek sprawdzenia istniejących sesji szybkościowych i bez przejścia przez `finalizeWeekPlan` | `modifications.ts:316-348`, gating `439-475` |
| H | Wszystkie bramki czytają `session.classification.category` z cache (`classOf` = `session.classification ?? classifySession`) → po przepisaniu treści bez `normalizeSessionCategory` decyzja jest podejmowana na starych metadanych | `sessionClassification.ts:492-494` |

### Proponowane jedno źródło prawdy
Nowy moduł `speedLoad.ts` z funkcją `getSpeedExposure(session): "none" | "technique" | "microdose" | "full"` liczoną **z treści ćwiczeń** (dystanse, liczba powtórzeń, intensywność), nie z tytułu. Klasy:
- **full** — pełny sprint jakościowy (akceleracja/max speed, pełne przerwy),
- **microdose** — 40-100 m ekspozycji,
- **technique** — technika biegu bez sprintu (brak obciążenia szybkościowego),
- **cod** — COD/hamowanie z maksymalnymi przyspieszeniami → liczy się jako **full**,
- **rsa** — liczy się jako **full** dla zasad sąsiedztwa, nawet gdy kategoria to `endurance_conditioning`.

Twarde zasady do egzekwowania w jednym miejscu: max 1 ekspozycja `full` dziennie (łącznie z `secondSession` i klubem), brak `full` dzień po dniu, min. 1 pełny dzień przerwy, druga sesja nigdy nie może zawierać `full`.

---

## 3. Siłownia

Jedyna funkcja kwalifikująca to `isMainGymSession` (`sessionClassification.ts:503-506`):
```ts
const c = classOf(session);
return c.isGym && !c.isPrehab && !c.isMobility && !c.isRecovery;
```
Brak progu czasu, objętości i intensywności. Skutki:

- `powerPrimer()` — 30 min, 3 ćwiczenia, `intensity: "niska"`, tytuł „Siłownia: primer mocy (lekko)" — **liczy się jako pełna siłownia** (`strengthBlocks.ts:1426-1469`).
- Filler naprawczy „Primer siłowy (utrzymanie)" — 30 min, 2 ćwiczenia — tworzony **wyłącznie po to, by zaspokoić minimum 2×gym** i natychmiast je zaspokaja (`weekFinalization.ts:663-731`, pętla `777`).
- Degradacja: każde naruszenie bezpieczeństwa meczowego podmienia całą sesję na `powerPrimer` (`strengthBlocks.ts:1900-1905`) — i ta zdegradowana sesja nadal liczy się do minimum.
- `bodyweight_strength` również liczy się w pełni, mimo że `requiresGymEquipment` (`globalPlanRules.ts:96-111`) odróżnia bodyweight, ale nie jest używane do liczenia tygodniowego.
- `recoveryPrehab` jest wykluczony **przypadkiem** — bo tytuł zawiera „regener" i łapie `RE_RECOVERY` wcześniej. To dowód, że wykluczanie nie jest świadomą bramką objętościową.
- Trzeci, niezależny pomysł na „ciężkość" siłowni: `isHardSession` (`globalPlanRules.ts:424`) — używany tylko do konfliktów tego samego dnia, bez związku z `isMainGymSession`.

### Proponowany kontrakt (pole `gymTier` w klasyfikacji)
| Tier | Minimum | Liczy się do tygodniowego minimum |
|---|---|---|
| `DEVELOPMENT_GYM` | ≥45 min, ≥1 główny wzorzec, ≥4 ćwiczenia, RIR 1-3 | tak (pełne) |
| `MAINTENANCE_GYM` | ≥30 min, ≥1 główny wzorzec z realnym obciążeniem | tak |
| `PRIMER_GYM` | aktywacja przed meczem/klubem | **nigdy** |
| `BODYWEIGHT_STRENGTH` | ≥30 min, progresje jednonóż + hamstring + core | tak, gdy `hasGym=false`; nie, gdy siłownia dostępna |

Klub + siłownia tego samego dnia: `DEVELOPMENT_GYM` rano + klub wieczorem dopuszczalne przy `doubleSessionsAllowed=yes_if_safe`, braku bólu, readiness ≥7, ≥5 h odstępu i braku meczu w 48 h. Przy `light_only` — wyłącznie `PRIMER_GYM`. MD-1, MD, MD+1 po >60 min meczu oraz po ciężkim dniu poprzednim — druga sesja zablokowana.

---

## 4. Jakość sesji sprinterskich i biegowych

- **Brak progresji techniki biegu A → C → B → D.** Istnieją pojedyncze drille (A-skip, B-skip, wall drill, ankling) dobierane przez `pick(variants, seed)` wyłącznie dla urozmaicenia (`sessionContent.ts:159-234`, `140-142`). Nie ma modelu progresji ani wersji z dostawieniem/bez.
- **Brak progresji tygodniowej dla sprintu i biegania**: `const seed = ctx.counters.sport + ctx.weekIndex` (`sessionContent.ts:789, 806, 812, 818`) — `weekIndex` rotuje wariant ćwiczenia, nie zmienia objętości ani intensywności. Siłownia ma prawdziwą progresję (`planRules.ts:229-243`, mnożniki `[0.82, 0.93, 1.08, 0.74]`), sprint nie.
- **Warstwa nazewnictwa myli**: `endurancePlanning.ts` (618 linii) nie zawiera **żadnej** treści (`prescription`/`rest`) — to tylko logika rozmieszczenia. Cała treść wydolnościowa jest w `sessionContent.ts`/`sessionVariants.ts`.
- Work:rest istnieje, ale niespójnie formatowany (`sessionContent.ts:602` `8 × 1 min bieg / 1 min trucht`; `610` `6-10 × 20-25 m, przerwa 30-40 s`).
- Brak rozdziału celów sprintu (akceleracja / max speed / hamowanie-COD) jako jawnego pola sesji — cel jest tylko w tekście.

## 5. Jakość sesji siłowni

Silnik siłowy jest najlepszą częścią systemu: pełne serie/powt./przerwy/RIR/tempo (`strengthBlocks.ts:877, 1009, 1138, 1324, 1693`), tabela RIR (`1922-1936`), konwersja RPE→RIR (`1996-2004`), progresja 4-tygodniowa (`planRules.ts:228-243`). **Nie należy go usuwać.**

Problemy:
- `powerPrimer` jako fallback bezpieczeństwa nie ma RIR, tempa ani liczbowych przerw (`strengthBlocks.ts:1442-1453`) — degraduje ważną sesję do „lekkiej techniki".
- `recoveryPrehab` (`1475-1534`) ma tylko czasy trwania — poprawne dla roli, ale potwierdza dwupoziomową jakość, której liczenie tygodniowe nie widzi.
- Brak jawnej różnicy między sesją 1 a 2 w tygodniu poza mnożnikiem obciążenia.
- Zakaz dwóch ciężkich dolnych dni z rzędu jest realizowany przez `enforceConsecutiveLowerBodySafety` na podstawie samego `intensity`, bez sprawdzenia wzorca ruchowego.

## 6. Architektura i źródła prawdy

Trzy niezależne taksonomie tekstu opisują te same ćwiczenia i mogą się nie zgadzać:
1. `sessionClassification.ts` — `RE_STRENGTH`/`RE_SPEED`/`RE_ENDURANCE` (liczenie tygodniowe),
2. `sessionContent.ts:88-105` — `GYM_RE`/`SPRINT_RE`/`CORE_RE` (czystość kategorii),
3. `sessionVariants.ts:711` `classifyExerciseTypes` (reguły MD-1).
Żadna nie korzysta z metadanych `exerciseLibrary.ts`.

Trzy validatory robiące częściowo to samo: `strengthBlocks.ts:2579`, `sessionContent.ts:715`, `sessionVariants.ts:711` + reguły dnia w `globalPlanRules.ts:480-513`.

Docelowe pojedyncze źródła prawdy:
| Obszar | Docelowa funkcja |
|---|---|
| klasyfikacja sesji | `sessionClassification.normalizeSessionCategory` (jedyna, zawsze po każdej mutacji treści) |
| speed load | nowy `speedLoad.getSpeedExposure` (z treści, nie z tytułu) |
| endurance load | `endurancePlanning` + jeden licznik oparty o klasyfikację |
| gym qualification | `gymTier` w klasyfikacji + `countsTowardGymMinimum` |
| limit sesji dziennie | `dailyScheduling.getMaxSessionsPerDay` (już wspólny) |
| konflikty dzień po dniu | `globalPlanRules.canPlaceSession` — podpięty do realnego pipeline |
| minima tygodniowe | `weeklyRequirements` (dziś dubluje `planRules.MAIN_GOAL_RULES`) |
| status `weekMeta` | jedna funkcja `refreshWeekMeta`, wywoływana wyłącznie na końcu |

Ryzyka: mutacje in-place bez unieważnienia `classification`, `weekMeta` przeliczane przed ostatnimi mutacjami, post-passy uruchamiane 4× w różnej kolejności.

## 7. Testy regresyjne do napisania

| # | Scenariusz | Oczekiwanie |
|---|---|---|
| 1 | main sprint + second sprint tego samego dnia | dokładnie 1 ekspozycja `full` |
| 2 | sprint pon + speed_exposure wt | druga przesunięta lub zdegradowana do techniki |
| 3 | sprint + RSA następnego dnia | RSA liczy się jako speed load → konflikt wykryty |
| 4 | sprint + COD z maks. przyspieszeniami | COD traktowany jako `full` |
| 5 | klub ze sprintem + własny sprint tego dnia | zablokowane |
| 6 | primer liczony jako gym minimum | `countsTowardGymMinimum === false` |
| 7 | dwa primery zamiast dwóch pełnych gym | tydzień `invalid` |
| 8 | development gym + klub tego samego dnia | dozwolone tylko przy `yes_if_safe`, gym rano |
| 9 | dzień niedostępny | repair go nie wykorzystuje |
| 10 | mecz w dniu niedostępnym | mecz ma pierwszeństwo |
| 11 | `hasGym=false` | bodyweight z realną treścią, brak sesji siłowni |
| 12 | 14 lat, beginner | brak wysokiej intensywności HIIT i maks. obciążeń |
| 13 | ból kończyny dolnej | brak sprintu, plyo, ciężkiej dolnej |
| 14 | 2/3/4 treningi klubowe × różne terminy meczu | brak konfliktów, minima spełnione |
| 15 | `doubleSessionsAllowed` = no / light_only / yes_if_safe | odpowiednio 0 / tylko primer / pełna druga sesja |
| 16 | granica tygodni (ndz + pon) | adjacency sprawdzone |
| 17 | tydzień niepełny (3 dni) | naprawy sprintu wykonane |
| 18 | regeneracja jednego tygodnia w `store.tsx` | dni graniczne rewalidowane |

**Nie zmieniamy oczekiwań istniejących testów, żeby były zielone.** Testy `speedPlanning.test.ts` i `dayPlacementScoring.test.ts` przenosimy na realny pipeline, a nie usuwamy.

## 8. Backlog PR-ów (kolejność obowiązkowa)

**PR 1 — Jedno źródło prawdy dla ekspozycji sprintowej (bez zmiany zachowania)**
Cel: dodać `speedLoad.ts` z `getSpeedExposure()` liczonym z treści + testy jednostkowe. Pliki: nowy `speedLoad.ts`, testy. Zakres: brak podpięcia do generatora. Ryzyko: zerowe. Efekt dla zawodnika: żaden (fundament).

**PR 2 — Podpięcie `getSpeedExposure` do `weekFinalization`**
Cel: `countSpeedSessions`/`adjacentDayHasSpeed`/`repairDuplicateSpeedSameDay`/`repairBackToBackSpeedSessions` liczą z treści, a RSA, klub-ze-sprintem i MD-2 z przyspieszeniami wchodzą do licznika. Pliki: `weekFinalization.ts:94-103, 288-470`, `sessionClassification.ts`. Testy: 1-5, 16. Ryzyko: więcej wykrytych konfliktów → więcej napraw, możliwe „chudsze" tygodnie. Zawodnik: znikają dwa dni sprintu z rzędu i podwójny sprint w jednym dniu.

**PR 3 — Naprawy sprintu również dla tygodni niepełnych i granic tygodni**
Cel: usunąć `continue` dla `!isFullCalendarWeek` i sprawdzać dzień przed/po slice'ie. Pliki: `weekFinalization.ts:1177-1220`, `store.tsx:664-681`. Testy: 16-18. Ryzyko: średnie (zmiana pierwszego/ostatniego tygodnia planu).

**PR 4 — `gymTier` i uczciwe minimum siłowni**
Cel: dodać `gymTier` + `countsTowardGymMinimum`; primer i filler przestają zaliczać minimum. Pliki: `sessionClassification.ts:503`, `weekFinalization.ts:663-830`, `weeklyRequirements.ts:244-260`. Testy: 6-8, 11. Ryzyko: **wysokie** — tygodnie mogą stać się `invalid`, dopóki nie powstanie PR 5. Wdrażać razem z PR 5.

**PR 5 — Generator realnych sesji zamiast fillera**
Cel: `addMissingGymSessions` buduje `MAINTENANCE_GYM` (nie 2-ćwiczeniowy primer), a `powerPrimer` przestaje być fallbackiem po naruszeniu bezpieczeństwa — zamiast tego wybierany jest bezpieczny wariant górnej partii/unilateralny. Pliki: `weekFinalization.ts:663-731`, `strengthBlocks.ts:1900-1905`. Testy: 7, 8, 13. Zawodnik: zamiast „Primer siłowy (utrzymanie) 30 min" dostaje realną jednostkę.

**PR 6 — Uporządkowanie post-passów i `weekMeta`**
Cel: jedna sekwencja: build → normalize → repair (pętla) → normalize → `refreshWeekMeta` na końcu; usunąć powtórzone wywołania z kroków 12 i 15. Pliki: `planEngine.ts:4330-4479`. Testy: cały istniejący zestaw + brak oscylacji (plan deterministyczny w 10 uruchomieniach). Ryzyko: wysokie, ale to jedyna droga do usunięcia cofania poprawek.

**PR 7 — Usunięcie/podpięcie martwego kodu**
Cel: `speedPlanning.ts` i `dayPlacementScoring.ts` — albo podpiąć `canAddSessionToDay`/`wouldCreateDuplicateSpeedDay` do realnego pipeline, albo usunąć wraz z testami. Rekomendacja: przenieść wartościowe reguły do `speedLoad.ts`/`globalPlanRules.ts` i **usunąć oba pliki**, bo dziś dają fałszywe poczucie pokrycia testami.

**PR 8 — Bramki dla `modifications.ts`**
Cel: propozycja `"sprint"` sprawdza istniejące ekspozycje i sąsiedztwo; po zastosowaniu modyfikacji uruchamiany jest `finalizeWeekPlan`. Pliki: `modifications.ts:316-348, 439-475`. Testy: 1, 3, 5.

**PR 9 — Jakość sprintu i biegania**
Cel: jawne pole `speedGoal` (akceleracja / max speed / hamowanie), progresja techniki A → C → B → D, limit metrów jakościowych, work:rest w jednym formacie, realna progresja tygodniowa (nie tylko rotacja wariantu). Pliki: `sessionContent.ts:159-234, 780-830`, `sessionVariants.ts`. Testy: kontrakt treści sesji sprintowej.

**PR 10 — Ujednolicenie taksonomii ćwiczeń**
Cel: `exerciseLibrary.ts` jako jedyne źródło tagów; `sessionContent.ts` i `sessionVariants.ts` przestają mieć własne regexy. Ryzyko: wysokie, robić na końcu.

## Błędne założenia do usunięcia

1. „Mamy reguły anty-duplikacji sprintu" — mamy, ale w module, którego generator nie importuje (`speedPlanning.ts`, `dayPlacementScoring.ts`).
2. „Prehab nie liczy się jako siłownia, więc minimum jest uczciwe" — wykluczenie prehabu wynika z przypadkowego dopasowania słowa „regener", nie z bramki objętościowej.
3. „RSA to wydolność" — fizjologicznie to powtarzany sprint maksymalny i musi wchodzić do speed load.
4. „Więcej post-passów = bezpieczniej" — cztery przebiegi `validateAndRepairWeekPlan` cofają sobie nawzajem poprawki.
5. „`weekIndex` daje progresję" — daje tylko rotację wariantów ćwiczeń.
