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
| MD+1 | Regeneracja (osobna krótka sesja). Wyjątek: siła pełna dla zaawansowanych i dla mających mało dni na siłownię; mniej zaawansowani – tylko góra. Siła dzień po meczu to **ostatnia opcja** i planujemy ją tylko przy stażu siłowym **od 2 lat** (próg umowny, do przeglądu trenera) |
| MD+2 | Zasady ogólne |
| MD-4 i dalej | Dowolne sesje, tylko zasady ogólne |
| Dwa mecze w tygodniu | Krótszy cykl, tylko lekkie sesje |

## Zasady ogólne
- Nie dwie takie same sesje dzień po dniu (siła, bieganie, sprint).
- Max 2 treningi dziennie: klubowy + 1 indywidualny. Trzech nie ma.
- Dzień klubowy nie blokuje treningu indywidualnego.

## Gdzie i kiedy zawodnik może ćwiczyć siłę
- Onboarding pyta, gdzie można ćwiczyć: siłownia, boisko, bieżnia, własny ciężar (do wyboru kilka).
- „Na siłownię tylko kilka razy w tygodniu” (pytanie pojawia się tylko, gdy zaznaczono siłownię) wymaga wskazania dni (`gymWeekdays`). Silnik planuje siłę **wyłącznie** w te dni; gdy żaden dozwolony dzień nie pasuje do reguł MD-x, siła nie jest wciskana na siłę – pojawia się ostrzeżenie.
- Starszy profil z „mało dni na siłownię” bez wskazanych dni działa jak dotąd (każdy dzień).
- Check-in „Dziś nie zrobię siły” (oraz „Nie zrobię siły tego dnia” przy sesji w planie): siła z tego dnia jest przekładana na pierwszy dozwolony dzień **nie wcześniejszy niż dzień zgłoszenia**, w kolejności MD-3 → dzień wolny → MD+2 → dzień po meczu (tylko przy stażu od 2 lat i dniu z siłownią). Przełożona sesja ma w opisie, skąd pochodzi. Zgłoszenie można cofnąć w planie („Cofnij”).
- Wynik zależy wyłącznie od zgłoszeń i profilu (nie od „dzisiaj”), więc przełożona siła nie zmienia miejsca w kolejnych dniach. Zgłoszenia są zapisywane tylko na urządzeniu (klucz `strengthBlocked`).

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

## Wdrożone (runda 6)
- Bieganie z MAS: objętość = interwały długie (90% MAS), intensywność = 15/15 (105%), rozładowanie lub mocny check-in = bieg ciągły 65%. Bez wyniku MAS ekran pokazuje test 5 min. Wartości robocze do przeglądu.
- Wpis wykonania: jeden przycisk „Koniec sesji". Sugestia kg tylko po sesji (do zrobienia).
- Kolejny tydzień pojawia się dopiero po dacie meczu (do zrobienia).

## Onboarding i profil (wdrożone)
- Pola: wiek (16+), staż siłowy, masa, pozycja, sprzęt, dni klubowe, dni meczu (maks. 2), „mało dni na siłownię". Zapis lokalny (do czasu logowania).
- Poziom ze stażu i wieku: progi TYMCZASOWE (staż <1 / 1–3 / >3 lat, 16–17 lat o stopień niżej) – do ustalenia.
- Pozycja i sprzęt są zapisane w profilu, ale silnik jeszcze z nich nie korzysta.

## Dziennik kg i sugestia (wdrożone)
- Wpis kg per ćwiczenie siłowe; „Koniec sesji" zapisuje i pokazuje propozycje na następną sesję (Przyjmij / Zostaję).
- 1RM szacowany wg Epleya z kg i zaplanowanych powtórzeń; przy ćwiczeniach z %1RM pokazuje ≈ kg.
- Sugestia: +2,5% dolne partie/moc, +1,25 kg góra; bez dodawania przy gorszym check-inie i w tygodniu rozładowania.
- Pozycja wpływa tylko na treningi boiskowe i lekko na biegowe, NIE na siłownię (do wdrożenia).

## Cykl i logowanie (wdrożone częściowo)
- Numer tygodnia w cyklu 5-tygodniowym liczony od daty rozpoczęcia (`profile.startDate`).
- Logowanie e-mail + hasło (Supabase) włącza się, gdy ustawione są `VITE_SUPABASE_URL` i `VITE_SUPABASE_PUBLISHABLE_KEY`; bez nich aplikacja działa lokalnie.
- Schemat bazy: `supabase/migrations/0001_init.sql` (profil, testy MAS, dziennik kg, check-iny; RLS po `auth.uid()`).
- Do zrobienia: synchronizacja profilu, MAS, dziennika i check-inu z bazą (dziś nadal localStorage).

## Synchronizacja (kod gotowy, NIEPRZETESTOWANA z prawdziwą bazą)
- Local-first: zapis lokalny, potem cichy zapis do Supabase (`src/lib/sync.ts`); po zalogowaniu pobranie profilu, MAS, dziennika kg i dzisiejszego check-inu.
- Mapowanie wierszy ma testy (`src/lib/sync-map.test.ts`); zapytania sieciowe wymagają kluczy i migracji `0001_init.sql`.
- Check-in dnia zapisuje się lokalnie i przetrwa odświeżenie strony.

## Luki silnika zamknięte (runda 7)
- Siła bez siłowni: drabinki trudności (docs/BEZ-SILOWNI.md), wybierane, gdy w profilu brak „pełnej siłowni".
- Pozycja: wpływa tylko na sprint (skrzydłowy/napastnik – prędkość, pozostali – przyspieszenie i COD, co 2. tydzień zamiana), lekko na bieganie (pomocnik +1, bramkarz −1 powtórzenie) i na dobór ćwiczeń z piłką. NIE na siłę.
- Plan uwzględnia mecze z sąsiednich tygodni (poprawne MD+1/MD-1 na granicy tygodni).
- Kolejny tydzień odblokowuje się po dacie ostatniego meczu bieżącego tygodnia.
