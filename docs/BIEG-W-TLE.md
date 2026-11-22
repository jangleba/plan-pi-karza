# Ekran biegu, mapa na żywo i zapis GPS

## Stan (22.11.2026)

| Element | Stan |
|---|---|
| Wygląd ekranu biegu ciągłego i interwałów (`src/RunTracker.tsx`) | Zrobiony wg makiety; sprawdzony w emulacji przeglądarki 360×740, 390×844, 430×932 |
| Mapa na żywo (`src/RunMap.tsx`: Leaflet + Mapbox `light-v11`) | Zaimplementowana; z prawdziwymi kafelkami **nie sprawdzona** (środowisko bez sieci do Mapbox) – sprawdzono ścieżkę z tokenem i niedostępnymi kafelkami |
| Rejestrator w przeglądarce (`src/run/recorder.ts`) | Zaimplementowany i pokryty testami; GPS tylko symulowany (Playwright `setGeolocation`) |
| Zapis w tle przy zablokowanym ekranie | **Wymaga integracji natywnej** – w repozytorium nie ma projektu natywnego (brak Capacitor/Cordova), więc w przeglądarce nie działa. Przygotowany jest adapter `src/run/native.ts` |
| Test na fizycznym telefonie (blokada 15–30 min, inna aplikacja, utrata sieci/GPS) | **Niewykonany** |

W przeglądarce GPS działa tylko przy włączonym ekranie (aplikacja prosi o blokadę wygaszania, ale system może ją zwolnić). Nie ma tu obietnicy nagrywania w tle.

## Konfiguracja mapy

Zmienna `VITE_MAPBOX_TOKEN` – publiczny token Mapbox (`pk.…`). Bez tokenu albo z tokenem w złym formacie zamiast mapy rysujemy szkic rzeczywistej trasy z komunikatem „Mapa niedostępna — zapis trasy trwa” (komunikat tylko wtedy, gdy zapis faktycznie trwa). Przy braku sieci albo błędzie kafelków jest to samo zachowanie. Mapy offline nie są obsługiwane (wymagałyby własnych kafelków i zgodności z warunkami dostawcy). Atrybucja „© Mapbox © OpenStreetMap” zostaje na mapie. Warunki i limity konta Mapbox sprawdza operator.

## Jak działa rejestrator

- Stan aktywnego biegu żyje poza ekranem (`recorder.ts`, `useSyncExternalStore`): minimalizacja ekranu (strzałka w lewo) nie zatrzymuje zapisu; tylko **Pauza** i **Zakończ** sterują biegiem. Na liście sesji pojawia się pasek „Bieg trwa · mm:ss – Wróć”.
- Czas aktywny liczony jest ze znaczników czasu i okresów pauzy (`engine/runClock.ts`); `setInterval` służy wyłącznie do odświeżania widoku. Punkt GPS dostaje czas z chwili pomiaru (`position.timestamp`), więc opóźnione próbki nie zaburzają osi czasu. `GeoPoint.t` jest w ms, `RoutePoint.t` w sekundach.
- Pauza i wznowienie, a także utrata GPS dłuższa niż 30 s, tworzą nowy **odcinek zapisu** (`seg`). Między odcinkami nie liczymy dystansu i nie rysujemy linii. Zapis biegu ma trasę `[lat, lon, t(s), odcinek]`; starsze zapisy `[lat, lon]` i `[lat, lon, t]` nadal się odczytują.
- Stan sesji (punkty, odcinki, pauzy) zapisuje się lokalnie co kilka sekund (`scoped`, klucz `activeRun`). Po przerwaniu procesu sesja wraca jako **pauza od ostatniej potwierdzonej chwili** z komunikatem o przerwaniu; brakujący czas i trasa nie są dopisywane. Zapis roboczy znika dopiero po potwierdzonym zapisie biegu albo świadomym odrzuceniu. Nic nie jest wysyłane na serwer.
- Zapis zakończonego biegu: ostateczny czas z zegara (nie z opóźnionego stanu widoku), zabezpieczenie przed podwójnym naciśnięciem, odczyt kontrolny po zapisie; błąd zapisu jest pokazany, a bieg zostaje w aplikacji.
- Stan GPS (`engine/gps.ts`): szukanie / aktywny / słaby sygnał / brak aktualizacji / brak zgody / niedostępny. „GPS aktywny” tylko po świeżym odczycie (do 10 s) o dokładności do 25 m. Bez wiarygodnego tempa ekran pokazuje „—:—”.
- Dźwięk w trakcie biegu: przełącznik w nagłówku (stan zapamiętany w `runSound`). Sygnały faz działają tylko przy włączonym ekranie.

## Integracja natywna (wymagana do zapisu w tle)

Docelowy wrapper (np. Capacitor/Swift/Kotlin) ma wystawić obiekt zgodny z `NativeTracker` jako `window.BallWiseNative.tracker`:

```ts
interface NativeTracker {
  start(): Promise<void>;                 // start serwisu lokalizacji w tle
  stop(): Promise<void>;
  drain(): Promise<Array<{ lat: number; lon: number; acc: number; timestamp: number /* ms epoki */; speed?: number | null; heading?: number | null }>>;
}
```

Gdy adapter istnieje, rejestrator nie używa `watchPosition`, tylko co kilka sekund oraz po powrocie na pierwszy plan odbiera punkty przez `drain()` (kolejność i duplikaty odrzuca filtr czasu w `addPoint`). Po stronie natywnej punkty muszą być zapisywane trwale, niezależnie od WebView/React.

- **iOS:** Core Location, Background Modes → *Location updates*, opisy `NSLocationWhenInUseUsageDescription` i autoryzacja „podczas używania”; pasek stanu włączony przez `showsBackgroundLocationIndicator`. Nie prosić automatycznie o „Zawsze”. [Apple – handling location updates in the background](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)
- **Android:** usługa foreground typu `location`, uprawnienia `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, powiadomienie na czas treningu. [Android – foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types)
- Standardowy plugin `@capacitor/geolocation` nie zapewnia lokalizacji w tle; wybór modułu do tła (wersja platformy, licencja, koszt) do decyzji przed wdrożeniem.
- Sygnały dźwiękowe odcinków w tle też wymagają warstwy natywnej (powiadomienia lokalne / sesja audio); samo Web Audio tego nie załatwia.
- Wymuszone zamknięcie aplikacji przez użytkownika nie jest scenariuszem „nagrywanie trwa”.

## Lista prób na fizycznym telefonie (do wykonania po integracji)

15–30 min z zablokowanym ekranem; przełączenie do innej aplikacji; utrata sieci i GPS (tunel, tryb samolotowy); pauza i wznowienie; otwarcie UI w trakcie biegu (dystans bez dubli); odmowa uprawnienia; wymuszone zamknięcie i odzyskanie sesji. Zapisać platformę, wersję systemu i wyniki.
