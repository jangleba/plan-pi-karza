# BallWise V2.6 — MAS i wykonywalna sesja sprintu

## Zakres gotowego kodu

Kod opiera się na `4adddb1a79824e61a137c01faaa8c5de8ad701c7`. Zsynchronizowano `package-lock.json` z już zadeklarowaną wersją konfiguracji Vite 2.27.1 i istniejącym `bun.lock`. Podnosi wersję generatora do `ballwise-v2.6`; poprzednie wykonania zachowują przypiętą recepturę, a oczekujące plany pokazują istniejącą akcję aktualizacji.

### Sprint

Jedna receptura numeryczna prowadzi kolejno przez: przygotowanie ogólne (6 min), trzy wybrane drille w rundach, dwie przebieżki, opcjonalny kwalifikowany opór sań, część główną, mały dodatek i zakończenie marszem (2 min). Domyślnie są trzy rundy po trzy TE SAME ćwiczenia w obrębie danej sesji. Młodsi, początkujący i wariant odciążony otrzymują dwie rundy; ograniczony budżet może zmniejszyć je do jednej. Każdy drill trwa 12 s; przerwy wynoszą 30 s między ćwiczeniami i 60 s po rundzie.

Rundy są rozwijane w kolejności A–B–C, A–B–C, A–B–C. Dziewięć wystąpień ma niezależne klucze wykonania i postępu. Zapis źródłowy zawiera trzy drille z liczbą rund, a widok wykonania zachowuje rozwiniętą chronologię.

Podstawowe warianty części głównej:

| Cel | Dawka bazowa przygotowanego dorosłego | Warunki |
| --- | --- | --- |
| Przyspieszenie | 6 × 10 lub 20 m, 90 s przerwy | Dystans uwzględnia dostępną strefę wyhamowania |
| Prędkość maksymalna | 4 × (20 m nabiegu + 10 m lotnego), 150 s przerwy | Dorosły, zaawansowany poziom sportowy, wysoka kontrola ruchu, nadzór, co najmniej 50 m łącznej przestrzeni, faza rozwoju |
| Bieg po szerokim łuku | 2 × 10 m na kierunek, 120 s przerwy między próbami | Boisko, wysoka kontrola, wiek co najmniej 16 lat, deklarowana przestrzeń |
| Hamowanie i ponowny start | 6 × łącznie 10 m (5 + 5), 120 s przerwy | Jak wyżej; wejście kontrolowane |
| Zaplanowana zmiana kierunku | 2 × łącznie 10 m na kierunek (5 + 5), 120 s przerwy | Jak wyżej; kierunek jest znany wcześniej |

Te liczby są konserwatywnymi szablonami produktu, a nie uniwersalnie optymalnymi dawkami. Przy zmęczeniu/deloadzie/niższym przygotowaniu wracamy do prostszych, krótszych przyspieszeń. Odległość i pełny odpoczynek mają pierwszeństwo przed liczbą dodatków. Liczone są przebieżki, nabiegi, szybkie podejścia do hamowania, strony i oporowane odcinki; limit produktu wynosi 240 m. Znane kontakty skokowe liczymy oddzielnie. Brak danych o kontaktach w drillach nie oznacza zmierzonego zera kontaktów.

Sanie wymagają deklaracji sprzętu i kwalifikacji. Marsz przy ścianie jest drillem pozycji, nie zastępczą sesją z oporem zewnętrznym. Definicje `wicket_run` i `resisted_a_march` mają instrukcje i warunki sprzętu/nadzoru/partnera; nie są automatycznie dodawane bez potwierdzenia tych warunków. Biblioteka animacji jawnie dopuszcza brak demonstracji tych dwóch nowych ćwiczeń.

Opcja „Akcent sprintu”, łączna długość miejsca i deklaracja sań są dostępne w ustawieniach przygotowania. Silnik zachowuje istniejące ograniczenia tygodnia, osobne dni siły i sprintu, kalendarz klubu/meczów, maksymalnie dwa sloty i ochronę rozpoczętych sesji.

### MAS

Przebieg: przygotowanie GPS/mapy → 10 min rozgrzewki → gotowość → odliczanie 3 s → 300 s ciągłej próby → 5 min schłodzenia → podsumowanie/zapis. Etykieta przycisku odpowiada faktycznie rozpoczynanemu etapowi. W gotowości widoczne są 05:00 i 0 m; dystans próby jest niezależny od rozgrzewki i schłodzenia. GPS jest proszony dopiero po działaniu zawodnika, a bez pozycji nie rysujemy fikcyjnej trasy.

Mapa utrzymuje jedną instancję Leaflet. Zmieniają się warstwy i pozycja. Awaria kafelków uruchamia szkic śladu z osobnym komunikatem i nie oznacza awarii GPS. Współrzędne trasy nie są wysyłane do bazy wyników.

