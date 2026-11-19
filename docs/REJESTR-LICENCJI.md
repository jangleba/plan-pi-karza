# Rejestr źródeł i licencji

Plik jest GENEROWANY z `src/legal/licenses.ts` (`node scripts/registry.mjs`). Nie edytuj ręcznie – zmieniaj rejestr w kodzie. Zależności npm: patrz `docs/zaleznosci-licencje.md` (generowane przez `node scripts/licenses.mjs`).

To rejestr roboczy, a NIE opinia prawna. Pozycje oznaczone „do ustalenia” wymagają sprawdzenia warunków przez operatora przed sprzedażą.

| Źródło | Do czego użyte | Licencja / warunki | Uznanie autorstwa w aplikacji | Status | Uwagi |
|---|---|---|---|---|---|
| USDA FoodData Central (SR Legacy) | wartości odżywcze produktów w module Fuel (src/engine/foods.ts, z identyfikatorami fdc) | domena publiczna (CC0 1.0) | Dane: USDA FoodData Central | ustalone | Dane amerykańskich produktów – nie zawsze odpowiadają produktom w Polsce. Atrybucja nie jest wymagana, podajemy ją z uczciwości. |
| Open Food Facts | wyszukiwanie produktów przez trasę serwerową /api/foods; wyniki wybrane przez użytkownika zapisywane lokalnie na jego urządzeniu | baza: ODbL 1.0; treść: DbCL; zdjęcia: CC BY-SA | Dane: Open Food Facts (ODbL). openfoodfacts.org | ustalone | Wymagana atrybucja i zachowanie ODbL dla baz pochodnych (share-alike dotyczy bazy danych i jej adaptacji, a NIE kodu aplikacji). Nie kopiujemy OFF do własnej, współdzielonej bazy – wyniki zostają lokalnie u użytkownika. Wyszukiwane hasło trafia do usługi OFF. |
| Mapbox / OpenStreetMap | kafelki mapy w module biegowym (jeśli skonfigurowano VITE_MAPBOX_TOKEN) | warunki Mapbox; dane © współtwórcy OpenStreetMap (ODbL) | © Mapbox © OpenStreetMap | ustalone | Atrybucja jest na mapie. Zapytania o kafelki ujawniają Mapbox adres IP i obszar mapy. Warunki konta Mapbox (limity, komercyjne użycie) do sprawdzenia przez operatora. |
| Mixamo (Adobe) – postać i animacje IQ | public/iq/player.glb, idle.json, walking.json, soccer-pass.json oraz klip biegu zapisany w modelu | warunki Adobe Mixamo (nie zweryfikowane dla tej aplikacji) | – | **do ustalenia** | Pochodzenie i warunki KONKRETNYCH plików trzeba ustalić (konto, data pobrania, zakres użycia w produkcie komercyjnym). Pliki NIE są usuwane automatycznie – decyzja po ustaleniu warunków. Do tego czasu nie wolno udostępniać plików osobno jako zasobów do pobrania. |
| MediaPipe Tasks Vision i model pozy (pose_landmarker_lite) | detekcja pozy w Labie (CMJ) – w przeglądarce użytkownika | Apache-2.0 (biblioteka); model: warunki karty modelu Google (do potwierdzenia) | – | ustalone | Biblioteka WASM ładowana z jsDelivr, model z Google Cloud Storage: te serwery widzą adres IP użytkownika. Wideo nie jest wysyłane. Wynik jest szacunkiem własnego algorytmu, a nie zwalidowanym pomiarem. |
| My Jump / MySprint (publikacje walidacyjne) | źródła opisowe w docs/ZRODLA-LAB.md; wzory fizyczne (czas lotu → wysokość) | n/d – nie przenosimy wyników badań na własny algorytm | – | ustalone | Własny algorytm detekcji lotu NIE dziedziczy trafności z badań o aplikacjach My Jump/MySprint; w aplikacji oznaczony jest jako szacunek. |
| Zależności (React, TanStack, Three.js, Leaflet, supabase-js, Tailwind i in.) | kod aplikacji | w większości MIT/BSD/Apache-2.0 – zestawienie generowane: docs/REJESTR-LICENCJI.md | – | ustalone | Zestawienie pochodzi z package.json zainstalowanych pakietów (npm run licenses). |

## Pozycje do ustalenia przez operatora

- **Mixamo (Adobe) – postać i animacje IQ**: Pochodzenie i warunki KONKRETNYCH plików trzeba ustalić (konto, data pobrania, zakres użycia w produkcie komercyjnym). Pliki NIE są usuwane automatycznie – decyzja po ustaleniu warunków. Do tego czasu nie wolno udostępniać plików osobno jako zasobów do pobrania.

## Zasady przyjęte w projekcie

- Licencja ODbL (Open Food Facts) dotyczy bazy danych i jej adaptacji, a nie kodu aplikacji; nie kopiujemy OFF do własnej współdzielonej bazy.
- Mixamo: nic nie jest usuwane automatycznie. Najpierw trzeba ustalić pochodzenie i warunki konkretnych plików (konto, data pobrania, zakres użycia komercyjnego).
- Publiczna dostępność strony, RSS ani robots.txt nie są licencją na wykorzystanie treści: źródła radaru są dopuszczane pojedynczo, z zapisaną podstawą.
