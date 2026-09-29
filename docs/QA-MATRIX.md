# BallWise — aktualna macierz QA

Stan specyfikacji testów: 29 września 2026. Dla każdej pozycji zapisz commit,
środowisko/urządzenie, datę, wynik `PASS`, `FAIL`, `BLOCKED` lub `N/A` oraz dowód.
Poniższa macierz nie deklaruje wykonania testów ręcznych ani wdrożenia.

## Bramka automatyczna

`npm ci` i `npm run verify:release` muszą przejść dla tego samego commitu.
Polecenie obejmuje typy, testy z limitem 30 s, lint, web i mobilne SPA.
Wynik testu jednostkowego nie zastępuje potwierdzenia zachowania na urządzeniu.

| Obszar | Scenariusze i warunek odbioru |
| --- | --- |
| Uruchomienie i nawigacja | Demo oraz konto, cold start, wolna sieć, wygasła sesja, cofanie i szybkie powtórne kliknięcia. Brak podwójnej nawigacji; trasy dociągane przy intencji/odwiedzeniu, bez harmonogramu pobierania ekranów. |
| Plan | Kombinacje pozycji, poziomu, celu, sprzętu, klub/mecz i wieku 13/15/16/17/18. Maksymalnie dwa sloty, bez utraty zobowiązań lub historii przy przebudowie; aktualne reguły bezpieczeństwa i minima potwierdzone testami silnika. |
| Decyzja dnia | Zostaw, lżej, zamień, dodaj, zmień tydzień, niedostępność; osobna decyzja drugiego slotu; odświeżenie oraz unieważnienie po zmianie planu. Nie utożsamiać z dawną ankietą zdrowotną. |
| Gotowość i zgody | Brak/udzielenie/cofnięcie zgody zdrowotnej, ból i ostrożny plan. Brak nieuprawnionego odczytu lub zapisu danych; testy triggerów/RLS w wybranym backendzie. |
| Store i synchronizacja | Cache → odświeżenie z serwera, błąd hydratacji/ponowienie, wylogowanie/zmiana konta podczas żądania, kolejność zapisów i powrót online. Dane spóźnionej odpowiedzi nie trafiają na inne konto. |
| Sesja siłowa | Wybór slotu, bramka startu, poprzednie serie, ukończenie/pominięcie/zamiana ćwiczenia, zapis RPE i ukończenie dokładnie raz; odświeżenie i offline. |
| Sprint | Przywrócenie postępu, start/pauza/wznowienie, interwały, przejście między ćwiczeniami, reset i opuszczenie ekranu. Timery nie działają po wyjściu; prawidłowy slot otrzymuje wynik. |
| Daty | Północ lokalna, zmiana miesiąca/roku, 29 lutego i DST. Operacje UTC na datach bez czasu pozostają oddzielone od dat lokalnych. |
| Bieganie | Zgoda/odmowa GPS, słaby sygnał, pauza/wznowienie, import GPX, przerwanie i 5-min test. Niewiarygodny test nie aktualizuje MAS; sieć/baza zawierają tylko wynik agregowany, bez trasy. Zachowanie tła sprawdzić fizycznie. |
| Football IQ | Aktywny `football-iq-match`: onboarding, wybór sytuacji, ruch/podanie/przechwyt, zależności akcji, ocena, timeout, replay, zmiana scenariusza i pauza karty. Sprawdzić oba renderery, dotyk, pomniejszony ruch i czytelność wyborów. Nie deklarować liczby ani kompletności dawnych `SIM_SCENARIOS`. |
| Fuel | Pora przed/po/bez treningu, mało składników, pusty i nierozpoznany tekst, zapis wyboru. Ręczna nazwa/kod, lokalny `BarcodeDetector` dostępny/brak/błąd, Open Food Facts znaleziony/brak/offline/anulowanie. Głos dostępny/brak/odmowa; tekst pozostaje dostępny. |
| Funkcja zdjęć Fuel | Obecnie bez UI. Jeśli wdrożona: JWT brak/błędny, origin dozwolony/obcy, MIME/rozmiar, limit 8 wywołań na 10 min, błędy dostawcy i brak zapisu zdjęcia. Nie testować jej jako dostępnego przycisku aplikacji. |
| Lab | Przeglądarka pokazuje brak natywnej kamery. iPhone: capability 240 FPS, odmowa kamery, przerwanie, przycięcie, dokładne klatki/PTS, linie, zakresy i 17 prób. Wynik offline synchronizuje się bez duplikatu; film usuwany po trwałym zapisie. Szczegóły w protokole. |
| Trening reaktywny | Wybór/zapis własnego zestawu, start/stop, sygnały, koniec i ponowne wejście; izolacja kont, blokada ekranu i przerwanie audio. |
| Konto | Rejestracja, potwierdzenie e-mail, reset hasła, wiek graniczny, opiekun (oświadczenie + potwierdzony e-mail), przekazanie konta i ponowne zgody. Nie zakładać osobnego tokenu weryfikującego tożsamość opiekuna. |
| Prawa do danych | Eksport porównać z rzeczywistymi tabelami i lokalnymi zapisami; usunięcie konta, kaskady, kopie i czyszczenie urządzenia. Znane braki z listy wydania pozostają otwarte. |
| Grafiki | Wszystkie 71 dynamicznych URL PNG, 32 WebP i 3 grafiki IQ istnieją; stare zapisane `visualId` działają; placeholder bez mapowania. Materiały dokumentacyjne i usunięte obrazy nie trafiają do świeżego buildu. |
| iOS i dostępność | Instalacja/aktualizacja, mały i duży ekran, wspierane wersje iOS, klawiatura, Dynamic Type/VoiceOver, orientacja, uprawnienia i ich zmiana w Settings. SDK, manifesty i ruch sieciowy zgodne z App Privacy. |

