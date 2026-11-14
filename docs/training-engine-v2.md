# BallWise — silnik treningowy V2.4

Kod do zastosowania i integracji, bez ponownego projektowania przez Claude. Nowy generator nie przywraca usuniętego silnika. Dla zawodników od 13 lat tworzy podgląd 1–4 tygodni, zapisuje go dopiero po świadomej akcji zawodnika i odtwarza zatwierdzony zapis. Nie generuje ani nie zapisuje planu przy każdym wejściu do aplikacji.

## Odpowiedzialność modułów

- `model.ts`: poziom przygotowania, funkcje ćwiczeń, liczbowa dawka, rola sesji, diagnostyka i wersja planu.
- `preparation.ts`: rozdziela wstępną kategorię programowania z istniejącego onboardingu od szczegółowo zadeklarowanego przygotowania siłowego.
- `goalPolicy.ts`: zachowuje cel główny, dodatkowe ograniczenie i kolejność odpowiedzi o odczuciach; kieruje akcentem oraz wariantem lżejszym.
- `taxonomy.ts` i `exercises.ts`: dobór wariantu z katalogu, stałe sesje A/B i konkretna dawka. Katalog obejmuje 205 kart, z czego 104 karty siły, mocy, plyometrii, izometrii i tułowia mają dodatkową klasyfikację funkcjonalną. Dwie nowe karty to utrzymanie przysiadu wykrocznego oraz osobny nadzorowany primer izometryczny.
- `scheduling.ts`: pełne przeszukanie możliwych miejsc dla maksymalnie czterech głównych zadań w jednym siedmiodniowym oknie. Najpierw liczba pokrytych celów, potem ich priorytet i koszt położenia. To nie jest optymalizacja wszystkich kombinacji całego sezonu.
- `planner.ts`: spina kalendarz, główne zadania, bloki wspierające i strukturę wykonywanej sesji. Kolejny moduł nie nadpisuje wybranej metody.
- `strengthProtocols.ts`: jawne recepty siłowe i izometryczne z warunkami użycia oraz źródłem.
- `endurance.ts` i `running.ts`: liczbowa receptura biegu dla istniejącego licznika, bez odgadywania pomiarów z tekstu.
- `support.ts`: aktywacja przed meczem, mobilność z wybranym obszarem, spokojny ruch/oddech i indywidualna technika z piłką.
- `validation.ts`: niezależnie przelicza dawki, czas, metry i obciążenie; sprawdza funkcję ćwiczenia, reprezentację wykonania i limity. Jest walidatorem, a nie drugim generatorem naprawiającym wynik po cichu.
- `progression.ts`: propozycja ciężaru na podstawie potwierdzonej historii. `activation.ts`, `persistence.ts` i `locks.ts`: zapis, kontrola wersji oraz zachowanie wykonania.
- `planStatus.ts`: stan pustego, aktualnego, zakończonego lub wymagającego aktualizacji planu oraz warunki nowego rozpoczęcia sesji.

## Zawodnik i tydzień

Silnik korzysta z istniejących odpowiedzi onboardingu, bez dodawania pytań. Pole „Doświadczenie treningowe” obejmuje podstawy/regularność/trening siły i szybkości; liga pozostaje osobną informacją. Przy braku szczegółowych danych siłowych kategoria programowania jest wstępna: podstawy → foundation, regularnie → development, zaawansowany/wysoki → performance. To wybór objętości, a nie potwierdzenie techniki, stażu ze sztangą lub nadzoru. Brakujące miesiące, kompetencja i nadzór nie są dopisywane do profilu.

Jeśli istnieje choć jedna szczegółowa deklaracja przygotowania siłowego, pierwszeństwo ma ten zestaw danych. Performance wymaga jawnego poziomu advanced, co najmniej 24 miesięcy i wysokiej kompetencji; development — poziomu intermediate/advanced, co najmniej 6 miesięcy i kompetencji medium/high. Niepełny lub niespełniający warunków zestaw daje foundation. Każdy wariant dodatkowo przechodzi kanoniczne bramki wieku, sprzętu, nadzoru i umiejętności. Sama wstępna kategoria performance nie odblokowuje ciężkiej sztangi, obciążanych skoków, M09 ani M14.

