# BallWise Lab — skok w dal AUTO i 505

Wersja: 2026-10-13 AUTO

## Skok w dal z miejsca

Pomiar jest celowo prosty dla zawodnika, ale rygorystyczny dla aplikacji. BallWise pokazuje wynik tylko wtedy, gdy film pozwala wyznaczyć skalę podłoża, bliższą piętę i stabilność kamery.

### Przygotowanie

1. Wydrukuj oba arkusze w skali 100%: niebieski **START** i pomarańczowy **3 METRY**. Długa krawędź czarnej ramki każdego arkusza musi mieć 20,0 cm.
2. Połóż arkusz START płasko za linią odbicia, długą krawędzią równo z palcami zawodnika.
3. Taśmą ustaw środek krzyżyka pomarańczowego arkusza dokładnie 3,00 m od linii START. Oba arkusze i pięty muszą leżeć na tej samej płaskiej nawierzchni.
4. Ustaw i unieruchom telefon z boku. W jednym kadrze muszą być oba arkusze, całe ciało, odbicie i lądowanie.
5. Nagraj 5–10 sekund. Zawodnik skacze obunóż i na chwilę zatrzymuje lądowanie.

Arkusze leżą na podłożu. Zawodnik niczego nie nosi. LiDAR nie jest wymagany ani używany w Safari.

### Obsługa

1. Nagraj próbę albo wybierz oryginalny film.
2. Poczekaj na automatyczną analizę sylwetki, obu arkuszy, ruchu telefonu i bliższej pięty.
3. Sprawdź duży wynik oraz klatkę dowodową z niebieskim punktem pięty.
4. Tylko gdy punkt jest nieprawidłowy, wybierz **Popraw punkt pięty** i dotknij właściwego miejsca.
5. Zapisz wynik.

Nie trzeba zaznaczać narożników, linii ani skali. Model pozy działa lokalnie na urządzeniu; nagranie nie jest wysyłane do analizy zewnętrznej.

### Kiedy wynik jest odrzucany

BallWise nie zgaduje centymetrów. Nie zapisze wyniku, gdy:

- nie rozpozna obu arkuszy lub sylwetki,
- któryś arkusz zniknie z kadru,
- telefon przesunie się o więcej niż 5 px,
- geometria daje szacowaną niepewność większą niż 5 cm,
- wykryta odległość jest nietypowa albo pięta znajduje się poza wiarygodnym obszarem podłoża.

Ten sam film i te same punkty dają ten sam wynik. Podawana niepewność dotyczy geometrii obrazu; nie zastępuje walidacji terenowej.

### Walidacja przed użyciem profesjonalnym

Przed komunikowaniem dokładności wykonaj co najmniej 20 prób równolegle z pomiarem taśmą. Zapisz średni błąd bezwzględny, największy błąd i odsetek odrzuconych nagrań. Dopiero ten test na docelowym telefonie, odległości i nawierzchni określa realną dokładność systemu.

## Test 505

505 pozostaje w Labie. Odcinek przygotowuje się taśmą: 10 m rozbiegu i 5 m od linii pomiarowej do linii nawrotu. Czas jest liczony między dwoma przecięciami tej samej linii przez środek tułowia. Klatkę kontaktu nogi stawnej na linii nawrotu oznacza użytkownik.

Flying 10 m nie jest oferowany jako nowy test. Dawne wyniki pozostają widoczne w historii jako archiwalne.
