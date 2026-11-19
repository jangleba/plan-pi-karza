# Zakładki: Lab, IQ, Fuel, Progres (specyfikacja robocza)

Nawigacja dolna: Plan · Lab · IQ · Fuel · Progres.

## Lab (testy)
- Testy: CMJ, skok w dal z miejsca, sprint 10/20/30 m, test wydolnościowy (MAS 5 min już jest; kolejne do ustalenia, np. Yo-Yo IR1, 30-15 IFT).
- Pomiar z wideo: automat + ręczna korekta (zawsze można przesunąć klatki odbicia/lądowania). Jasne instrukcje nagrywania (ustawienie kamery, fps).
- CMJ: wysokość z czasu lotu, h = g·t²/8. Dokładność zależy od fps.
- RYZYKO: automatyczne wykrywanie z wideo w przeglądarce wymaga testów na prawdziwych nagraniach; do czasu weryfikacji to sugestia do poprawy.

## IQ (taktyka)
- Widok z trzeciej osoby, 3D w przeglądarce (Three.js); zawodnik porusza się, podaje, strzela, dośrodkowuje, kiwa.
- Sterowanie: joystick + przyciski akcji.
- Po zagraniu: tablica taktyczna z góry – co zrobiłeś, co lepiej, gdzie iść / nie iść, gdzie podać, timing.
- Ocena: tylko porównanie z lepszym wyborem (bez punktów).
- Sytuacje: wszystkie zaawansowane, nie podstawowe.

## Fuel
- Wszystkie trzy tryby: porady wg czasu do sesji/meczu, tryb sklepu (co kupić, czego unikać, mało czasu), dziennik posiłków.

## Progres
- Wykresy liniowe (nie słupkowe), kolor wg trendu: zielony – progres, pomarańczowy – lekki regres, czerwony – wyraźny regres.
- Źródła: laby, siła, bieganie, piłka, wykonane sesje, regularność.

## Wdrożone: nawigacja i Progres
- Pasek zakładek na dole; Lab, IQ, Fuel mają na razie ekran „W budowie".
- Progres: wykresy liniowe z kolorem wg trendu (ostatnia wartość vs średnia z do 3 poprzednich: ≥+1% zielony, do −1% szary, do −5% pomarańczowy, poniżej czerwony; dla czasów odwrotnie).
- Historia (sesje, szac. 1RM, MAS) zapisywana lokalnie; NIE jest jeszcze synchronizowana z bazą.
- Kolejność prac: Lab → Fuel → IQ. Testy Lab co 4–5 tygodni (przypomnienie w planie); porównanie tylko z samym sobą. Fuel uwzględnia masę i cel oraz pory sesji i meczu.

## Wdrożone: Lab (wpis ręczny)
- 4 testy z instrukcjami (źródła: `docs/ZRODLA-LAB.md`), walidacja zakresów, przelicznik czasu lotu na wysokość (h = g·t²/8), splity sprintu muszą rosnąć, znacznik „Do zrobienia" po 5 tygodniach.
- Wyniki trafiają do Progresu. Wideo (ręczne klatki i automat) – następny etap Labu.

## Wdrożone: wideo w Labie (ręczne klatki)
- CMJ i sprint: wczytanie filmu, przesuwanie klatka po klatce (−10/−1/+1/+10), zaznaczenie odbicia i lądowania lub startu i 10/20/30 m; wynik trafia do pól wpisu.
- fps: wybór ręczny (30/60/120/240) lub „Wykryj" (spowolnione odtwarzanie, średnia różnica czasu klatek).
- Sprawdzone na sztucznych filmach (30/60/120 kl./s) w Chromium. NIE sprawdzone na prawdziwych nagraniach iPhone'a (zwolnione tempo może mieć inną oś czasu w pliku).
- Automatyczne wykrywanie odbicia i lądowania: jeszcze nie wdrożone.

## Wdrożone: Fuel
- Teraz: wybór Trening/Mecz, „Przede mną / Już po", godzina startu; porady z ilościami z masy ciała (źródła i niezweryfikowane elementy: docs/ZRODLA-FUEL.md).
- Sklep: co kupić, co ograniczyć, szybkie opcje (praktyczne, nie badania).
- Dziennik: cel (utrzymanie/masa/redukcja), cele dzienne węglowodanów i białka wg dnia z planu, ręczny wpis posiłków; dane lokalne.