## Weryfikacja specjalistyczna i wydanie

Trener zatwierdza reguły planu i treść IQ, dietetyk treść Fuel, a pomiary Lab
wymagają porównań referencyjnych opisanych w [protokole](BALLWISE-LAB-PROTOCOL.md).
StoreKit jest propozycją: testy zakupów z [specyfikacji](apple/IAP-SUBSCRIPTION-SPEC.md)
stają się wymagane po implementacji, a nie dowodem aktualnie działającego paywalla.

Dowody wdrożenia, prywatności i testów fizycznych zbieraj w
[liście wydania](RELEASE-CHECKLIST.md). [Macierz z 12 września](archive/FULL-PRODUCT-QA-MATRIX-2026-09-12.md)
jest archiwum wcześniejszego produktu, nie aktualną specyfikacją.

## Wynik porządkowania kodu — 29 września 2026

Porównanie: commit `ddbb4c6fe543c21a536b81578c4feff0c8df22f2` i lokalne zmiany
porządkujące kod. Czyste `npm ci --offline --no-audit --no-fund` oraz
`npm run verify:release` zakończyły się powodzeniem: TypeScript, ESLint,
644 testy w 75 plikach, build web i mobilnego SPA. Wersje zachowanych pakietów
w lockfile nie zmieniły się.

| Pomiar | Przed | Po |
| --- | ---: | ---: |
| Główny plik JavaScript, bajty | 814 777 | 788 113 |
| Główny plik JavaScript, gzip | 238 811 | 232 207 |
| Wszystkie pliki JavaScript web, bajty | 2 395 088 | 2 363 848 |
| Wszystkie pliki JavaScript web, suma gzip | 718 863 | 711 392 |
| Football IQ, bajty / gzip | 560 584 / 148 393 | 558 729 / 148 072 |
| Trasa sesji, bajty / gzip | 152 054 / 47 315 | 151 156 / 47 306 |
| Zawartość `public`, bajty | 24 806 832 | 22 656 544 |
| Świeży pakiet web `.output/public`, bajty | 29 315 881 | 27 134 174 |
| Żądania JavaScript po starcie | 68 | 32 |
| Pobrane treści JavaScript, gzip | 676 331 | 363 557 |
| Transfer JavaScript z narzutem raportowanym przez przeglądarkę | 696 731 | 373 157 |

Rozmiary gzip plików policzono tym samym lokalnym `node:zlib.gzipSync`.
Transfer zmierzono osobno w przeglądarce: oba mobilne buildy produkcyjne,
identyczny lokalny serwer z gzip, syntetyczny użytkownik i przechwycone żądania
backendu, bez cache startowego, 10 sekund bez interakcji na `/start`.
Po zmianie żaden dodatkowy ekran nie pobrał się według harmonogramu; hover Fuel
wczytał jego trasę, a kliknięcie ją otworzyło. Wynik lokalny nie jest pomiarem
CDN ani rzeczywistego urządzenia.

Oszczędności mają różne zakresy: usunięte obrazy zmniejszają pliki repozytorium
o 36 690 730 bajtów; przeniesione materiały autorskie pozostają w repozytorium,
ale usuwają 1 704 713 bajtów z pakietów. Łączny pakiet web zmalał
o 2 181 707 bajtów, a treści JavaScript pobrane przy starcie o 312 774 bajty
(46%). Obrazów źródłowych, których wcześniej nie pakowano, nie zaliczamy
do oszczędności transferu. Historia Git pozostaje bez zmian.

Smoke test przeglądarki potwierdził przekierowanie gościa do logowania, demo,
Start i Plan zalogowanego użytkownika, pojedynczy wpis historii po szybkim
podwójnym kliknięciu, przejście zgód onboardingu, check-in i ukończenie sesji
klubowej, tekstową propozycję posiłku Fuel, start Football IQ oraz wejście do
Lab i trenera reakcji. Backend był zastąpiony danymi testowymi; nie weryfikowano
wdrożonego RLS ani zapisu w rzeczywistej bazie.

Sprawdzono 82 lokalne linki dokumentacji, 71 ścieżek manifestów, 32 importy
WebP, dokładne klucze konfiguracji prawnej i oba szablony plist. Przeniesione
obrazy są identyczne bajtowo; usunięte obrazy i materiały autorskie nie występują
w świeżych pakietach. Testy fizycznego iPhone, kamera, wdrożenie oraz otwarte
kwestie eksportu i czyszczenia danych nadal wymagają dowodów z listy wydania.
