# BallWise Lab w Safari — wersja do testów

## Kamera w Lab i rzeczywiste czasy — 11.10.2026

Wydanie poprawione 1.1: naprawione dwa błędy ESLint prefer-const w timerach nagrywania oraz ostrzeżenie react-hooks/exhaustive-deps w sprzątaniu podglądu kamery. Wgraj ponownie ten sam lab-camera-auto.yml, zastępując poprzednią wersję. Nieudana wcześniejsza instalacja przed krokiem commitu nie zapisała tych zmian na main. Instalator akceptuje rozpoznaną poprzednią wersję paczki oraz bazę Prosto i kamera. Lokalnie ponownie zaliczono 65 testów modułu, kontrolę typów runtime i formatowania; cały moduł sprawdzono także ESLint 9.39.5 z regułami TypeScript i React Hooks, bez błędów i ostrzeżeń. Pełny verify:release pozostaje częścią workflow na GitHubie.

Aktualna poprawka: `BallWise-Lab-Kamera-Auto-Ustawienia-2026-10-11.zip`, jeden plik `lab-camera-auto.yml`. Wgraj ten plik do `.github/workflows` na main w `jangleba/plan-pi-karza`, po zainstalowanej poprawce Prosto i kamera. Poczekaj na zielony workflow **BallWise Lab - Kamera i auto ustawienia**, następnie Lovable → Publish → Publish changes. Instalator sprawdza wersje wszystkich zmienianych plików przed zapisem, jest idempotentny i uruchamia pełne verify:release przed commitem. Nie zmienia zależności ani formatu historii.

**Nagraj próbę** otwiera podgląd kamery w Lab przez getUserMedia. Żądana jest tylna kamera bez mikrofonu. Moduł sprawdza getCapabilities, próbuje najwyższej dostępnej liczby klatek do 240 FPS, z preferowaną rozdzielczością HD, i odczytuje ustawienia przez getSettings. Próby ograniczeń, a nie nazwa modelu telefonu, określają dostępny tryb. Przeglądarka może udostępniać mniej trybów niż natywna aplikacja Aparat. Stan kamery i deklarowany FPS nie dowodzą FPS gotowego nagrania: parser po nagraniu odczytuje rzeczywiste znaczniki czasu i średni FPS.

Start → 3 sekundy odliczania → 8 sekund filmu → automatyczny powrót do oznaczania zdarzeń. Nagranie można zakończyć wcześniej. Zapis przez MediaRecorder w MP4, z wykrywaniem obsługi kontenera/kodeka; bez skalowania klatek przez canvas i bez obliczania wyniku z zegara interfejsu. Wszystkie fragmenty filmu są łączone w oryginalnej kolejności. Parser obsługuje także fragmentowany MP4. Kamera i timery są zwalniane przy zakończeniu, błędzie, anulowaniu, wyjściu z ekranu i ukryciu strony. Przerwane nagrywanie nie daje wyniku.

Obsługiwane są oryginalne nagrania od około 15 do 300 FPS, w tym 24/25 FPS i zmienny FPS. Wcześniejszy próg 29 FPS został usunięty. Pomiar oraz zakres wynikają z rzeczywistych czasów klatek przy każdym oznaczonym zdarzeniu. Nie interpolujemy klatek i nie uznajemy 24 FPS za 60 FPS. Wyniki poniżej 119 FPS są oznaczone jako orientacyjne. Odrzucane są powtórzone lub nieprawidłowe czasy, przerwa ponad 0,25 s w filmie i odstęp ponad 0,125 s przy oznaczonym zdarzeniu; limity długości, rozdzielczości, rozmiaru i jawnych edycji tempa pozostają. Typowy FPS nie pozwala samodzielnie sprawdzić oryginalności ani całkowitego błędu pomiaru.

Jeśli odczyt nie przejdzie, **Zachowaj nagranie** pobiera otrzymany oryginalny plik. Przy wyniku film można pobrać ze Szczegółów pomiaru. Plik jest dostępny w pamięci bieżącej próby, bez automatycznego trwałego zapisu w galerii ani wysyłki na serwer. Import galerii oraz systemowy aparat jako opcja w zwijanej pomocy pozostają dostępne.

