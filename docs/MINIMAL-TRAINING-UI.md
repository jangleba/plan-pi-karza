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

Kolor zawsze towarzyszy tekstowi, ikonie lub rodzajowi linii. Kategorie na Start,
w nagłówku treningu oraz schematy ćwiczeń zachowują ten zestaw. Plan tygodnia
ma osobny, neutralny wygląd opisany poniżej.

## Neutralny Plan

Lista tygodnia używa zwykłych szarych nazw kategorii, cienkich separatorów
i małych oznaczeń intensywności zamiast kolorowych etykiet. Wybór dzisiejszej
daty i główne działanie są neutralne; wspólna nawigacja aplikacji pozostaje spójna
z pozostałymi zakładkami.

- 1–3 szare słupki odpowiadają zapisanej niskiej, umiarkowanej i wysokiej
  intensywności sesji. Nie tworzą nowego wyniku obciążenia ani pomiaru fizjologii.
- Kreska oznacza brak określonej intensywności w planie. Trening klubowy i mecz
  nie otrzymują udawanego pomiaru z domyślnej etykiety kalendarza.
- Status i dobrowolny test biegowy zajmują krótkie wiersze. Pełne przyczyny,
  zmiany profilu i porównanie propozycji są dostępne w zamkniętych szczegółach.
- Błędy zapisu i blokujące informacje pozostają jawne. Podgląd nadal wymaga
  osobnego zatwierdzenia. Realizacja celów znajduje się pod tygodniem.

Zmiana dotyczy prezentacji Planu; nie zmienia planowania ani przepisanych dawek.

Sprawdzenie tej korekty: 34 testy komponentów Planu/MAS, TypeScript, ESLint,
build web i mobilnego SPA — PASS. Chromium: 8 widoków przy 320/390 px oraz
4 sprawdzenia zwijanych szczegółów — PASS, bez błędów JS, przepełnienia
i automatycznych zapisów. Raporty: `/tmp/ballwise-plan-monochrome-final/`.
Pełne sprawdzenie silnika v2.13 pozostaje opisane dla poprzedniego commita
`9b782530` w dokumencie dalszych prac; tej wizualnej korekty nie nazywa się
ponownym pełnym przebiegiem wszystkich testów projektu.

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