Główny przysiad lub wyprost biodra bez obciążenia zewnętrznego otrzymuje kontrolowane powtórzenia z zapasem, zamiast recepty ciężkiego boju. Podstawowa moc może korzystać z dozwolonego skoku z masą ciała, a brak takiego wariantu prowadzi do kontroli lądowania lub jawnego braku bodźca.

Każde siedmiodniowe okno dąży do dwóch własnych sesji siłowych, jednego sprintu i jednej wydolności. Klub obciąża kalendarz, lecz nie zalicza automatycznie własnej siłowni. Daty meczów pochodzą z deklaracji, a tygodniowe powtórzenie wymaga jawnie wskazanego stałego dnia. Nieznanych minut gry i obciążenia klubu nie wymyślamy.

Cel główny ustala priorytety czterech bazowych zadań. Dodatkowe wskazanie strength, speed/cod lub endurance zwiększa priorytet właściwej domeny o 4; gdy nie ma takiego wskazania dla tej domeny, pierwszy akcent daje +2. Dodatkowe ograniczenie i pierwszy akcent kierują też treścią oraz wsparciem: power może wybrać akcent mocy, cod — kontrolowane hamowanie, speed — wariant szybkości, endurance — drogę wydolnościową, ball — technikę. Pierwsza pożądana odpowiedź ma pierwszeństwo; jeśli nie wskazuje konkretnej cechy, używa się pierwszej obecnej. Druga odpowiedź nie nadpisuje pierwszej. Wskazanie siły wzmacnia priorytet obu bazowych siłowni, bez dokładania trzeciej. Odczucie pewności kieruje ku pracy z piłką, bez obietnicy rozwiązania trudności psychologicznych.

Cel wydolności, dodatkowe ograniczenie endurance lub pierwszy akcent wydolnościowy uruchamiają próbę drugiego spokojnego biegu, z wyjątkiem celu głównego powrotu. Jest dodawany dopiero do wybranego układu bazowego i przechodzi te same bramki kalendarza, obciążenia, czasu oraz liczby sesji. Nie wypiera wcześniej ułożonych celów. Brak terminu daje `UNMET_GOAL_TARGET`. To kolejny etap doboru, a nie wspólna optymalizacja pięciu zadań ani całego sezonu.

Jawny powrót po przerwie, ograniczenie zmęczeniem lub pierwszy obecny wybór „wracam po przerwie” kierują siłę i sprint na mniejszą objętość, wydolność na spokojny wariant z maksymalnie 15 minutami części głównej, a wsparcie na mobilność. „Słabnę pod koniec meczu” oznacza akcent wydolnościowy; nie jest automatycznie rozpoznawane jako dzisiejsze zmęczenie. Wskazany uraz/ból lub faza return_injury wstrzymuje treningi własne zamiast zamieniać ten tryb w rehabilitację.

Główne jednostki respektują dostępne dni, czas, bufor meczu, potwierdzony check-in oraz poprzedni i następny ciężki dzień nóg, także na granicy okna. Zadeklarowane siłowe dni klubu również się liczą. MD-3 sam nie obniża dawki. Na dzień przypadają maksymalnie dwa rzeczywiste sloty, również przy klubie. Dwa ciężkie bodźce lub połączony sprint + siła wymagają wieku 17+, pełnego zestawu danych przygotowania siłowego, poziomu co najmniej intermediate, minimum 6 miesięcy, wysokiej kompetencji i preferencji yes_if_safe. Połączona jednostka ma zsumowany czas, kolejność i metry; nie jest ukrytym trzecim treningiem.

Niepokryte cele i przyczyny odrzucenia terminów pozostają widoczne także po zapisie. Nie są zaliczane jako wykonany bodziec. Bloki wspierające dodaje się po głównych zadaniach; nie wypierają siłowni, sprintu ani wydolności. Aktywacja MD-1 nie liczy się jako siłownia/sprint. Domyślne miejsce wynika z deklarowanego dostępu do boiska/terenu lub siłowni; jeśli istnieje zapisana preferencja miejsca, silnik ją respektuje. Mobilność jest domyślnie ogólna; istniejąca preferencja może wskazać biodro, kostkę lub odcinek piersiowy. Nie wymaga to nowych pytań onboardingu. Technika wymaga zadeklarowanej piłki; dostęp do boiska nie dowodzi jej posiadania, a ćwiczenia bramkarskie nie trafiają do zawodnika z pola.

