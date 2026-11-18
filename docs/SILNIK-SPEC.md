# Ballwise – silnik planu (specyfikacja robocza)

Silnik = czysty, deterministyczny TypeScript (bez AI). Ten sam wynik dla tych samych danych, każda zmiana ma wyjaśnienie.

## Użytkownik i wejście
- Zawodnik amator/młodzieżowy, 16+, bez trenera.
- Dane: wiek, pozycja (wpływ tylko lekki, w akcentach), poziom (z wieku i stażu treningowego), sprzęt (pełna siłownia / masa ciała / bieżnia-boisko-teren), historia sesji, check-in.

## Tydzień
- Oś: data meczu. Jeden mecz w tygodniu, czasem dwa.
- Minimum tygodnia: 1 siła, 1 bieganie, 1 sprint. Brak maksimum – wszystko dopasowane do tygodnia i zawodnika.
- Moduły: siła (siłownia / bez), sprint, bieganie (ciągły, interwały, fartlek, szybkość wytrzymałościowa meczowa), technika z piłką (osobna sesja), regeneracja (osobna krótka sesja).
- Dni klubowe: zawodnik zaznacza w tygodniu.

## Reguły dni meczowych
| Dzień | Zasada |
|---|---|
| MD-3 | Ostatnia mocna siła |
| MD-2 | Bieganie wytrzymałościowe / interwały |
| MD-1 | Aktywacja, lekki sprint lub technika z piłką. Bez mocnej siły i mocnego biegania |
| MD | Dzień meczu. Zawodnik wpisuje minuty i samopoczucie |
| MD+1 | Regeneracja (osobna krótka sesja). Wyjątek: siła pełna dla zaawansowanych i dla mających mało dni na siłownię; mniej zaawansowani – tylko góra |
| MD+2 | Zasady ogólne |
| MD-4 i dalej | Dowolne sesje, tylko zasady ogólne |
| Dwa mecze w tygodniu | Krótszy cykl, tylko lekkie sesje |

## Zasady ogólne
- Nie dwie takie same sesje dzień po dniu (siła, bieganie, sprint).
- Max 2 treningi dziennie: klubowy + 1 indywidualny. Trzech nie ma.
- Dzień klubowy nie blokuje treningu indywidualnego.

## Check-in
- Czynniki: słaby sen, złe samopoczucie, mało czasu, „dziś mniej".
- Czas sesji nie jest parametrem; zmieniają się ćwiczenia i liczba serii.
- Lekko: mniej serii i lżejszy ciężar. Mocno: inne, lżejsze ćwiczenia.
- Ból/kontuzja: tylko komunikat.

## Progresja i dziennik
- Siła: zawodnik wpisuje ciężar na ćwiczenie; silnik daje lekką sugestię dodania, którą można odrzucić.
- Bieganie i sprint: progresja automatyczna z wyniku (dystans, czas, tempo).
- Pomiar biegu: docelowo mapa GPS jak w Stravie (osobny etap, natywnie/import); silnik dostaje tylko wynik.

## Wyjście
- Plan tygodnia + szczegółowa sesja (ćwiczenia, serie, powtórzenia, przerwy), z wbudowanej biblioteki ćwiczeń.

## Ustalenia – sesje siłowe (runda 2)
- Źródło: `docs/SESJE-SILOWE-TRENERA.md` (na start to wszystkie sesje). Kolejne ćwiczenia dodawane później.
- Silnik łączy 3 tryby: gotowe szablony sesji, biblioteka ćwiczeń + reguły składania, szablony z podmianami (zamienniki, check-in).
- Zmiana planu treningowego (faza) co 4–5 tygodni.
- Skracanie: mniej serii albo ćwiczenia mniej obciążające OUN i stawy.
- Bez siłowni: osobna lista ćwiczeń z progresją trudności.
- Zamiana ćwiczenia w trakcie sesji: „idealny zamiennik" (ta sama partia, wzorzec ruchu, dostępny sprzęt).
- Przeniesienie opuszczonej sesji: dopasowane do celu i tygodnia, z zachowaniem reguł MD-x.
