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
  odczytywane przez przeglądarkowy `BarcodeDetector`, jeżeli jest dostępny.
  Opcjonalny opis głosowy korzysta z `SpeechRecognition`; zawsze można wpisać tekst.
  Funkcja serwerowa analizy zdjęcia posiłku jest zachowana, ale niepodłączona do UI.
- **BallWise Lab:** aktywne pomiary sportowe z natywnej kamery iOS 240 FPS,
  ręczny wybór klatek, historia i synchronizacja wyników. Stary **Vision Lab**
  i MediaPipe zostały wycofane; nie należy mylić ich z obecnym Lab.
- **Trening reaktywny:** ćwiczenia reakcji i lokalnie zapisane własne zestawy.

Konto spersonalizowane jest dostępne od 13 lat; dla wieku 13–15 właścicielem
jest opiekun. Kod sprawdza potwierdzenie jego e-maila i oświadczenie, nie tożsamość
ani prawny status opiekuna. Poniżej 13 lat dostępne jest publiczne demo.
StoreKit/IAP pozostaje [propozycją](docs/apple/IAP-SUBSCRIPTION-SPEC.md).

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
Router ładuje trasy przy intencji nawigacji; nie ma harmonogramu pobierania
wszystkich ekranów w tle.

## iOS i natywny Lab

Na macOS z Xcode wybierz własny bundle ID:

```sh
BALLWISE_IOS_BUNDLE_ID=pl.twojafirma.ballwise npm run ios:setup
npm run ios:open
```

Setup buduje SPA, tworzy projekt `ios/`, jeśli go brakuje, synchronizuje
Capacitor i lokalny plugin `@ballwise/camera`, oraz ustawia opis kamery. Po
kolejnych zmianach uruchom
`BALLWISE_IOS_BUNDLE_ID=pl.twojafirma.ballwise npm run ios:sync`.
Podpisywanie, uprawnienia, privacy manifest i archiwum wymagają konfiguracji w
Xcode. Projekt iOS/IPA nie jest dostarczany w repozytorium. Kamera Lab wymaga
fizycznego zgodnego iPhone'a; przeglądarka/PWA nie nagrywa tym pluginem.
Szczegóły: [protokół Lab](docs/BALLWISE-LAB-PROTOCOL.md) i
[szablony iOS](ios-templates/README.md).

## Wdrożenie i dokumentacja

W wybranym projekcie Supabase zastosuj migracje z `supabase/migrations` w
kolejności nazw, a potem uruchom odczytowe kontrole z `supabase/verification`.
Do SQL Editora wklejaj SQL, nie wyniki ani eksport CSV. Wdrożenia i testy na
urządzeniach muszą mieć osobny dowód; lokalne testy ich nie wykonują.

- [Indeks dokumentacji](docs/README.md)
- [Aktualna macierz QA](docs/QA-MATRIX.md) i [lista wydania](docs/RELEASE-CHECKLIST.md)
- [Usuwanie konta](supabase/functions/delete-account/README.md)
- [Opcjonalna funkcja zdjęć Fuel](supabase/functions/analyze-fuel-photo/README.md)
- [Czyszczenie starego Vision Lab](docs/VISION-LAB-CLEANUP.md)
- [Grafiki ćwiczeń i materiały autorskie](docs/exercise-artwork/README.md)
- [Projekt Lovable](https://lovable.dev/projects/de7e9c03-6af5-4ba0-9a0c-426417d42531)
