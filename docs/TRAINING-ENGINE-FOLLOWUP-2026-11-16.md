# Dopracowanie silnika i sesji — 16 listopada 2026

Kolejna lokalna iteracja po `bd645d91`, silnik **ballwise-v2.13**.
Kod nie został wdrożony do Lovable.
Poprzedni etap opisuje [dokument celów tygodnia](WEEKLY-PLANNING-AND-SESSION-TOOLS.md).
Następny etap 2.14 opisuje [sportowy układ siłowni A/B](ATHLETIC-STRENGTH-AB.md); poniżej pozostaje zapis weryfikacji etapu 2.13.

## Tydzień i dane wejściowe

- **Powtarzane mecze:** wcześniejszy przykład z jednym meczem nie ujawniał
  wypadania sprintu w kolejnych tygodniach. Dla odtworzonego kalendarza klub
  środa/piątek i mecz w każdą niedzielę poprawka uwzględnia istniejące warianty
  siły MD+1 podczas wyszukiwania układu całego tygodnia. Wynik fixture w każdym
  z 4 tygodni: **2 siłownie, 1 sprint, 1 bieg i co najmniej 1 pełny odpoczynek**.
  Żądanie 2 sprintów nadal może pozostać niespełnione, z jawnym ograniczeniem.
- **Profil fixture:** 21 lat, cel wydolność, 48 miesięcy siłowni; dodatkowe
  założenia testowe to `advanced`, wysoka kompetencja ruchowa, pełny nadzór,
  sprzęt, dostępność i 75 minut. Wynik nie potwierdza tych dodatkowych danych
  u użytkownika ani optymalności obciążenia dla niego.
- **Onboarding:** jawne odpowiedzi o doświadczeniu siłowym, liczbie miesięcy,
  kompetencji ruchowej i nadzorze trafiają przez istniejący codec profilu do
  silnika (`gymExperienceLevel`, `strengthTrainingMonths`, `movementCompetence`,
  `supervisionLevel`). Sam staż nie uzupełnia pozostałych odpowiedzi.
- **Opcjonalny check-in na Start:** wymaga zgody na personalizację zdrowotną;
  można go pominąć bez zapisywania odpowiedzi. Pominięcie i edycja są przypisane
  do konta i dnia, a odpowiedzi zapisuje osobne działanie. Istniejąca polityka
  stosuje zapis do dzisiejszego rozpoczęcia i dostosowania sesji, zachowując
  rozpoczęte/wykonane receptury. Nie przebudowuje automatycznie 28 dni planu.
- **Aktualizacja wersji:** zapisane plany 2.12 są nadal odczytywane. Nierozpoczęte
  własne sesje wymagają jawnego podglądu i zatwierdzenia aktualizacji; rozpoczęte
  oraz wykonane zachowują receptury. Generowanie pozostaje dostępne od 16 lat,
  tak jak w poprzedniej wersji; nie zmieniano polityki wieku.

## Treść i wykonanie sesji

- **Siła:** rzeczywiste wiersze 5 ruchów z istniejącego
  `buildWarmupProtocol("strength")`: marsz/lekki trucht, ruch stawu skokowego,
  cofanie bioder na przywodziciele, przysiad bez obciążenia i most biodrowy.
  Dawki pochodzą z tego szablonu; rozgrzewka należy do kanonicznej receptury
  i jej czasu zamiast dodatkowych 8 minut. Nie zastępuje serii wprowadzających
  głównego ćwiczenia. Oddzielne klucze przygotowania zachowują historię serii
  roboczych, także gdy przysiad lub most występują w obu częściach.
- **M08:** przejście z klastrów na zwykłe serie usuwa również instrukcję
  dodatkowych przerw wewnątrz serii i pokazuje instrukcję zwykłych serii.
- **Sprint:** wygenerowane 120 s marszu pozostaje
  minutnikiem zamiast zmieniać się w „1 powtórzenie”. Poprawki obejmują też
  uzasadnienia zgodne z dawką rund, wykluczenie niedostępnego partnera i
  klasyfikację RAMP jako przygotowania. Stoper głównego odcinka wymaga jednego
  rozwinięcia; uruchomienie, użycie czasu i zapis próby pozostają osobne.
