# Pełne jednostki i automatyczny sprint — silnik 2.19

Nowe plany domyślnie zachowują pełne receptury treningowe. Brak wybranego czasu
nie oznacza limitu 75 minut. Dotyczy to generowania, podglądu, zapisu, rozpoczęcia
jednostki oraz propozycji kolejnego planu.

## Długość treningu

- `sessionDurationMode: "full"` zachowuje kompletną recepturę dobraną do zawodnika
  i kontekstu tygodnia. Wartość `minutesPerSession` jest wtedy wyłącznie polem
  zgodności zapisu.
- `sessionDurationMode: "limited"` oznacza świadomie wybrany limit czasu.
  Dotychczasowe wywołania API z samym `minutesPerSession` nadal oznaczają limit.
- Receptury, wynik silnika i zapisane dane wejściowe przechowują tryb. Liczbowe
  metadane zapisu pozostają skończone; wewnętrzna granica `Infinity` nie trafia do
  JSON ani bazy danych.
- Stary zapis bez trybu pozostaje historycznym planem z limitem. Przygotowanie
  jego aktualizacji domyślnie proponuje pełne jednostki, a zastosowanie wymaga
  zwykłego potwierdzenia podglądu.
- Odpowiedź o braku czasu w podsumowaniu cyklu nie skraca treningów automatycznie.
  Zawodnik wybiera limit osobno.

Pełna receptura nadal uwzględnia staż, sprzęt, kalendarz meczów, przygotowanie
ruchowe i faktycznie zgłoszone dane zdrowotne. Pełna jednostka przedmeczowa może
mieć mniejszą dawkę niż pełna jednostka w okresie przygotowawczym.

## Codzienny wybór

Na ekranie Start można pozostawić pełną jednostkę albo świadomie przygotować
krótszy wariant dzisiejszego treningu. Przed zapisem widoczne są zmiany dawki.
Gdy bezpieczna minimalna struktura nie mieści się w limicie, aplikacja wyjaśnia
brak wariantu. Rozpoczęta jednostka nie podlega tej zmianie.

Wybór czasu jest niezależny od ankiety zdrowotnej. Aplikacja nie zapisuje za
zawodnika odpowiedzi o śnie, bólu ani samopoczuciu. Ankietę można pominąć.

## Sprint

Interfejs nie ustawia stałego wymogu jednego lub dwóch sprintów. Tryb `auto`
próbuje znaleźć miejsce na główną sesję szybkościową; kolejna ekspozycja jest
możliwa przy celu szybkościowym i odpowiednich warunkach tygodnia. Zatłoczony
kalendarz może uniemożliwić sprint. Brak drugiej sesji nie jest zaległością.

Zapisane preferencje liczby sprintów przechodzą w interfejsie na `auto`, z
zachowaniem wyborów siły, biegania i odpoczynku. Jawne wywołania dawnego API
`speed: 1` lub `speed: 2` pozostają obsługiwane dla zgodności.

## Weryfikacja

Regresje obejmują pełne receptury przekraczające dawne 75 minut, jawne limity,
zapis i rozpoczęcie pełnej jednostki, serializację, zachowanie rozpoczętych
treningów, wybór czasu na Start, kolejne plany i automatyczny sprint.
Pełne sprawdzenie projektu: `npm run verify:release`.

Ta zmiana nie zamyka pozostałych ustaleń audytu silnika 2.18 ani nie publikuje
aplikacji w Lovable lub App Store.
