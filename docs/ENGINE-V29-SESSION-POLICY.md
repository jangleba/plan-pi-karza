# BallWise v2.9 — engine fixes and session policy

## Zakres i wdrożenie

Zmiany przygotowano na bazie main 54afdb75385622b3573207c43ae49261a4dc1d3b, po PR #162. Pierwszy commit naprawia integralność danych i rekomendacje; drugi porządkuje nazewnictwo oraz sesje. Publikacja i wdrożenie aplikacji pozostają odrębnymi operacjami.

Wersja generatora rośnie do ballwise-v2.9. Zapisane plany v2.8 można odczytać, natomiast nierozpoczęte stare jednostki wymagają aktualizacji przez podgląd. Rozpoczęte/ukończone wykonanie zachowuje swój zapis. Nowe angielskie nazwy nie są powodem do przepisywania historycznych ćwiczeń ani ich wyników.

## Naprawy silnika

- Podgląd nie powstaje podczas ładowania/awarii danych siłowni ani przy oczekujących lub konfliktowych zapisach. Zmiana kolejki synchronizacji od razu unieważnia podgląd.
- Aktywacja sprawdza aktualność danych przed odczytem serwera i po nim. Zmiana rekordu treningu, właściciela albo stanu synchronizacji unieważnia poprzedni podgląd.
- Odrzucone propozycje klubowe są pomijane przed wyborem następnej. Nie blokują późniejszej propozycji siłowej ani innego zdarzenia klubowego.
- Powrót po deloadzie sprawdza obecną listę obciążeń. Jeśli wcześniejsze 80 kg nie jest dostępne, aplikacja kieruje do doboru obciążenia zamiast proponować niedostępną wartość.
- Aktualizacja po MAS czeka na potwierdzone zapisy i unieważnia obliczenie, jeśli w trakcie zmieniły się dane siłowni, plan, check-in albo modyfikacje. Ekran Plan opisuje niezaktualizowane biegi i powód oczekiwania.
- Porównanie modelu IQ toleruje wyłącznie śladowe zaokrąglenia liczb w JSON. Geometria i animacje w części binarnej nadal muszą być identyczne.

## Nazwy sesji i ćwiczeń

Nazwy sesji i ćwiczeń w nowym generatorze są angielskie. Instrukcje, uzasadnienie i komunikaty użytkowe pozostają polskie.

Lista planu, ekran wykonania i ponowna hydratacja szczegółów zachowują to samo nazewnictwo. Reguły prezentacji starszych tytułów nie zamieniają już „Acceleration Development”, „Strength Deload” ani „Aerobic Intervals” w polskie etykiety o innym znaczeniu. Historia zapisów i identyfikatory ćwiczeń nie są przepisywane; istniejące ćwiczenia z dawką silnika korzystają z angielskiej nazwy przy wyświetlaniu.

| Praca zapisana przez silnik            | Nazwa                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Przyspieszenie od startu               | Acceleration Development                                                          |
| Nabieg i lotny odcinek                 | Flying Sprint Development                                                         |
| Bieg po łuku                           | Curved Sprinting                                                                  |
| Hamowanie; ponowne ruszenie, jeśli występuje w zadaniu | Deceleration Development / Deceleration & Reacceleration |
| Znany wcześniej kierunek zwrotu        | Planned Change of Direction                                                       |
| Kierunek wybierany po sygnale partnera | Reactive Agility                                                                  |
| Siła według przygotowania i dawki      | Strength Foundations / Strength Development / Maximal Strength                    |
| Zapisany kontrast lub klastry          | Strength–Power Contrast / Cluster Strength                                        |
| Mniejsza dawka lub powrót              | Strength Deload / Strength Reintroduction                                         |
| Spokojny bieg lub konkretne interwały  | Easy Aerobic Run / Aerobic Intervals / Tempo Intervals / High-Intensity Intervals |
| Przygotowanie przed meczem             | Pre-Match Activation                                                              |
| Lekka technika indywidualna            | Individual Ball Skills                                                            |

## Dowody a decyzje produktu

Haugen i wsp. (2019) łączą literaturę badawczą z praktyką trenerów sprintu. Rozdzielają akcelerację, pracę lotną i wytrzymałość sprinterską, zalecając odpoczynek pozwalający utrzymać jakość. Podają m.in. przykład około 2 minut po 20 m oraz około 4 minut przy 20 m nabiegu i 10 m lotnym odcinku. W BallWise przyjęto 150 s po 20 m i 240 s w dwóch wariantach lotnych, z możliwością wydłużenia odpoczynku. To ustawienia startowe produktu, nie indywidualnie zmierzony czas odnowy. Wąski teren i stały nabieg nie potwierdzają osiągnięcia Vmax, dlatego nazwa opisuje ćwiczenie lotne. Nie przeniesiono objętości elitarnych sprinterów 100 m na młodych piłkarzy.

