# BallWise · pełne jednostki siłowni 16+

Ta zmiana dotyczy generatora siłowni, biblioteki ćwiczeń i ustawień, z których generator faktycznie korzysta. Silnik ma wersję `ballwise-v2.10`. Domyślny układ to pełne A/B. Specjalistyczne pary mocy są osobnym wyborem, a główne ćwiczenia pozostają stałe przez blok.

## Naprawione przyczyny

- Szablony par mocy trafiały automatycznie do niemal każdego zaawansowanego, także przy celu wydolnościowym. Teraz wymagają celu mocy oraz świadomego wyboru układu.
- Siłownia A zmieniała główne ćwiczenie co tydzień. Zmiana szablonu następuje teraz po rekomendacji zmiany bodźca, a nie z samego numeru tygodnia.
- Trap bar i nordiki wymagały jawnego wskazania sprzętu, którego nie można było wskazać na ekranie. Ustawienia sprzętu obejmują teraz te stanowiska, a ich zapis przechodzi przez normalizację, trwały zapis i ponowne odczytanie profilu.
- Po niewielkim przekroczeniu czasu silnik od razu obcinał większość dodatków do jednej serii. Najpierw usuwa teraz opcjonalną pracę uzupełniającą, zachowując główne serie i przerwy.
- Początkujący mógł dostawać A/B dzień po dniu, bo obie jednostki nie miały flagi ciężkich nóg. Reguła odstępu obejmuje teraz również te pełne jednostki i granicę tygodni.
- Generator nowych planów przyjmuje zawodników od 16 lat. Historia pozostaje zachowana.
- Przygotowawcze utrzymanie M13 było umieszczane przed częścią główną przez generator, a następnie odrzucane przez walidator. Oba miejsca korzystają teraz z tego samego, ograniczonego protokołu. Dowolnej długiej izometrii nadal nie można przenieść na początek.

## Struktura pełnego A/B

Przykład dla przygotowanego zawodnika; dawkę modyfikują cel, kalendarz, wykonanie, check-in i dostępny czas. To reguły początkowe produktu, nie jeden naukowo optymalny protokół dla wszystkich.

| Część                  | A                                                    | B                                                                                          |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Przygotowanie          | Mobilność i serie wprowadzające                      | Mobilność i serie wprowadzające                                                            |
| Moc                    | CMJ albo kwalifikujący się wybrany wariant           | Skok w dal / boczny albo wybrany wariant                                                   |
| Główna siła            | Back squat lub właściwy zamiennik; zwykle 3 serie    | Trap-bar deadlift, klasyczny deadlift lub wybrany RDL; zwykle 3 serie                      |
| Uzupełnienie nóg       | RDL/wyprost biodra oraz Nordic/uginanie kolana       | Bułgar lub wejście na skrzynię; przygotowany zaawansowany zwykle 3 serie po 5 na stronę    |
| Góra ciała             | Wyciskanie i przyciąganie                            | OHP i przyciąganie, zwykle w kierunku pionowym                                             |
| Tułów i przywodziciele | Pallof / wybrany wariant oraz przywodziciele         | Plank boczny / wybrany wariant oraz przywodziciele                                         |
| Łydka                  | Proste kolano: dynamicznie lub izometrycznie         | Zgięte kolano: płaszczkowaty                                                               |
| Opcje                  | Klastry, kontrast albo odpowiedni protokół izometrii | Rzut piłką, przyjęcie obciążenia, krótka praca dynamiczna tyłu uda — gdy warunki pozwalają |

W sprawdzonym wariancie zaawansowanego z celem siły, sztangą, hantlami, maszyną i strefą skoków: **A 65 min / 9 ćwiczeń roboczych; B 64 min / 9 ćwiczeń roboczych**. Czasy obejmują zapisane przerwy, zmianę stanowisk oraz przygotowanie. Wskazanie trap bara/Nordiców zmienia dobór według sprzętu; nie udajemy, że te stanowiska są dostępne w każdej siłowni. Krótki limit, okres utrzymania i deload nadal mogą dać celowo mniejszą jednostkę.

## Dostępne warianty