- **Bieganie:** GPS/licznik można wybrać przed rozpoczęciem bez uruchamiania
  pomiaru ani zapisu. Pełny podgląd rozgrzewki, pracy, przerw i schłodzenia
  pozostaje dostępny po aktywacji, pod aktywnym narzędziem. Nie ma pustego
  nagłówka dodatkowej rozgrzewki. Status kalibracji wyjaśnia blokady źródeł;
  rzeczywista karta propozycji jest jedynym miejscem jej CTA. Gdy nowy MAS
  nie zmienia spokojnych receptur z odczucia, nie ma pustej obietnicy zmiany.
- **Piłka:** zastępstwo ćwiczenia wymagającego ściany uwzględnia pozycję:
  skanowanie dla pomocnika, zwrot dla napastnika, podanie do celu dla pozostałych.
  Nadal obowiązuje dostępność i kwalifikacja ćwiczenia.

## Potwierdzone sprawdzenie tej iteracji

Dotąd zamknięto kontrolę biegania: **28 testów PASS w 3 plikach** oraz
**10/10 widoków świeżego biegu V2 na rzeczywistej trasie `/sesja/$date`**
przy 320 i 390 px. Sprawdzono oba tryby przed startem i po aktywacji, pełny
protokół, jeden jawny start sesji, brak GPS/zapisów podczas wyboru trybu oraz
jeden watcher dopiero po „Start GPS” i jego zamknięcie przy wyjściu.
Nie stwierdzono błędów JS, poziomego przepełnienia ani przycisków poniżej 44 px.

Raport lokalny: `/tmp/ballwise-fresh-running-route-final/results.json`.
GPS był symulowany, zapisy izolowane, a żądania zewnętrzne blokowane.
Nie wykonano tej kontroli na fizycznym telefonie.

Check-in i rzeczywisty onboarding: 18 scenariuszy przy 320/390 px oraz końcowe
powtórzenia układu checkboxa i krótszych opcji — PASS. Odpowiedzi bez domyślnych
obserwacji, pominięcie bez zapisu, jeden jawny zapis, zachowanie formularza po
błędzie, zgoda oraz konto/dzień mają osobne regresje. Baza była lokalna.

Świeżo wygenerowany sprint i piłka na rzeczywistej trasie: 4 widoki oraz
10 otwarć ćwiczeń, dostępne narzędzia i boiska, 0 błędów oraz 0 zapisów.

Lokalny SQL RPC → odczyt planu → hydratacja ćwiczeń → klucze runnera:
`strengthPreparationVersion:1` oraz 5 znaczników `preparationOnly:true` na
sesję pozostają zachowane. Przysiad i most zachowują osobne `#warmup` oraz
dotychczasowy klucz pracy. Nie wykonywano połączenia z hostowanym backendem.
Dowód: `/tmp/ballwise-preparation-codec-probe.json`.

## Weryfikacja całego projektu

- `npm run verify:release`: **PASS** (końcowy przebieg, kod zamrożony).
- TypeScript i zgodność obu lockfile'ów: PASS.
- Vitest: **348 plików PASS, 3031 testów PASS, 1 warunkowy SKIP w UTC**.
- `TZ=Europe/Warsaw` dla `todayIso.test.ts`: **3/3 PASS**, także przypadek
  pomijany w UTC.
- Nowy `warmup_walk` wskazuje istniejącą demonstrację `bwprep:walk`.
  Sprawdzenie całego katalogu obejmuje 230 dopuszczonych ćwiczeń.
- Regresje czasu kontrastu sprawdzają oba kontrakty: starsze receptury
  zachowują dodatkowe 8 minut, nowe liczą jawne kroki przygotowania.
- ESLint, build webowy oraz mobilne SPA z prerenderowanym `index.html`: PASS.
  Build SPA nie jest kompilacją ani archiwum Xcode.

Log końcowy: `/tmp/ballwise-training-followup-final-verify.log`.
Po tym przebiegu uzupełniono wyłącznie dokumentację i paczkę przekazania.