„Piłka nożna” jest opcją istniejącej listy własnego sprzętu, bez nowego pytania ani kroku onboardingu. Piłka lekarska nie spełnia tego warunku. Istniejące wskazanie ściany/odbojnika jest zapisywane jako rebounder i wybiera podania o ścianę oraz przyjęcie zamiast samodzielnego przetoczenia; bez niego pozostają ćwiczenia bez ściany. Zablokowany sprzęt jest respektowany. Zwykła piłka nadal jest konieczna, a zadania pozostają jednoosobowe.

Krótkie 2 × 2 kontrolowane wybicia w aktywacji podlegają kwalifikacji wieku i przygotowania do ruchu z masą ciała; historia treningu ze sztangą nie jest dodatkowym warunkiem. W wariancie zmniejszonego obciążenia lub przy overall ≤4 skoki są usuwane wraz z ich czasem. Zgłoszony w check-inie ból stawów blokuje także wsparcie.

## Dobór i progresja

Główne warianty A/B pozostają stabilne w bloku. Oddzielne funkcje to dynamiczne zgięcie kolana, wyprost biodra, izometria tyłu/przodu uda, siła jednonóż i przywodzenie biodra. RDL nie zalicza Nordica, a Pallof nie zastępuje przywodzicieli. Moc ma krótkie próby i odpoczynek; ruchy balistyczne ze sprzętem wymagają jego jawnej deklaracji. Czwarty tydzień obniża rzeczywiste dawki. Dane o kącie, czasie, stronie i pomocy są częścią dawki, a nie tylko nazwy ćwiczenia.

W zdrowej standardowej ścieżce przez pierwsze trzy tygodnie główny bój zachowuje porównywalną receptę: foundation 2 × 6/RIR 4/120 s, jawne development 3 × 6/RIR 2/120 s, jawne performance 3 × 4/RIR 2/180 s. Dopuszczony podstawowy wariant obciążany przy kategorii wstępnej ma 3 × 6/RIR 3/120 s; wariant bez obciążenia w development/performance — 3 × 8/RIR 3/90 s. Deload i wariant zmniejszonego obciążenia stosują 2 serie i większy zapas, z osobnym obniżeniem części akcesoriów. Sama etykieta fazy peak nie zmienia co tydzień głównej recepty i nie uniemożliwia porównania wykonania.

Propozycja zmiany ciężaru wymaga dwóch kolejnych, ukończonych, zweryfikowanych i porównywalnych ekspozycji oraz kompletu serii. Zakres powtórzeń, ciężar i RIR są sprawdzane; dla zwiększenia trzeba osiągnąć górę zakresu z zapasem. Zmieniona dawka, nieukończona sesja, izometria i moc nie uprawniają do automatycznego zwiększania kilogramów. Propozycja nie zmienia zapisu ani ciężaru bez decyzji zawodnika. RFD nie jest wyliczane ze stopera.

Cykl jest ciągły, a nie stałym presetem faz. Zapisany początek cyklu (`engineV2.cycle.anchorDate`) przechodzi do kolejnych podglądów i przeliczeń; numer tygodnia w cyklu wynika z odległości od tego początku. Czwarty tydzień jest tygodniem przeglądu obciążenia, nie obowiązkowym deloadem. Lżejszy wariant (deload) wynika z warunków: zadeklarowane zmęczenie, okres przejściowy lub powrót, dwa ostatnie ukończone treningi siłowe z RPE 9–10 w ciągu 7 dni albo przerwa co najmniej 14 dni od ostatniej potwierdzonej siłowni. To ostrożne progi produktu, nie diagnoza. Silnik nie uczy się indywidualnej odpowiedzi na trening ani nie wyznacza momentu szczytu formy. Check-in jest wejściem do ponownego planowania i walidacji, a propozycja ciężaru korzysta z konkretnej historii wykonania; nie oznacza to samoczynnego przepisywania zatwierdzonych czterech tygodni.