| Zadanie              | Przykłady dostępne w wyborze i generatorze                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Przysiad             | Back squat, front squat, tempo 3–1–X, box squat, dead-stop pin squat                                                                  |
| Wyprost biodra       | Trap bar, martwy klasyczny, RDL ze sztangą/hantlami, kickstand RDL, RDL jednonóż                                                      |
| Jedna noga           | Obciążony bułgar, wejście na skrzynię z hantlami, wykrok w tył                                                                        |
| Zgięcie kolana       | Nordic wspomagany, ekscentryczny i pełny; maszyna, ślizgi                                                                             |
| Moc nóg              | CMJ, CMJ z asystą/oporem gum, skok w dal, skok boczny, pogo, depth jump, drop jump                                                    |
| Rzuty i góra         | Rzut sprzed klatki, rzut rotacyjny, slam, wyciskanie sztangi/hantli, OHP, podciąganie, wiosłowanie, szybkie przyciąganie lekkiej gumy |
| Tułów                | Pallof press, plank, side plank, cable chop w półklęku, suitcase carry                                                                |
| Przyjęcie obciążenia | Lądowanie obunóż z podestu, dla zakwalifikowanych lądowanie jednonóż, krok z zatrzymaniem, krok z ciągnięciem gumy na pasie           |
| Pochodne ciężarowe   | Jump shrug i hang power snatch po nauce, przy zadeklarowanej obecności trenera i odpowiednim stanowisku                               |
| Krótkie dodatki      | Szybkie uginanie z gumą i pulsacje mostu, izometria łydki, płaszczkowatego, przodu i tyłu uda                                         |

Trzynaście nowych tożsamości ćwiczeń ma szczegółowe polskie instrukcje, metadane funkcji i sprzętu oraz kontrolowany dobór. Nie podstawiamy im animacji innego ćwiczenia. **Własne, sprawdzone animacje tych trzynastu wariantów pozostają do opracowania**; w tej zmianie działają instrukcje krok po kroku. Istniejące animacje pozostają przy swoich tożsamościach.

OHP jest wyciskaniem nad głowę. Pallof jest antyrotacją; chop/rzut rotacyjny to inne zadania. RDL nie zastępuje Nordica, a krótka oscylacja nie zastępuje całego bloku siły. Tempo przysiadu jest kontrolą faz ruchu. Dead-stop pin squat ma również kontrolowany powrót na piny — nie nazywamy go czystą koncentryką.

## Dobór, progresja i limity

- Wiek 16+ jest progiem produktu. Ciężar, trudność i metoda zależą również od rzeczywistego stażu i techniki. Początkujący dorosły nadal potrzebuje właściwego wariantu wprowadzającego.
- Doświadczony dorosły z co najmniej rokiem zadeklarowanego stażu i wysoką kontrolą ruchu może wykonywać zwykłe ćwiczenia siłowe samodzielnie. To nie znosi wymagań nadzoru dla pochodnych ciężarowych i wariantów specjalistycznych.
- Nowe najbardziej wymagające warianty mają konserwatywne progi produktu: dorosły, przygotowanie zaawansowane, co najmniej 24 miesiące stażu, wysoka kompetencja i pełny nadzór. Nie są to biologiczne granice wykazane przez badania.
- Skoki są na początku pracy jakościowej; podstawy siły pozostają seriami zwykłymi. Superserie dodatków, klastry i kontrast zachowują własne przerwy. Sam fakt połączenia siły i rzutu nie jest gwarancją PAPE.
- Różne instrukcje odróżniają drop landing, depth jump i drop jump. Depth/drop jump liczą również końcowe lądowanie po odbiciu. Wysokość skrzyni nie rośnie automatycznie.
- Tempo ma zapis liczbowy i wpływa na obliczenie czasu. Stoper nie potwierdza techniki ani prędkości sztangi.
- Propozycje kilogramów nadal opierają się na zgodnych rzeczywistych seriach, powtórzeniach, zapasie i sprzęcie. Zmiana ćwiczenia nie przenosi kilogramów z innego wariantu. Zawodnik zachowuje możliwość przyjęcia, utrzymania lub zmniejszenia proponowanego obciążenia.
- Sesje rozpoczęte i ukończone są chronione. Nowa wersja prowadzi do podglądu nowego planu; nie przepisuje po cichu historii.