Lokalnie: testy modułu, kontrola typów runtime i formatowania. Testy kamery mockują API platformy; parser jest sprawdzany na rzeczywistym, sztucznie wygenerowanym fragmentowanym MP4 H.264 24 FPS oraz pozostałych klipach AVC/HEVC, HD/4K. To kontrola oprogramowania, nie walidacja pomiaru na zawodnikach. Nie wykonano nagrania na fizycznym iPhonie w tej sesji. Pełny projekt sprawdza workflow. Po instalacji sprawdź na opublikowanej domenie w Safari: zgoda na kamerę, podgląd, odliczanie, zakończenie, oznaczenie zdarzeń, wynik i zapis; sprawdź też anulowanie. Podgląd w ramce Lovable może ograniczać zgodę na kamerę przez Permissions Policy.

Automatyczne rozpoznanie wybicia i lądowania nadal nie jest częścią tej poprawki. Wynik pojawia się po dwóch oznaczeniach użytkownika.

Źródła techniczne: https://www.w3.org/TR/mediacapture-streams/ ; https://www.w3.org/TR/mediastream-recording/ ; https://webkit.org/blog/11353/mediarecorder-api/ .

Protokół wyników: `ballwise-browser-lab-1.0`. Punkt wejścia: **Plan → Lab — Testy z filmu** (`/lab`). Pozostałe pięć zakładek aplikacji zachowuje dotychczasowy układ.

## Zakres

| Test          | Próby            | Początek i koniec                               | Wynik                                        |
| ------------- | ---------------- | ----------------------------------------------- | -------------------------------------------- |
| CMJ           | 3                | Pierwsza klatka lotu → pierwsza klatka kontaktu | Szacowana wysokość z czasu lotu, cm          |
| Skok jednonóż | 3 na nogę        | Lot → kontakt tej samej stopy                   | Wysokość, cm; różnica L/P po pełnych seriach |
| Sprint 10 m   | 2                | Pierwszy ruch tułowia → środek tułowia na mecie | Czas, s; bez czasu reakcji                   |
| Flying 10 m   | 2                | Środek tułowia na wejściu → na wyjściu          | Czas i średnia prędkość odcinka              |
| 505           | 2 na nogę stawną | Wejście → powrót przez tę samą linię            | Czas, s; porównanie stron po pełnych seriach |

Pełny profil ma 17 prób. Strony są wykonywane naprzemiennie w obrębie testu. Przerwa zalecana: 60 s po skoku, 180 s po biegu. Licznik jest przypomnieniem; przejście do kolejnej próby można wykonać wcześniej. Seria zakończona przed zebraniem wszystkich prób jest opisana jako niepełna.

## Nagranie i odczyt

1. Telefon na statywie, dobre światło, widoczne zdarzenia i cały odcinek. Rozgrzewka przed testami.
2. Aparat: najlepiej HD 60 FPS i 5–10 s. Przyjmujemy HD i 4K od około 15 do 300 FPS, także 24/25 FPS. Jedna próba, klip do 20 s i 128 MiB. Lab nagrywa w Safari w trybach udostępnionych przez przeglądarkę; 240 FPS nie jest gwarantowane.
3. W aktualnych Zdjęciach iOS: wybierz film → Udostępnij → **Eksportuj niezmodyfikowane oryginały / Export Unmodified Originals** → wybierz folder w Plikach → Zapisz. Przy iCloud może być potrzebne pobranie oryginału. Apple opisuje tę ścieżkę: https://support.apple.com/en-us/111762.
4. Alternatywnie w iCloud.com/photos użyj dodatkowych opcji pobierania i wybierz **Unmodified Originals**, a następnie rozpakuj pobrany ZIP w Plikach. Nie konwertuj klipu na inny kodek ani tempo po nagraniu.
5. W Labie wybierz film. Odczytane FPS muszą odpowiadać nagraniu. Film 30/60 FPS jest przyjmowany jako wynik orientacyjny. Samo FPS nie rozstrzyga, czy plik był wcześniej spowalniany. Użytkownik musi potwierdzić oryginalność; aplikacja nie zgaduje FPS nagrania ani nie tworzy dodatkowych klatek.
6. Oznacz dwa zdarzenia zgodnie z instrukcją. Obejrzyj klatkę poprzednią. Potwierdź oryginalność i protokół, zapisz próbę.

H.264 oraz HEVC w zwykłym lub fragmentowanym MP4/MOV. Jeden tor wideo, maksymalnie 4K (4096 px na dłuższej krawędzi i 4096 × 2160 pikseli), do 6500 próbek. Podgląd ma maksymalnie 1280 px na dłuższej krawędzi; czasy pochodzą z oryginalnych próbek. Dekodowanie 4K nadal wymaga obsługi przez konkretny telefon i kodek. Odrzucane są niespójne PTS, nieobsługiwany kodek, brak pełnych próbek i edycje zmieniające tempo. Oryginalność materiału pozostaje także potwierdzeniem użytkownika: parser nie wykryje każdej możliwej wcześniejszej konwersji.

