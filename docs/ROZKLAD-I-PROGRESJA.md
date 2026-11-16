# Rozkład tygodnia i progresja w bloku · silnik V2.15

## Wolne dni przed drugą sesją

Do V2.14 przy wolnym tygodniu (np. poza sezonem) spokojny bieg trafiał jako druga sesja do dnia z siłownią, choć czwartek, sobota i niedziela zostawały wolne. Wszystkie miejsca miały ten sam koszt, a wygrywał najwcześniejszy dzień.

Od V2.15 druga własna sesja w dniu z inną sesją (`append_second`) ma koszt +1. Solver tygodnia nadal najpierw maksymalizuje liczbę pokrytych celów, a koszt jedynie rozstrzyga remisy. Dlatego druga sesja w dniu zostaje tylko wtedy, gdy nie ma równie dobrego wolnego dnia. W sezonie z klubem i meczem nic się nie zmienia, bo wolnych dni zwykle brakuje.

## Progresja spokojnego biegu

| Tydzień bloku (`cycle.weekIndex % 4`) | Spokojny bieg (dorośli / <16 lat) |
| ------------------------------------- | --------------------------------- |
| 1 (build)                             | 20 / 15 min                       |
| 2 (build)                             | 22 / 17 min                       |
| 3 (build)                             | 24 / 18 min                       |
| 4 (przegląd)                          | 20 / 15 min                       |

- Bez wzrostu: deload, powrót, ograniczenie zmęczeniem (wtedy bieg ma maks. 15 min), tydzień ponownego wejścia.
- Jeśli dłuższy bieg nie mieści się w czasie sesji, silnik cofa się o krok, zamiast usuwać bieg.
- Interwały (z aktualnym MAS) nie rosną automatycznie. Tak było już wcześniej (#165) i zostaje bez zmian.
- Siła zachowuje stałą dawkę w tygodniach 1–3. Progresja ciężaru wynika z zapisanych serii (GP2, `gymProgression.ts`), a nie z kalendarza.

Testy: `blockProgression.test.ts`.
