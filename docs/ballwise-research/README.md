# Silnik ćwiczeń BallWise – katalog badawczy i raport kompletności

Dane źródłowe (z zlecenia v1.0, 23.11.2026): `src/engine/exercise/data/research-catalog.compact.json` (237 kandydatów w formie `defaults` + rekordy;
suma kontrolna rozwiniętych rekordów jest sprawdzana testem) oraz `source-registry.json` (24 źródła, mapa tagów). Wszystkie rekordy zostają
`research_candidate`, `autoPublish=false`. Nie ma ich w puli produkcyjnej – `qualify` zwraca `not_published`.

## Liczby
| | |
|---|---|
| Pozycje aktywne (pula produkcyjna, ID bez zmian) | 55 |
| Kandydaci badawczy | 237 (gym 119, ballistic 18, plyometric 24, sprint 31, deceleration_cod 16, conditioning 9, dynamic_mobility 20); 155 bazowych + 82 warianty |
| Scalone duplikaty (pozycja obecna ↔ kandydat, 1:1) | 33 (mapa `LEGACY_TO_RESEARCH` w `variants.ts`) |
| Obecne bez kandydata (celowo, np. zbiorcze „skip A/B/D”, `copenhagen` = plank ≠ izometria Copenhagen) | 22 |
| Kandydaci bez odpowiednika w puli | 204 |
| Kandydaci bez przypisanego źródła (puste `sourceTags`) | 6 (conditioning bez tagów – jawna luka) |

## Czego brakuje do publikacji kandydata (dotyczy wszystkich 237)
instrukcje po polsku, zmapowana i sprawdzona demonstracja, recepty wg typu (parametry z `parameterRequirements`), relacje zamian dla funkcji
slotu, funkcje slotu (`functions`), przegląd trenera. Dla pozycji aktywnych: instrukcje i animacje są (z `exercises/info.ts`), ale wymagania,
nadzór, sprzęt i dawki zastępcze to robocze decyzje produktu – do przeglądu trenera.

## Założenia produktu (do przeglądu)
- Profil „gym/field/track/bodyweight” daje tylko zgrubną bazę sprzętu i miejsca (`qualify.ts`). Reszta (ślizgacze poza siłownią, guma z kotwą, stół, nadzór, partner) wymaga deklaracji zawodnika. Partner nie jest sprzętem.
- Kompetencje: `self_assessed`, `previously_trained`, `coach_assessed`, `performed_in_app` to osobne źródła; przeszkolenie specjalisty (`qualified_instruction_*`) nie jest spełnione samooceną; `qualified_required` wymaga też bieżącego nadzoru. Ocena trenera (`coach_assessed`) nie ma jeszcze ekranu – brak takiego wejścia w aplikacji.
- Rotacja: polityka `ROTATION_POLICY` v1 (blok 5 tygodni, rotują tylko role `accessory`/`preparation`, ziarno stabilne); dawki zastępcze `POLICY_VERSION` 1.
- Stan silnika (`exerciseState`, `exercisePlan:*`) jest lokalny; nie jest synchronizowany z chmurą (stary `weightLog` jest jak dotąd).