MP4Box odczytuje PTS w kolejności prezentacji. WebCodecs dekoduje GOP, a klatka jest wybierana według PTS, niezależnie od kolejności callbacków i klatek B. Oznaczanie jest zablokowane do chwili narysowania potwierdzonej klatki. Anulowanie, zmiana filmu i opuszczenie ekranu unieważniają poprzednią operację. Dekoder ma limit czasu i kolejki; nieużywane VideoFrame są zamykane. Macierz obrotu filmu jest uwzględniana przy rysowaniu.

Wymagane HTTPS i działający VideoDecoder dla rzeczywistego kodeka pliku. Aktualny Safari jest zalecany. Samo zgłoszenie obsługi kodeka przez przeglądarkę nie zastępuje próby dekodowania. **Sprawdź Safari** wykonuje odczyt czterech klatek AVC i czterech HEVC z własnych sztucznych filmów 240 FPS. Przykład 23,018387 cm służy wyłącznie kontroli obliczeń, nie jest zapisywany jako wynik zawodnika.

## Rzetelność

- Skok: `h = 9.80665 · t² / 8`. Zakładamy podobne ustawienie nóg przy oderwaniu i pierwszym kontakcie. Podciągnięcie nóg lub inne lądowanie zmienia wynik.
- Biegi wymagają odcinków zmierzonych taśmą, nieruchomej kamery i ograniczenia paralaksy. Średnia prędkość Flying 10 m nie jest prędkością maksymalną ani chwilową.
- Przy 30/60 FPS wynik i historia mają oznaczenie „Wynik orientacyjny”. HD/4K nie określa dokładności czasowej: obie rozdzielczości przy 60 FPS mają takie same odstępy między klatkami. 120/240 FPS można wybrać w osobnym trybie Aparat → Zwolnione tempo na obsługiwanych iPhone’ach.
- Pokazany przedział uwzględnia tylko możliwy moment zdarzenia między sąsiednimi klatkami. Nie jest przedziałem ufności ani całkowitym błędem metody.
- Porównanie dopuszcza ten sam test, nogę i wersję protokołu. Warunki, technika i wybór zdarzeń wymagają kontroli użytkownika.
- Nie wyliczamy mocy, siły reakcji podłoża, RSI/DRI, norm wieku, diagnozy ani ryzyka urazu. Nie wykorzystujemy LiDAR ani automatycznej rekonstrukcji pozy z jednego obrazu.
- Przeglądarka nie weryfikuje prawidłowej techniki ruchu automatycznie. Pomiary trzeba zweryfikować na oryginalnych nagraniach sportowców; testy sztucznych klipów nie zastępują walidacji względem fotokomórek lub platformy.

## Historia i kopie

Wyniki są zapisywane lokalnie dla konkretnego konta i originu. Przejście z domeny podglądu na opublikowaną domenę może pokazać pustą historię: przenieś ją przez JSON. Inne urządzenie lub usunięcie danych Safari też wymaga kopii JSON. Film nie jest zapisywany przez Lab ani wysyłany do analizy; zachowaj go osobno.

Historia: do 300 prób. Zapis ma walidację wzorów, pól i protokołu; ta sama para zdarzeń z tego samego filmu nie jest dodawana drugi raz dla tego samego testu i strony. Nieudany zapis nie wyświetla sukcesu; można pobrać kopię pojedynczej próby.

JSON służy do przywracania, CSV do arkusza. Nazwy i notatki CSV są zabezpieczone przed interpretacją jako formuły. Import sprawdza wszystkie wyniki przed zapisem i zachowuje istniejącą historię. Uszkodzona historia nie jest automatycznie nadpisywana. Odzyskanie wymaga poprawnego JSON, pobrania surowej kopii i osobnego potwierdzenia zastąpienia uszkodzonych danych.

## Pierwotna instalacja pełnego Labu — historia

Aktualna paczka **BallWise-Lab-Safari-2026-10-11.zip** zawiera jeden instalator. Rozpakuj ZIP w Plikach na iPhonie. W repozytorium `jangleba/plan-pi-karza`, na `main`, wgraj tylko `lab-safari-install.yml` do `.github/workflows`. Zapisanie tego pliku uruchamia instalację automatycznie. W Actions wybierz **BallWise Lab Safari - instalacja** i poczekaj na zielony wynik. Jeśli potrzeba ponowienia, użyj **Run workflow → main**. Nie musisz instalować wcześniejszych trzech etapów.

