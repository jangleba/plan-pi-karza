# BallWise IQ — akcje etapowe, 15.10.2026

## Zachowanie

Zawodnik podejmuje jedną decyzję naraz: podanie, prowadzenie, ruch bez piłki,
asekuracja, krycie, doskok lub zakończenie. Piłka i pozostali zawodnicy wykonują
reakcję, a aplikacja przechodzi do następnego zadania. Standardowa akcja obejmuje
4–5 decyzji. W nowych scenariuszach po stracie dochodzi decyzja o doskoku lub powrocie. Spalony i zamknięcie kontynuacji mogą zakończyć akcję wcześniej.

Tryb **Z podpowiedziami** udostępnia krótką wskazówkę i oznaczenie przestrzeni na
żądanie. **Bez podpowiedzi** ukrywa tę pomoc, trasy i komentarze oceniające w trakcie
wykonywania akcji. W obu trybach po końcu dostępne są pełna powtórka własnych wyborów,
analiza pojedynczej decyzji i odtworzenie dostępnego lepszego wariantu od tego samego
stanu. Wyniki są oznaczone trybem; powtórka i analiza nie zapisują nowej próby.

Aktualne modele i pliki Mixamo idle/running/walking/soccer-pass pozostają te same.
Rozmiar zawodników wynosi 6,8 jednostki zamiast 8,4; długości cykli chodu i biegu
zostały dopasowane do tej skali. Nowy silnik podaje pozycje i fazy tych samych animacji.

## Baza i profil

| Profil z onboardingu | Role IQ                               | Liczba kontekstów |
| -------------------- | ------------------------------------- | ----------------: |
| goalkeeper           | Bramkarz                              |                60 |
| defender             | Środkowy i boczny obrońca / wahadłowy |               120 |
| midfielder           | 6, 8, 10                              |               180 |
| forward              | Skrzydłowy, napastnik                 |               120 |

Baza zawiera **160 nazwanych wątków × 3 konteksty = 480 scenariuszy**.
Osiem szczegółowych ról ma po 60 kontekstów. Wątki współdzielą 18 rodzin
przebiegu. Są to autorskie zadania schematyczne; liczba nie oznacza 480
rekonstrukcji profesjonalnych meczów. Odbicia lustrzane nie są doliczane.

Domyślny dobór bierze pozycję z istniejącego profilu. Nagłówek IQ otwiera wybór
szczegółowej roli, wyszukiwarkę i pełny katalog. Nie zmieniono pól onboardingu.
Nowa sesja zaczyna od rozszerzonego scenariusza dopasowanego do profilu. Kolejna akcja preferuje nieukończony kontekst innej rodziny; trzecia w serii może wracać do trudnego wątku w innym kontekście.

## Zapis i zgodność powtórki

Nowe próby i szkic: `ballwise:iq:journeys:v1:<owner>`. Dotychczasowa historia
`ballwise:iq:v2:<owner>` pozostaje nienaruszona. Nowa historia przechowuje do 100 prób,
ich tryb, wersję bazy i rzeczywiste wybory. Szkic jest zapisywany po zatwierdzeniu
decyzji, dzięki czemu można kontynuować po odświeżeniu. Gość korzysta z pamięci sesji.
Zapis jest lokalny dla przeglądarki/urządzenia; nie dodano synchronizacji do chmury.

Pamięć powtórki zawiera te same przejścia stanów co rozgrywka. Historia odtwarza je
deterministycznie z wyborów i wersji bazy. Alternatywa jest liczona od stanu przed
daną decyzją i nie nadpisuje własnej akcji. Ukrycie karty lub utrata WebGL pauzują
transport. Ograniczenie ruchu w systemie jest respektowane.

Model taktyczny używa geometrii korytarza podania, nacisku w docelowym miejscu,
ustawienia w obronie i linii spalonego w chwili podania. Rywale wykonują zdefiniowane
reakcje. To model edukacyjny: ocena odnosi się do pokazanej sytuacji, a nie do
zwalidowanej prognozy wyniku rzeczywistego meczu. Kilka bezpiecznych rozwiązań może
być poprawnych. Strzał nie gwarantuje gola i nie wymaga wskazywania rogu.

## Weryfikacja

