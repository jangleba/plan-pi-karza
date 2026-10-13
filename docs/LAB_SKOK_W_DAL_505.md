# BallWise Lab — skok w dal, 505 i kamera

Wersja paczki: 2026-10-12. Baza: b1a617537378b2b8e04d9afa06592ff2002ae93c.

## Zakres

- Flying 10 m usunięto z listy testów i pełnego profilu. Wcześniejsze wyniki pozostają w historii jako archiwalne, z zachowaniem kopii i eksportu.
- Skok w dal z miejsca: dwie próby, najlepsza odległość, 90 s przerwy. Odbicie obunóż, zamach ramion dozwolony. Odległość prostopadle od linii odbicia do pięty bliższej startowi. Próba z cofnięciem lub podparciem za piętą nie jest poprawna.
- 505 tradycyjny: dokładnie 10 m rozbiegu przed linią pomiarową, 5 m do linii nawrotu i powrót przez tę samą linię pomiarową. Dwie próby na każdą nogę stawną, 3 min przerwy. Rozbieg nie wchodzi do wyniku. Czas końcowy obejmuje 5 m w jedną stronę, nawrót 180° i 5 m powrotu.
- Podgląd kamery zajmuje cały dostępny obszar strony, ponad nawigacją aplikacji. Obraz nie jest przycinany. Safari może zachować własny pasek przeglądarki. Kamera i analiza respektują obrót telefonu.
- Pozostałe testy nadal wykorzystują rzeczywiste czasy prezentacji klatek MP4/MOV, nie czas odtwarzacza ani ręcznie wpisane FPS. Pełny profil nadal ma 5 testów i 17 prób.

## Skok w dal — pierwsza próba

1. Telefon na stabilnym statywie, z boku i powyżej podłoża. Widoczne pełne ciało, strefa lądowania i wzorzec. Obiektyw i zoom bez zmian przez całe nagranie. Dobre światło, płaskie podłoże. Widok z bardzo niskiej kamery daje zbyt spłaszczony wzorzec.
2. Przygotuj płaski prostokątny wzorzec o zmierzonych wymiarach. Najprościej większa mata albo prostokąt z taśmy na podłożu. Cztery narożniki jednego prostokąta wystarczają; cztery osobne stożki nie są wymagane. Dwa nieodmierzone stożki ani samo nagranie bez skali nie wyznaczają centymetrów.
3. Poza ścieżką zawodnika zaznacz dwa końce osobnego odcinka długości minimum 100 cm, zmierzonego taśmą. Odcinek powinien przebiegać wzdłuż kierunku skoku i obejmować możliwie dużą część jego strefy. Nie wykorzystuj ponownie krawędzi wzorca jako kontroli.
4. Po nagraniu wybierz klatkę, na której wzorzec jest widoczny. Wpisz jego rzeczywiste dwa wymiary i zaznacz cztery zewnętrzne narożniki w kolejności wokół obwodu. Szerokość odpowiada krawędzi między punktem 1 i 2. Zatwierdź narożniki. Przycisk „Znajdź wzorzec” proponuje narożniki czarnej ramki na białym tle; zawsze wymagają sprawdzenia.
5. W „Kontrola skali” wpisz zmierzoną długość osobnego odcinka i zaznacz jego dwa końce.
6. W „Linia odbicia” wybierz klatkę przed skokiem. Zaznacz dwa punkty tej samej linii podłoża tuż przed palcami stóp. Kliknij „Oznacz przed odbiciem”.
7. Wybierz klatkę stabilnego lądowania. W „Pięta” zaznacz kontakt bliższej pięty z podłożem. Kliknij „Oznacz lądowanie”. Punkty można przeciągać, a lupa pomaga widzieć kontakt. Powiększenie i przesunięcie obrazu są dostępne w pomocy.
8. Potwierdź poprawność próby i zapisz. Każda zmiana punktów wymaga ponownego potwierdzenia wyniku. Zachowaj film i kopię JSON.

Wydruk `public/lab-wzorzec.svg`: A4, skala 100%, zewnętrzna ramka 20 × 14 cm. Po wydruku zmierz ramkę i wpisz rzeczywiste wymiary. Mały wzorzec w szerokim kadrze może być odrzucony; użyj wtedy większego prostokąta. Nie ma ograniczenia do wydrukowanego wzorca dla ręcznej kalibracji.