Materiały ALTIS wspierają przygotowanie dopasowane do tematu dnia: osobno akceleracja i szybki bieg w pozycji wyprostowanej. Nie dowodzą, że dokładnie trzy wybrane drille po 12 s są optymalnym protokołem. Te czasy, rotacja i limit 240 m pozostają jawnymi regułami aplikacji. Wall drills są dostępną opcją nauki pozycji, a nie koniecznym lub samodzielnie skutecznym treningiem szybkości.

Badania interwencyjne sprintu z oporem odnoszą się do konkretnych grup, sprzętu i prowadzenia. Podtrzymano istniejące warunki dostępu do sań i metod zaawansowanych; nie dodano automatycznego przeliczania oporu z koloru gumy ani kopiowania procentów masy ciała na wszystkich użytkowników. Stanowisko NSCA dla młodzieży jest podstawą ostrożnego traktowania przygotowania i progresji, bez utożsamiania wieku z opanowaniem techniki.

## Trening techniczny: wykonany etap i dalsze prace

Zachowano stałe dwa zadania bazowe, a jeden dopuszczony dodatek rotuje w kolejnych tygodniach. Pozwala to dotrzeć z planu do bramek i kontroli kierunkowej z istniejącymi schematami kolorów. Zadania są dobierane z uwzględnieniem pozycji, piłki, ściany i miejsca. Młodszy lub początkujący użytkownik otrzymuje mniejsze okno pracy; deload zmniejsza liczbę serii.

Rotacja nie jest dowodem postępu. Timer nie potwierdza celności ani umiejętności taktycznych. Mocne prowadzenie, slalom na czas, strzały i dalekie podania nie są wciskane w lekką sesję uzupełniającą. Pełne jednostki techniczne z takimi zadaniami oraz automatyczna progresja oparta na wiarygodnie zapisanych wynikach wymagają kolejnego, osobnego etapu. Funkcja partnerów nie jest częścią tej zmiany.

Przegląd Bergmann i wsp. (2021) pomaga odróżniać powtarzanie techniki od reprezentatywnego podejmowania decyzji. Wskazówki FIFA akcentują orientację ciała i skan przed kontaktem. Sygnał na telefonie w treningu solo jest ćwiczeniem orientacji, nie pełnym odwzorowaniem przeciwnika. Techne stanowi porównanie produktu: stała baza, stopniowanie trudności i krótkie moduły; nie jest źródłem dowodu naukowego.

## Źródła sprawdzone podczas prac

1. Haugen, Seiler, Sandbakk, Tønnessen (2019), The Training and Development of Elite Sprint Performance: https://doi.org/10.1186/s40798-019-0221-0
2. Haugen i wsp. (2015), Sprint conditioning of junior soccer players: effects of training intensity and technique supervision: https://pubmed.ncbi.nlm.nih.gov/25798601/
3. Lahti i wsp. (2020), Changes in sprint performance and sagittal plane kinematics after heavy resisted sprint training in professional soccer players: https://pubmed.ncbi.nlm.nih.gov/33362970/
4. Faigenbaum i wsp. (2009), NSCA Youth Resistance Training Position Statement: https://www.nsca.com/globalassets/about/position-statements/position_stand_youth_resistance_training---2009.pdf
5. ALTIS, Streamlining Warm-Ups for Faster Acceleration: https://altis.world/articles/streamlining-warmups-for-faster-acceleration/
6. ALTIS, Resisted Sprint Training — Part II: https://altis.world/articles/resisted-sprint-training-altis-1080-motion-part-ii/
7. World Athletics, The science of sprinting: https://worldathletics.org/competitions/world-athletics-ultimate-championship/2026/news/feature/the-science-of-sprinting
8. Bergmann i wsp. (2021), Perceptual-Motor and Perceptual-Cognitive Skill Acquisition in Soccer: https://doi.org/10.3389/fpsyg.2021.772201
9. FIFA Training Centre, Individual actions: Developing central midfielders: https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/position-specific-training/individual-actions-developing-central-midfielders.php
10. Techne, Training Tips: https://www.technefutbol.com/training-tips

## Weryfikacja końcowa — 2026-11-15

`npm run verify:release` zakończyło się powodzeniem: kontrola lockfile, TypeScript, 307 plików testowych (2566 testów zaliczonych, 1 istniejący pominięty), ESLint bez błędów i ostrzeżeń oraz budowanie wersji produkcyjnej i mobilnej. Testy regresji obejmują nieaktualny podgląd, odrzucone propozycje, dostępność ciężaru po deloadzie, kalibrację MAS, zachowanie rozpoczętych/ukończonych receptur v2.8 oraz rzeczywisty widok angielskich nazw w podglądzie siłowni i hydratacji szczegółów. Kompilacja mobilna nie zastępuje testu na fizycznym iPhonie.

Nie zmieniono zależności ani schematu bazy. Paczka zawiera zmienione pliki i patch; publikacja kodu oraz wdrożenie nie zostały wykonane.
