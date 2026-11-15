# SP1.1: połączona progresja siły, check-in i zapis obciążenia

15 listopada 2026. Baza: `344421cffb858394d996244720009e1740b93ae2` — PR #158 zawierający poprzednią progresję skoków i pary A/B. SP1.1 zawiera SP1 i poprawki audytu integracji. To osobne, niewdrożone rozszerzenie. Zachowuje dwie sesje A/B, ich zadania i kwalifikacje ćwiczeń.

## Audyt przepływu i uzupełnione połączenia

W SP1 sugestie korzystały z zapisów kg/powtórzeń/RIR oraz opcjonalnego pola gotowości, ale nie zapisywały próśb o mniejszy ciężar. Serie ze zmianą kg między seriami kończyły się ponownym doborem bez rozpoznania obniżki. Ekran Start na bazie #158 nie zawiera formularza świeżej gotowości; istnienie pola `readiness` nie dowodzi, że zawodnik coś dziś zgłosił.

SP1.1 dodaje **opcjonalny treningowy check-in przed rozpoczęciem siłowni**: „Zgodnie z planem” / „Dziś mniejszy ciężar”. Nie ma domyślnie zaznaczonej odpowiedzi. To preferencja treningowa, nie pomiar zdrowia lub zmęczenia. Nie dodano pytań medycznych ani przywróconego formularza snu/objawów. Istniejąca gotowość jest używana tylko z właściwą datą i przy włączonej opcjonalnej personalizacji; jej brak nie staje się wysoką oceną.

| Etap | Rzeczywiste źródło i skutek |
| --- | --- |
| Przed treningiem | Wybór trafia przez `startSession` do istniejącego JSON `execution_snapshot` razem z datą i startem. Sam podgląd niczego nie zapisuje. |
| Zapis i powrót | Ta sama kolejka offline, RPC `save_training_log` i odczyt `mapCompletionRows` zachowują wybór. Rozpoczętej migawki nie można nadpisać kolejnym wyborem. |
| Bieżące kg | `SetTable` czyta wybór z rozpoczętej sesji. „Mniejszy ciężar” blokuje dodatnią sugestię ze starej historii i proponuje mniejszy porównywalny punkt odniesienia albo dobór w rozgrzewce. |
| Powtarzające się prośby | Liczone osobno, raz na ukończoną sesję: ostatnie trzy siłownie w 14 dniach. Dwa takie wybory blokują automatyczną podwyżkę i nadają akcent utrzymania przy następnym przeliczeniu planu. |
| Faktyczne obniżki kg | Liczone z trzech ostatnich porównywalnych ekspozycji ćwiczenia w 21 dniach, z czwartą jako bazą porównania. Jedna sesja może dać najwyżej jeden wpis o obniżce. Nie jest to licznik „chciał lżej”. |
| Mieszane serie robocze | Sekwencja np. 80 → 75 → 75 kg z poprawnym końcowym wykonaniem wspiera utrzymanie 75 kg; nie wymusza kolejnej redukcji za wcześniejszą trudną serię. Nieudana ostatnia seria nadal może obniżyć zalecenie. |
| Wyjątki | Nie zliczamy celowego deloadu ani innej dawki jako spadku; serie wprowadzające rosnące i piramidy nie są uznawane za obniżki. Nieporównywalny zakres powtórzeń oznacza ponowny dobór. |

„Dwa z trzech”, okna 14/21 dni oraz redukcja około 5% są **decyzjami produktu**, a nie progami udowodnionymi jako optymalne. Prośba o lżejszy ciężar i faktyczna obniżka nie dowodzą ich przyczyny: nie diagnozujemy przemęczenia ani utraty siły. Jedno ćwiczenie nie uruchamia automatycznie deloadu całego ciała. Plan uwzględnia także profil, klub, mecze, faktyczne RPE i dostępne dane gotowości.

Wybór przed startem dotyczy ciężaru, nie samoczynnego przepisywania liczby serii zapisanej sesji. Powtarzające się wybory zmieniają akcent i objętość **przy kolejnym przeliczeniu niezaczętego planu**. Zaczęte i ukończone sesje pozostają wiernym zapisem. Wszystkie sugestie kg zachowują kwalifikacje wieku i przygotowania SP1.

## Wniosek z analizy

Progresja nie powinna oznaczać dokładania kilogramów w każdym tygodniu. Potrzebne są dwa powiązane poziomy decyzji:

1. **Akcent planu:** podstawy, rozwój siły, ciężki akcent siły maksymalnej, siła wspierająca moc, utrzymanie, deload albo powrót po przerwie.
2. **Ciężar danego ćwiczenia:** dobór w rozgrzewce, utrzymanie, mały wzrost, regresja lub powrót do porównywalnej bazy. Bieżąca nieudana seria może zmienić zalecenie następnej serii.

Maksymalna siła jako cecha fizyczna nie oznacza wykonywania maksymalnych prób 1RM. Można ją rozwijać ciężkimi seriami z zapasem. Aplikacja nie wylicza „prawdziwego 1RM” ani deficytu siły z samych kilogramów, RIR, wieku, pozycji na boisku lub etykiety poziomu.

## Literatura: co rzeczywiście wiadomo

| Źródło                                                                                                                              | Wniosek mający znaczenie dla silnika                                                                                                                                                 | Ograniczenie                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ACSM, 2026](https://pubmed.ncbi.nlm.nih.gov/41843416/), [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/)          | Aktualizacja stanowiska z 2009 r.; synteza 137 przeglądów. U zdrowych dorosłych większe obciążenia, m.in. ≥80% 1RM, mogą wspierać rozwój siły. Trening do upadku nie jest konieczny. | Dotyczy dorosłych, nie stanowi algorytmu dla niepełnoletnich piłkarzy. Nie wyznacza optymalnego RIR=2 ani dokładnego procentowego kroku progresji.  |
| [Lloyd i wsp., 2014](https://pubmed.ncbi.nlm.nih.gov/24055781/), DOI 10.1136/bjsports-2013-092952                                   | Trening młodzieży powinien uwzględniać przygotowanie, kompetencję ruchową, nadzór, zmęczenie i pozostały sport.                                                                      | Data urodzenia nie jest pomiarem dojrzałości ani kompetencji. Nie określa progów 12/24 miesięcy SP1.                                                |
| [AAP, 2020](https://publications.aap.org/pediatrics/article/145/6/e20201011/76942/Resistance-Training-for-Children-and-Adolescents) | Przy wysokiej kompetencji oporowej młodzież może wykonywać okresowe fazy z mniejszą liczbą powtórzeń i większym obciążeniem.                                                         | To nie zalecenie ciężkich serii dla każdego 17-latka. Opis i animacja nie potwierdzają kompetencji.                                                 |
| [Graham i Cleather, 2021](https://doi.org/10.1519/JSC.0000000000003164)                                                             | U 31 wytrenowanych mężczyzn autoregulowany program przysiadów oparty na RIR poprawił siłę bardziej niż sztywne obciążenie ustalone na początku programu.                             | Jedno badanie nie dowodzi przewagi każdego algorytmu RIR w piłce lub u juniorów.                                                                    |
| [Refalo i wsp., 2024](https://pubmed.ncbi.nlm.nih.gov/37967832/)                                                                    | W badaniu 24 wytrenowanych osób oceniano trafność RIR przy wyciskaniu. RIR może wspierać dobór wysiłku.                                                                              | Ocena jest obarczona błędem i zależy od warunków; nie jest czujnikiem zmęczenia ani oceną techniki.                                                 |
| [Steele i wsp., 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5712461/)                                                            | W badaniu 141 osób przewidywanie liczby możliwych powtórzeń nie było idealnie trafne.                                                                                                | RIR nie uzasadnia pozornej precyzji automatycznych procentów.                                                                                       |
| [Pareja-Blanco i wsp., piłkarze](https://pubmed.ncbi.nlm.nih.gov/27618386/)                                                         | Program z mniejszą utratą prędkości serii poprawiał wybrane parametry nerwowo-mięśniowe u zawodowych piłkarzy.                                                                       | Bez rzeczywistego czujnika nie można przeliczać RIR lub timera na „15% spadku prędkości”. SP1 tego nie robi.                                        |
| [Pareja-Blanco i wsp., zmęczenie po seriach](https://pubmed.ncbi.nlm.nih.gov/26970332/)                                             | Manipulowanie bliskością upadku wpływa na zmęczenie i czas odzyskiwania sprawności.                                                                                                  | Nie wyznacza uniwersalnej przerwy ani klinicznego progu przemęczenia.                                                                               |
| [Rønnestad i wsp., 2011](https://pubmed.ncbi.nlm.nih.gov/21873897/), DOI 10.1519/JSC.0b013e31822dcd96                               | W małym badaniu zawodowych piłkarzy jedna sesja podtrzymująca tygodniowo utrzymywała część osiągniętych adaptacji lepiej niż sesja co drugi tydzień.                                 | Próba 14 zawodników; nie upoważnia do przepisywania jednej dawki wszystkim juniorom. SP1 zachowuje A/B i reguluje dawkę.                            |
| [In-season autoregulation, 2023](https://pubmed.ncbi.nlm.nih.gov/37343954/), DOI 10.1080/02640414.2023.2227536                      | Badano autoregulowaną cotygodniową siłę w kontekście utrzymania sprawności i obciążeń meczowych zawodowych piłkarzy.                                                                 | Środowisko profesjonalne nie jest równoważne samodzielnemu treningowi nastolatka.                                                                   |
| [Keiner i wsp., 2022](https://www.mdpi.com/1660-4601/19/10/5835), DOI 10.3390/ijerph19105835                                        | Przekrojowo badano związek względnej siły przysiadu ze sprintem i skokami u 492 młodych piłkarzy.                                                                                    | Korelacja nie określa indywidualnej przyczyny ograniczeń. Nie wdrażamy uniwersalnego progu „1,5× masy ciała” ani diagnozy słabości.                 |
| [Bell i wsp., 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/), DOI 10.1186/s40798-023-00633-0                             | Konsensus dotyczący deloadu wskazuje na zmniejszanie stresu i uwzględnienie potrzeb sportu oraz zawodnika.                                                                           | Opinie ekspertów sportów siłowych i sylwetkowych; nie walidują dokładnego algorytmu piłkarskiego.                                                   |
| [Badanie tygodnia bez treningu, 2024](https://pubmed.ncbi.nlm.nih.gov/38274324/)                                                    | W badaniu 39 osób całkowite przerwanie treningu na tydzień w środku programu nie dało przewagi w adaptacji siłowej.                                                                  | Przerwa od treningu nie jest tym samym co deload z mniejszą liczbą serii. Nie ma podstaw do obowiązkowego tygodnia bez treningu co czwarty tydzień. |

Zasady przeciążania opisane w [ACSM 2009](https://pubmed.ncbi.nlm.nih.gov/19204579/) są historycznym punktem odniesienia; nowszego stanowiska z 2026 r. nie pominięto. Nie twierdzimy, że przeczytano osobno 137 badań lub że literatura bezpośrednio przetestowała kod SP1.

## Komu nadajemy większy akcent siły

| Dostępne informacje                                                                                                        | Decyzja SP1                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Niepełne przygotowanie siłowe albo poziom podstawowy                                                                       | Podstawy i regularność; brak automatycznego ciężkiego akcentu.                                                                         |
| Cel lub ogranicznik „siła”, przygotowanie średnie                                                                          | Budowanie siły w umiarkowanym zakresie powtórzeń.                                                                                      |
| Cel lub ogranicznik „siła”, odpowiednie przygotowanie do ciężkich serii, odpowiedni tydzień                                | Akcent ciężkiej siły maksymalnej w głównym ćwiczeniu.                                                                                  |
| Cel moc/szybkość bez potwierdzonego priorytetu siły                                                                        | Siła wspierająca, bez automatycznego maksymalizowania jej objętości. Nie oznacza to, że zawodnik jest obiektywnie wystarczająco silny. |
| Dwa mecze w kolejnych 7 dniach, peak, mecz w odległości ≤2 dni, dużo potwierdzonych ciężkich dni lub dwie klubowe siłownie | Utrzymanie i ograniczenie objętości.                                                                                                   |
| Wymagający zapis wykonania, dwie bardzo ciężkie sesje lub lżejsza faza istniejącego cyklu                                  | Deload; decyzja o kilogramach zależy także od zapasu i wykonania.                                                                      |
| Co najmniej 14 dni od ostatniej potwierdzonej siłowni                                                                      | Powrót od mniejszej dawki i ponowne dopasowanie ciężaru.                                                                               |

To **priorytet programowania oparty na deklaracjach i wykonaniu**, a nie diagnoza rzeczywistego deficytu. Do dokładnego stwierdzenia, czy ogranicza kogoś siła, jej szybkie wykorzystanie, technika czy inny czynnik, potrzebne są odpowiednie porównywalne pomiary i szerszy kontekst. Nie zastępujemy ich pozycją na boisku, wiekiem lub arbitralną normą.

## Konkretny dobór dawki

Poniższe wartości są **ostrożnymi decyzjami produktu**, nie optymalnymi dawkami wyznaczonymi bezpośrednio w badaniach.

- Dorośli: ciężki akcent wymaga dotychczasowej zaawansowanej deklaracji siłowej: poziom zaawansowany, ≥24 miesiące, wysoka kompetencja i dostęp do siłowni. Główne ćwiczenie A: 3 × 4, RIR 2, ≥180 s. B: 2 × 4, RIR 2, ≥180 s.
- Wiek 16–17: taki akcent może być dostępny przy ≥12 miesiącach, co najmniej średnim przygotowaniu siłowym, wysokiej kompetencji i **już zapisanym pełnym nadzorze**. Główne ćwiczenie A/B: odpowiednio 3/2 × 5, RIR 3, ≥180 s. Nie dodano nowego formularza lub obowiązku pytania o trenera; brak tych danych po prostu nie odblokowuje tej ścieżki.
- Młodsi lub niespełniający warunków ciężkiego akcentu nadal rozwijają siłę odpowiednim wariantem. Przy średnim przygotowaniu i priorytecie siły: zasadniczo 3 × 6, RIR 3, ≥150 s w głównym ćwiczeniu.
- Utrzymanie i wsparcie mocy ograniczają zwykle główne zadanie do najwyżej dwóch serii. Utrzymanie nie oznacza samo w sobie zmniejszenia kilogramów.
- Deload/powrót ogranicza liczbę serii i zwiększa zapas. Akcent specjalistyczny nie ma pierwszeństwa przed potrzebą redukcji. W lżejszej ścieżce można wyłączyć primer, klastry i parę kontrastową, zachowując pełny odpoczynek.
- Krótsze i specjalistyczne warianty zachowują własne reguły. Nie przedstawiamy ich jako nowego ciężkiego bloku, jeśli dawka SP1 nie została zastosowana. Nie zmieniono kwalifikacji M08/M09/M14, skoków, gum ani A/B w osobne jednostki.

Przepisanie 4 powtórzeń przy RIR 2 nie jest pomiarem 80% lub 85% 1RM. W aplikacji nie pojawiają się takie wyliczone procenty. Masa robocza wynika z rozgrzewki i faktycznie zapisanych serii.

## Kiedy zwiększyć, utrzymać i obniżyć kilogramy

| Sytuacja                                                                                                                                                          | Rekomendacja                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Dwie kolejne pełne porównywalne ekspozycje u dorosłego; trzy u niepełnoletniego/podstawowej ścieżki; wszystkie serie wykonane z co najmniej jednym dodatkowym RIR | Jeden mały dostępny skok ciężaru; bez równoczesnego dokładania serii.                                                                       |
| Osiągnięto zaplanowane powtórzenia dokładnie przy docelowym zapasie                                                                                               | Utrzymaj. Wykonanie prawidłowego treningu nie wymaga podwyżki.                                                                              |
| Tydzień podtrzymujący, gęsty kalendarz, bliski mecz, nieznane obciążenie minionego klubu albo obniżona bieżąca gotowość                                           | Bez zwiększenia na podstawie dawnych udanych sesji.                                                                                         |
| Jedna kompletna sesja poniżej minimum powtórzeń albo z deficytem zapasu co najmniej 2 RIR, np. 0 zamiast 2 lub 1 zamiast 3                                        | Propozycja mniejszego ciężaru; nie trzeba czekać na dwa niepowodzenia.                                                                      |
| Ostatnia seria bieżącej sesji nie osiągnęła minimum albo zabrakło co najmniej dwóch powtórzeń zapasu, np. RIR 0 zamiast 2 lub 1 zamiast 3                         | Mniejszy ciężar może być podpowiedziany od następnej serii, po pełnej przerwie.                                                             |
| Dwa niepowodzenia                                                                                                                                                 | Większa redukcja i przegląd obciążenia, nie dodatkowe serie „na odrobienie”.                                                                |
| Brak RIR, niepełne serie, inna technika/tempo/kąt/asysta, nieznany wariant, nieporównywalna dawka lub sprzeczny zapis                                             | Utrzymanie albo dobór w rozgrzewce; brak pozornego zwiększenia.                                                                             |
| Powrót po deloadzie                                                                                                                                               | Punkt odniesienia ze zwykłej, porównywalnej sesji, jeśli jest wystarczający dowód. Lżejsze sesje nie liczą się jako sukcesy do zwiększenia. |

Parametry SP1: do 5% małego wzrostu u dorosłego w ścieżce rozwoju; do 2,5% u niepełnoletniego lub w ścieżce wsparcia mocy. Domyślny krok sprzętu to 2,5 kg, zgodny z istniejącym polem zapisu; **nie jest to potwierdzenie faktycznej dostępności takiego obciążenia**. Jeśli znana lista obciążeń została podana do API, ma pierwszeństwo. Gdy najmniejszy skok jest za duży, rekomendacją jest utrzymanie, nie wymuszona podwyżka.

Przy redukcji używane są projektowe punkty odniesienia około 5% po jednym niepowodzeniu, 7,5% po powtórzonym i około 10% w odpowiedniej lżejszej ścieżce lub po przerwie. Zaokrąglenie do dostępnego kroku może zmienić faktyczny procent; nie wolno opisywać go jako zmierzonej utraty siły. Nie podstawiamy zerowego lub identycznego ciężaru jako „udanej redukcji”. Bardzo stara historia nie daje dokładnej sugestii kg.

Przykład dla tej samej dawki 3 × 4 z celem RIR 2 i zapisanym ciężarem 80 kg: dwie pełne ekspozycje z RIR ≥3 mogą pozwolić zaproponować 82,5 kg; wykonanie przy RIR 2 prowadzi do utrzymania 80 kg; RIR 0 lub niewykonanie minimum może dać 75 kg po zaokrągleniu projektowej redukcji. To punkty do sprawdzenia z rzeczywistym sprzętem i zapasem, a nie gwarancje aktualnej zdolności zawodnika.

## Progresja w cyklu i całym tygodniu

Utrzymano istniejący przegląd cyklu po trzech tygodniach. Numer tygodnia nie dokłada kilogramów ani nie wymusza przerwy od treningu. Przy dobrym wykonaniu można kontynuować rozwój, przy kalendarzu utrzymującym — podtrzymywać, a przy pogorszeniu — zmniejszyć stres. Sam brak wzrostu kg przez kilka sesji nie dowodzi braku adaptacji lub przetrenowania.

Uwzględniane są obie sesje siłowe, pozostałe potwierdzone ciężkie dni, klub, najbliższe mecze, istniejąca gotowość i przerwy w wykonaniu. Brak raportu minionego zadeklarowanego klubu nie jest zerowym obciążeniem. Przyszłe zaplanowane sesje nie liczą się jako wykonane sukcesy. Trzy dni przed meczem sam kalendarz nie zmniejsza dawki. Istniejące bramki nadal chronią dzień przed meczem i następstwo ciężkich dolnych dni.

Dzisiejszy feedback może zablokować podwyżkę lub obniżyć następną serię także wtedy, gdy zapisany wcześniej plan miał mocniejszy akcent. Zmiana całej receptury wymaga istniejącego procesu przeliczenia niezaczętego planu. SP1 nie nadpisuje rozpoczętych lub wykonanych migawek.

## Zmiany dla użytkownika i granice

Cel sesji pokazuje wybrany akcent. Formularz zapisuje rzeczywiste serie i pokazuje krótką sugestię z rozwijaną przyczyną dostępną na telefonie. Dodatnia sugestia nie podnosi samoczynnie wpisanego ciężaru. Korekta po nieudanej serii może wstępnie uzupełnić mniejszy ciężar następnej, zachowując możliwość edycji. RIR nie jest kopiowany do jeszcze niewykonanej serii.

Wprowadzono tożsamość mechaniki ćwiczenia i dodatkowe pochodne dane weryfikacji na podstawie **istniejącej zapisanej rozpiski**. Nie dodano tabel bazy, migracji, formularza zdrowotnego, pytań o masę ciała ani automatycznego pomiaru techniki. Dokładne obciążenia trzeba zapisywać konsekwentnie w tej samej konwencji, np. masa jednej hantli lub całej sztangi; SP1 nie odgaduje zmiany konwencji.

Progresja kilogramów działa na istniejących zapisach ciężaru, powtórzeń i zapasu. Odrębna progresja gum/skoków z poprzedniej paczki nadal wymaga właściwych obserwacji i pomiarów; ten mechanizm nie udaje, że zyskał je z RIR lub timera.

Kod wymaga przeglądu i prób użyteczności przed publikacją. Testy oprogramowania sprawdzają reguły, spójność planu i działanie formularza. Nie stanowią walidacji fizjologicznej wszystkich progów. Szczegółowe wyniki rzeczywistych uruchomień znajdują się w pliku `VALIDATION.txt` paczki.