Próby nie można pauzować ani ręcznie zaliczyć przed czasem. Przerwanie jest dostępne. Ukrycie ekranu podczas webowej próby unieważnia jej kalibrację. Natywny GPS może pracować w tle, ale końcowa trasa musi potwierdzać ciągłość pomiaru. Zaktualizowany plugin iOS przekazuje do mapy tylko najnowszy punkt, a pełną trasę przy podsumowaniu.

`masQuality.ts` ocenia granice odcinka, rzeczywisty czas, jakość/pokrycie GPS, luki i przerwania. Baza przyjmuje odpowiadający im agregat `mas_test_evidence` dopiero z przypiętą recepturą testu. Obie warstwy odrzucają brakujące lub nieskończone wartości i stosują ten sam zakres 7–26 km/h, minimum 600 m. Progi GPS (m.in. 35 m deklarowanej dokładności, luka do 10 s) są heurystykami produktu; nie potwierdzają laboratoryjnej dokładności telefonu. Wynik 1300 m / 300 s daje 15,6 km/h jako terenowe oszacowanie MAS, nie pomiar VO₂max.

Nieudana próba pozostaje aktywnością (`mas_test_attempt`) bez zmiany MAS i bez progresji jak po zwykłym biegu. Zapis zachowuje idempotencję i kontrolę wersji. Usunięcie najnowszego testu przywraca poprzedni prawidłowy wynik, jeśli istnieje. Naprawiono też zgubienie budżetu czasowego oferty MAS po pierwszym dniu planu oraz blokadę ponownej próby przez świeżą datę przy nieważnym wyniku.

## Wymaganie kolejnego etapu: różnorodność między sesjami

Gotowy patch wprowadza opisane podstawowe warianty i wybór drilli zależny od przygotowania/celu. NIE zawiera jeszcze pełnej rotacji zestawów między kolejnymi sesjami. To jest osobne, obowiązkowe zadanie do wykonania po zastosowaniu patcha.

Między sesjami zmieniają się konkretne drille, ich warianty oraz sesje szybkościowe. W każdej pojedynczej sesji pozostają trzy zapisane ćwiczenia powtarzane w tej samej kolejności przez zapisane rundy. Dobór i rotacja muszą wynikać z celu głównego, pierwszego akcentu onboardingu, poziomu, wieku, fazy sezonu i cyklu, historii wykonania, gotowości, miejsca i sprzętu. Utrzymujemy potrzebną powtarzalność do nauki i porównania wyniku. Każda odmiana ma unikalne id, parametry i instrukcję; zmiana samej nazwy nie tworzy nowego ćwiczenia.

Biblioteka ma rozróżniać przyspieszenie, MaxV, łuk, hamowanie/ponowny start, planowaną zmianę kierunku i rzeczywistą reakcję na bodziec. Warianty należy tworzyć jako kwalifikowane, kompletne szablony, z deterministycznym wyborem przy zapisie, pełnym budżetem czasu/metryki i bez zmiany rozpoczętej sesji. Priorytetem jest dopasowanie bodźca; liczba kombinacji nie jest miarą jakości.

## Wdrożenie i weryfikacja

1. Zastosować patch na aktualnym `main` z kontrolą kolizji. Nie przywracać dawnych instalatorów `.github/workflows`.
2. W poprawnym projekcie bazy wdrożyć nową migrację `20261114210001_mas_gps_evidence.sql` i zweryfikować funkcje w odczytowej kontroli. Skordynować z aktualizacją klienta: starszy klient nie dostarcza nowego agregatu jakości MAS.
3. Sprawdzić TypeScript, ESLint, testy, build web i mobilny oraz CI. Opublikować dopiero zgodną wersję aplikacji i bazy. Sam merge nie jest publikacją.
4. W iOS wykonać synchronizację i nowy build pluginu; przetestować na fizycznym telefonie lokalizację, tło, blokadę i odzyskiwanie szkicu. Build SPA nie zastępuje archiwum Xcode ani testu urządzenia.
5. Przy starym zapisanym planie użyć aktualizacji planu; rozpoczęte i zakończone jednostki zachowują dotychczasową recepturę.

Lokalny pełny przebieg testów wykazał niezależny od tej zmiany problem: `scripts/prepare-iq-clips.mjs --check` zgłasza, że istniejący `running.glb` nie odpowiada eksportowi z `running.fbx`. Pliki IQ i ich generator nie były zmieniane przez ten patch. Nie deklarować zielonego pełnego CI bez rozwiązania/zweryfikowania tego istniejącego problemu. Dodatkowe robocze testy audytowe znajdujące się poza commitem nie należą do paczki.

## Instrukcje i demonstracje techniki

