# BallWise Lab — protokół 2.0, 240 FPS

Aktualny natywny moduł iOS; nie jest wycofanym Vision Lab. Przegląd dokumentu:
29 września 2026. Wyniki testów fizycznych i wdrożenia są nadal do udokumentowania.

## Zakres

BallWise Lab mierzy tylko parametry, które można wyznaczyć z dwóch ręcznie wskazanych klatek filmu nagranego z rzeczywistą częstotliwością 240 FPS:

1. CMJ — wysokość z czasu lotu, 3 próby.
2. Skok jednonóż — lewa i prawa noga, po 3 próby.
3. Sprint 10 m — czas i średnia prędkość na odcinku, 2 próby.
4. Flying 10 m — czas i średnia prędkość na odcinku, 2 próby.
5. 505 — lewa i prawa strona, po 2 próby.

Pełny profil ma 17 prób i zwykle zajmuje 25–30 minut wraz z ustawieniem telefonu i przerwami.

## Przepływ użytkownika

Wybór testu → instrukcja ustawienia → pełnoekranowa kamera 240 FPS → przycięcie filmu → wybór dokładnych klatek → ustawienie jednej lub dwóch linii odniesienia → kontrola zakresu → wynik → historia.

- CMJ, skok jednonóż i 505 używają jednej wspólnej linii odniesienia.
- Sprint 10 m i Flying 10 m używają osobnych linii początku i końca.
- Analizator umożliwia zmianę o 1 lub 10 klatek. Przy 240 FPS jedna klatka odpowiada około 4,17 ms.
- Film roboczy pozostaje w katalogu pamięci podręcznej aplikacji i jest usuwany po zapisaniu wyniku. Do Supabase trafiają tylko wynik, numery klatek i dane kontroli jakości.

## Obliczenia

Odcinki są odmierzane przed nagraniem: sprint i Flying 10 mają 10 m, a 505 obejmuje 5 m do nawrotu i powrót przez tę samą linię. Linie w analizatorze ułatwiają wybór zdarzeń; nie służą do przeliczania pikseli na metry.

Plugin odczytuje wszystkie próbki wideo i ich znaczniki prezentacji (PTS), porządkuje je według czasu i tworzy rzeczywisty indeks klatek. Liczba klatek pochodzi z liczby próbek, nie z iloczynu FPS i długości filmu. `frameAt` zwraca obraz tylko wtedy, gdy jego czas dokładnie odpowiada czasowi żądanej próbki.

- Czas: `t = PTS[druga klatka] − PTS[pierwsza klatka]`. Brak osi czasu blokuje pomiar; nie ma zastępczego dzielenia liczby klatek przez nominalne FPS.
- Wysokość skoku: `h = 9,80665 × t² / 8` w metrach, następnie przeliczenie na cm.
- Sprint 10 m i Flying 10: `v = 10 / t` w m/s oraz `km/h = v × 3,6`. To średnia prędkość na odcinku, nie pomiar chwilowej prędkości maksymalnej.
- Asymetria: `|L − P| / max(L, P) × 100%`, dla dodatnich wyników. Porównujemy najlepsze poprawne próby obu stron wyłącznie w bieżącym profilu.
- Najlepszy skok to największa wysokość; najlepszy sprint lub 505 to najmniejszy czas.

Rzeczywiste FPS to `(liczba próbek − 1) / (ostatni PTS − pierwszy PTS)`. Nagranie musi mieć co najmniej 239 FPS, dodatnie odstępy i kompletne metadane. Powtórzone czasy, nieprawidłowe próbki oraz odstęp przekraczający 1,5 mediany odstępów blokują pomiar. Tolerancja liczbowa służy tylko konwersji CMTime do sekund, nie maskuje zgubionych klatek.

Zakresy czasu: CMJ 0,2–1 s; skok jednonóż 0,15–0,9 s; sprint 10 m 1–5 s; Flying 10 m 0,7–3 s; 505 1–6 s. Nie stosujemy dodatkowego wspólnego progu wysokości do różnych testów skoku. Sprawdzenie zakresu nie potwierdza prawidłowości techniki wykonania próby.

## Zapis i zgodność

Nowe wyniki mają `protocol_version = ballwise-lab-2.0`. Istniejące kolumny JSON przechowują dystans i prędkość (`metrics`) oraz źródło czasu, PTS obu klatek, nominalne/rzeczywiste FPS, medianę i maksymalny odstęp (`quality.timing`). Nie jest potrzebna nowa migracja tabeli.

Wynik jest zapisywany lokalnie przed usunięciem filmu. Nieudany zapis lokalny pozostawia nagranie do ponowienia. Brak sieci pozostawia wynik w kolejce; ponowienie wysyła ten sam identyfikator. Wyniki oczekujące na synchronizację nie podlegają limitowi 300 zapisanych wyników historii. Synchronizacja łączy odpowiedzi z aktualnymi danymi, nie ze starą kopią rozpoczętego żądania.

