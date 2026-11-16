# Cele tygodnia i narzędzia sesji

Stan lokalnej implementacji i QA: 16 listopada 2026.

## Planowanie tygodnia

W **Plan → Dopasowanie treningu → Cele tygodnia** domyślnie działa
„Automatycznie z profilu”. Własne cele włącza się świadomie: **2 osobne sesje
siły A/B, 1–2 sprinty i 1–2 biegi na tydzień**. Skrót „2 siłowe · 2 sprinty ·
1 bieg” ustawia również minimum 1 pełny dzień odpoczynku i lekkie uzupełnienie
wolnych dni.

- **Pełne dni odpoczynku:** minimum 0, 1 lub 2 na każde 7 dni planu. Wartość 0
  oznacza brak dodatkowej rezerwacji, nie nakaz treningu codziennie. Przesunięcia
  po informacji zwrotnej również zachowują minimum w oryginalnych oknach
  7 dni od początku planu, także gdy sesja miałaby przekroczyć ich granicę.
- **Uzupełnianie:** opcja „Lekka technika lub mobilność w pozostałe wolne dni”
  korzysta z dostępnych dni, zachowując zarezerwowany odpoczynek. Uwzględnia
  sprzęt, dostępność, wykonane sesje i ograniczenia planowania.
- **Podgląd:** zmiana ustawień przelicza propozycję. Kalendarz klubu i meczów,
  odstępy między obciążeniami oraz czas na sesję mogą ograniczyć realizację
  celu. Pokrycie i przyczyny brakujących sesji widać przed zapisem.
- **Zapis:** dopiero „Zapisz plan” albo „Zapisz plan z pokazanymi ograniczeniami”
  aktywuje propozycję. „Wróć do zapisanego planu” odrzuca niezapisane cele.
- **Reset:** „Automatycznie z profilu” usuwa własne cele z propozycji. Powrót
  do automatyki w zapisanym planie wymaga zapisania tej propozycji.

Wybrane cele, uzupełnianie i minimum odpoczynku trafiają do snapshotu
`plan[0].planInputs` razem z budżetem czasu. Po odczycie planu UI odtwarza
zapisane ustawienia; przebudowa dziedziczy je, jeżeli nie przekazano nowej
wartości. Jawny reset usuwa te pola. Niezapisane wybory nie przechodzą na inny
plan ani inne konto. Testy trwałości używają izolowanego adaptera zapisu.

Pokrycie obejmuje kolejne **7 dni od początku planu**. Liczy fizyczne sloty
sesji głównej i drugiej według ich ról; A i B w jednym slocie nie stają się
dwiema sesjami siły. Technika i mobilność nie zaliczają sprintu ani biegu.
Pełny odpoczynek wymaga rzeczywiście wolnego dnia bez treningu i zobowiązania
zewnętrznego. Brakująca data nie jest domyślnie dniem odpoczynku.
Klub z nieokreśloną długością (`0 min` w danych) nadal widnieje jako trening
klubowy, również obok drugiej sesji; nie jest pokazywany jako odpoczynek.

## Sprawdzony przykład tygodnia

Dry-run dla 16–22 listopada (`/tmp/ballwise-user-week-dryrun.json`) sprawdzał
cel **2 siły / 2 sprinty / 1 bieg**, minimum 1 dzień odpoczynku i uzupełnianie.
Wynik: **2 siły / 1 sprint / 1 bieg oraz 1 pełny dzień odpoczynku**.

| Dzień        | Zaplanowane sloty      |
| ------------ | ---------------------- |
| Poniedziałek | Siła A + spokojny bieg |
| Wtorek       | Technika z piłką       |
| Środa        | Klub + siła B          |
| Czwartek     | Pełny odpoczynek       |
| Piątek       | Klub + sprint MD−2     |
| Sobota       | Aktywacja przedmeczowa |
| Niedziela    | Mecz                   |

Drugiego sprintu nie dodano: raport wskazał rozdzielenie siły i sprintu,
sąsiedztwo ciężkiej pracy nóg, obecność tego samego bodźca i bufor meczowy.
Walidacja tego wyniku nie zgłosiła naruszeń. Jest to wynik konkretnego fixture,
nie obietnica osiągnięcia każdego żądanego celu.

Piątkowy sprint dwa dni przed meczem korzysta z istniejącego wariantu
o zmniejszonej objętości. W sprawdzonym fixture zmienił się z **45 min / 180 m
na 28 min / 50 m**: część główna **3 × 10 m** oraz **2 × 10 m** narastającego
rozpędzenia. Pominięto sanki, skoki i dodatki. Zachowano fazę `development`,
oznaczenie `highLower: true` i dotychczasowe warunki kwalifikacji; krótsza
receptura nie jest traktowana jako brak ciężkiego bodźca dla nóg. Liczba sesji
pozostała bez zmian. To potwierdzenie konkretnej receptury i reguł planowania,
nie dowód optymalności obciążenia dla użytkownika.

