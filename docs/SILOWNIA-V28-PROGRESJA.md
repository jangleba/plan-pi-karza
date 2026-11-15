# V2.8: progresja jakościowa i pełne sesje A/B

> Dokument etapu GP1. Zbieranie obserwacji i kalibracji, ich zapis na koncie oraz tryb jawnej propozycji dla przyszłych sesji dodaje [GP2](GYM-FEEDBACK-GP2.md). Sekcja o braku interfejsu/migracji poniżej opisuje historyczny zakres GP1, a nie całość po GP2.

Stan analizy: 15 listopada 2026. Baza: `d8e8d19f2a570ea8797b1bf7afba86e5e0b5d019`.
PR [#157](https://github.com/jangleba/plan-pi-karza/pull/157) został scalony 15 listopada o 06:25:47 UTC (07:25:47 w Polsce). Ta poprawka została przygotowana osobno i nie jest scalona ani opublikowana.

## Ustalenia z kodu

1. `gymPower.ts` wybiera warianty i początkowe dawki. Nie zapisuje historii jakości ani rzeczywistego naciągu gum.
2. `progression.ts` celowo wyklucza ćwiczenia eksplozywne i na czas z progresji ciężaru/RIR. To właściwe ograniczenie, którego nie należy usuwać.
3. `validation.ts` ogranicza liczbę prób i sprawdza zgodność dawki z ekranem. Progresja musi zmieścić się w tych ograniczeniach.
4. `cycle.ts` już rozpoznaje deload i powrót po przerwie. Czwarty tydzień jest przeglądem, a nie automatycznym zwiększeniem obciążenia lub obowiązkowym deloadem.
5. Pełne A miało tylko pchanie góry ciała, B tylko przyciąganie. Generator potrafił wyrenderować kontrast M09, ale nie tworzył zwykłych superserii uzupełniających.
6. Etykieta poziomu sportowego nie jest tym samym co przygotowanie siłowe. W `preparation.ts` niepełne lub podstawowe zapisane dane siłowe mogą dać `foundation`, nawet przy `level: advanced`. Przykładowo samo `supervisionLevel: none` przy brakujących pozostałych danych jest obecnie traktowane jako niepełna deklaracja. Nie zmieniamy tego ograniczenia w ukryty sposób.

Nie da się na podstawie samego zrzutu ustalić, czy prosty plan wynika z przygotowania siłowego, krótkiego limitu czasu, zapisanego starszego planu czy lżejszej trasy. Nie należy automatycznie naprawiać tego większym ciężarem.

## Co wynika z literatury

| Źródło                                                                                                                                             | Uzasadniony wniosek                                                                                                                                                                                         | Granica zastosowania                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Lloyd i wsp., 2014, konsensus treningu młodzieży](https://bjsm.bmj.com/content/48/7/498), DOI 10.1136/bjsports-2013-092952                        | Kompetencja ruchowa, przygotowanie, kontrola zmęczenia i łączny trening sportowy powinny sterować progresją. Przy wymagających zadaniach mocy potrzebne są odpowiednie przerwy.                             | Nie wyznacza progów 16/18 lat, liczby udanych ekspozycji ani algorytmu dla aplikacji. Opis i animacja nie zastępują obserwacji techniki; w badaniach i zaleceniach ważny jest fachowy nadzór.   |
| [Argus i wsp., 2011](https://pubmed.ncbi.nlm.nih.gov/21654341/)                                                                                    | Asysta i opór w CMJ zmieniają parametry mechaniczne w różny sposób.                                                                                                                                         | Próby obejmowały dorosłych; nie potwierdzają uniwersalnej drabiny „mocniejsza guma = lepiej”.                                                                                                   |
| [Tufano i wsp., 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6144929/), DOI 10.3389/fphys.2018.01284                                             | Różne stanowiska asysty dają różną charakterystykę skoku.                                                                                                                                                   | Sama nazwa/kolor gumy i wysokość skoku nie opisują porównywalnego bodźca.                                                                                                                       |
| [Januševičius i wsp., 2017](https://www.jssm.org/jssm-16-239.xml-Fulltext)                                                                         | U 25 aktywnych dorosłych mężczyzn porównano trzy metody. HVT wykorzystywało 4-sekundowe próby, filmowanie częstotliwości, 4–6 serii i 5 minut odpoczynku. Opór zwiększano po poprawie o dwa zliczone ruchy. | Wyniki grupy HVT liczącej osiem osób nie walidują dawki 2 × 4 s dla wszystkich piłkarzy ani juniorów.                                                                                           |
| [Januševičius i wsp., 2020](https://journals.lsu.lt/baltic-journal-of-sport-health/article/view/1017)                                              | U dorosłych profesjonalnych piłkarzy poprawiła się częstotliwość ruchów.                                                                                                                                    | Nie uzyskano istotnych zmian siły, skoku ani sprintu. Nie obiecujemy automatycznego transferu na boisko.                                                                                        |
| [Badanie piłkarzy, 2023](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2023.1219087/full), DOI 10.3389/fphys.2023.1219087 | W badaniu 319 zawodników oceniono szybkie uginanie z gumą i późniejsze urazy.                                                                                                                               | Różnica częstości urazów nie była istotna statystycznie. Nie reklamujemy tego dodatku jako udowodnionej profilaktyki urazów.                                                                    |
| [Ramírez-Campillo i wsp., 2022](https://www.mdpi.com/2075-4663/10/6/94), DOI 10.3390/sports10060094                                                | Programy skokowe mogą poprawiać sprawność piłkarzy; dobór rodzaju skoku, jakości, odpoczynku i łącznej objętości ma znaczenie.                                                                              | Bardzo różne dawki w badaniach nie wyznaczają jednej optymalnej liczby skoków. Mikrodawki w A/B nie są kopią osobnego programu plyometrii.                                                      |
| [Silva i wsp., zmęczenie pomeczowe](https://pubmed.ncbi.nlm.nih.gov/29098658/)                                                                     | Niektóre wskaźniki pozostają pogorszone także 72 godziny po meczu, z dużą zmiennością odpowiedzi.                                                                                                           | Dwa lub trzy dni nie są uniwersalnym terminem odzyskania gotowości.                                                                                                                             |
| [Bell i wsp., 2023, Delphi](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/), DOI 10.1186/s40798-023-00633-0                                    | Eksperci opisują deload jako zmniejszenie stresu treningowego, dopasowane m.in. do zmęczenia i kalendarza.                                                                                                  | To konsensus praktyków sportów siłowych i sylwetkowych, nie próba kliniczna ustalająca optymalny deload młodych piłkarzy.                                                                       |
| [Paz i wsp., 2017](https://pubmed.ncbi.nlm.nih.gov/28933712/), DOI 10.1519/JSC.0000000000001059                                                    | W badaniu 15 wytrenowanych mężczyzn oceniono naprzemienne wyciskanie i wiosłowanie. Wspiera to rozważanie par przeciwstawnych zadań góry ciała.                                                             | Nie dowodzi optymalności konkretnych par i przerw dla 17-latka.                                                                                                                                 |
| [Hammami i wsp., 2017](https://pubmed.ncbi.nlm.nih.gov/28328713/)                                                                                  | Metody siłowe i kontrastowe badano także u juniorów około 16 lat.                                                                                                                                           | Nie ma naukowego zakazu wszystkich kontrastów przed 18. rokiem życia. Istniejący próg M09 w BallWise jest ograniczeniem produktu; nie znosimy go tylko na podstawie wieku lub fotografii planu. |

Nie znaleziono tu bezpośredniego potwierdzenia optymalnego dawkowania dokładnie wariantu `gym_bridge_pulses` z V2.8. Jego krótki czas i mała amplituda pozostają decyzją projektową; nie przypisujemy mu dowiedzionego wzrostu RFD.

## Reguły GP1: decyzje produktu

Wszystkie liczby w tej części są parametrami projektu wymagającymi obserwacji w praktyce. Nie są „progami bezpieczeństwa udowodnionymi badaniami”.

| Decyzja                                | Warunki                                                                                                                                                                         | Wynik                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Zwiększ objętość w dozwolonej drabinie | Zwykła faza rozwoju, bieżący dzień, aktualna gotowość ≥7, brak blokady tygodnia, dwie kolejne porównywalne ekspozycje u dorosłego; trzy u niepełnoletniego/początkującego       | Zmiana jednego parametru dawki, bez skracania przerw.                                                                  |
| Utrzymaj                               | Brak obserwacji, niepełna seria, inny wariant/dawka/ustawienie, brak gotowości, nieznane obciążenie klubu, przyszły dzień, peak/adaptacja lub co najmniej cztery wymagające dni | Bez zwiększenia dawki lub oporu. Niepewność nie oznacza świeżości.                                                     |
| Regresja                               | Zapisana utrata kontroli, pogorszenie porównywalnego pomiaru o ponad 5%, przerwa ponad 14 dni lub nieaktualne ustawienie gumy                                                   | Mała dawka prostszego skoku; dynamiczny dodatek tyłu uda można pominąć.                                                |
| Lżejszy blok                           | Faza deload, dwie bardzo ciężkie ukończone sesje w ostatnich 7 dniach, niska aktualna gotowość lub mecz w odległości ≤2 dni                                                     | Zwykle podstawowy skok 1 × 2; bez dynamicznego dodatku tyłu uda. Istniejący scheduler nadal może wstrzymać całą sesję. |
| Wznowienie po redukcji                 | Najnowsza faktycznie wykonana mała dawka jest punktem odniesienia                                                                                                               | Lżejsza ekspozycja przerywa serię sukcesów. Nowy wzrost wymaga ponownych zwykłych ekspozycji.                          |

Drabina dla pojedynczego wariantu skoku: `1 × 2 → 2 × 2 → 2 × 3 → 3 × 3`, z ograniczeniem do dawki dopuszczonej dla wieku/fazy. Dla skoków bocznych powtórzenia są na stronę. Jeden skok obunóż to jedno zdarzenie lądowania; skok w lewo i w prawo to dwa. Nie utożsamiamy kontaktu z jednakowym obciążeniem mechanicznym.

Nie cofamy wszystkich obecnych użytkowników V2.8 na pierwszy szczebel. Bez historii utrzymujemy dawkę startową V2.8, a po redukcji stopniowo wracamy do niej. Osiągnięcie 3 × 3 nie rozpoczyna nieograniczonego dodawania prób. Dalszy rozwój może polegać na lepszym wykonaniu tej samej dawki.

Utrata kontroli w CMJ z gumami prowadzi do CMJ bez gum; w skoku bocznym jednonóż do obunóż. Powrót do pierwotnego zaawansowanego wariantu wymaga trzech jakościowych ekspozycji prostszego zadania i ponownej kwalifikacji. Nie następuje za samo ukończenie lżejszego tygodnia.

### Gumy i dynamiczny tył uda

- Zapisujemy fizyczny zestaw gum, konkretne stanowisko/mocowania, dwa zdefiniowane położenia ruchu, długości i rzeczywiście zmierzone siły w niutonach. `stationId` musi oznaczać tę samą geometrię stanowiska, a nie tylko nazwę siłowni.
- Nie przeliczamy kolorów na kilogramy. Nie zgadujemy siły z masy ciała, filmu animacji ani odmierzonego czasu.
- W CMJ z oporem, przy osiągniętej małej dawce docelowej, można wybrać następne skalibrowane ustawienie tej samej gumy i stanowiska. Siła w obu położeniach nie może spaść ani wzrosnąć o więcej niż 5%. Potrzebne są porównywalne pomiary wysokości skoku i zachowana kontrola.
- W CMJ z asystą nie zwiększamy automatycznie napięcia ani nie zmniejszamy go jako uniwersalnej „progresji”. Zmiana celu lub mechaniki wymaga osobnego doboru; przy regresji wybieramy zwykły CMJ.
- Kalibracja jest ważna projektowo 30 dni. Nowa guma, stanowisko lub geometria przerywa porównywalność; ponowny pomiar nie jest pozorną progresją.
- Szybkie uginanie pozostaje tylko dla dorosłych zaawansowanych. Drabina prób: `1 × 4 s → 2 × 4 s`; odpoczynek 300 s. Przy dwóch pełnych próbach wzrost zmierzonego oporu wymaga także poprawy najniższej częstotliwości serii o ≥0,5 zliczanego cyklu/s między porównywanymi ekspozycjami. Jest to adaptacja kryterium ruchów z badania 2017, a nie odtworzenie całego protokołu.
- Pulsacje mostu: `1 × 8 s → 2 × 8 s`, w peak najwyżej jedna próba; bez dokładania gumy, ciężaru, czasu lub większej amplitudy. Utrata kontroli pozwala pominąć dodatek. Podstawowa siła tyłu uda pozostaje w A/B.

### Wiek, poziom i cały tydzień

Zachowane są kwalifikacje V2.8: gumy w CMJ i boczny skok jednonóż od 16 lat dla zaawansowanych; szybkie uginanie od 18 lat. Wiek jest filtrem administracyjnym produktu, nie pomiarem dojrzałości biologicznej. Przygotowanie, wyposażenie, jakość i bieżący kontekst nadal mogą ograniczyć wariant.

Kontekst uwzględnia obie siłownie, sprint, wymagającą wydolność, klub i mecz. Sprawdzane są minione i nadchodzące siedem dni. Brak wpisu o zadeklarowanym klubie oraz nieznane RPE nie stają się zerowym obciążeniem. Dwa sloty tego samego dnia nie stają się dwoma dniami odpoczynku. Nie wyliczamy ryzyka urazu z ACWR.

Dodatkowy budżet znanych lądowań aplikacji wynosi projektowo 36/48/60 w ruchomych 7 dniach dla grup <16/16–17/18+. Przekroczenie ogranicza lub pomija nowy dodatek skokowy; nie usuwa historii i nie twierdzi, że rzeczywiste lądowania klubowe zostały policzone. To mechanizm ograniczający objętość nowych bloków, nie uniwersalny limit treningu plyometrycznego.

Trzy dni przed meczem sama odległość w kalendarzu nie zmniejsza dawki. Dwa dni mogą uruchomić małą dawkę; dzień przed meczem istniejący scheduler wyklucza zwykłą siłownię. Zachowany jest zakaz siłowni i sprintu tego samego dnia oraz ciężkich nóg dzień po dniu. Trudne następstwo obciążeń jest oceniane przez istniejące bramki planu.

## Pełniejsze A/B i pary ćwiczeń

Roboczy limit pełnej sesji to 75 minut z przygotowaniem i odpoczynkiem; istniejąca preferencja czasu nadal ma pierwszeństwo. Pełna zwykła sesja przygotowanego zawodnika z siłownią dostaje oba kierunki pracy góry oraz tułów i przywodziciele. To zwykle osiem zadań roboczych w A i dziewięć w B, plus przygotowanie; dostępność sprzętu może ograniczyć wybór.

| Blok             | A                                                                     | B                                                    | Organizacja                                             |
| ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Przygotowanie    | Rozgrzewka, ewentualny kwalifikowany primer                           | Rozgrzewka, ewentualny kwalifikowany primer          | Istniejące zasady izometrii pozostają.                  |
| Moc              | Jeden główny skok                                                     | Jeden główny skok i ewentualne spokojne zatrzymanie  | Samodzielnie, pełne przerwy; GP1 może zmniejszyć dawkę. |
| Siła dolna       | Główne zadanie kolanowe i zgięcie kolana albo kwalifikowany zamiennik | Główne zadanie biodrowe i zadanie jednonóż           | Bez superserii konkurujących ciężkich zadań nóg.        |
| Dodatek tyłu uda | Według istniejącego szablonu                                          | Krótka praca dynamiczna albo dotychczasowa izometria | Bez automatycznego łączenia wszystkiego.                |
| B1/B2            | Pchanie + przyciąganie                                                | Przyciąganie + pchanie                               | Dwie rundy; 30 s przejścia, 90 s po parze.              |
| C1/C2            | Przywodziciele + tułów                                                | Tułów + przywodziciele                               | Dwie rundy; 30 s przejścia, 60 s po parze.              |
| Uzupełnienie     | Łydka proste kolano                                                   | Łydka zgięte kolano                                  | Samodzielnie.                                           |

Pary B/C są projektową organizacją pracy uzupełniającej, bez twierdzenia, że są najlepsze dla każdej osoby. Ciężka siła + skok to odrębny protokół kontrastowy M09, z dotychczasową kwalifikacją i długimi przerwami. Notatki „sanki + skok w dal” czy „izometria + skok” nie stają się automatycznie zwykłą superserią bez odpoczynku. Nie wprowadzamy niejasnych pozycji „to moje na brzuch” ani „uginanie na czwórki” pod wymyślonym ID.

W deloadzie, peak, przy podstawowym przygotowaniu lub skróconym budżecie nie dokładamy nowych par na siłę. Wariant kompaktowy usuwa oznaczenia par i przywraca samodzielne przerwy. Nowy wykonawca prowadzi `B1 → przerwa → B2 → przerwa → B1`, zapisując prawdziwe numery serii. To nie tylko nagłówki na ekranie.

## Kontrakt danych i realne ograniczenie wdrożenia

Nowe wejście `EngineOptions.gymProgression` przyjmuje obserwacje serii i opcjonalne zmierzone ustawienia gum. Dawkę i tożsamość bierze się z ukończonego `executionSnapshot` w `EngineOptions.completions`, a nie z deklarowanej przez klienta kopii dawki.

Obserwacja identyfikuje sesję i ćwiczenie; każda seria zawiera numer, stronę, rzeczywistą liczbę powtórzeń/sekund i stan kontroli. Pozytywny wpis wymaga kompletu wszystkich stron/serii. Zgłoszona utrata kontroli działa także po przerwaniu pierwszej serii. `athlete_observed` jest samoobserwacją, a nie obiektywną weryfikacją techniki. Pomiar ilościowy podaje metodę filmu lub urządzenia. Dla częstotliwości należy konsekwentnie liczyć ten sam pełny ruch nogi, nie mieszać definicji zliczeń między sesjami.

**Obecny interfejs V2.8 nie zbiera takich obserwacji i kalibracji.** Poprawka nie tworzy nowej ankiety, nie dodaje pomiaru z kamery i nie produkuje pozornych danych z timera. Bez przekazanego wejścia dodatnie zwiększanie oporu pozostaje zablokowane; działają utrzymanie i ograniczenia wynikające z istniejących danych. Pełne wykorzystanie progresji jakościowej wymaga doprowadzenia rzeczywistych obserwacji z zatwierdzonego źródła. To jawne ograniczenie, a nie funkcja rzekomo działająca po samym wgraniu plików.

Wywołanie pozostaje kompatybilne z wcześniejszymi klientami:

```ts
generateTrainingPlan(profile, {
  startDate: windowStart,
  asOfDate: todayIso,
  previousPlan,
  completions, // ukończone migawki bieżącego zawodnika
  readiness,
  gymProgression: {
    observations, // rzeczywiście zapisane obserwacje; bez danych: []
    bandSetups, // rzeczywiście zmierzone ustawienia; bez danych: []
  },
});
```

Nie dodano migracji ani nowego przechowywania danych jakości. Typy i wejście są gotowe do podłączenia, a testy obejmują ścieżki z danymi i bez nich. Źródło obserwacji musi być ograniczone do aktualnego konta; nie wolno korzystać z rekordów innego zawodnika. Ponowne przeliczenie daje ten sam następny krok i nie nalicza sukcesów z przyszłych zaplanowanych sesji. Rozpoczęte/wykonane dni są nadal chronione przez istniejący mechanizm blokad.

## Pliki i zastosowanie

- `gymProgression.ts`: reguły, dane, ograniczenia tygodnia, przejścia i kontrola dawki.
- `strengthPairs.ts` i `exercises.ts`: pełniejsze A/B oraz pary uzupełniające.
- `planner.ts`: zastosowanie na konkretną datę przed bramką umieszczenia sesji i renderowanie par.
- `model.ts`, `types.ts`: opcjonalne zgodne wstecznie pola.
- `validation.ts`: niezależne ograniczenia dawek, stron, par i zgodności wykonania.
- `FocusedSessionRunner.tsx`, `ContrastRounds.tsx`: prowadzenie zwykłych superserii rundami.
- Testy jednostkowe, planisty i wykonawcy sprawdzają także brak pozornej progresji.

Zastosuj patch na osobnej gałęzi zgodnej z podaną bazą. Na nowszym `main` najpierw sprawdź konflikty. Nie nadpisuj całego repozytorium plikami z archiwum. Po wgraniu trzeba jawnie przeliczyć niezaczęte sesje; zapisane stare receptury nie zmieniają się przez samo dodanie kodu. Brak automatycznego scalenia i publikacji.

Wyniki rzeczywistych uruchomień i znane ograniczenia środowiska zapisano w `VALIDATION.txt` w paczce. Nie wykonano testu na fizycznym iPhonie, z rzeczywistą gumą lub platformą siłową. Zielone testy oprogramowania potwierdzają reguły i spójność wykonania; nie dowodzą skuteczności fizjologicznej progów produktu.
