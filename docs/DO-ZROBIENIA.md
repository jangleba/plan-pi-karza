# Do zrobienia (stan na 2026-11-18)

## Wygląd – priorytet wskazany przez użytkownika
- Obecny wygląd jest za bardzo kolorowy i za mało profesjonalny.
- Cel: stonowana paleta, elegancja; małe, delikatne szkice (ilustracje liniowe) dla każdej zakładki oraz lekkie elementy w tle.
- Kolory znaczeniowe (zielony, żółty/pomarańczowy, czerwony) zostają, ale subtelniej i tylko tam, gdzie niosą informację.

## IQ – dokończyć
- Zasady oceny do przeglądu przez użytkownika: docs/ZRODLA-IQ.md. Najpierw dośrodkowanie, potem 1 na 1 i kiwnięcie, 11 na 11 z pressingiem, strzał po dograniu.
- Poziomy trudności: mniej czasu na decyzję i więcej zawodników.
- Test prototypu na telefonie (wydajność) – po stronie użytkownika.

## Pozostałe
- Supabase: klucze, migracja 0001_init.sql, synchronizacja historii, Labu i Fuel.
- Lab: automat wykrywania odbicia/lądowania (model pozy) – czeka na nagranie CMJ.
- Do przeglądu przez trenera: dawki biegowe, drabinki bez siłowni, szkice techniki, zamienniki ćwiczeń, progi poziomu.

## Wygląd – wdrożone (2026-11-18)
- Paleta ciepły beż i grafit, stonowane kolory znaczeniowe, cienkie obramowania zamiast cieni.
- Cienkie szkice liniowe w nagłówku każdej zakładki (`src/Sketch.tsx`), w pustych stanach i ledwo widoczny wzór boiska w tle.
- Do dopracowania po Twojej ocenie na telefonie: rozmiar i charakter szkiców, siła tła, kolory kostek na boisku (wciąż nasycone, bo muszą się różnić).

## Lovable: podgląd (2026-11-18)
- Przyczyna „Couldn't update the preview": projekt Lovable jest z szablonu TanStack Start (`.lovable/project.json`), a nowa aplikacja była zwykłym Vite bez `@lovable.dev/vite-tanstack-config`.
- Naprawa: przywrócony szablon (TanStack Start, konfiguracja Lovable, wersje paczek jak w ostatniej działającej wersji, bun.lock). Aplikacja renderowana tylko w przeglądarce (`ClientOnly`).
- Nie usuwać `.lovable/project.json`, `vite.config.ts` z konfiguracją Lovable ani `bun.lock`.
- „Not Found" w podglądzie: Lovable otwierał zapamiętany adres starej aplikacji (np. /start). Trasa `src/routes/$.tsx` pokazuje aplikację pod każdym adresem.
- Przepływ pracy: PR-y scalane przez „Squash and merge"; przed każdym nowym PR gałąź jest synchronizowana z main, żeby nie było konfliktów.

## Onboarding (2026-11-18)
- Kroki: powitanie → O Tobie (imię, wiek, masa, pozycja) → Sezon i cel (moment w sezonie, cel, poziom rozgrywek) → Trening (staż, sprzęt, mało dni na siłownię) → Twój tydzień (dni klubowe, mecz/sparing).
- Wpływ na silnik: sezon (przygotowawczy: sparingi opcjonalne, sesja z celu obowiązkowa; w sezonie: MD-x, sesja z celu gdy jest wolny dzień; przerwa: 1× siła, 1× lekki bieg, 1× lekki sprint; mecz (np. towarzyski) można zaznaczyć w każdym okresie), cel (szybkość +sprint, siła +siła, wydolność +bieg, powrót: 2 pierwsze tygodnie rozładowania).
- DO USTALENIA: wpływ poziomu rozgrywek (polskie ligi) na silnik – na razie tylko zapis w profilu.
- Do doprecyzowania z użytkownikiem: szczegóły meczu/sparingów w okresie przygotowawczym.