Instalator dodaje cały Lab w jednym uruchomieniu, ustawia Node 22 i npm 11.9.0 zgodny z lockfile, sprawdza typy, wszystkie testy, lint oraz oba buildy. Dopiero po ich powodzeniu zapisuje kod na GitHubie. Zmiany w Planie i istniejących zależnościach są zachowywane przez punktowe dodanie integracji. Pliki Labu mogą pochodzić z rozpoznanych wcześniejszych paczek; nieznana wersja zatrzymuje instalację przed zmianą źródeł. Ponowne uruchomienie po pełnej instalacji jest idempotentne. Zmiana main podczas testów może zablokować push; wtedy uruchom ten sam workflow ponownie.

Kod w folderze `kod/` służy do przeglądania, nie do wgrywania całej zawartości do głównego katalogu GitHuba. Sam ZIP umieszczony w repozytorium nie instaluje modułu.

Po instalacji sprawdź synchronizację `main` z projektem Lovable. Do testowania opublikowanej strony użyj w Lovable **Publish → Publish changes**. Aktualizacja repozytorium i podglądu nie publikuje automatycznie nowej wersji strony: https://docs.lovable.dev/features/publish. Sam ZIP umieszczony w repozytorium nie instaluje kodu.

## Test odbiorczy na iPhonie

1. Otwórz zaktualizowaną stronę w zwykłym Safari przez HTTPS. Zaloguj się, Plan → Lab.
2. Uruchom **Sprawdź Safari**. Pobierz raport, jeśli odczyt kodeka nie przejdzie.
3. Nagraj CMJ, wyeksportuj niezmodyfikowany oryginał, oznacz wybicie i kontakt. Zapisz trzy różne próby.
4. Odśwież stronę. Sprawdź komplet 3/3 i najlepszą/średnią. Pobierz JSON i CSV.
5. Przywróć JSON na tej samej domenie: duplikaty mają być pominięte. Na innym urządzeniu wyniki mają zostać dodane.
6. Wykonaj pozostałe testy po zmierzeniu odcinków. Sprawdź właściwą nogę stawną 505 i komplet 17 prób.
7. Porównaj dwie próby tego samego testu. Zapisz warunki, wersję iPhone/iOS oraz raport przeglądarki.

Pierwsza próba na fizycznym iPhonie jest obowiązkowym krokiem odbioru. Lokalny build oraz WebKit na Linuksie nie dowodzą działania na każdym iPhonie. Po odbiorze tej wersji możliwa jest osobna integracja natywnego nagrywania; moduły pomiarów i protokołów są wydzielone od źródła filmu.

## Źródła techniczne

- MP4Box: https://github.com/gpac/mp4box.js
- WebKit / HEVC w WebCodecs: https://webkit.org/blog/15063/webkit-features-in-safari-17-4/
- WebKit / poprawka kolejności klatek H.264: https://webkit.org/blog/17862/webkit-features-for-safari-26-4/
- WebKit / problem flush w dekoderach: https://webkit.org/blog/18420/release-notes-for-safari-technology-preview-254/
- Apple / pobieranie oryginałów: https://support.apple.com/en-us/111762
- Lovable / synchronizacja: https://docs.lovable.dev/integrations/github
- Lovable / aktualizacja opublikowanej strony: https://docs.lovable.dev/features/publish

## Stabilność aktualnej paczki

Pomiar jest zablokowany, jeśli przeglądarka nie udostępnia VideoDecoder i EncodedVideoChunk albo strona nie działa przez HTTPS. Historia i kopie pozostają dostępne. Każdy konkretny film przechodzi osobną kontrolę kodeka i czasu. Dekoder ma limit 15 sekund na odczyt klatki oraz jawne zakończenie przy anulowaniu, także gdy platformowe flush nie kończy swojego Promise.

Przy wyborze pliku jest zwijana instrukcja: Zdjęcia → Udostępnij → Eksportuj niezmodyfikowany oryginał → Pliki. Jest ona oparta na aktualnej instrukcji Apple: https://support.apple.com/en-us/111762.

## Poprawka HD/4K i 30/60 FPS — 11.10.2026

Plik `lab-format-fix.yml` jest poprawką do zainstalowanego Lab Safari 1.1. Wgraj go do `.github/workflows` w `jangleba/plan-pi-karza` na `main`. Uruchamia się automatycznie po zapisie. Zmieniane są tylko pliki modułu Lab i ta dokumentacja. Instalator sprawdza rozpoznaną wersję plików, nie nadpisuje nieznanych zmian, a przed commitem uruchamia pełne `verify:release`. Historia zachowuje format i dotychczasowe wyniki.

