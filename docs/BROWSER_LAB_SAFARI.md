# BallWise Lab w Safari — wersja do testów

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
2. Aparat: najlepiej HD 60 FPS i 5–10 s. Przyjmujemy HD i 4K oraz 30, 60, 120 i 240 FPS. Jedna próba, klip do 20 s i 128 MiB. Safari służy do importu i pomiaru; moduł nie nagrywa w nim 240 FPS.
3. W aktualnych Zdjęciach iOS: wybierz film → Udostępnij → **Eksportuj niezmodyfikowane oryginały / Export Unmodified Originals** → wybierz folder w Plikach → Zapisz. Przy iCloud może być potrzebne pobranie oryginału. Apple opisuje tę ścieżkę: https://support.apple.com/en-us/111762.
4. Alternatywnie w iCloud.com/photos użyj dodatkowych opcji pobierania i wybierz **Unmodified Originals**, a następnie rozpakuj pobrany ZIP w Plikach. Nie konwertuj klipu na inny kodek ani tempo po nagraniu.
5. W Labie wybierz film. Odczytane FPS muszą odpowiadać nagraniu. Film 30/60 FPS jest przyjmowany jako wynik orientacyjny. Samo FPS nie rozstrzyga, czy plik był wcześniej spowalniany. Użytkownik musi potwierdzić oryginalność; aplikacja nie zgaduje FPS nagrania ani nie tworzy dodatkowych klatek.
6. Oznacz dwa zdarzenia zgodnie z instrukcją. Obejrzyj klatkę poprzednią. Potwierdź oryginalność i protokół, zapisz próbę.

H.264 oraz HEVC w zwykłym, niefragmentowanym MP4/MOV. Jeden tor wideo, maksymalnie 4K (4096 px na dłuższej krawędzi i 4096 × 2160 pikseli), do 6500 próbek. Podgląd ma maksymalnie 1280 px na dłuższej krawędzi; czasy pochodzą z oryginalnych próbek. Dekodowanie 4K nadal wymaga obsługi przez konkretny telefon i kodek. Odrzucane są niespójne PTS, nieobsługiwany kodek, brak pełnych próbek i edycje zmieniające tempo. Oryginalność materiału pozostaje także potwierdzeniem użytkownika: parser nie wykryje każdej możliwej wcześniejszej konwersji.

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

## Instalacja bez Xcode

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