## Wdrożone: IQ – prototyp (jedna scena)
- Scenariusz „Bieg za linię obrony": widok zza pleców (Three.js, ładowany leniwie), joystick + przyciski Podanie/Strzał (na komputerze WASD/strzałki), pierścień pokazuje adresata podania.
- Po zagraniu: tablica taktyczna z góry (pozycje, linia spalonego, Twój wybór i lepsza opcja) oraz zdanie, dlaczego. Bez punktów, zgodnie z decyzją.
- Silnik decyzji (`src/engine/iq.ts`): czysty TypeScript, 6 testów; spalony, zablokowany tor, wolność adresata, szansa strzału. Model jest uproszczony (reguły, nie dane meczowe).
- NIE ma jeszcze: dośrodkowania, kiwania, więcej scenariuszy, animacji piłki i zawodników (na razie walce), poziomów trudności.
- NIE sprawdzone na telefonie: fps zmierzono tylko w przeglądarce bez GPU (60 fps), co nie mówi nic o urządzeniach mobilnych.

## Start i „Mecz w głowie" (wdrożone)
- Zakładki: Start · Plan · Lab · IQ · Fuel · Progres.
- Start: check-in (główny element) z jednym zdaniem, co zmienia w sesji; mała karta „Dziś" (MD-x, rodzaj sesji, przejście do sesji); „Mecz w głowie".
- „Mecz w głowie": ok. 3 min – oddech, 4 sytuacje dla pozycji z animowaną tablicą, słowo na mecz; zalecany MD-1 i w dniu meczu. Treści to moje szkice do przeglądu trenera.
- MAS przeniesiony do jednostki biegowej. Bieganie jak w Stravie (mapa na żywo, tempo, dystans, km, prowadzenie interwałów) – następny PR.
- Trening reakcji zostaje tylko w treningach piłkarskich.

## Bieg z GPS (wdrożone)
- W jednostce biegowej: „Rozpocznij bieg/test z GPS" – ekran jak w Stravie: trasa, czas, dystans, tempo teraz i średnie, odcinki km, fazy interwałów (praca/przerwa) z odliczaniem i tempem docelowym z MAS.
- Test MAS z GPS: dystans po 5 minutach zapisuje MAS automatycznie (ręczny wpis nadal działa).
- Sygnał zmiany fazy: tylko wibracja (decyzja użytkownika) – NIE działa w przeglądarce na iPhonie; zadziała w wersji natywnej iOS.
- Mapa: Mapbox (styl light) po ustawieniu `VITE_MAPBOX_TOKEN`; bez tokenu rysunek trasy.
- Ekran pozostaje włączony (Wake Lock); w przeglądarce GPS działa tylko przy włączonym ekranie.
- Biegi zapisywane lokalnie (`runs`), trasa co 5. punkt.
- Filtrowanie GPS: punkty o dokładności > 25 m i prędkości > 11 m/s odrzucane.

## IQ – grafika v2 (2026-11-19)
- Scena: murawa z pasami koszenia, pełne linie (pola karne, bramkowe, łuki, punkty), bramki z siatką, niebo i mgła w oddali, miękkie cienie, tonowanie kolorów.
- Zawodnicy: sylwetki (nogi, spodenki, koszulka, ręce, głowa) z animacją biegu i obrotem w stronę ruchu; my – granat, koledzy – błękit, rywale – czerwień, bramkarz – żółty.
- Rozgrywka: ekran startowy z opisem sytuacji, licznik czasu, przerywana linia celowania z pulsującym pierścieniem i nazwą adresata, lot piłki po podaniu/strzale, płynna kamera.
- Wynik: tablica taktyczna (pasy, linie, linia spalonego, Twój wybór vs lepsza opcja z legendą) w karcie od dołu.
- NIE sprawdzone na telefonie (wydajność cieni i grafiki) – sprawdzone w przeglądarce bez GPU.

