# BallWise Lab w Safari — protokół 1.2 AUTO

Stan: 13 października 2026. To wersja do odbioru na fizycznym iPhonie, nie deklaracja walidacji laboratoryjnej.

## Dostępne testy

| Test | Próby | Pomiar |
| --- | ---: | --- |
| CMJ | 3 | czas lotu → wysokość |
| Skok jednonóż | 3 na nogę | czas lotu → wysokość |
| Sprint 10 m | 2 | pierwszy ruch → przecięcie mety |
| Skok w dal z miejsca | 2 | automatyczna geometria podłoża i bliższa pięta |
| 505 | 2 na nogę stawną | dwa przecięcia tej samej linii, z kontrolą nawrotu |

Flying 10 m nie jest dostępny jako nowy test. Poprzednie wyniki pozostają czytelne w historii jako archiwalne.

## Nagranie

- **Nagraj próbę** otwiera pełnoekranową kamerę ponad nawigacją aplikacji. Start następuje po 3 sekundach, a film trwa maksymalnie 8 sekund.
- Można też wybrać oryginalny MP4/MOV H.264 lub HEVC z Plików. Limit to 20 s, 128 MiB i 4K.
- WebCodecs odczytuje rzeczywiste znaczniki czasu każdej klatki. Aplikacja nie tworzy sztucznych klatek i nie zgaduje FPS.
- Macierz orientacji filmu jest uwzględniana przy rysowaniu. Filmy pionowe z iPhone'a nie powinny już obracać się o 180° w niewłaściwą stronę.
- Wymagane są HTTPS oraz przeglądarka udostępniająca `VideoDecoder` i `EncodedVideoChunk`.

Tryb kamery zależy od tego, co Safari udostępni dla danego iPhone'a. 120/240 FPS może być dostępne tylko w systemowej aplikacji Aparat. Dla testów czasowych nagrania poniżej 119 FPS są oznaczone jako orientacyjne.

## Skok w dal AUTO

### Przygotowanie

1. Wydrukuj w skali 100% arkusz niebieski **START** i pomarańczowy **3 METRY**. Długa krawędź czarnej ramki ma mieć 20,0 cm.
2. START połóż płasko za linią odbicia, długą krawędzią równo z palcami.
3. Środek krzyżyka drugiego arkusza ustaw taśmą dokładnie 3,00 m od linii START.
4. Oba arkusze i pięty muszą leżeć na jednej płaskiej nawierzchni.
5. Telefon unieruchom z boku. Oba arkusze, całe ciało, odbicie i lądowanie muszą być widoczne przez cały film.

Zawodnik niczego nie nosi. LiDAR nie jest wymagany ani używany.

### Analiza

Po imporcie filmu aplikacja:

1. pobiera próbki klatek i wykrywa sylwetkę,
2. wybiera stabilną pozycję przed odbiciem i po lądowaniu,
3. wykrywa oba kolorowe wzorce w obu klatkach,
4. sprawdza ruch kamery,
5. wyznacza projektową mapę płaskiego podłoża z linii START oraz punktu oddalonego o 3,00 m,
6. wybiera bliższą piętę i liczy prostopadłą odległość od linii odbicia,
7. wykonuje analizę wrażliwości narożników i punktu pięty.

Model pozy i film są przetwarzane lokalnie na urządzeniu. Model jest dostarczany jako lokalny zasób aplikacji; nagranie nie jest wysyłane do zewnętrznej analizy.

Użytkownik widzi duży wynik i klatkę dowodową. Jedyną opcjonalną korektą jest dotknięcie właściwego punktu bliższej pięty; korekta otwiera się na całym ekranie.

### Warunki odrzucenia

Aplikacja nie pokazuje wyniku, gdy:

- nie rozpozna sylwetki lub obu wzorców,
- którykolwiek wzorzec znika z kadru,
- średnie przesunięcie narożników wskazuje ruch telefonu większy niż 5 px,
- jakość pozy lub wzorców jest za niska,
- szacowana niepewność geometrii przekracza 5 cm,
- punkt leży poza wiarygodnym obszarem płaskiego podłoża,
- odległość znajduje się poza zakresem 10–500 cm.

Wyświetlane `± cm` to oszacowanie wrażliwości geometrii obrazu, a nie laboratoryjny przedział ufności. Taśma 3,00 m jest konieczna: pojedyncza kamera bez znanej skali nie może wiarygodnie przeliczyć pikseli na centymetry.

## CMJ, skok jednonóż, sprint i 505

Te testy nadal korzystają z dokładnego przewijania klatka po klatce:

- CMJ i skok jednonóż: pierwsza klatka bez kontaktu → pierwsza klatka kontaktu; `h = 9,80665 × t² / 8`.
- Sprint 10 m: pierwszy ruch tułowia → środek tułowia przecina odmierzoną metę.
- 505: środek tułowia przecina linię pomiarową w kierunku nawrotu → kontakt wybranej nogi stawnej na linii nawrotu → ten sam punkt tułowia przecina tę samą linię w drodze powrotnej. Przygotowanie: 10 m rozbiegu i 5 m od linii pomiarowej do nawrotu.

Odcinki biegowe zawsze mierzy się taśmą. Linie na obrazie służą do wyboru zdarzeń, nie do tworzenia skali odległości.

## Historia i prywatność

Wyniki są walidowane i zapisywane lokalnie dla bieżącego konta i domeny. JSON służy do kopii/przywracania, CSV do arkusza. Film pozostaje w pamięci bieżącej próby tylko po to, by można go było pobrać; aplikacja nie zapisuje go automatycznie w historii ani nie wysyła do analizy.

Stare wyniki protokołów 1.0 i 1.1 pozostają zgodne. Automatyczny skok w dal używa protokołu `ballwise-browser-lab-1.2` i zapisuje wykryte punkty, metodę, jakość, ruch kamery oraz źródło punktu pięty.

## Weryfikacja

Kod przechodzi kontrolę typów, 758 testów, lint oraz build web i mobile. Testy obejmują dekodowanie klatek, orientację iPhone'a, geometrię projektową, wykrywanie wzorców, progi jakości, zapis i zgodność historii. To potwierdza działanie oprogramowania, nie dokładność terenową.

Przed użyciem profesjonalnym należy wykonać co najmniej 20 skoków mierzonych równolegle taśmą i raportować:

- średni błąd bezwzględny,
- największy błąd,
- odsetek nagrań odrzuconych przez kontrolę jakości,
- model iPhone'a, odległość kamery, światło i nawierzchnię.

Nie należy obiecywać „100% dokładności”. System celowo woli odrzucić słabe nagranie niż pokazać pozornie precyzyjną liczbę.

## Instalacja

Paczka `BallWise-Lab-AUTO-Skok-W-Dal-2026-10-13.zip` zawiera jeden instalator do GitHuba: `lab-skok-w-dal-auto.yml`. Wgrywa się go do `.github/workflows` na `main`. Workflow pobiera model z przypiętego adresu, weryfikuje jego SHA-256, uruchamia wszystkie kontrole i dopiero po ich powodzeniu zapisuje kod do `main`.
