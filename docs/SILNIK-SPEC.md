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

## Ustalenia – runda 3
- Mezocykl 4–5 tyg.: fale objętość → intensywność → rozładowanie.
- 1RM wyliczany z ciężaru i powtórzeń (bez testu).
- Dobór ćwiczeń lżejszych dla OUN/stawów oparty na badaniach; ukryty przed zawodnikiem (tagi wewnętrzne, dopasowanie automatyczne).
- Wpis: kg tylko przy ćwiczeniach siłowych. Plyo/skoki – progresja automatyczna (drabinka trudności) z rosnącym poziomem.
- Poziom zawodnika rośnie z kombinacji stażu i wyników.
- Profil: masa ciała (bez wzrostu).
- Platforma: podgląd w Lovable (web), docelowo iOS (Capacitor).

## Sprint (runda 4)
- Źródło: `docs/SESJE-SPRINT-TRENERA.md`. Kolejność: skipy → przejścia → drille techniczne → przyspieszenia → prędkość maksymalna → akcesoria wg celu (hamowanie, łuk, COD, plyo).
- Bez partnera. Szukanie partnera – późniejsza funkcja.
- Cel zawodnika w sprincie (akcesoria): zmiana kierunku i hamowanie. Powtarzalne sprinty meczowe należą do modułu wytrzymałości, nie sprintu.
- Drille techniczne: stały zestaw na mezocykl (4–5 tyg.), potem zmiana.
- Objętość sprintu w tygodniu = metry szybkich biegów.
- Pomiar sprintu telefonem (czas + dystans → prędkość): do zbadania wykonalność (patrz „Do sprawdzenia").

## Do sprawdzenia
- Czy telefon nadaje się do pomiaru czasu/dystansu sprintu 15–30 m (GPS 1 Hz jest zbyt zgrubny; alternatywy: pomiar z wideo, ręczny wpis czasu).

## Bieganie i MAS (runda 5)
- Brak gotowych jednostek biegowych. Dwie główne formy: bieg ciągły i interwały (fartlek i szybkość wytrzymałościowa meczowa jako dodatki).
- Dawkowanie na bazie MAS (maximal aerobic speed). Test: bieg 5-minutowy; MAS = dystans / 300 s (m/s; km/h = m/s x 3,6).
- MAS liczony jednorazowo (kalkulator w aplikacji, automatycznie), powtarzany co 8–10 tygodni (dwa cykle po 4–5).
- Z MAS silnik wylicza tempo, dystans i intensywność sesji.
- Konto wymagane (logowanie). Pierwszy etap: silnik + prosty ekran tygodnia.

## Wygląd
- Styl Apple: basic, modern, minimalistyczny, elegancki, prosty. Ogólnie pastelowy i subtelny.
- Kolory znaczeniowe (pastelowe): czerwony, żółty, zielony.
- Test MAS i biegi: aplikacja z GPS odczytuje dystans i od razu liczy MAS; gdy się nie da, zawodnik wpisuje dystans ręcznie. Mapa jak w Stravie, wewnątrz treningów biegowych (etap natywny/iOS).
- Supabase: nowy projekt, klucze poda użytkownik.
