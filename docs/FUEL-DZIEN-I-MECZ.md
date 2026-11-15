# Fuel: dzień, mecz i bezpieczeństwo danych (`fuel-targets-1`)

## Podstawa

- UEFA expert group statement on nutrition in elite football (Collins i in., BJSM 2021): periodyzacja
  węglowodanów, MD-1/MD/MD+1 6–8 g/kg, białko ok. 1,6–2,2 g/kg, posiłek przedmeczowy 3–4 h przed,
  30–60 g/h w trakcie (jeśli przećwiczone), ok. 1 g/kg CHO + 0,3 g/kg białka po meczu.
- IOC consensus on REDs (Mountjoy i in., BJSM 2023): unikanie niskiej dostępności energii, brak
  deficytów dla rosnących zawodników.
- Wartości elitarne nie są przenoszone mechanicznie: zakresy są szerokie, oznaczone jako
  orientacyjne, w planie meczowym użyto dolnych wartości.

## Model dnia (`src/lib/fuel/dayTargets.ts`)

Deterministyczny, wersjonowany (`FUEL_TARGETS_VERSION`). Typ dnia z kalendarza i wykonania:

| Typ               | CHO g/kg | Kiedy                                               |
| ----------------- | -------- | --------------------------------------------------- |
| rest              | 3–4      | brak aktywności                                     |
| light             | 3–5      | krótko/lekko; dzień odpoczynku po mocnym dniu       |
| moderate          | 4–6      | ≥45 min lub umiarkowane obciążenie                  |
| heavy             | 6–8      | wysokie obciążenie ≥60 min lub ≥120 min łącznie     |
| match_prep (MD-1) | 6–8      | jutro mecz — **niezależnie od lekkiego treningu**   |
| match (MD)        | 6–8      | dziś mecz                                           |
| match_recovery    | 6–8      | wczoraj mecz (nie, gdy zawodnik nie zagrał — 0 min) |

- Energia = (4·CHO + 4·białko) / (1 − udział tłuszczu 25–30 %). Bez BMR, bez RPE, bez kalorii z zegarka.
- Deduplikacja: ta sama sesja (dbId) liczy się raz; wykonanie zastępuje plan (rzeczywisty czas),
  odwołana/nieodbyta i dzień niedostępny nie liczą się; dwie sesje dnia sumują minuty.
- Aktywność poza treningiem jest pytaniem „poza treningiem”, przesuwa dzień najwyżej o jeden poziom.
- Bez masy ciała (zgoda Fuel Precision) albo poniżej 16 lat: tylko porcje, „ograniczona precyzja”.
- <18 lat: białko 1,6–2,0 g/kg; brak jakiegokolwiek celu redukcji lub deficytu (model nie ma takiego wejścia).

## Plan meczowy (`src/lib/fuel/matchPlan.ts`)

Kroki: posiłek 3–4 h przed (4 h przy wrażliwym żołądku), przekąska 60–90 min przed (opcjonalna,
obowiązkowa gdy od posiłku >4 h), w trakcie (opcjonalnie, nic nowego w meczu), do 1 h po, pełny
posiłek 1–3 h po. Uwzględnia godzinę z kalendarza (lub ustawioną w Fuel), przewidywany udział
(cały/część/ławka), czas od ostatniego posiłku, tolerancję. Przeliczany przy każdej zmianie planu.

## Dane i zgody

| Dane                                               | Gdzie                | Zgoda                    | Wycofanie                                  |
| -------------------------------------------------- | -------------------- | ------------------------ | ------------------------------------------ |
| Alergie, status alergii, nietolerancje             | `athlete_profiles`   | `health_data` (2.2+)     | serwer czyści; klient czyści stan          |
| Wykluczenia („czego nie jem”)                      | `athlete_profiles`   | brak (preferencja)       | —                                          |
| Masa ciała                                         | `athlete_profiles`   | `fuel_precision`         | serwer czyści; model wraca do porcji       |
| Tolerancja jedzenia przed wysiłkiem                | urządzenie (Fuel v3) | traktowana jak zdrowotna | usuwana z urządzenia i z kopii bez tekstów |
| Aktywność poza treningiem, udział, ostatni posiłek | urządzenie           | brak                     | —                                          |

Serwer: `enforce_optional_health_profile_fields` (istniejący) usuwa alergie bez zgody;
`enforce_fuel_youth_rules` (nowy, `20261117090000_fuel_youth_body_mass.sql`) nie zapisuje masy
ciała dla kont <16 lat.

## Warunki uruchomienia (niespełnione w kodzie)

1. Migracja `20261117090000_fuel_youth_body_mass.sql` (oraz wcześniejsze niezastosowane) musi zostać
   zastosowana w produkcji.
2. Walidacja progów i tekstów przez dietetyka sportowego (zwłaszcza 16–17 lat i amatorzy).
3. Ocena prawna: podstawa przetwarzania alergii (dane szczególnej kategorii, art. 9 RODO) dla
   16–17 lat, DPIA, aktualizacja Polityki prywatności (wciąż mówi o kontach od 13 lat).
4. Kopie zapasowe modułów zapisane w chmurze przed wycofaniem zgody — do sprawdzenia, czy
   usuwanie obejmuje je po stronie serwera.