## IQ – sylwetki zawodników v3 (2026-11-19)
- Anatomia: biodro → udo → kolano → łydka → but (z podeszwą), bark → rękaw z mankietem → ramię → łokieć → przedramię → dłoń; szyja, głowa, uszy, włosy; tułów i spodenki z profilu (lathe).
- Strój: jedna drużyna = jeden strój (Ty: pierścień + numer 8), kołnierzyk, mankiety i opaski getrów w kolorze dodatków, numer na plecach; bramkarz – osobny strój i rękawice.
- Różne odcienie skóry i włosów; postawa: obrońca ugięte kolana, bramkarz gotowość; oddech w miejscu.
- Animacja: cykl biegu (udo, kolano, praca rąk ze zgiętym łokciem, pochylenie tułowia, podskok), kopnięcie przy podaniu i strzale; kamera bliżej zawodnika.
- Wydajność: geometrie i materiały współdzielone, cienie tylko z większych części; ok. 220 wywołań rysowania i 28 tys. trójkątów na klatkę.

## IQ – ruch nóg bez ślizgania (2026-11-19, plan A, punkty 1–5)
- Analiza na podstawie wyciągu „BallWise-Ruch-Animacje-Claude.zip" (zakres: aktualne IQ, main 312ce29). Zmierzone przed zmianą: stopa „stojąca” sunęła 2,7 m/s w truchcie i 8,4 m/s w biegu; maks. zgięcie kolana w podporze (odwrócona faza); stopa nigdy nie dotykała murawy (1,4–1,7 cm nad); próg 0,4 m/s bez przejścia.
- Nowe `src/iq/gait.ts` (czysta matematyka, testy w `gait.test.ts`): faza z przebytej drogi; stopa podporowa przesuwa się względem bioder z prędkością biegu (w świecie stoi); dwuczłonowa kinematyka odwrotna (biodro–kolano) do celu stopy; miednica z ułożenia nóg (dwa obniżenia na cykl, zawsze w zasięgu); wygładzona prędkość i płynne mieszanie bieg ↔ postawa; kolano w podporze lekko ugięte.
- Sylwetka: staw skokowy (but płasko w podporze), pochylenie tylko tułowia od bioder (grupa „upper”).
- Testy: przy 1,5–7 m/s stopa w podporze < 0,1 m/s względem ziemi i ±1 cm od murawy; start/zatrzymanie nie szybsze niż równy bieg; po zatrzymaniu stopy pod biodrami; IK trafia w cel.
- Parametry (kadencja, długość podporu, wysokość wymachu) to założenia wizualne, nie zweryfikowany model biomechaniczny.
- Następny krok (punkty 6–8): świat w trakcie lotu piłki, kopnięcie z kontaktem, prowadzenie piłki.

