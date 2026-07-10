# Vision Lab: automatyczny gotowy wynik dla zawodnika

## Cel
Każdy poprawnie nagrany test ma dawać zawodnikowi **gotowy wynik liczbowy** liczony klatka po klatce, bez ręcznego zaznaczania linii i bez czekania na trenera — o ile fizyka na to pozwala. Coach review zostaje tylko jako fallback przy niskiej pewności, nie jako domyślna ścieżka.

## Co już działa (zostawiamy)
- CMJ → wysokość wyskoku z czasu lotu (metoda flight-time, bez skali).
- Pogo → czas kontaktu, wysokość, RSI (czasowe, bez skali).
Te dwa już zwracają `completed` i pełny raport.

## Co trzeba naprawić (teraz idą do trenera zamiast do zawodnika)

### 1. Auto-kalibracja skali z wzrostu zawodnika
Testy dystansowe (sprint, broad jump) potrzebują skali metry↔piksele. Zamiast prosić o rysowanie linii, wyliczamy skalę z **realnego wzrostu zawodnika** (z profilu `athlete_profiles.height_cm`) zmierzonego w pikselach w stabilnej klatce stojącej (kostka→bark z antropometrycznym współczynnikiem, lub kostka→czubek głowy).
- Nowy moduł `autoCalibration.ts`: `estimateScaleFromHeight(poses, heightCm)` → metry na jednostkę znormalizowaną + confidence.
- Wzrost przekazywany do `runVideoAnalysis` z profilu zawodnika (flow/onboarding).
- Gdy brak wzrostu lub niestabilna sylwetka → niższy confidence → fallback coach.

### 2. Sprint 20/30 m — automatyczny czas i prędkość
- Start = moment ruszenia (próg prędkości poziomej bioder), wykrywany z klatek.
- Meta = klatka, w której zawodnik pokonał znany dystans (20/30 m) wg auto-skali.
- Prędkość = dystans / czas (dystans znany z protokołu).
- Bez rysowania linii; przy słabej skali/perspektywie → needs_review.

### 3. COD (5-10-5, Sprint to Stop) — automatyczny czas (czasowe, bez skali)
- 5-10-5: czas całkowity = ruszenie → końcowe zatrzymanie; czas hamowania z minimów prędkości.
- Sprint to Stop: czas do zatrzymania + czas hamowania.
- Usunąć twarde `needs_review` — publikować wynik czasowy zawodnikowi, gdy pewność OK.

### 4. Broad Jump — automatyczna długość skoku
- Odbicie i lądowanie z detekcji stóp; przemieszczenie stopy × auto-skala = długość w metrach.
- Bez ręcznego wpisywania dystansu; przy słabej skali → needs_review.

### 5. Gym Technique — bez zmian w polityce
Zostaje analiza techniki + coach review (bez fałszywego pomiaru AI). Dodatkowo pokazujemy zawodnikowi uczciwe, mierzalne dane: liczba powtórzeń, tempo, względny zakres ruchu — werdykt techniczny nadal od trenera.

### 6. Polityka statusu i raport zawodnika
- `statusPolicy` + progi confidence dostrojone tak, by `completed` był domyślny dla poprawnych nagrań, a coach review był wyjątkiem.
- Ekran wyniku zawodnika pokazuje główną wartość (wysokość / prędkość / czas / długość), metryki pomocnicze, pewność analicy i krótką interpretację — jako gotowy raport.

## Szczegóły techniczne
- `src/features/vision-analysis/autoCalibration.ts` (nowy) + testy jednostkowe.
- Zmiany w `sprintAnalyzer.ts`, `codAnalyzer.ts`, `broadJumpAnalyzer.ts`: auto-detekcja start/stop, użycie auto-skali, złagodzenie wymuszonego `needs_review`.
- `runVideoAnalysis` przyjmuje `athleteHeightCm`; przekazane z `VisionAutoAnalysis` (profil zawodnika).
- `statusPolicy.ts`: gating przez confidence zamiast twardego blokowania testów dystansowych.
- Deterministyczne obliczenia, pokryte testami (`analyzers.test.ts`, nowe przypadki kalibracji i sprintu/COD).
- Wszystkie wartości walidowane zakresami fizycznymi (`PLAUSIBLE_RANGES`) — brak losowych wyników; poza zakresem → needs_review.

## Kryteria ukończenia
- CMJ, Pogo, Sprint, COD, Broad Jump dają zawodnikowi automatyczny wynik liczbowy dla poprawnego nagrania.
- Coach review pojawia się tylko przy niskiej pewności / niepoprawnym nagraniu.
- Gym zostaje przy coach review (bez fałszywego pomiaru).
- Testy jednostkowe i typy przechodzą.