- Każdy kontekst ma co najmniej jedną pełną ścieżkę; każdy nowy kontekst ma pełną ścieżkę z piłką górną.
- Testy sprawdzają gałęzie starszych akcji oraz wszystkie opcje na pełnych nowych ścieżkach i obie reakcje po stracie.
- Końcowe pozycje są identyczne w rozgrywce, pojedynczej powtórce i pełnej powtórce.
- Podpowiedzi, rozdzielenie trybów, zapis raz, wznowienie i wybór katalogu mają testy UI.
- Istniejące testy animacji i wcześniejszego modułu nadal pozostają w projekcie.

Odbiór na fizycznym iPhonie: załadować animacje, przejść akcję w obu trybach,
sprawdzić pauzę, suwak, obrót telefonu, opuszczenie karty, odświeżenie w środku akcji,
zapis próby i zmianę konta. Test przeglądarkowy nie zastępuje tej próby na urządzeniu.

## Punkty odniesienia

- FIFA Training Centre, analiza indywidualna, współpraca i zespół:
  https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/training-framework/scales-of-the-game.php
- FIFA Training Centre, biblioteka pozycyjna:
  https://www.fifatrainingcentre.com/en/resources/game-library/position-specific.php
- Be Your Best, scenariusze i analiza powtórek:
  https://www.beyourbest.com/scenarios

Źródła stanowią odniesienie do struktury nauki; nie skopiowano filmów ani modeli.

## Rozszerzenie 15.10.2026 — piłki górne

- Łącznie 160 wątków i 480 kontekstów; dodano 80 wątków w 240 kontekstach.
  Osiem ról ma po 60 scenariuszy. Nazwy nie oznaczają 480 rekonstrukcji meczów:
  baza współdzieli 18 rodzin przebiegu (11 wcześniejszych i 7 nowych).
- Nowe akcje mają 4–5 planowanych decyzji. Po stracie dochodzi jedna decyzja
  o doskoku lub powrocie; do 6 decyzji w zapisie próby.
- Cztery tory piłki: po ziemi, podcięcie, przerzut, dośrodkowanie. Ekran pokazuje
  dwa warianty odpowiednie dla sytuacji. Następnie gracz dotyka partnera.
- Tor, czas lotu, opadanie i kontrola po przyjęciu są odtwarzane deterministycznie.
  Zasięg przejęcia uwzględnia wysokość; zagranie górą nie omija spalonego ani
  rywala stojącego w miejscu opadania piłki. Odbiorca dobiega i opanowuje piłkę.
- Zachowano te same cztery pliki FBX. Wyższe dokończenie zamachu i przyjęcie
  opadającej piłki są autorskimi offsetami proceduralnymi szkieletu, nie nowymi
  nagraniami motion capture. Kontakt w istniejącym klipie nie jest przesuwany.
  Offsety są resetowane przed każdym rysowaniem, także przy pauzie i przewijaniu.
- Po stracie bliski doskok może odzyskać piłkę; powrót osłania drogę do bramki;
  spóźniony doskok pozwala rozwinąć kontrę. Błąd pierwszej decyzji pozostaje
  widoczny w ocenie i w zapisanej powtórce, także po skutecznym odzyskaniu.
- Analiza ma przycisk „Zagraj od tego momentu”. Zachowuje wcześniejszy przebieg
  jako początek nowej próby, pozwalając ponownie wybrać konkretną decyzję.
- Krótka seria pokazuje postęp 0–3 na podstawie rzeczywistych prób z bieżącego
  dnia i wybranego trybu, według lokalnej daty urządzenia. Powtórka nie liczy
  się jako nowa próba. Trzecia akcja może wracać do trudnego wątku w innym,
  jeszcze nierozgrywanym kontekście. Wyniki obu trybów są rozdzielone.
- Identyfikatory i logika wcześniejszych 240 kontekstów pozostają stabilne.
  Historia i szkice z wersji 2026-10-15.1 są obsługiwane obok wersji .2.
  Test porównuje wynik całej wcześniejszej bazy z hashem wersji 32a6667.

### Granice modelu i odbiór

Jest to edukacyjny model decyzji. Tor lotu i zasięgi są uproszczone i dopasowane
wizualnie do istniejącej skali zawodników. Nie stanowią pełnej symulacji fizyki
ani pomiaru zdolności zawodnika na boisku. Główki, wyskoki do pojedynków,
woleje i interwencje bramkarskie wymagają osobnego etapu animacji.

Przed publikacją natywną należy sprawdzić na fizycznym iPhonie: długi przerzut,
krótkie podcięcie, dośrodkowanie, przyjęcie po locie, powrót po stracie,
obrót telefonu, wznowienie szkicu i powtórkę wcześniejszej próby.
