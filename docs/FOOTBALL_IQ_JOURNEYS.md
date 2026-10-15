# BallWise IQ — akcje etapowe, 15.10.2026

## Zachowanie

Zawodnik podejmuje jedną decyzję naraz: podanie, prowadzenie, ruch bez piłki,
asekuracja, krycie, doskok lub zakończenie. Piłka i pozostali zawodnicy wykonują
reakcję, a aplikacja przechodzi do następnego zadania. Standardowa akcja obejmuje
cztery decyzje. Strata, spalony albo zamknięcie kontynuacji mogą zakończyć ją wcześniej.

Tryb **Z podpowiedziami** udostępnia krótką wskazówkę i oznaczenie przestrzeni na
żądanie. **Bez podpowiedzi** ukrywa tę pomoc, trasy i komentarze oceniające w trakcie
wykonywania akcji. W obu trybach po końcu dostępne są pełna powtórka własnych wyborów,
analiza pojedynczej decyzji i odtworzenie dostępnego lepszego wariantu od tego samego
stanu. Wyniki są oznaczone trybem; powtórka i analiza nie zapisują nowej próby.

Aktualne modele i pliki Mixamo idle/running/walking/soccer-pass pozostają te same.
Rozmiar zawodników wynosi 6,8 jednostki zamiast 8,4; długości cykli chodu i biegu
zostały dopasowane do tej skali. Nowy silnik podaje pozycje i fazy tych samych animacji.

## Baza i profil

| Profil z onboardingu | Role IQ                                      | Liczba kontekstów |
| -------------------- | -------------------------------------------- | ----------------: |
| goalkeeper           | Bramkarz                                     |                30 |
| defender             | Środkowy obrońca, boczny obrońca / wahadłowy |                60 |
| midfielder           | 6, 8, 10                                     |                90 |
| forward              | Skrzydłowy, napastnik                        |                60 |

Baza zawiera **80 nazwanych wątków taktycznych × 3 konteksty = 240 scenariuszy**.
Konteksty zmieniają ustawienie przeciwników, dostępność korytarzy i reakcje.
Wątki korzystają z 11 wspólnych rodzin przebiegu; odbicia lustrzane nie są osobno
doliczane do 240. To autorskie zadania schematyczne, a nie oznaczone jako autentyczne
rekonstrukcje 240 profesjonalnych meczów.

Domyślny dobór bierze pozycję z istniejącego profilu. Nagłówek IQ otwiera wybór
szczegółowej roli, wyszukiwarkę i pełny katalog. Nie zmieniono pól onboardingu.
Kolejna akcja preferuje nieukończony kontekst innego wątku w wybranej grupie.

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

- Każdy kontekst ma przynajmniej jedną pełną, czteroetapową ścieżkę.
- Wszystkie oferowane gałęzie są wykonalne; strata blokuje dalsze decyzje.
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
