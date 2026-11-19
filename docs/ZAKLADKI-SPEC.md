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