## Badania i porównanie produktu

1. [NSCA 2009: Youth Resistance Training](https://www.nsca.com/globalassets/about/position-statements/position_stand_youth_resistance_training---2009.pdf) — kompetencja, stopniowanie pracy, zróżnicowane wzorce i niekolejne dni treningu. Nie uzasadnia automatycznego przypisania ciężkiej wersji wszystkim szesnastolatkom.
2. [Kassiano i in. 2022](https://pubmed.ncbi.nlm.nih.gov/35438660/) — przegląd systematyczny o celowej zmienności doboru ćwiczeń; nadmierna przypadkowa rotacja może przeszkadzać adaptacji. Badania dotyczyły młodych mężczyzn, a nie walidacji tego silnika dla każdego wieku.
3. [NSCA 2023: Weightlifting for Sports Performance](https://www.nsca.com/globalassets/about/position-statements/weighlifting-for-sports-performance.pdf) — rola pochodnych ciężarowych, nauka techniki i dobór ćwiczenia/obciążenia do zamierzonej adaptacji.
4. [Suchomel i in. 2015](https://pubmed.ncbi.nlm.nih.gov/25689955/) — pochodne bez chwytu mogą upraszczać naukę i dostarczać bodźca siła–moc. To nie czyni power snatch obowiązkowym elementem planu.
5. [Review 2023: Drop Jump Training](https://pubmed.ncbi.nlm.nih.gov/37153219/) — dawka i intensywność zależą od wykonania i warunków; sama nazwa lub wysokość skrzyni nie określa indywidualnego obciążenia.
6. [Harper i in. 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9474351/) — hamowanie obejmuje wymagania ekscentryczne, koncentryczne, izometryczne, reaktywne i techniczne. Sama koncentryka lub wolny przysiad nie zastępują umiejętności hamowania.
7. [van Dyk i in. 2019](https://pubmed.ncbi.nlm.nih.gov/30808663/) oraz [reanaliza Impellizzeri i in. 2021](https://pubmed.ncbi.nlm.nih.gov/34520846/) — Nordic ma istotną bazę badań, z ograniczeniami interpretacji efektu profilaktycznego. Nie obiecujemy prewencji urazu konkretnemu użytkownikowi ani nie wymuszamy dużej objętości na starcie.
8. [Volt — oficjalna filozofia programowania](https://voltathletics.com/training-programs) — przykład konkurencji stosującej powtarzanie głównych ruchów i programowanie wzorców. Jest porównaniem produktu, nie dowodem naukowym skuteczności BallWise.

Nie znaleziono podstaw do traktowania dowolnej szybkiej oscylacji jako lepszej od zwykłej pracy siłowej. Krótkie warianty są dodatkami z ograniczoną dawką. Wybrane wartości startowe w kodzie nie stanowią obietnicy optymalnego protokołu neurologicznego.

## Sprawdzenie i użycie

Testy obejmują rzeczywiste przepisywanie każdego dostępnego wariantu, pełne tygodnie 16/17/27 lat, brak sprzętu i kwalifikacji, zapis/ponowny odczyt ustawień, ekran wyboru sprzętu, liczenie lądowań, tempo, stabilność głównych ćwiczeń, krótszy limit oraz końcową walidację M08/M09/M13/M14. Macierz planów obejmuje 216 kombinacji celu, wieku 16+, poziomu, kalendarza i dostępu.

Po włączeniu zmiany: **siłownia → Doświadczenie siłowe → Sprzęt i warianty siłowni → Zapisz odpowiedzi → podgląd i przyjęcie aktualnego planu**. Wybrany sprzęt i ćwiczenia dotyczą nowych propozycji; historia wykonanych sesji pozostaje zachowana.

Weryfikacja techniczna: `npm run check:lockfiles`, `npm run typecheck`, `npm test -- --testTimeout=30000`, `npm run lint`, `npm run build`, `npm run build:mobile`.

Wynik lokalnej weryfikacji tej zmiany: **2727 testów zaliczonych, 1 pominięty**, kontrola typów, lint, zgodność lockfile oraz oba buildy zakończone powodzeniem. Build mobilny nie stanowi testu na fizycznym iPhonie.