Sprint dobiera objętość z wieku, przygotowania sportowego i miejsca, a nie ze stażu na siłowni. Odcinek 20 m wymaga wieku co najmniej 16 lat i doświadczenia co najmniej intermediate. Bez liczbowej długości używa istniejącej deklaracji „miejsce na sprint — 30 m z miejscem na hamowanie”; instrukcja dawki wymaga dodatkowo co najmniej 20 m stopniowego wyhamowania. Gdy podano długość liczbowo, jest to cała wolna przestrzeń: 20 m przyspieszenia wymaga co najmniej 40 m, a 10 m — co najmniej 20 m. Nieprawidłowa lub krótsza niż 20 m wartość blokuje sprint. Silnik nie udaje pomiaru terenu. Odcinki lotne są opcją dorosłego, zaawansowanego sportowo zawodnika z wysoką kompetencją, nadzorem i co najmniej 50 m wolnej przestrzeni: 20 m nabiegu, 10 m lotne oraz co najmniej 20 m stopniowego wyhamowania. Wariant lekki, powrót po przerwie, roztrenowanie i deload wyłączają odcinki lotne i obniżają objętość przyspieszeń. Kontrolowane hamowanie przy celu zwinności nie jest pomiarem reakcyjnej zwinności.

Wydolność korzysta z aktualnego MAS tylko przy liczbowej wartości w dopuszczalnym zakresie, dacie testu młodszej niż 28 dni i identyfikatorze sesji źródłowej. Przygotowanie biegowe wynika z danych sportowych, nie z poziomu siłowni. Bez aktualnego źródła pozostaje odczucie wysiłku i spokojny bieg; silnik nie dopisuje obowiązkowego testu. Mocniejsze interwały są wariantem celu wydolnościowego dla przygotowanej grupy, z osobną ostrożniejszą dawką młodzieżową; w deloadzie, okresie przejściowym i wariancie lekkim pozostaje bieg spokojny. Czas na ekranie oraz kroki licznika powstają z tej samej receptury.

## Obsługiwane metody

- **M09 — kontrast:** jawna preferencja, osoba dorosła z rzeczywiście zadeklarowanym zaawansowanym przygotowaniem siłowym, dopuszczony obciążany główny bój i dopasowany skok; poza adaptacją i deloadem. Wstępny performance z onboardingu nie wystarcza. Para jest zapisana jako jeden blok, zachowuje kolejność, liczbę rund i przerwy. Brak warunków pozostawia osobne serie, bez deklaracji, że kontrast został wykonany.
- **M13 — utrzymanie pozycji:** dodatkowa izometria czworogłowych w sesji A. Odrębna karta `split_squat_iso_hold` i dawka na obie strony, bez zamiany głównego dynamicznego boju. Są to skromne dawki wprowadzające produktu, nie protokół leczenia.
- **M14 — nadzorowany primer:** wymaga jednocześnie wyboru metody i osobnego potwierdzenia `coachedIsometricPrimer`, pełnoletności, poziomu zaawansowanego, minimum 24 miesięcy stażu, wysokiej kompetencji, pełnego nadzoru, siłowni i jawnie dostępnych stałych pinów. Nie jest włączany w deloadzie, roztrenowaniu, powrocie po urazie ani przy wskazanym ograniczeniu zmęczeniem. Nowa karta `overcoming_pin_squat_primer` nie używa sprzecznej instrukcji starego M14.