Historia 1.0 pozostaje nieprzeliczona i nie otrzymuje sztucznych znaczników PTS. Dawne rekordy testów z piłką są zachowane, lecz nie pojawiają się w LAB ani w zestawieniach. Nowe testy z piłką nie są dostępne.

## Weryfikacja automatyczna

`npx vitest run src/lib/lab src/components/lab` sprawdza wzorce liczbowe, granice, niekompletne osie czasu, indeksy, asynchroniczny odczyt obrazu, przycinanie, zapis offline, konkurencyjną synchronizację i pełne 17 prób.

Wzorce: 0,5 s lotu = 30,64578125 cm; 0,15 s lotu = 2,7581203125 cm; sprint 10 m w 2 s = 5 m/s = 18 km/h; Flying 10 w 1,25 s = 8 m/s = 28,8 km/h.

Na macOS z Xcode można sprawdzić rzeczywisty dekoder AVFoundation bez kamery:

```sh
xcrun swiftc -parse-as-library \
  native/ballwise-camera/ios/Sources/BallWiseCameraPlugin/VideoTimeline.swift \
  native/ballwise-camera/verification/TimelineChecks.swift \
  -o /tmp/ballwise-timeline-checks
/tmp/ballwise-timeline-checks
```

Program generuje film MOV o znanej osi czasu 240 FPS, sprawdza liczbę próbek, wybrane obrazy (łącznie z pierwszym i ostatnim), czas 0,5 s oraz odrzucenie filmu ze zgubioną klatką. To kontrola oprogramowania; próby na fizycznym iPhonie nadal są wymagane.

## Celowo pominięte

Bez platformy sił, maty kontaktowej albo dodatkowych czujników aplikacja nie podaje RSI, siły, mocy, impulsu, profilu siła–prędkość, S-MAS ani oceny ryzyka kontuzji. Asymetria jest opisem różnicy wyników, a nie diagnozą.

## Warunki rzetelnego pomiaru

- Stabilny statyw i niezmienione ustawienie kamery między próbami.
- Dobre, stałe oświetlenie; tryb 240 FPS wymaga dużo światła.
- Bez zoomu cyfrowego, panoramowania i kamery trzymanej w dłoni.
- Dokładnie odmierzony odcinek oraz wyraźne, pionowe znaczniki linii.
- Zawodnik i obie linie muszą mieścić się w kadrze.
- Powtarzalne obuwie, nawierzchnia, rozgrzewka i definicja znacznika klatki.
- Wyniki z telefonu służą do monitorowania sportowego, nie do diagnozy medycznej.

## Instalacja iOS

1. W wybranym projekcie zastosuj migracje w kolejności, w tym `supabase/migrations/20260925185931_ballwise_lab_240fps_results.sql`.
2. Na macOS z Xcode, Node.js 22.12+ i npm uruchom `npm ci`.
3. Uruchom `BALLWISE_IOS_BUNDLE_ID=pl.twojafirma.ballwise npm run ios:setup` z własnym bundle ID.
4. Uruchom `npm run ios:open`, ustaw podpisywanie aplikacji i wykonaj build na fizycznym iPhonie.
5. Po zmianach używaj `BALLWISE_IOS_BUNDLE_ID=pl.twojafirma.ballwise npm run ios:sync`; skrypt ponownie buduje mobilne SPA.

Instalator tworzy projekt iOS, synchronizuje lokalny plugin `@ballwise/camera` i dodaje opis uprawnienia kamery. Nagrywanie 240 FPS nie działa w samej przeglądarce ani w PWA — wymaga natywnej aplikacji iOS.

## Kontrola przed wydaniem

Poniższe próby wymagają osobnych dowodów; nie są deklaracją zaliczenia. Ogólne
warunki i otwarte kwestie eksportu/czyszczenia lokalnych wyników opisuje
[lista wydania](RELEASE-CHECKLIST.md).

- Sprawdź na każdym wspieranym modelu iPhone, czy ekran Lab pokazuje `240 FPS • GOTOWE`.
- Sprawdź ręczne zatrzymanie, automatyczne zakończenie po limicie, odmowę dostępu, przerwanie nagrania i anulowanie analizy.
- Przewijaj szybko; zaznaczanie musi być zablokowane do wyświetlenia właściwej klatki. Sprawdź linie w pionie i poziomie oraz czarne pasy.
- Wykonaj pełne 17 prób, dodatkową próbę i zapis offline; sprawdź zgodność ekranu wyniku, podsumowania i historii.
- Nagraj wzorcowy zegar lub migającą diodę o znanej częstotliwości i potwierdź odstęp czasowy klatek.
- Porównaj co najmniej 30 pomiarów każdego testu z fotokomórkami lub platformą referencyjną.
- Zbadaj powtarzalność dwóch niezależnych oceniających i ustal instrukcję rozstrzygania niejednoznacznej klatki.
- Potwierdź usuwanie pliku `.mov` po zapisie i brak dostępu użytkownika A do wyników użytkownika B.
- Nie publikuj twierdzeń o walidacji konkretnego testu BallWise, dopóki własny protokół nie przejdzie porównania z urządzeniem referencyjnym.