## Lab – nagrywanie i automat (2026-11-19)
- Wdrożone: karta testu od dołu z krótką instrukcją (3 punkty) → „Nagraj skok/sprint" → kamera tylna, wymagana orientacja (CMJ pionowo, sprint poziomo – w Safari nie da się jej wymusić, więc aplikacja prosi o obrót), odliczanie 5 s, nagranie (CMJ kończy się samo po 6 s).
- CMJ automatycznie: model pozy MediaPipe (w telefonie, wideo nie wychodzi z urządzenia) → pozycja stóp w każdej klatce → wykrycie lotu (parabola przecięta z poziomem podłoża) → wysokość i dokładność ±cm na klatkę; „Popraw ręcznie" zawsze dostępne.
- Czas lotu nie zależy od odległości telefonu (testy na symulacji). NIE sprawdzone na prawdziwych nagraniach ludzi – wymaga testu na telefonie.
- Przeglądarka na iPhonie: zwykle do 60 kl./s (±ok. 2 cm na klatkę przy CMJ 30 cm). 240 kl./s tylko w wersji iOS.
- ZABLOKOWANE: wersja natywna iOS (240 kl./s, gotowa wtyczka w historii: native/ballwise-camera w 4f05c9d) – użytkownik nie ma Maca; darmowe konto Apple.
- DO ZROBIENIA: skok w dal z wideo ze znacznikiem 1 m (kalibracja), automatyczny sprint (start na sygnał, meta z ruchu tułowia).

## Wygląd niebieski i onboarding v2 (2026-11-19)
- Paleta: pastelowy błękit → granat (gradient na przyciskach głównych, pierścieniu i wybranych opcjach), klub na zielono.
- Onboarding bez przewijania (sprawdzone przy wysokości 520 px), liga z listy od dołu, kalendarz tygodnia: wolny / klub / mecz / brak (dzień niedostępny – silnik nie układa w nim treningów), zawsze „Mecz", nie „Sparing".
- Animacje: przesuwanie kroków (dalej z prawej, wstecz z lewej), „podskakujące" wybory, animowany szkic na każdym kroku, ekran przejścia „Układam Twój tydzień" i płynne wejście na Start.
- 2026-11-19 (poprawka): bez gradientów. Tło złamana biel (#f7f8fa), karty białe, tekst grafit, główne przyciski grafitowe, zaznaczenia w bardzo jasnym błękicie (#e8f1fc, tekst #2f6fb3, cienka obwódka), klub jasnozielony.

## Onboarding v3 (2026-11-19)
- Bez wpisywania liczb: koła jak w iOS (wiek, masa, staż); duże kafle wyboru na całą szerokość z animacją i znacznikiem (✓ lub kolejność 1/2).
- Kroki: O Tobie → Na boisku (pozycja, „jak czujesz się teraz" – za wolny / pojedynki / brak pary) → Jak chcesz się czuć? (cel główny i dodatkowy, podpowiedziane z odpowiedzi) → Sezon → Trening → Twój tydzień.
- Silnik: drugi cel dodaje sesję tylko, gdy zostanie wolne miejsce (bez ostrzeżeń).
- „Jak czujesz się na boisku?" wraca na Starcie co 5 tygodni; Progres pokazuje zmianę (pierwsza vs ostatnia odpowiedź).
- Pytanie o stres/pewność siebie celowo pominięte (decyzja użytkownika).

## Dopracowanie całości (2026-11-19)
- Płynność: IQ nie aktualizuje stanu Reacta w każdej klatce; jakość grafiki obniża się sama, gdy telefon nie wyrabia (najpierw rozdzielczość, potem cienie); brak renderowania w ukrytej karcie przeglądarki; brak tworzenia obiektów w pętli kamery.
- Karty od dołu (wspólny komponent): przeciągnięcie uchwytu w dół zamyka, animowane zamykanie, blokada przewijania tła, bezpieczny margines dołu (iPhone). Okno sesji przeniesione na wspólną kartę.
- Pasek zakładek z ikonami liniowymi (styl SF Symbols), rozmyte tło; zwijany nagłówek po przewinięciu (jak w iOS); płynne przejście między zakładkami; szkielet ładowania IQ.
- Progres w nowym stylu (pigułki trendu, legenda, metryki bez pomiarów w jednej liście); Start na wspólnych wierszach; liczba gotowości „dolicza się".
- Detale: brak „gumki" strony, zaznaczenie i fokus w kolorze akcentu, kursor w akcencie, przycisk „Zapisz wynik" aktywny dopiero po wpisaniu wyniku.
