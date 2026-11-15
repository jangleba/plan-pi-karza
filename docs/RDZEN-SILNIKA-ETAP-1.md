# Etap 1 — integralność rdzenia (baza `638c2f28`, po #163)

Pierwszy etap specyfikacji „kompletny silnik treningowy, Progres i wyszukiwarka partnerów”.
Kolejność z specyfikacji: **rdzeń** → bieganie i siła → pełna technika → synchronizacja i Progres → wyszukiwarka 18+.

## Zrobione w tym etapie

| Wymaganie                                      | Zmiana                                                                                                                                                                                                                                                                                                                         | Test                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Progresja siły oceniana na kompletnym tygodniu | po rozmieszczeniu wszystkich zadań tygodnia (sprint, bieg, klub, mecz) każda sesja siłowa jest oceniana ponownie tą samą funkcją co korekty; zmiana zostaje tylko, gdy tydzień pozostaje równie poprawny                                                                                                                       | `coreIntegrity.test.ts` (niezmiennik: plan = ocena na pełnym kalendarzu; przed zmianą 6/1090 sesji się różniło) |
| Czas po ostatecznej dawce, wariant kompaktowy  | `finalizeStrengthRecipe`: najpierw akcent i potwierdzona progresja, dopiero potem budżet czasu; przy braku miejsca istniejący wariant kompaktowy, inaczej jawny brak (`TIME_LIMIT`)                                                                                                                                            | `coreIntegrity.test.ts`                                                                                         |
| Wspólne reguły generowania i korekt            | `refreshStrengthSession` używa tego samego routingu profilu wg celu i tej samej funkcji co generator (wcześniej: surowy profil i przycinanie do bieżącego czasu sesji)                                                                                                                                                         | `coreIntegrity.test.ts`                                                                                         |
| Zapisany budżet czasu przy starcie             | `planTimeBudget(plan)`; `sessionStartIssue` waliduje recepturę wobec budżetu planu, nie stałych 75 min                                                                                                                                                                                                                         | `coreIntegrity.test.ts`                                                                                         |
| Serwer odrzuca start zastąpionej sesji         | migracja `20261116090000_reject_superseded_session_start.sql`: pierwszy start wymaga sesji w migawce aktywnego planu (`plan_json`) lub w aktywnej modyfikacji. Wcześniej ponownie użyty wiersz `training_days` przepięty do nowego planu „przenosił” starą sesję tego dnia. Wpisy historyczne i rozpoczęte wykonania bez zmian | `sql/supersededStart.sql.test.ts` (PGlite)                                                                      |
| Nowe tempa po MAS przez propozycję             | usunięty automatyczny zapis (`useRunningCalibration`); `proposeRunningCalibration` pokazuje każdą zmienioną przyszłą sesję (przed → po) w istniejącej karcie „Zastosuj / Zostaw plan”; zapis przez aktywację z kontrolą wersji; blokada przy niepotwierdzonych zapisach                                                        | `runningCalibration.test.ts`, `useFeedbackAdjustment.test.tsx`                                                  |

Zachowane: atomowe zapisy, kolejka offline, kontrola wersji, dwa sloty dnia, ochrona wykonania.

## Wdrożenie

Migracja `20261116090000_reject_superseded_session_start.sql` zmienia tylko `save_training_log` (bez nowych tabel). Jest zgodna wstecz z obecnym klientem, więc może być zastosowana przed lub po wdrożeniu frontendu. Nie stosowano jej na żadnej zdalnej bazie.

## Nie zrobione w tym etapie (pozostałe punkty specyfikacji)

- Rdzeń: dodatkowe aktywności zapisywane niezależnie od planu; check-in wyłącznie na Start (zgodnie z planem / lżej / mniej czasu / pomijam, czas, miejsce, sprzęt) bez danych zdrowotnych — obecny check-in gotowości i check-in ciężaru przy starcie siłowni nadal istnieją.
- Bieganie i sprint: wybór metody niezależny od fazy `peak`, metoda i uzasadnienie w recepturze przy wznowieniu, osobna progresja metod, fazy rozgrzewka/praca/przerwy/zakończenie z odcinkami częściowymi i pominiętymi, pochodzenie wyniku, identyfikacja prób sprintu (ćwiczenie/wystąpienie/runda/powtórzenie/strona), wynik Lab jako referencja.
- Siła: jeden model receptury dla planu, instrukcji, runnera i walidacji; wystąpienie ćwiczenia w bloku i strona w zapisie; prezentacja deloadu/powrotu/niepełnego zapisu.
- Technika: cel `football_technique`, pełna jednostka techniczna, wymagania mocniejszych ćwiczeń, partner potwierdzony dla sesji, receptura na czas **lub** liczbę prób, opcjonalny wynik prób.
- Progres: pełna historia konta (wszystkie moduły), widoki i filtry, sesje rozpoczęte/przerwane/pominięte, wersjonowane wyniki modułowe, import idempotentny, dane > 45 dni, jawne stany zapisu, naprawy hydratacji MAS i Fuel.
- Wyszukiwarka partnerów 18+: tylko projekt w specyfikacji; brak backendu, migracji i interfejsu.