Panel techniki pokazuje dawkę/przerwę, cel, krótkie kroki, jedną wskazówkę, błędy i regułę przerwania. Znany konflikt `a_skip_add_step` (krok dostawny kontra dodatkowe odbicie) blokuje pokaz w głównym panelu do czasu ujednolicenia znaczenia.

Kolejny etap wizualny wymaga osobnej kontroli każdej tożsamości ruchu: kamera z boku/przodu/po skosie odpowiednia do zadania; fazy kontaktu/lotu; podparcie i kierunek siły; położenie miednicy/tułowia; praca ramion; tor nogi; kontakt i wyhamowanie; poprawna pętla. Tempo poglądowe opisujemy osobno od rzeczywistej kadencji. Nie narzucamy jednego kąta tułowia, jednego kąta kolana ani jednego tempa wszystkim sprintom. Test braku NaN, poprawnych długości segmentów i kontaktu z podłożem jest testem geometrii oprogramowania, nie potwierdzeniem idealnej biomechaniki.

## Źródła i granice zastosowania

- Berthon i wsp. (1997), *A 5-min running field test as a measurement of maximal aerobic velocity*: https://pubmed.ncbi.nlm.nih.gov/9088842/ — podstawa terenowego protokołu, badanie dorosłych mężczyzn; nie walidacja GPS w telefonie.
- Dabonneville i wsp. (2003), *The 5 min running field test: test and retest reliability on trained men and women*: https://pubmed.ncbi.nlm.nih.gov/12527963/ — powtarzalność terenowego oszacowania, bez przenoszenia jej na każdy telefon i powierzchnię.
- Haugen i wsp. (2019), *The Training and Development of Elite Sprint Performance*: https://pmc.ncbi.nlm.nih.gov/articles/PMC6872694/ — specyficzność bodźca, pełne przerwy, drille jako przygotowanie, indywidualizacja; literatura i praktyka elitarnych sprinterów wymagają ostrożnego przenoszenia na młodych piłkarzy.

Dokładnie trzy rundy po trzy ćwiczenia, limit 240 m, czasy przygotowania oraz techniczne progi jakości GPS są decyzjami produktu. Nie przypisywać im nieistniejącego dowodu na uniwersalną optymalność.

## Rotacja zestawów drilli i wariantów sprintu (implementacja)

Moduł `engineV2/sprintCatalog.ts` zawiera kwalifikowane szablony: 6 wariantów przyspieszenia (swobodny, z półklęku, z upadku, z pozycji wykrocznej, z truchtu, boczny), 2 prędkości maksymalnej (20+10 m oraz 30+10 m przy co najmniej 60 m prostej), 2 łuku (10 i 15 m), 4 hamowania (5+5 ponowny start, progresywne 5/10/15, dwa kroki z utrzymaniem, wyjście boczne), 3 zaplanowanej zmiany kierunku (cięcie, cięcie z ponownym startem, 5-0-5) i 2 reaktywne (tylko z zadeklarowanym partnerem dającym sygnał w trakcie biegu), oraz 8 zestawów trzech drilli (ściana tylko przy zadeklarowanej ścianie). Każdy wariant ma własną dawkę (serie, metry, nabieg/wybieg, strony, przerwa), instrukcję z regułą przerwania i warunki dopuszczenia (wiek, poziom, miejsce, kontrola ruchu, partner).

Dobór jest deterministyczny w chwili generowania: kwalifikacja → rotacja według historii sesji sprintu (omija ostatnio użyty wariant i zestaw, potem najrzadziej używany, potem kolejność katalogu). Wybrane identyfikatory i krótkie uzasadnienie są zapisane w recepturze (`engineV2.sprintVariant`), więc otwarcie, odświeżenie ani synchronizacja nie zmieniają sesji; walidator odrzuca zapis, w którym wariant lub trójka drilli nie zgadza się z recepturą (`SPRINT_VARIANT_MISMATCH`). W jednej sesji zawodnik wykonuje A/B/C ×(2–3 rundy) tych samych trzech drilli. Lżejszy tydzień, młodsi i początkujący dostają tylko proste warianty. Małe uzupełnienie (np. trzykrokowe hamowanie) nie występuje w dwóch kolejnych sesjach. Reaktywność wymaga partnera (opcja w ustawieniach); znany wcześniej kierunek nie jest liczony jako trening reakcji.

Ograniczenia: katalog korzysta z istniejących ćwiczeń biblioteki (instrukcje per wariant są w recepturze, nie jako osobne animacje); brak osobnych demonstracji graficznych dla nowych wariantów; wybór nie uczy się z jakości wykonania; skip B i skoki kontaktowe nie są częścią rotacji.

## Problem pełnego CI (kontrola)
`scripts/prepare-iq-clips.mjs --check` przechodzi na Node 22 (wersja CI), także test `mixamo.test.ts`; zgłoszona niezgodność `running.glb` dotyczy generowania na Node 24 (inny eksport). CI używa Node 22.
