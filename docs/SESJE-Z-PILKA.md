# Indywidualna sesja z piłką · silnik V2.13

Sesja z piłką („Individual Ball Skills”) wchodzi do tygodnia przy celu ogólnym, przy dodatkowym ograniczeniu „piłka” lub przy pierwszym akcencie piłkarskim. Wymaga zadeklarowanej piłki. Do V2.12 był to krótki blok trzech zadań po 30–45 s. Od V2.13 to pełna sesja.

## Budowa

1. Rozgrzewka z piłką, 1 × 120 s: czucie piłki (stała).
2. Przyjęcie: przy ścianie albo z własnego podania (stałe, zależne od zadeklarowanej ściany).
3. Podanie lub obrót: zadanie rotowane co tydzień, z uwzględnieniem pozycji.
4. Prowadzenie: bramki, zwody, szybkie prowadzenie.
5. Wyzwanie: wykończenie, żonglerka, długie podanie, slalom na czas.
6. Spokojne kontakty, 1 × 90 s.

Bramkarz zamiast punktów 2–5 dostaje rozegranie, chwyty przy ścianie, przyjęcie, podanie do celu i wybicie do strefy.

## Dawka

| Zawodnik                        | Zadania 2–5 | Przerwa |
| ------------------------------- | ----------- | ------- |
| Początkujący lub poniżej 16 lat | 2 × 45 s    | 30 s    |
| Średniozaawansowany             | 3 × 60 s    | 45 s    |
| Zaawansowany, elita             | 3 × 75 s    | 45 s    |

- Deload albo sesja obok klubu: 2 serie i bez zadań szybkich lub siłowych (szybkie prowadzenie, slalom, wykończenie).
- Za mało czasu: najpierw znika wyzwanie, potem prowadzenie, potem podanie. Przy dalszym braku czasu odejmowane są serie.

## Miejsce w tygodniu

- Najpierw własny dzień bez klubu i bez innej sesji, z dala od meczu (nie MD-1, nie MD+1).
- Gdy takiego dnia brak, sesja trafia obok klubu jako lżejsza wersja.
- Sesja nie wypiera siły, sprintu ani wydolności.

Kod: `engineV2/support.ts` (`buildSkills`), `planner.ts`. Testy: `support.test.ts`, `ballSessions.test.ts`.
