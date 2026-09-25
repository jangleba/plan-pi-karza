# BallWise Lab — protokół 240 FPS

## Zakres

BallWise Lab mierzy tylko parametry, które można wyznaczyć z dwóch ręcznie wskazanych klatek filmu nagranego z rzeczywistą częstotliwością 240 FPS:

1. CMJ — wysokość z czasu lotu, 3 próby.
2. Skok jednonóż — lewa i prawa noga, po 3 próby.
3. Sprint 10 m — czas, 2 próby.
4. Flying 10 m — czas i średnia prędkość na odcinku, 2 próby.
5. 505 — lewa i prawa strona, po 2 próby.
6. Sprint 10 m z piłką — czas i różnica względem sprintu bez piłki, 2 próby.

Pełny profil ma 19 prób i zwykle zajmuje 25–35 minut wraz z ustawieniem telefonu i przerwami.

## Przepływ użytkownika

Wybór testu → instrukcja ustawienia → pełnoekranowa kamera 240 FPS → przycięcie filmu → wybór dokładnych klatek → ustawienie jednej lub dwóch linii odniesienia → kontrola zakresu → wynik → historia.

- CMJ, skok jednonóż i 505 używają jednej wspólnej linii odniesienia.
- Sprint 10 m, Flying 10 m i sprint z piłką używają osobnych linii początku i końca.
- Analizator umożliwia zmianę o 1 lub 10 klatek. Przy 240 FPS jedna klatka odpowiada około 4,17 ms.
- Film roboczy pozostaje w katalogu pamięci podręcznej aplikacji i jest usuwany po zapisaniu wyniku. Do Supabase trafiają tylko wynik, numery klatek i dane kontroli jakości.

## Obliczenia

Niech `n` oznacza różnicę numerów klatek, a `fps` rzeczywistą częstotliwość odczytaną z pliku.

- Czas: `t = n / fps`.
- Wysokość skoku z czasu lotu: `h = g × t² / 8`, gdzie `g = 9,80665 m/s²`.
- Flying 10: `v = 10 m / t`, a `km/h = v × 3,6`.
- Asymetria stron: `|L − P| / max(|L|, |P|) × 100%`.
- Różnica sprintu z piłką: `(czas z piłką − czas bez piłki) / czas bez piłki × 100%`.

Wynik jest odrzucany, jeżeli film ma mniej niż 239 FPS, znaczniki są odwrócone lub czas wypada poza jawny zakres wiarygodności danego testu. Aplikacja nie zapisuje `NaN`, zer ani zastępczych wartości.

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

1. Wgraj zawartość paczki do katalogu głównego repozytorium.
2. Zastosuj migrację `supabase/migrations/20260925185931_ballwise_lab_240fps_results.sql`.
3. Na macOS z Xcode uruchom `npm ci`.
4. Uruchom `BALLWISE_IOS_BUNDLE_ID=pl.twojafirma.ballwise npm run ios:setup`.
5. Uruchom `npm run ios:open`, ustaw podpisywanie aplikacji i wykonaj build na fizycznym iPhonie.

Instalator tworzy projekt iOS, synchronizuje lokalny plugin `@ballwise/camera` i dodaje opis uprawnienia kamery. Nagrywanie 240 FPS nie działa w samej przeglądarce ani w PWA — wymaga natywnej aplikacji iOS.

## Kontrola przed wydaniem

- Sprawdź na każdym wspieranym modelu iPhone, czy ekran Lab pokazuje `240 FPS • GOTOWE`.
- Nagraj wzorcowy zegar lub migającą diodę o znanej częstotliwości i potwierdź odstęp czasowy klatek.
- Porównaj co najmniej 30 pomiarów każdego testu z fotokomórkami lub platformą referencyjną.
- Zbadaj powtarzalność dwóch niezależnych oceniających i ustal instrukcję rozstrzygania niejednoznacznej klatki.
- Potwierdź usuwanie pliku `.mov` po zapisie i brak dostępu użytkownika A do wyników użytkownika B.
- Nie publikuj twierdzeń o walidacji konkretnego testu BallWise, dopóki własny protokół nie przejdzie porównania z urządzeniem referencyjnym.