**Założenia fixture, nieustalone fakty o użytkowniku:** zaawansowane
przygotowanie (`advanced`), wysoka kompetencja ruchowa (`high`), pełny nadzór
(`full`), dostęp do sprzętu oraz 75 minut na jednostkę. Wynik należy odnieść
do rzeczywiście uzupełnionego profilu i kalendarza.

## Narzędzia podczas treningu

- **Sprint:** ustawienie odcinka i znaczników z dawki, kierunek, najazd i wybieg;
  ręczny stoper oraz zgodna próba z Lab. „Użyj czasu” wypełnia wynik, a zapis
  próby jest osobnym działaniem. GPS nie mierzy krótkiego sprintu.
- **Bieg z GPS:** czas, dystans, tempo na kilometr i mapa trasy podczas aktywnego
  biegu. Mapa korzysta z istniejącego rejestratora pozycji; pauza zatrzymuje
  śledzenie. Bez GPS dostępne jest prowadzenie po odcinkach i przerwach.
- **Siła i superserie:** pola właściwe dla dawki, zapis serii, przerwa oraz
  przejście A1 → A2 w tej samej rundzie. Przy 320 px wybór zapasu powtórzeń
  układa się w 3 kolumny; przyciski mają minimum 44 px.
- **Piłka:** schemat ustawienia i kolejność podania, przyjęcia, prowadzenia
  oraz ruchu bez piłki. Dla ćwiczeń reaktywnych opcjonalne „Kierunki i kolory”
  zmieniają sygnał co 4, 6, 8 lub 10 sekund. Zamknięcie narzędzia lub ukrycie
  karty zatrzymuje sygnały; narzędzie nie zmienia dawki ani postępu sesji.

Znaczenie pastelowych kolorów i linii opisuje
[instrukcja wyglądu i schematów](MINIMAL-TRAINING-UI.md).

## Zakres sprawdzenia

Chromium: **26/26 widoków rzeczywistej strony sesji** po przejściu z Planu
oraz **10/10 widoków panelu sesji — PASS**, w szerokościach 320 i 390 px.
Sprawdzono narzędzia, zapis serii, superserie, bieżącą mapę, tempo `/km`,
kierunki i kolory; nie stwierdzono poziomego przepełnienia, zbyt małych
przycisków ani błędów JS w tych scenariuszach.

Końcowy scenariusz ustawień tygodnia po zmianach MD−2 i oznaczenia klubu:
**8/8 widoków — PASS** przy 320 i 390 px. Sprawdzono edycję i anulowanie
propozycji, dokładnie jeden zapis, 28 dni w 4 tygodniach, fizyczne sloty,
minimum 1 dzień odpoczynku, zgodność pokrycia oraz odtworzenie zapisanych
ustawień po przeładowaniu. Raport lokalny:
`/tmp/ballwise-weekly-planning/weekly-results.json`.

Dane treningowe i zapisy były izolowane. **GPS był symulowany**, a żądania
zewnętrzne blokowane. Sprawdzenie nie potwierdza dokładności GPS, działania
mapowych kafelków online ani pomiaru i pracy w tle na fizycznym telefonie.
Telefon i kompilacja iOS wymagają osobnego sprawdzenia. Wyniki globalnych
testów projektu opisano poniżej.

## Końcowa weryfikacja kodu

- Zgodność lockfile'ów, TypeScript, ESLint, build web i mobilnego SPA: **PASS**.
- Pełny przebieg UTC obejmował **342 pliki i 2966 testów**: 2964 PASS,
  1 warunkowy SKIP oraz 1 błąd środowiska `spawnSync Node EPERM`. Minimalna
  sonda potwierdziła blokadę procesu potomnego przez profil sandboxu.
- Cały dotknięty tą blokadą plik `mixamo.test.ts` powtórzony w profilu
  umożliwiającym proces potomny: **26/26 PASS**. Nie zmieniano testu ani assetów.
  Pozostałych 341 plików nie powtarzano. Jedyną przerwę pełnego przebiegu
  wyjaśniono i zweryfikowano bez pomijania kontroli.
- `TZ=Europe/Warsaw` dla `todayIso.test.ts`: **3/3 PASS**, również test
  warunkowo pominięty w UTC.

Po tej weryfikacji nie zmieniano kodu produkcyjnego ani testów.
