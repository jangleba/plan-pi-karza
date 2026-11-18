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
