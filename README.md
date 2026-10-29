# BallWise

BallWise pomaga piłkarzowi wybrać dzisiejszy trening i wykonać sesję. Łączy profil,
kalendarz klubu i meczów, sprzęt oraz historię treningową. Nie jest wyrobem
medycznym, nie diagnozuje, nie leczy i nie zastępuje konsultacji ze specjalistą.

## Aktualne moduły

- **Plan i sesje:** decyzja dnia (zostaw, lżej, zamień, dodaj, zmień tydzień lub
  brak dostępności), najwyżej dwie sesje dziennie, siła, sprint, bieganie i historia.
  Decyzja dnia jest oddzielona od danych zdrowotnych. Obsługa zgód, gotowości,
  bólu i ostrożnego planu bez zgody pozostaje w aplikacji.
- **Football IQ:** interaktywne sytuacje meczowe z `src/features/football-iq-match`.
- **Fuel:** lokalne propozycje posiłków z podanych składników i kontekstu sesji;
  sprawdzanie produktu po nazwie lub kodzie w Open Food Facts. Zdjęcie kodu jest
  odczytywane lokalnie przez `BarcodeDetector` lub dołączony dekoder zgodności.
  Opcjonalny opis głosowy korzysta z `SpeechRecognition`; zawsze można wpisać tekst.
  Funkcja serwerowa analizy zdjęcia posiłku jest zachowana, ale niepodłączona do UI.
- **BallWise Lab:** aktywny ekran `/lab` analizuje oryginalne MP4/MOV przez
  WebCodecs w zgodnej przeglądarce/WKWebView, z nagrywaniem lub importem filmu.
  Skok w dal AUTO używa wzorców podłoża i detekcji sylwetki (MediaPipe);
  pozostałe testy mają ręcznie oznaczane zdarzenia. Historia jest lokalna,
  z eksportem/importem i ręcznymi kopiami modułu. Zachowany adapter natywnej
  kamery 240 FPS nie jest aktywną trasą `/lab`. Stary Vision Lab jest osobnym,
  wycofanym modułem.
- **Trening reaktywny:** ćwiczenia reakcji i lokalnie zapisane własne zestawy.

Konto spersonalizowane jest dostępne od 13 lat; dla wieku 13–15 właścicielem
jest opiekun. Kod sprawdza potwierdzenie jego e-maila i oświadczenie, nie tożsamość
ani prawny status opiekuna. Poniżej 13 lat dostępne jest publiczne demo.
Kod [subskrypcji iOS](docs/apple/IAP-SUBSCRIPTION-SPEC.md) obejmuje RevenueCat,
paywall, zakup/przywracanie i serwerowe potwierdzanie dostępu. Wymaga osobnej
konfiguracji Apple/RevenueCat/backendu i testów sandbox; obecność kodu nie
potwierdza aktywnej oferty ani publikacji.

## Uruchomienie

Używaj **Node.js 22.12+** (dla linii 22, zgodnie z wymaganiami Vite) i **npm**.
`package-lock.json` jest jedynym utrzymywanym lockfilem. Stos: React 19,
TypeScript, TanStack Start/Router, Vite, Tailwind CSS i Supabase.

W ignorowanym pliku `.env.local` ustaw publiczną konfigurację projektu:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

Frontend używa tych zmiennych podczas budowania; kod SSR dopuszcza także
`SUPABASE_URL` i `SUPABASE_PUBLISHABLE_KEY`. Nigdy nie umieszczaj klucza
`service_role` ani klucza OpenAI w konfiguracji `VITE_*`.

```sh
npm ci
npm run dev
```

Konfigurację prawną skopiuj z [.env.legal.example](.env.legal.example) do lokalnej
lub wdrożeniowej konfiguracji i uzupełnij według
[instrukcji](docs/LEGAL-CONFIGURATION.md). `VITE_RELEASE_MODE=production` włącza
bramkę kompletności w aplikacji. Sam udany build nie potwierdza gotowości wydania.

## Sprawdzenie i kompilacja

```sh
npm run verify:release
```

To TypeScript, testy, ESLint, build webowy oraz mobilny. `npm run verify` pomija
build mobilny. Pojedynczo: `npm run typecheck`, `npm test`, `npm run lint`,
`npm run build`, `npm run build:mobile`.

Webowy build TanStack/Nitro jest w `.output`; `npm run preview` uruchamia go
lokalnie przez Wrangler. Build mobilny używa osobnej konfiguracji SPA i tworzy
`dist/client/index.html` dla Capacitor. Zwykłego buildu SSR nie kopiuj do iOS.
Router ładuje trasy przy intencji nawigacji; część zakładek przygotowuje kod
w tle po pokazaniu nawigacji. To zachowanie trzeba uwzględnić w pomiarze startu.

## iOS i pomiary Lab

Na macOS z Xcode wybierz własny bundle ID:

```sh
BALLWISE_IOS_BUNDLE_ID=pl.twojafirma.ballwise npm run ios:setup
npm run ios:open
```

Setup sprawdza konfigurację wydania, buduje SPA, tworzy projekt `ios/`, jeśli
go brakuje, i synchronizuje Capacitor wraz z lokalnymi pluginami kamery/runtime.
Ustawia opisy kamery i lokalizacji, tryb lokalizacji w tle oraz przygotowuje
Associated Domains i plik prywatności. Skonfiguruj też domenę powrotu logowania
według [instrukcji wdrożenia](docs/WDROZENIE-2026-10-29.md). Po
kolejnych zmianach uruchom
`BALLWISE_IOS_BUNDLE_ID=pl.twojafirma.ballwise npm run ios:sync`.
Podpisywanie, uprawnienia, privacy manifest i archiwum wymagają konfiguracji w
Xcode. Projekt iOS/IPA nie jest dostarczany w repozytorium. Aktywny Lab wymaga
HTTPS i obsługi WebCodecs; wysoki FPS kamery zależy od urządzenia/przeglądarki.
Nie deklaruj dokładności pomiaru bez prób referencyjnych na fizycznym telefonie.
Szczegóły: [Lab w Safari](docs/BROWSER_LAB_SAFARI.md),
[skok w dal i 505](docs/LAB_SKOK_W_DAL_505.md),
[zachowany protokół natywny](docs/BALLWISE-LAB-PROTOCOL.md) oraz
[szablony iOS](ios-templates/README.md).

## Wdrożenie i dokumentacja

W wybranym projekcie Supabase zastosuj migracje z `supabase/migrations` w
kolejności nazw, a potem uruchom odczytowe kontrole z `supabase/verification`.
Do SQL Editora wklejaj SQL, nie wyniki ani eksport CSV. Wdrożenia i testy na
urządzeniach muszą mieć osobny dowód; lokalne testy ich nie wykonują.

- [Wdrożenie bieżącej paczki](docs/WDROZENIE-2026-10-29.md)
- [Indeks dokumentacji](docs/README.md)
- [Aktualna macierz QA](docs/QA-MATRIX.md) i [lista wydania](docs/RELEASE-CHECKLIST.md)
- [Usuwanie konta](supabase/functions/delete-account/README.md)
- [Opcjonalna funkcja zdjęć Fuel](supabase/functions/analyze-fuel-photo/README.md)
- [Czyszczenie starego Vision Lab](docs/VISION-LAB-CLEANUP.md)
- [Grafiki ćwiczeń i materiały autorskie](docs/exercise-artwork/README.md)
- [Projekt Lovable](https://lovable.dev/projects/de7e9c03-6af5-4ba0-9a0c-426417d42531)
