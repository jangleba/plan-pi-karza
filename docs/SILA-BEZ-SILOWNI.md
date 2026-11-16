# Siła bez siłowni · silnik V2.14

Do V2.13 sesje A/B bez siłowni zostawiały puste zadania:

- początkujący z niską kompetencją ruchową nie miał pchania, bo pompka była za trudna, a pompka na podwyższeniu wymaga ławki;
- bez gumy i drążka nie było przyciągania;
- bez gumy, ślizgów i stanowiska do nordyckich nie było zgięcia kolana.

## Zmiany

| Zadanie        | Nowy wariant bez sprzętu                    | Dla kogo                                                                                                                           |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Pchanie        | `wall_push_up` · pompka przy ścianie        | Każdy, także przy niskiej kompetencji ruchowej. Ostatni w kolejności, więc pompka lub sprzęt mają pierwszeństwo.                   |
| Przyciąganie   | `prone_ytw_raise` · Y-T-W w leżeniu przodem | Gdy nie ma hantli, wyciągu, stanowiska do wiosłowania ani gumy.                                                                    |
| Zgięcie kolana | `bridge_walkout` · chód piętami z mostu     | Gdy nie ma maszyny, ślizgów, gumy ani stanowiska do nordyckich. Wymaga kompetencji ruchowej wyższej niż niska (reguła biblioteki). |

Oba nowe ćwiczenia (w `gymExerciseExpansions.ts`) mają po 3 kroki instrukcji. Są na liście `INSTRUCTION_ONLY_GYM_IDS`, więc nie dostają cudzej animacji.

## Granice

- Początkujący z niską kompetencją bez gumy nadal nie ma zgięcia kolana. Ten brak jest jawnie zgłaszany, a sesja ma most biodrowy jako wzorzec tyłu nóg.
- Sprint, bieg i aktywacja przed meczem nadal wymagają zadeklarowanego boiska, terenu lub prostej do sprintu. Dodanie pola „miejsce do biegania” to decyzja produktowa (zob. `SPOJNOSC-SILNIKA.md`).

Testy: `noGym.test.ts`.