Lokalnie: 42 testy modułu zaliczone, w tym rzeczywiste pliki HD 30 FPS i 4K 60 FPS, zapis/odczyt 30/60 FPS, zakres czasowy i przepływ oznaczenia/zapisu 60 FPS. Testy interfejsu korzystają z uproszczonego komponentu dialogu w izolowanym środowisku; dekoder platformowy jest mockowany. Typy runtime modułu i formatowanie sprawdzone. Pełny build projektu jest uruchamiany przez instalator na GitHubie. Odczyt własnego filmu 4K i wydajność na fizycznym iPhonie wymagają odbioru po instalacji.

Źródła: Apple — https://support.apple.com/pl-pl/guide/iphone/iphc1827d32f/ios; Pueo i wsp., 2023 — https://pubmed.ncbi.nlm.nih.gov/37077799/. Wyniki walidacji innych aplikacji nie są walidacją BallWise.

## Poprzednia poprawka: uproszczony pomiar i kamera — 11.10.2026

Paczka `BallWise-Lab-Prosto-Kamera-2026-10-11.zip` zawiera jeden plik `lab-camera-compact.yml`. Instalacja do `.github/workflows` na main po poprawce HD/4K. Przebieg: Nagraj próbę lub Wybierz film → oznacz pierwszą klatkę zdarzenia początkowego → oznacz pierwszą klatkę zdarzenia końcowego → wynik. Film z kamery przechodzi identyczny parser i dekoder jak import z galerii.

Nagrywanie używa systemowego mechanizmu HTML Media Capture (`accept="video/*"`, `capture="environment"`) po dotknięciu przycisku. Ustawienia i UI kamery wybiera system. Atrybut capture jest wskazówką dla przeglądarki, nie gwarancją konkretnej kamery czy FPS; na komputerze lub w nieobsługującej go przeglądarce może pojawić się zwykły wybór pliku. Nie dodajemy strumienia MediaRecorder ani nie deklarujemy 120/240 FPS przez Safari. Anulowanie wyboru zachowuje bieżący ekran. Gotowy plik wraca do analizy po zatwierdzeniu przez użytkownika.

Jedna aktywna instrukcja i jeden przycisk oznaczenia. Nie można oznaczyć końca przed początkiem ani oznaczyć nieodczytanej klatki. Po prawidłowych dwóch oznaczeniach wynik jest pokazywany automatycznie, a edytor zostaje schowany. Popraw oznaczenia otwiera edytor. Jedno potwierdzenie obejmuje oryginalne tempo filmu i poprawne wykonanie protokołu; pod nim przycisk Zapisz wynik. Zapis nadal przechodzi walidację wyników, a błąd zachowuje ten sam ID do ponowienia i umożliwia pobranie kopii. Po zapisie dekoder jest zatrzymywany, a przyciski edycji blokowane. Zakres z klatek pozostaje widoczny; wzór, ograniczenia, notatka i eksport pojedynczej próby są w Szczegółach pomiaru.

Weryfikacja lokalna: 45 testów modułu, kontrola typów runtime i formatowania. Testy UI używają mockowanego dekodera i uproszczonego dialogu, nie potwierdzają otwierania systemowej kamery na fizycznym iPhonie. Próba renderowania w przeglądarce lokalnej była niedostępna (brak Chromium i bibliotek WebKit). Pełną kontrolę projektu wykonuje instalator przez verify:release. Po wgraniu wymagany odbiór na iPhonie: Nagraj próbę, powrót po nagraniu, anulowanie, pomiar klatek, zapis i następna próba.

Automatyczna detekcja wybicia i lądowania nie jest częścią tej paczki. Proponowany kolejny etap: algorytm proponuje klatki zdarzeń i użytkownik może je zatwierdzić lub poprawić. Dopiero wyniki walidacji własnego rozwiązania względem ręcznego oznaczenia nagrań o wysokim FPS i docelowo platformy sił mogą uzasadnić tryb całkowicie automatyczny. Wyniki innych aplikacji nie stanowią walidacji BallWise.

Źródła: W3C HTML Media Capture — https://www.w3.org/TR/html-media-capture/ ; Balsalobre-Fernández i Varela-Olalla, Sensors 2024 — https://pmc.ncbi.nlm.nih.gov/articles/PMC11679296/ . Automatyczny pomiar jest technicznie możliwy; w tym badaniu aplikacji My Jump Lab wykorzystano Apple Vision i obraz kamery przy 60 Hz, a średnia różnica w nieważonym CMJ wyniosła około +2 cm względem platformy sił. Tych parametrów nie przenosimy na BallWise.