## Co oblicza silnik

Cztery narożniki oraz dwa znane wymiary wyznaczają homografię płaszczyzny podłoża. Zaznaczona pięta i dwa punkty linii odbicia są przeliczane na centymetry. Wynikiem jest odległość punktu od prostej, a nie długość przekątnej między palcami i piętą. Czas między zaznaczonymi klatkami służy wyłącznie do dokumentowania próby; nie wyznacza odległości.

Blokady obejmują niewypukły lub zdegenerowany wzorzec, zbyt mały wzorzec (krótsza krawędź poniżej 24 pikseli lub pole poniżej 0,3% wyświetlanej klatki), punkty poza obrazem, nieprawidłową linię, brak potwierdzeń oraz różnicę kontroli skali większą niż 2 cm na znanym odcinku minimum 1 m. Progi są konserwatywnymi warunkami przyjęcia geometrii, nie potwierdzonym błędem sportowego pomiaru.

Automatyzacja w tej paczce: dobór dostępnego trybu kamery, odczyt FPS i czasów klatek, propozycja narożników wzorca, przeliczenie odległości, kontrola geometrii, historia i eksport. Linia odbicia i pięta są oznaczane przez użytkownika. Nie dodano automatycznego rozpoznawania pięt, LiDAR ani natywnego mapowania ARKit.

## 505 — oznaczanie

Odmierz taśmą obie odległości, wybierz nogę STAWNĄ i ustaw nieruchomą kamerę bokiem do linii pomiarowej. Tułów przy obu przecięciach oraz kontakt stopy na nawrocie muszą być widoczne. Wybierz pierwszą klatkę przecięcia tej samej linii przez ten sam punkt tułowia przy wejściu i powrocie. Sprawdź klatki poprzednie. Między tymi zdarzeniami zaznacz też klatkę kontaktu wybranej nogi na linii nawrotu. Bez niej nowy pomiar nie zostanie zapisany. Nie zapisuj zmodyfikowanego 505 ze startu stojącego jako tradycyjnego 505.

Nowe 505 i skok w dal mają protokół `ballwise-browser-lab-1.1`. Wcześniejsze pomiary pozostają w protokole 1.0; porównanie wymaga tej samej wersji. Przedział dla czasów wynika z odstępów klatek i nie obejmuje błędu ustawienia kamery ani oznaczenia zdarzeń. Dla odległości nie wyświetlamy wymyślonego przedziału dokładności.

## Odbiór na fizycznym iPhonie

Testy kodu i przeglądarek nie potwierdzają dokładności sportowej na telefonie. Do pierwszego odbioru zrób przynajmniej 20 skoków o różnej długości, za każdym razem mierząc ten sam skok taśmą od linii do bliższej pięty. Sprawdź krótsze i dłuższe skoki oraz różne pozycje lądowania w kadrze. Powtórz oznaczanie kilku nagrań przez drugą osobę. Zachowaj wynik aplikacji, wynik taśmy, model telefonu, warunki i film. Oblicz średni błąd bezwzględny, największy błąd i liczbę odrzuconych prób. Nie traktuj 2 cm kontroli skali jako gwarancji dokładności.

Dla 505 porównaj te same zdarzenia z fotokomórką lub niezależną analizą oryginalnego filmu. Obowiązuje ustalone ustawienie kamery i punkt tułowia. Na bazie rzeczywistych prób należy określić obsługiwane warunki i osiągnięty błąd, zanim funkcja będzie reklamowana jako zwalidowana.

## Źródła metody i protokołów

- KIT, test skoku w dal z miejsca: https://www.ifss.kit.edu/more/english/Testothek_Standweitsprung.php
- OpenCV, homografia płaszczyzny: https://docs.opencv.org/4.x/d9/dab/tutorial_homography.html
- Badanie automatycznego pomiaru skoku w dal (odrębne stanowisko i model, jego dokładność nie jest dokładnością BallWise): https://doi.org/10.1038/s41598-026-44523-3
- Badanie pomiaru tradycyjnego i zmodyfikowanego 505: https://doi.org/10.1002/ejsc.12252