Primer ma 3 próby po 3 sekundy, 60 sekund między próbami i 300 sekund po bloku przed dalszą pracą; wewnętrzny kąt kolana 90°. Odpoczynku po bloku nie wolno ucinać, aby zmieścić sesję. Źródło: [Fan i wsp., DOI 10.5114/jhk/208832](https://pmc.ncbi.nlm.nih.gov/articles/PMC13551340/). Badano 12 wytrenowanych męskich sprinterów akademickich i następnie skoki. Poprawiły się wybrane parametry prędkości, nie wykazano wzrostu siły szczytowej ani mocy szczytowej. Badanie nie dowodzi poprawy ciężkiego boju; użycie przed nim jest jawną decyzją programowania pod nadzorem. Nie obiecujemy PAPE u każdej osoby.

Pozostałe specjalistyczne identyfikatory metod nie są potajemnie interpretowane jako M09/M13/M14. Brak obsługi lub warunków jest komunikowany.

## Granice dowodów i reguł produktu

Dwa własne treningi siłowe, jeden sprint i jedna wydolność w oknie tygodnia, próg 17 lat dla podwójnego ciężkiego bodźca, limit 240 m i ważność MAS poniżej 28 dni są jawnymi regułami produktu. Nie stanowią uniwersalnych, eksperymentalnie udowodnionych granic fizjologicznych. Podobnie domyślne serie, czasy utrzymań, poziomy przygotowania i krok ciężaru 2,5% nie dowodzą optymalnej dawki dla każdego zawodnika. Testy sprawdzają przestrzeganie tych reguł, a nie indywidualny efekt sportowy.

Uzasadnienie rozdzielania funkcji pochodzi m.in. z [Tillin i Folland, 2014](https://pubmed.ncbi.nlm.nih.gov/24292019/) — odmienna adaptacja siły maksymalnej i szybkiej intencji — oraz [Cormie i wsp., 2010](https://pubmed.ncbi.nlm.nih.gov/20139780/) — swoistość treningu ciężkiej siły i mocy balistycznej. [Bourne i wsp., 2017](https://pubmed.ncbi.nlm.nih.gov/27660368/), ze sprostowaniem, uzasadnia rozróżnienie pracy Nordica i wyprostu biodra. [Harøy i wsp., 2019](https://pubmed.ncbi.nlm.nih.gov/29891614/) badał progresywny program przywodzicieli u męskich drużyn; wynik nie dowodzi identycznego efektu dowolnego utrzymania Copenhagen przez 15 sekund. Żadne z tych badań nie waliduje całego algorytmu BallWise. Opcjonalny M14 ma odrębne źródło, populację, dawkę i ograniczenia opisane wyżej.

## Zapis i granice weryfikacji

Podgląd pamięta identyfikator planu zaobserwowany podczas jego budowania, również gdy poprzedni generator jest ukryty. Odczyt wykonany przed zapisem może odrzucić nieaktualny podgląd, lecz nie może nadać mu świeżej zgody na nadpisanie planu z innego urządzenia. Zapis używa dotychczasowego atomowego RPC z kontrolą właściciela i oczekiwanej wersji. Zmiana użytkownika, profilu, limitu czasu lub chronionej sesji wymaga ponownego sprawdzenia.

Limit czasu sesji jest częścią wyniku i zapisanego planu; po odczycie ekran przywraca zapisany limit. Zatwierdzanie ponownie waliduje go zamiast używać innego domyślnego budżetu. Połączony sprint + siła mieści się w jednym limicie, a dwie osobne sesje mają osobne limity — nie jest to deklaracja łącznego dziennego czasu zawodnika.

Rozpoczęte i ukończone wykonania pozostają zamrożone podczas przebudowy. Nieudany zapis nie staje się sukcesem w UI. Poprzednie zapisy V2.1–V2.3 można odczytać; nowy start własnej sesji ze starszej wersji wymaga aktualnego podglądu i zapisu, a istniejący zapis wykonania pozostaje dostępny. Nieznana nowsza wersja i uszkodzona struktura nie są po cichu nadpisywane. Starych modyfikacji i zamienników nie nakłada się na niepowiązany nowy dzień lub odmienną dawkę.

## Integracja wykonania w V2.4

- Start korzysta z tego samego efektywnego planu co widok sesji. Po ukończeniu pierwszego slotu wskazuje drugi. Pusty plan, koniec zapisanego okna i zmiana ustawień/wersji mają osobne stany. Kolejny podgląd zaczyna się od aktualnej daty; samo otwarcie aplikacji nie generuje ani nie zapisuje następnych 28 dni.
- Nowe rozpoczęcie sprawdza aktualną sesję, datę, wersję, ustawienia i jawne ograniczenia. Zapisane symptomy nie są unieważniane dobrym wynikiem ogólnym; dane zdrowotne są używane zgodnie ze zgodą. Nie dodano obowiązkowych pytań zdrowotnych ani nowego check-inu w Start. Historyczne dane check-inu są obsługiwanym wejściem, nie reklamą dostępnego formularza.
- Serwer dodatkowo odrzuca nowy start sesji z zastąpionego planu, także gdy drugie urządzenie nie odświeżyło jeszcze lokalnych danych. Kontrola jest serializowana z zapisem planu. Rozpoczęte wykonanie i późniejsze wpisy historyczne pozostają dostępne.
- Zgłoszenie braku sprzętu w V2 wymaga aktualnego podglądu, który dobiera łącznie ćwiczenia i liczbowe dawki. Nie nakłada się starszego mechanizmu pojedynczej podmiany na zapisany protokół V2. Komunikat prowadzi do planu; zamienniki starszych sesji zachowują dotychczasowe działanie.
- Pochodne wyniki MAS i poziomu biegania nie oznaczają zmiany wyborów treningowych. Nie przebudowują zapisanych dawek ani nie blokują kolejnej sesji tylko przez zmianę wyniku. Uwzględnia je następny świadomie przygotowany podgląd; kontrola aktualności już otwartego podglądu nadal obejmuje pełne dane wejściowe.
- Własne sesje V2 bez biegu wykonuje istniejący runner z zapisanych `structuredSections`. Mobilność i spokojny ruch nie są zastępowane nowym protokołem RecoveryCoach; ten mechanizm pozostaje dla starszych sesji bez receptury V2. Zmiana obszaru mobilności w profilu nie przepisuje wykonania. Podgląd biegu, GPS i licznik bez GPS otrzymują tę samą zapisaną recepturę; ekran nie układa jej ponownie po wejściu.
- Zwykłe utrzymanie izometryczne ma zapis faktycznie wykonanych sekund, także gdy karta ma szeroką kategorię prehab. Eksplozywny primer pozostaje stałym protokołem czasowym z 60/300 s odpoczynku, bez zamiany na tabelę kilogramów/RIR lub automatyczną progresję utrzymania.

Aktualizacja biegowego poziomu wymaga ukończonej sesji, zapisanego wyniku oraz niepustego RPE. Oba zapisy mogą dotrzeć w różnej kolejności; zastosowanie wyniku jest jednorazowe, a brak RPE pozostawia go oczekującym. Dla rozpoznanej zapisanej receptury krótkiego HIIT 60/60 s z celem RPE 8–9 samo osiągnięcie tej trudności nie oznacza porażki ani podstawy zwiększenia poziomu. RPE 10, nieukończona lub nierówna praca nadal podlegają regułom obniżenia. Nie odtwarza się ponownie historii już wykorzystanej do progresji.

Ta część wymaga zastosowania migracji `supabase/migrations/20261113202126_engine_v24_running_feedback.sql` wraz z jej wcześniejszymi zależnościami. Sam plik SQL i testy kodu nie dowodzą wykonania migracji na docelowej bazie. Po zastosowaniu trzeba sprawdzić obie kolejności zapisu, późniejsze RPE i powtórzenie żądania na środowisku testowym; dopiero wtedy można potwierdzić działanie zapisu bazodanowego.

Pozostają granice produktu: po deloadzie kolejny blok nadal wymaga jawnego podglądu; nie ma wyuczonego przekazania obciążeń między cyklami, automatycznej progresji trudności ćwiczeń z masą ciała ani osobnej pętli progresji mocy/sprintu z wyników sportowych. Bez wiarygodnego dystansu/tempa licznik bez GPS dostarcza czasy, a nie dowód utrzymania tempa. Ta poprawka nie obejmuje testu biegu z GPS w terenie ani integracji i weryfikacji urządzeń ubieralnych.

Wyniki Lab/IQ nie zmieniają automatycznie dawki fizycznej. Przed adaptacją ze sprintowych pomiarów trzeba dodatkowo ujednolicić przypisanie czasu do konkretnego powtórzenia i rodzaju startu. Serwer nie odtwarza chronologicznie całej historii, gdy kilka różnych biegów zostanie przesłanych poza kolejnością; aktualizacja zachowuje tę dotychczasową politykę oraz już zużyte decyzje.

Testy obejmują kontrakty planowania, niezależne przeliczenia, niekorzystne kalendarze, granice wieku/przygotowania/sprzętu, protokoły ISO, źródło MAS, blokady wykonania, konflikt wersji, podgląd i odczyt. Wyniki wykonanych kontroli oraz ewentualne wcześniejsze błędy repozytorium należy dołączyć do paczki osobno; nie ukrywać ich przez usuwanie testów. Testy programu i build nie potwierdzają skuteczności sportowej. Nie deklarujemy wykonania testu w prawdziwej przeglądarce, na żywej bazie lub klinicznej walidacji, jeśli nie zostały wykonane. Silnik nie układa automatycznie rehabilitacji.


## Feedback po klubie i meczu, priorytet celu głównego, koniec planu

Stan implementacji w kodzie. Nie jest to dowód wdrożenia migracji ani testu na telefonie.

### Dane po sesji
- Nowa odpowiedź RPE to 1–10; odczyt starych zer pozostaje. Brak RPE to brak danych, nigdy 0 ani 1. RPE można uzupełnić później.
- Klub: bez pytania o czas. Nowy ukończony klub dostaje `durationMin = 90` i `durationSource = club_default` (jawne założenie produktu, nie pomiar); rzeczywiste historyczne czasy nie są przepisywane. Charakter treningu to wielokrotny wybór `running_endurance`, `technical`, `tactical_game`; brak wyboru oznacza brak odpowiedzi. Stare `activity_type` jest zapisywane obok dla zgodności: `running_endurance` i `technical` są rozpoznawane, `mixed` nie potwierdza części biegowej.
- Mecz: `matchMinutesPlayed` (0–180, zero poprawne) jest wymagane, osobne od czasu całej sesji (formularz meczu nie pyta o czas sesji) i nie jest podstawiane z różnicy start/stop.
- Pola `activity_tags`, `duration_source`, `match_minutes_played`, `feedback_version` są kolumnami `session_logs`, zapisywanymi przez `save_training_log` (migracja `20261114100000_session_feedback_v1.sql`). Starsze żądania bez tych kluczy nie usuwają zapisanych wartości. Obciążenie szacowane: klub 90 × RPE (czas oznaczony jako założenie), mecz minuty gry × RPE (bez rozgrzewki).

### Propozycja korekty (`feedbackAdjustment.ts`)
- Czysta funkcja czyta wyłącznie zapisane, ukończone wykonanie klubu lub meczu. Polityka (`feedback-policy-1`): RPE ≥ 8 (klub) otwiera ocenę najbliższych niewykonanych wymagających sesji w ciągu 48 h, w horyzoncie 7 dni od dziś. Mecz łączy minuty gry z RPE: propozycja, gdy minuty × RPE ≥ 240 i RPE ≥ 5 (wartości polityki produktu); 0 minut lub krótkie wejście nie otwierają propozycji.
- Kolejność: przełożenie tej samej sesji w obrębie tygodnia planu → lżejszy lub kompaktowy wariant (istniejące buildery, pełne przerwy) → pominięcie celu, który nie jest celem głównym. Każdy wynik przechodzi `validateTrainingPlan` i bramkę rozmieszczenia generatora.
- Zastąpienie dodatkowego spokojnego biegu klubem: tylko klub ukończony z jawnym `running_endurance` i RPE ≥ 5, w tym samym tygodniu planu, jedna sesja klubu zastępuje jeden cel, nie dotyczy głównej sesji celu wydolności, testu MAS, interwałów, sprintu, siły ani powrotu. Zapis `externalGoalCredits` (`external_reported`) na dniu planu, bez fikcyjnego ukończenia.
- Zapis dopiero po „Zastosuj”, przez `activatePlanV2` (kontrola oczekiwanego planu, profilu, blokad wykonania i walidatora). Ten sam feedback daje to samo id propozycji; zastosowana zmiana jest widoczna w planie i nie wraca; zmieniony feedback unieważnia starą propozycję. „Zostaw plan” jest pamiętane tylko na urządzeniu.

### Priorytet w ciasnym tygodniu
Ranking rozwiązań tygodnia: pokryte zadania celu głównego, potem liczba pokrytych zadań, potem priorytet i koszt rozmieszczenia. Mapowanie: speed/agility → sprint, endurance → wydolność, strength/power → siła A i B, pozostałe cele wg najwyżej ważonych zadań istniejącej polityki. Twarde bramki (wiek, sprzęt, miejsce, mecz, regeneracja, osobne dni siły A/B/sprintu) obowiązują zawsze. Diagnostyka braków niesie `target`, co pozwala w Progresie odróżnić „nie udało się zaplanować”, „zawodnik nie wykonał” i „uwzględniono przez klub”.

### Koniec planu
Po wygaśnięciu okna Start pokazuje „Podsumuj plan” (bez automatycznego przekierowania). Progres pokazuje wykonane/pominięte/niezaplanowane/zgłoszone z klubu sesje, obciążenie klubu i meczów oraz brak porównywalnych pomiarów zamiast wymyślonego trendu. Miniwywiad (3 kroki) zamienia odpowiedzi na jawne, potwierdzane zmiany: mniej czasu → budżet sesji o jeden stopień niżej, brak sprzętu → wykluczenie wskazanych pozycji, inny cel → priorytety, zmęczenie → ograniczenie dodatkowe (domyślnie nieodznaczone). Uwagi działają tylko przez stałe reguły; niejasny tekst daje jedno pytanie; nie są zapisywane. Podgląd kolejnego planu startuje od dziś z zapisanym początkiem cyklu, a podsumowanie zakończonego cyklu jest stemplowane na nowym planie. Zapis planu pozostaje jawny.

### Wersjonowanie
Rozszerzenia planu to wyłącznie pola opcjonalne (`feedbackAdjustments`, `externalGoalCredits`, `Issue.target`), więc `ENGINE_VERSION` pozostaje `ballwise-v2.5`, a zapisy V2.1–V2.5 są czytane bez zmian. Zmiana formatu wymagająca podniesienia wersji musi dopisać nową wartość do `supportedVersions` i zachować poprzednie.

### Zmiany ustawień i „Dziś nie mogę”
Plan zapisuje wejścia, z których powstał (`planInputs`: terminy meczów, dni własne, dni klubu, czas sesji, sprzęt). Po zmianie ustawień karta na Starcie i ekran Plan nazywają konkretną zmianę, a podgląd pokazuje różnice najbliższych 7 dni; nowy budżet czasu otwiera podgląd zamiast cicho zmieniać plan. Zapis pozostaje jawny i idzie przez pełną aktywację planu (korekta obejmuje cały zapisany plan, bo aktywacja wymaga aktualnej rewizji profilu). „Dziś nie mogę” zapisuje dzisiejszą nierozpoczętą sesję własną jako `missed`; nic nie jest przesuwane, a dzień przechodzi do kolejnego slotu.

### Progres, Fuel, sprint
Podsumowanie siły używa rzeczywistych serii (`exercise_set_logs`): tylko ukończone sesje, serie z ciężarem i powtórzeniami, bez sesji lżejszych (deload) i bez pomiarów czasu. Fuel planuje przyszły trening klubowy z założeniem 90 min (oznaczonym jako szacunek, nie ukończona aktywność); przyszły mecz nie dostaje minut. Czas sprintu jest przypisany do wybranego powtórzenia (numer = powtórzenie planu, pominięcie nie przenumerowuje, ponowny zapis poprawia ten sam wpis).

### Test MAS, chronologia biegów, próby sprintu
- „Ustal tempo” (dobrowolny): test 5 min z rozgrzewką 10 i schłodzeniem 5 min zastępuje jeden nierozpoczęty spokojny bieg w najbliższych 7 dniach po akceptacji (nie dokłada trzeciej sesji), przechodzi bramkę rozmieszczenia i walidator; oferowany od 16 lat, przy potwierdzonym przygotowaniu, bez trybu powrotu/zmęczenia i bez ważnego wyniku. Wynik z dystansu GPS zapisuje istniejący RPC; silnik używa tempa tylko przy wyniku z sesją źródłową, nie starszym niż 28 dni (reguła produktu).
- Poziom biegowy jest wyliczany po stronie serwera z dowodów (ukończony bieg z RPE) w kolejności czasu wykonania, remis rozstrzyga identyfikator; kolejność dostarczenia, ponowienia, późne RPE i korekty dają ten sam wynik. Nowszy test MAS wyznacza nowy punkt odniesienia; starsze dowody nie są odtwarzane.
- Próba sprintu ma dystans, rodzaj startu i metodę pomiaru; porównujemy tylko próby o zgodnych warunkach, historyczne bez metadanych nie są porównywalne.

### Czego ta wersja nie robi
Zapis zmiany ustawień zastępuje plan od dziś do końca (pokazane są zmiany w najbliższych 7 dniach i w dalszych tygodniach). Bieg testu MAS w terenie, testy na urządzeniu (telefon, GPS, tło, offline) oraz zastosowanie migracji na zdalnej bazie nie zostały wykonane.
