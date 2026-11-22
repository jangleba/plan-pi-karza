# Własna jednostka (trening poza aplikacją)

Stan na 2026-11-22. Zawodnik wpisuje na Starcie („Własna jednostka” → „Dodaj”), co zrobił sam: siła, bieg, piłka, rower, basen, spacer, sauna, inne. Wybiera dzień (dziś, wczoraj, 2 dni temu), czas (koło co 5 min, do 4 h) i wysiłek (lekko, średnio, mocno, bez wpisywania liczb).

## Jak to wpływa na plan
- Obciążenie jednostki = minuty × wysiłek (3 / 5 / 8, jak w sRPE) × waga rodzaju (siła, bieg, piłka, inne 1; rower 0,8; basen 0,7; spacer 0,5; sauna 0,25). `src/engine/extra.ts`.
- Obciążenie „ostre” na dziś = dzisiejsze + 0,6 × wczorajsze + 0,3 × przedwczorajsze, razem z sesjami z aplikacji zapisanymi jako wykonane (szacunek: siła 330, bieg 300, sprint 200, technika 200, aktywacja 80, regeneracja 60).
- Suwak wysiłku 1–10 (1–3 lekko, 4–6 średnio, 7–10 mocno); wysiłek zastępuje dawne trzy poziomy słowne.
- Od 450 pkt: regeneracja w check-inie spada o 1. Od 900 pkt: o 2 i włącza się „dziś mniej”. Samopoczucie (odpowiedź zawodnika) zostaje bez zmian.
- Dalej działa dotychczasowa logika: pierścień gotowości, lżejsza sesja (mniej serii, lżejsze ćwiczenia), propozycja regeneracji zamiast sesji. Na Starcie zawodnik widzi jedno zdanie, dlaczego plan jest lżejszy.
- Spacer, sauna i krótki basen zwykle nie dochodzą do progu, więc plan się nie zmienia.

## Do przeglądu trenera
Wagi rodzajów, mnożniki dni, progi 450 / 900 i szacunki sesji z aplikacji są umowne. Trening klubowy i mecz nie są wpisywane automatycznie: zawodnik może je dodać jako „Piłka”.

## Dane
Zapis lokalny (`extras`, 120 dni), jak zgłoszenia „nie mogę trenować”; bez synchronizacji z chmurą. Klucz jest na liście danych gościa przenoszonych na konto.

## Cały tydzień (2026-11-22)
Suma obciążenia od poniedziałku do dziś (własne jednostki + wykonane sesje z aplikacji): od 2200 pkt „ciężki tydzień”, od 3200 „bardzo ciężki”. W bieżącym tygodniu `planWeek` robi wtedy z kolejnych dni (po dniu zgłoszenia) lżejsze wersje siły, biegu i sprintu, a przy „bardzo ciężkim” pierwszy wolny dzień (bez meczu i niedostępny) zamienia w regenerację. Zawodnik widzi to w ostrzeżeniu planu i po zapisie jednostki. Progi do przeglądu trenera.

## Wygląd Startu
Pierścień gotowości obok tekstu, pod nim siatka 2×2 kafelków (Własna jednostka z dużym plusem, Dziś w planie, Cel, Piłkarski angielski) wjeżdżających po kolei. Dodawanie w trzech krokach (rodzaj, czas, suwak wysiłku) z animacją i potwierdzeniem.
