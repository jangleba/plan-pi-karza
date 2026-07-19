# Vision Lab — manualna checklista walidacji 13 testów

Ten dokument służy WYŁĄCZNIE do ręcznej walidacji pipeline'u Vision Lab na
prawdziwych filmach z aparatu telefonu. Testy syntetyczne (jednostkowe) NIE są
dowodem działania na realnych nagraniach.

Uruchom każdą pozycję na urządzeniu (telefon lub laptop z realnym plikiem MP4/MOV),
otwierając stronę wyniku z parametrem `?visionDebug=true`, aby zobaczyć pełny
`UnifiedVisionReport`, log klatek, timestampów, `motionWindow`, wykrytą liczbę
powtórzeń, użyty adapter, wynik i konkretny kod błędu.

Dla każdego testu zapisz w kolumnie „Wynik”: PASS / FAIL / N/A.

| # | Test | Adapter | Kalibracja | Protokół (powtórzenia, margines) | Wynik |
|---|------|---------|-----------|-----------------------------------|-------|
| 1 | CMJ | `cmj@vX` | brak | 1 skok, 2 s / 2 s | |
| 2 | Squat Jump | `squat_jump@vX` | brak | 1 skok bez zamachu, 2 s / 2 s | |
| 3 | Drop Jump | `drop_jump@vX` | brak (120–240 FPS) | 1 kontakt + odbicie, 2 s / 2 s | |
| 4 | Repeated Jumps | `repeated_jumps@vX` | brak (120–240 FPS) | 4–30 odbić w serii | |
| 5 | Pogo Jumps | `pogo_jumps@vX` | brak (120–240 FPS) | 6–30 krótkich odbić | |
| 6 | Broad Jump | `broad_jump@vX` | homografia per-film | 1 skok, widoczna pięta lądowania | |
| 7 | Single Leg Hop L | `single_leg_hop@vX` | homografia | 2 prawidłowe próby, lewa | |
| 8 | Single Leg Hop R | `single_leg_hop@vX` | homografia | 2 prawidłowe próby, prawa | |
| 9 | Sprint 20 m | `sprint_20m@vX` | linie START + FINISH | 1 bieg, 2 s zapasu z obu stron | |
| 10 | Sprint 30 m | `sprint_30m@vX` | linie START + FINISH | 1 bieg | |
| 11 | Flying Sprint | `flying_sprint@vX` | TIMING_A + TIMING_B | rozbieg poza A, pomiar A→B | |
| 12 | 5-10-5 (COD) | `five_ten_five@vX` | CENTER + TURN_L + TURN_R | pełna sekwencja zwrotów | |
| 13 | Sprint to Stop | `sprint_to_stop@vX` | BRAKING_ENTRY + STOP_ZONE_START + STOP_ZONE_END | pełne zatrzymanie w strefie | |

## Co obserwować w panelu `?visionDebug=true`

Panel dowodowy pokazuje dla każdej analizy:

- FPS zmierzone vs deklarowane,
- `decodedFrames` / `analyzedFrames` (klatki z sylwetką),
- `motionWindow`: start, koniec, długość, `leadingMarginSeconds`,
  `trailingMarginSeconds`, `approximateVerticalRepetitions`,
  `activeSegments`, `withinExpectedDuration`, `withinExpectedRepCount`,
  `hasSufficientMargins`,
- `recognition`: `selectedTestType`, `detectedSignature`, `detectedTestConfidence`,
  `protocolMatch`,
- listę `keyEvents` z timestampami mikrosekundowymi,
- użyty adapter (`testType@analyzerVersion`) i `algorithmVersion` protokołu,
- wynik oraz `qualityIssues` (kody błędów / ostrzeżeń — np. `TEST_WINDOW_INCOMPLETE`).

## Powtarzalność

Dla wybranej pozycji (np. CMJ i Broad Jump) uruchom **10 pełnych analiz**
tego samego pliku (bez cache przeglądarki). Sprawdź:

- identyczne `keyEvents` (mikrosekundowe timestampy),
- identyczny `motionWindow.startTimestampSeconds` / `endTimestampSeconds`,
- identyczna wartość główna metryki,
- identyczne `resultStatus` / `qualityTier`.

Rozbieżności zapisz w tym pliku obok danego wiersza.

## Uwaga

Testy syntetyczne w `src/features/vision-analysis/*.test.ts` weryfikują tylko
determinizm silnika i regresje logiki. NIE stanowią dowodu poprawności na
realnych filmach — do tego służy właśnie ta checklista.
