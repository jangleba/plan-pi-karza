/**
 * Rejestr źródeł i licencji (żywy: aplikacja pokazuje z niego wymagane uznania autorstwa; pełny opis w docs/REJESTR-LICENCJI.md).
 * status: "ok" – warunki znane i spełnione w kodzie; "do_ustalenia" – wymaga ustalenia pochodzenia/warunków przez operatora (nic nie usuwamy automatycznie).
 */
export interface LicenseEntry {
  id: string;
  name: string;
  used: string;
  license: string;
  /** Tekst uznania autorstwa pokazywany użytkownikowi (null = nie wymagany prawem/licencją, ale podajemy źródło). */
  attribution: string | null;
  note: string;
  status: "ok" | "do_ustalenia";
}

export const LICENSES: LicenseEntry[] = [
  { id: "usda", name: "USDA FoodData Central (SR Legacy)", used: "wartości odżywcze produktów w module Fuel (src/engine/foods.ts, z identyfikatorami fdc)", license: "domena publiczna (CC0 1.0)", attribution: "Dane: USDA FoodData Central", note: "Dane amerykańskich produktów – nie zawsze odpowiadają produktom w Polsce. Atrybucja nie jest wymagana, podajemy ją z uczciwości.", status: "ok" },
  { id: "off", name: "Open Food Facts", used: "wyszukiwanie produktów przez trasę serwerową /api/foods; wyniki wybrane przez użytkownika zapisywane lokalnie na jego urządzeniu", license: "baza: ODbL 1.0; treść: DbCL; zdjęcia: CC BY-SA", attribution: "Dane: Open Food Facts (ODbL). openfoodfacts.org", note: "Wymagana atrybucja i zachowanie ODbL dla baz pochodnych (share-alike dotyczy bazy danych i jej adaptacji, a NIE kodu aplikacji). Nie kopiujemy OFF do własnej, współdzielonej bazy – wyniki zostają lokalnie u użytkownika. Wyszukiwane hasło trafia do usługi OFF.", status: "ok" },
  { id: "geonames", name: "GeoNames", used: "współrzędne miejscowości (≥ 3000 mieszkańców) do przybliżonych odległości w radarze (supabase/functions/_shared/radar/places.ts)", license: "CC BY 4.0", attribution: "Współrzędne miejscowości: GeoNames (CC BY 4.0), geonames.org", note: "Atrybucja jest w ekranie wyboru miejscowości i tutaj. Odległość jest przybliżona (środek miejscowości).", status: "ok" },
  { id: "mapbox-osm", name: "Mapbox / OpenStreetMap", used: "kafelki mapy w module biegowym (jeśli skonfigurowano VITE_MAPBOX_TOKEN)", license: "warunki Mapbox; dane © współtwórcy OpenStreetMap (ODbL)", attribution: "© Mapbox © OpenStreetMap", note: "Atrybucja jest na mapie. Zapytania o kafelki ujawniają Mapbox adres IP i obszar mapy. Warunki konta Mapbox (limity, komercyjne użycie) do sprawdzenia przez operatora.", status: "ok" },
  { id: "mixamo", name: "Mixamo (Adobe) – postać i animacje IQ", used: "public/iq/player.glb, idle.json, walking.json, soccer-pass.json oraz klip biegu zapisany w modelu", license: "warunki Adobe Mixamo (nie zweryfikowane dla tej aplikacji)", attribution: null, note: "Pochodzenie i warunki KONKRETNYCH plików trzeba ustalić (konto, data pobrania, zakres użycia w produkcie komercyjnym). Pliki NIE są usuwane automatycznie – decyzja po ustaleniu warunków. Do tego czasu nie wolno udostępniać plików osobno jako zasobów do pobrania.", status: "do_ustalenia" },
  { id: "mediapipe", name: "MediaPipe Tasks Vision i model pozy (pose_landmarker_lite)", used: "detekcja pozy w Labie (CMJ) – w przeglądarce użytkownika", license: "Apache-2.0 (biblioteka); model: warunki karty modelu Google (do potwierdzenia)", attribution: null, note: "Biblioteka WASM ładowana z jsDelivr, model z Google Cloud Storage: te serwery widzą adres IP użytkownika. Wideo nie jest wysyłane. Wynik jest szacunkiem własnego algorytmu, a nie zwalidowanym pomiarem.", status: "ok" },
  { id: "mijump", name: "My Jump / MySprint (publikacje walidacyjne)", used: "źródła opisowe w docs/ZRODLA-LAB.md; wzory fizyczne (czas lotu → wysokość)", license: "n/d – nie przenosimy wyników badań na własny algorytm", attribution: null, note: "Własny algorytm detekcji lotu NIE dziedziczy trafności z badań o aplikacjach My Jump/MySprint; w aplikacji oznaczony jest jako szacunek.", status: "ok" },
  { id: "deps", name: "Zależności (React, TanStack, Three.js, Leaflet, supabase-js, Tailwind i in.)", used: "kod aplikacji", license: "w większości MIT/BSD/Apache-2.0 – zestawienie generowane: docs/REJESTR-LICENCJI.md", attribution: null, note: "Zestawienie pochodzi z package.json zainstalowanych pakietów (npm run licenses).", status: "ok" },
  { id: "brave", name: "Brave Search API", used: "serwerowe zapytania radaru (ogólne hasła, bez danych użytkowników)", license: "warunki usługi Brave (przechowywanie wyników – do sprawdzenia)", attribution: null, note: "Zapytania zawierają miejscowość i hasła, ale nie dane użytkownika. Warunki przechowywania/użycia wyników sprawdza operator.", status: "do_ustalenia" },
  { id: "anthropic", name: "Anthropic API", used: "serwerowy odczyt PUBLICZNYCH ogłoszeń (radar); tekst oczyszczony z adresów e-mail i numerów telefonu", license: "warunki usługi Anthropic", attribution: null, note: "Retencja zależy od ustawień organizacji i umowy – do potwierdzenia. Użytkownicy aplikacji nie przekazują tam żadnych danych.", status: "do_ustalenia" },
  { id: "radar-sources", name: "Źródła ogłoszeń radaru", used: "zatwierdzane pojedynczo w panelu administratora", license: "podstawa dopuszczenia zapisana per źródło (radar_sources.license_basis)", attribution: null, note: "Brak źródeł dopuszczonych domyślnie. Publiczna dostępność, domena, RSS ani robots.txt same nie są licencją.", status: "ok" },
];

/** Linie uznania autorstwa wymagane do pokazania w aplikacji. */
export const requiredAttributions = (): string[] => LICENSES.filter((l) => l.attribution).map((l) => l.attribution!);