## IQ – postacie Mixamo, kopnięcie i piłka (2026-11-19, plan A punkty 6–8 + wymiana postaci)
- Powód: proceduralne „klocki" wyglądały jak z drewna. Przywrócone z historii repo (commit 4f05c9d) gładko oskórowane Mixamo „Beta" (`public/iq/player.glb`, 65 kości, ok. 4,9 tys. trójkątów) i klipy: bieg (w pliku), stanie, chód, podanie (`public/iq/*.json`, wartości zaokrąglone do 4 miejsc). NIE sprawdzone: warunki licencji Mixamo dla tej aplikacji – do weryfikacji przed publikacją.
- `src/iq/actorMath.ts`: wagi klipów wg prędkości (stanie → chód → bieg, płynnie), tempo klipu = prędkość / prędkość natywna (bieg 5,63 m/s, chód 1,75 m/s – zmierzone na stopie w podporze), podział ciała na części stroju wg kości i wysokości.
- `src/iq/actors.ts`: wczytanie modelu i klipów (klip chodu przerobiony na „w miejscu"), strój z wag części ciała z ostrymi granicami w shaderze (skóra, koszulka, spodenki, getry, buty, rękawice), włosy, numer na plecach, `SkinnedActor`, zapas proceduralny (gdy model się nie wczyta).
- Kopnięcie: zawodnik staje do celu, piłka podtacza się na miejsce kontaktu (przed prawą stopą), zamach z klipu podania, piłka opuszcza stopę w chwili kontaktu (0,43 s klipu ÷ 1,2 tempo), potem lot. Świat żyje podczas zamachu i lotu; ocena decyzji nadal z chwili naciśnięcia.
- Prowadzenie piłki: dotknięcie co ok. 1,8 m drogi, piłka płynnie dąży do pozycji, obraca się o dystans / promień; kierunek wygładzony (bez teleportów).
- Testy (`actors.test.ts`): zmierzone prędkości klipów zgodne ze stałymi (±3%); stopa w podporze stoi względem murawy po dopasowaniu tempa (±5%); kontakt w klipie podania w 0,43 s, palce na wysokości piłki; wysokość modelu ~1,8 m; wagi sumują się do 1.
- Wydajność (przeglądarka bez GPU): 59 wywołań rysowania i 57 tys. trójkątów na klatkę; zapas proceduralny: 217 wywołań. NIE sprawdzone na telefonie.
- Model „Beta" to manekin bez twarzy; przy kamerze gry nie jest to widoczne.

## IQ – kamera i sterowanie jak w samochodzie (2026-11-19, etap 1 z 3)
- Decyzje użytkownika: kamera obraca się razem z zawodnikiem; sterowanie „jak w samochodzie"; akcja ma się toczyć do rozstrzygnięcia (gol / strata / przechwyt); nauka: powtórka z góry z tablicą, „Co robić” w 3 krokach, kolejna próba z wariantem, postęp w Progresie; sytuacje złożone od początku, objaśnienia konkretne i krótkie.
- Etap 1 (ten): `src/iq/control.ts` – joystick do przodu: bieg przed siebie; w bok: skręt (prędkość kątowa, nie kierunek docelowy – dlatego kamera podążająca za kierunkiem nie powoduje biegania w kółko); do tyłu: zatrzymanie; kamera dogania kierunek zawodnika płynnie (po najkrótszym łuku); przed kopnięciem zawodnik staje do celu. Adresat podania wynika z kierunku, w który patrzy zawodnik.
- Etap 2 (następny): żywi koledzy i rywale – pressing, przechwyt, odbiór, kontratak (silnik symulacji z testami).
- Etap 3: nauka po akcji (powtórka, „Co robić”, wariant, Progres).

## IQ – żywi koledzy i rywale, akcja do rozstrzygnięcia (2026-11-19, etap 2 z 3)
- Scenariusz „Wyjście spod pressingu + kontratak": grasz #8 (środkowy pomocnik) z piłką na własnej połowie; dwóch napastników doskakuje, za nimi trzech pomocników i czterech obrońców. Trzy warianty ustawienia rywala (pressing 2 napastników, wysoki blok, niski blok) – kolejne próby zmieniają wariant.
- Silnik `src/engine/sim` (czysty TS, deterministyczny, 19 testów): 17 zawodników (Ty + 5 kolegów + bramkarz, 10 rywali).
  - Rywal bez piłki: najbliższy napastnik doskakuje (≈6,3 m/s), drugi stoi w cieniu toru do najbliższego wyjścia, pomocnicy zwężają i schodzą na krycie, obrońcy trzymają linię i nie schodzą głębiej niż 1,5 m za biegnącym napastnikiem.
  - Przechwyt: lot piłki jest próbkowany; obrońca, który zdąży (czas reakcji 0,22 s, jego prędkość), idzie na punkt przecięcia i przejmuje piłkę w promieniu 0,85 m.
  - Odbiór: rywal w promieniu 1,15 m od posiadacza przez 0,35 s (z boku/przodu; doganiając od tyłu 3× wolniej) odbiera piłkę; po zmianie posiadacza 1 s osłony (bez natychmiastowego odbioru).
  - Kontratak: trzech biegaczy w osobnych torach, trzymanych na linii spalonego; posiadacz niesie piłkę ku bramce, omija rywala bokiem, podaje do przodu tylko wolnym i nieprzechwytywalnym torem, strzela z ≤ 19 m. Szansa strzału z `shotChance` (dystans, blokada), wynik z ziarna (gol / obrona / niecelny).
  - Nasza drużyna: po stracie najbliższy zawodnik opóźnia (3,5 m przed posiadaczem na linii do bramki), reszta zamyka środek; z piłką: wyjścia na wolne pozycje, napastnik na linii spalonego, koledzy mogą podać do Ciebie (trzeci zawodnik).
  - Ty: sterujesz do końca akcji – podajesz (kontakt z piłką w klipie kopnięcia), strzelasz, a po stracie przez kilka sekund gasisz kontrę (ta sama reguła odbioru). Strata w trakcie zamachu anuluje podanie.
- Wynik: gol, obrona/niecelny (nasz lub rywala), odzyskanie piłki albo koniec czasu (16 s). Po akcji krótkie podsumowanie momentów (czas – zdarzenie); wnioski i powtórka w etapie 3.
- Pomoc przy odzyskiwaniu: czerwony pierścień pod rywalem z piłką i strzałka na ekranie pokazująca, gdzie jest piłka względem kamery.
- Założenia (nie dane meczowe): prędkości, czasy reakcji, progi odbioru i szanse strzałów to parametry prototypu do strojenia po testach z trenerem. NIE sprawdzone na telefonie (17 postaci z modelem Mixamo to ok. 83 tys. trójkątów na klatkę – obniżanie jakości jest automatyczne).
- `engine/iq.ts`: `laneBlocked` – obrońca za plecami podającego nie blokuje toru; `shotChance` wyeksportowane.

## Plan – bloki sesji, drugi trening dnia i karta ćwiczenia (2026-11-19)
- Problem (zgłoszenie użytkownika): karty w sesji siłowej wyglądały jak osobne sesje, nie było widać „drugiej” sesji dnia (trening klubowy) i nie było gdzie zobaczyć techniki ani tempa. Decyzje: lista z numerowanymi blokami; szczegóły po dotknięciu ćwiczenia (karta od dołu); animacja jako prosta pętla z linii.
- Bloki: `Block.title` w szablonach (siła: Aktywacja, Moc, Siła nóg + skok, Góra, Plecy i biodra, Dodatki; sprint i siła bez siłowni mają własne nazwy). Zapis trenera: `1)` = blok, `a) b) c)` = ćwiczenia w obrębie bloku. W sile podpis „Na zmianę: a → b” (założenie: para/trójka = naprzemiennie, np. siła + skok), w sprincie „Po kolei: a → b” (sekwencja w jednostce). Adaptacja (mniej serii, lżejsze ćwiczenia) zachowuje nazwy bloków.
- Dzień z treningiem klubowym: w arkuszu przełącznik „<sesja> | Klub”; karta klubu to na razie tylko informacja (treść treningu prowadzi trener klubu; planuję najwyżej dwa treningi dziennie). Dzień wyłącznie klubowy też da się otworzyć. DO USTALENIA: co ma być w karcie klubu (np. ocena trudności po treningu, godzina).
- Karta ćwiczenia (`src/exercises/`): animacja w pętli, wyjaśnione tempo (np. 4-1-x = „4 s w dół · 1 s pauza · w górę szybko”), intensywność (tylko tam, gdzie ma sens: skoki, sprinty, drille), 3 krótkie wskazówki. Dla każdego ćwiczenia z biblioteki (56) jest opis i animacja (test sprawdza komplet).
- Animacje: sylwetka z kresek (widok z boku), nogi i ręce liczone odwrotną kinematyką, więc stopy stoją tam, gdzie je ustawiono; 31 pętli (ćwiczenia o tym samym ruchu dzielą pętlę, np. pompki i ich warianty); kadr dopasowany do ruchu (4:3); „ogranicz ruch” w systemie = statyczna poza. Testy: długości członów, nic pod podłożem, zasięg nóg i rąk, ciągłość pętli, kadr obejmuje głowę.
- To uproszczenia, nie wzorcowe wideo: pozy ustawione ręcznie i sprawdzone wizualnie; niektóre warianty używają tej samej pętli co ćwiczenie bazowe (łydki siedząc = łydki stojąc, copenhagen = plank boczny, cod = hamowanie). Wskazówki i intensywność to teksty robocze (wiedza ogólna) – DO PRZEGLĄDU TRENERA. „Knee iso push” opisany ogólnie (izometryczny docisk kolana, 1 s) – notatki trenera nie mówią, jak dokładnie wygląda; do potwierdzenia.

## Fuel – plan dnia, szybkie dodawanie, woda, zakupy (2026-11-19)
- Powód (zgłoszenie użytkownika): ekran Fuel był pusty i mało użyteczny (dwa zera i trzy wiersze). Decyzje: ekran główny = plan dnia + szybkie dodawanie; dodawanie przez wyszukiwarkę (zdjęcie talerza – osobny krok); przykładowe posiłki z gramaturą; licznik wody; lista zakupów z planu.
- Ekran: dzień (mecz / dzień przed meczem / trening / lekki) z planu zawodnika, godzina startu do zmiany, trzy pierścienie (węglowodany, białko, woda) liczone względem planu dnia, karta „Teraz” (najbliższy niezjedzony posiłek, odliczanie, jedno dotknięcie „Zjedzone”), oś dnia (posiłki z godziną i celem; zjedzone ✓, pominięte wyszarzone), licznik wody (+ szklanka 250 ml), „Dodaj jedzenie”, dziennik z usuwaniem, lista zakupów, narzędzie „Przed i po wysiłku” (dawny ekran), cel żywieniowy.
- Silnik (`src/engine/mealplan.ts`, testy `fuel2.test.ts`): `buildDayPlan` układa posiłki wokół treningu/meczu (patrz docs/ZRODLA-FUEL.md, co jest z UEFA, a co orientacyjne), `scaleIdea`/`ideasFor` dobierają gramy przykładowych posiłków do celu (główne źródło węglowodanów + źródło białka; przy dużych celach dokładana bułka), pomysły obracają się z dniem i między posiłkami tego samego rodzaju, `shoppingList` sumuje składniki dni (3 dni / tydzień), `nextSlot`/`untilText` – „co teraz”.
- Baza produktów (`src/engine/foods.ts`): ok. 50 produktów z porcjami (sztuki, kromki, szklanki), wyszukiwanie bez polskich znaków i po synonimach.
- Sklepowe produkty: Open Food Facts przez serwerową trasę `/api/foods` (przeglądarka nie może pytać wprost – brak CORS); parsowanie z odrzucaniem niekompletnych/niemożliwych wpisów (`src/lib/off.ts`, testy). Bez internetu zostaje baza wbudowana.
- Dane lokalne: dziennik (`meals`, zgodny ze starym formatem), woda i godzina startu per dzień, ostatnie produkty, zaznaczenia zakupów. NIE synchronizowane z bazą.
- Do zrobienia: zdjęcie talerza (szacowanie wymaga usługi po stronie serwera i klucza API), tłuszcze/kalorie (celowo pominięte), alergie/dieta/budżet, przypomnienia o posiłkach (wymagają natywnej aplikacji).

## Fuel – cele zależne od sesji, tłuszcze, dane USDA (2026-11-19, kolejny krok)
- Decyzje użytkownika: cele zależne od liczby sesji i godzin; tłuszcze (trochę mniej/więcej zależnie od dnia); „Redukcja” usunięta; dalej: zdjęcie talerza i głos przez AI (serwer + klucz), tryb meczowy z listą do torby, zdjęcie lodówki.
- Dzień z dwoma treningami (klubowy + indywidualny): dwie godziny do ustawienia, posiłki przed/po każdym (gdy są blisko – posiłek po pierwszym służy też jako przed drugim), wyższy cel węglowodanów, białko bez zmian, tłuszcz 22% energii.
- Cztery pierścienie: węgle, białko, tłuszcz, woda. Posiłki mają cel tłuszczu (wokół wysiłku mało); brakujący tłuszcz uzupełnia źródło dobrane do posiłku (śniadanie: orzechy/masło orzechowe, obiad: oliwa/awokado). Lista zakupów ma grupę „Tłuszcze”.
- Baza produktów z USDA (CC0) z tłuszczami i numerami pozycji; Open Food Facts z tłuszczem (gdy jest).
- Do zrobienia (po decyzji prawnej i kluczu API): zdjęcie talerza z AI, głos z AI do ulubionych posiłków i produktów, tryb meczowy z torbą, zdjęcie lodówki.
