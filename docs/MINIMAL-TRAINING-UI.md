# BallWise — prosty wygląd i narzędzia treningu

Kierunek: spokojny interfejs z systemowym fontem, jasnym neutralnym tłem,
płaskimi białymi powierzchniami i jednym głównym działaniem na ekranie.
Nazwy, dawki i kolejność ćwiczeń pochodzą z zapisanej sesji. Wygląd nie zmienia
obciążeń, progów kwalifikacji ani reguł planowania.

## Znaczenie kolorów

| Kolor       | Znaczenie                                                  |
| ----------- | ---------------------------------------------------------- |
| Niebieski   | Bieg, sprint, ruch i główne działanie                      |
| Lawendowy   | Siła; na schemacie przerywana linia podania lub lotu piłki |
| Miętowy     | Regeneracja, wykonanie, spokojny powrót                    |
| Bursztynowy | Przerwa, uwaga, znacznik na boisku                         |
| Koralowy    | Błąd lub stan wymagający zatrzymania                       |
| Turkusowy   | Praca z piłką i prowadzenie                                |

Kolor zawsze towarzyszy tekstowi, ikonie lub rodzajowi linii. Kategorie sesji
korzystają z tego samego zestawu kolorów w Planie, na Start i w nagłówku
treningu. Pastel służy oznaczeniu, nie wypełnia całego ekranu.

## Sesja sprintu

Na liście widać część treningu, ćwiczenie i dawkę. Otwarcie ćwiczenia pokazuje
właściwe narzędzia, bez rozpoczynania treningu w tle:

- **Ustawienie odcinka:** schemat z góry, znaczniki, kierunek biegu i jawne
  odległości z planu. Najazd, praca i wybieg są rozdzielone, gdy sesja je podaje.
- **Czas odcinka:** opcjonalny pomiar ręczny lub odczyt sprawdzonej próby z Lab
  w zgodnych warunkach. Stoper nie zapisuje wyniku automatycznie. „Użyj czasu”
  wypełnia pole; zapis wymaga osobnego działania.
- **Jak wykonać:** wskazówki ruchu i pokaz techniki. Ustawienie boiska i technika
  nie są dwiema kopiami tego samego panelu.

Krótki sprint nie jest mierzony GPS-em. Fizyczne znaczniki odmierzamy taśmą;
orientacyjna miarka kamery zachowuje własny zakres, niezależny od długości
odcinka treningowego.

## Bieganie

Podgląd czyta ten sam protokół co licznik: osobno pokazuje rozgrzewkę, pracę,
przerwy między odcinkami lub seriami i schłodzenie. Rozgrzewka nie może być
opisana jako przerwa po każdym odcinku.

**Z GPS** pokazuje czas, dystans i tempo. **Bez GPS** prowadzi po odcinkach
i przerwach bez deklarowania pomiaru dystansu. Zmiana trybu jest blokowana
podczas aktywnego pomiaru. Przygotowanie trasy jest dostępne przed startem
i podczas sesji. Schemat z metrami pojawia się tylko dla jawnego odcinka;
biegu rozpisanego na czas nie przeliczamy na wymyśloną długość.

## Schematy z piłką

Widok z góry pokazuje zawodnika, piłkę, znaczniki oraz ruch w kolejnych krokach.
Podanie, odbicie od ściany, przyjęcie i prowadzenie mają oddzielne odcinki
i wskazówki. Kroki wybiera się ręcznie; wybrany krok wyróżnia właściwą linię.
Podgląd nie zapisuje wykonania ćwiczenia.

- Linia ciągła: bieg bez piłki.
- Linia falowana: prowadzenie piłki.
- Linia przerywana: podanie lub lot piłki.
- Linia kropkowana: spokojny powrót lub wyhamowanie.
- Trójkąt: znacznik; kółko „Ty”: pozycja zawodnika.

Wymiary wynikają z opisu ćwiczenia. Rysunek jest schematem, nie skalowaną mapą.
Ćwiczenie bez rozpoznanego ustawienia nie dostaje przypadkowego boiska.

## Granice etapu

Wyszukiwanie użytkowników, wspólne treningi i dalsze zmiany Football IQ są
odłożone zgodnie z ustaleniem. Nie dodano pustych przycisków tych funkcji.

Kontrolę widoków treningu można powtórzyć w Chromium przez
`node scripts/check-session-flow-ui.mjs --field-only`, z lokalnym Playwright
i `BALLWISE_CHROMIUM_PATH`. Dane konta i zapisy w tym scenariuszu są izolowane.
