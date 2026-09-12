# BallWise — pełna macierz QA produktu

Cel: udowodnić działanie, a nie tylko brak błędu kompilacji. Każda pozycja ma wynik
`PASS`, `FAIL`, `BLOCKED` albo `NOT APPLICABLE` i dowód: test automatyczny, nagranie
urządzenia, zrzut, log lub zapytanie kontrolne bazy.

## Bramka wydania

Wydanie jest dozwolone dopiero, gdy:

- typecheck, testy, lint i build są zielone;
- nie ma błędu P0/P1;
- wszystkie migracje i Edge Functions są wdrożone i zweryfikowane;
- każda rola/wiek przechodzi E2E;
- generator spełnia niezmienniki bezpieczeństwa dla całej macierzy;
- Football IQ ma zatwierdzoną treść dla wszystkich deklarowanych pozycji;
- Fuel ma przegląd dietetyka sportowego;
- StoreKit i GPS przechodzą test na prawdziwych urządzeniach;
- prawnik i operator podpisują finalne teksty prawne.

## 1. Generator LoadWise

### Automatyczna przestrzeń wejść

| Wymiar | Wartości |
|---|---|
| Pozycja | goalkeeper, defender, midfielder, forward |
| Poziom | beginner, intermediate, advanced, elite |
| Cel | speed, strength, endurance, power, agility, general, mobility, return, matchready |
| Wiek/granica | 13, 15, 16, 17, 18, 20+ oraz dzień przed/po urodzinach |
| Tydzień bloku | 1–12, obowiązkowo 1, 4, 5, 8, 9, 12 |
| Faza | offseason, preseason, inseason, transition, return_injury |
| Klub | 0–5 dni, układy dzień po dniu i naprzemienne |
| Mecz | brak, MD, MD-1, MD+1, dwa mecze, termin stały/niestandardowy |
| Dostęp | dni niedostępne, siłownia, boisko, przestrzeń sprintowa, sprzęt |
| Zdrowie | zgoda tak/nie, ból tak/nie, readiness niski/średni/wysoki |
| Podwójne sesje | no, light_only, yes_if_safe |

Dodany test `allProfilesSmokeMatrix.test.ts` pokrywa wszystkie 4 × 4 × 9 kombinacji
pozycja/poziom/cel w tygodniu 1 i 5, naprzemiennie zmieniając wiek, zgodę zdrowotną,
obciążenie klubowe i dostęp do sprzętu. To smoke matrix, nie zastępstwo walidacji
sportowej.

### Niezmienniki, które muszą zawsze przejść

1. Maksymalnie dwie sesje dziennie.
2. Brak drugiej sesji w dzień meczu i MD-1.
3. MD+1 to regeneracja, nie ciężki bodziec.
4. Zobowiązanie klubowe i mecz nie są usuwane ani przemianowywane na własny trening.
5. Klub liczy się do obciążenia, ale nie zastępuje wymaganych minimów BallWise.
6. RSA jest wydolnością, nie sprintem i nie spełnia minimum szybkości.
7. Całkowity sprint jakościowy nie przekracza 240 m.
8. Brak niedostępnego sprzętu i sesji w dniu całkowicie niedostępnym.
9. `return_injury` nie tworzy agresywnej progresji ani komunikatu medycznego.
10. Bez zgody zdrowotnej brak odczytu/zapisu readiness; plan jest konserwatywny.
11. Ten sam profil i data dają identyczny wynik.
12. Tydzień 5 nie traci sesji ani minimum przez błędny offset bloku.

## 2. Football IQ

### Stan faktyczny

- ekran używa biblioteki `simulation/SIM_SCENARIOS`, nie starej biblioteki
  `IQ_SCENARIOS`;
- obsługiwane są: goalkeeper, defender, midfielder, forward;
- bramkarz ma osobną bibliotekę 36 wariantów: 9 rodzin decyzji × poziomy L2–L5;
- profil bramkarza dostaje dokładnie 9 wariantów przypisanych do swojego poziomu,
  bez scenariuszy zawodników z pola;
- część scenariuszy ma `status: draft`;
- cel produktu 144 sytuacje (36 na każdą z 4 pozycji, poziomy L2–L5) nie jest osiągnięty.

Implementacja bramkarza nie jest już luką techniczną. Każda z 9 rodzin opiera się
na wskazanym materiale FIFA Training Centre, ale przed deklaracją jakości sportowej
w produkcji nadal wymagany jest udokumentowany przegląd trenera bramkarzy. Marketing
„144 sytuacje” pozostaje **BLOCKED**, dopóki cała biblioteka nie osiągnie tego zakresu.

### Kontrola każdej mikrosymulacji

- unikalne ID, tytuł, brief, temat, pozycja i kontekst;
- dokładnie określony status źródłowy; `sourced` ma działające źródło;
- aktor `self`, piłka i wymagani rywale/partnerzy;
- wszystkie klatki `t` w 0–1, `x` w 0–100, `y` w 0–140;
- co najmniej jedno osiągalne okno czasu, strefa, reakcja i akcja;
- każda reakcja ma wynik dla akcji i istniejącą lepszą alternatywę;
- oceny deterministyczne, bez losowej zmiany poprawnej odpowiedzi;
- alternatywa zależy od reakcji rywala i nie jest zawsze tą samą odpowiedzią;
- timeout, wielokrotne kliknięcie, pauza karty, zmiana scenariusza i replay;
- VoiceOver opisuje kontekst i wybory bez wymagania samego koloru/animacji;
- zmniejszony ruch ma statyczny odpowiednik;
- brak punktów za dotknięcie poza aktywną strefą.

Dodany test `libraryIntegrity.test.ts` sprawdza spójność techniczną całej aktywnej
biblioteki. Ocena merytoryczna pozostaje zadaniem eksperta.

## 3. FuelWise

### Macierz automatyczna

Pełny iloczyn wejść silnika:

- 7 typów jednostki: match, strength, speed, endurance, football, recovery, none;
- 3 intensywności;
- 3 porcje;
- 5 zakresów czasu;
- 2 tryby „Mam tylko to”.

To 630 kombinacji na jeden rozpoznany posiłek; test wykonuje wynik dwukrotnie, więc
kontroluje także determinizm. Dodatkowo istnieją testy parsera, braku węglowodanów,
ciężkiego posiłku, szybkiego węglowodanu i nierozpoznanego tekstu.

### Testy treści do wykonania z dietetykiem

- zawodnik 13–15, 16–17 i dorosły;
- mecz rano, po południu i wieczorem;
- wysiłek <30, 30–60, 60–120, 120–240 i >240 min;
- posiłki polskie, wegetariańskie, bez laktozy/glutenu i ograniczenia alergiczne;
- kofeina/energetyki: osobne bezpieczne zasady dla małoletnich;
- odwodnienie i bardzo długi wysiłek;
- pusty wpis, literówki, wiele nierozpoznanych produktów i sprzeczne dane;
- komunikat nie diagnozuje, nie zawstydza i nie obiecuje wyniku sportowego;
- restrictions faktycznie blokują niewłaściwe rekomendacje — jeśli nie, jest to P0.

## 4. Bieganie i GPS

| Przypadek | Oczekiwany wynik |
|---|---|
| Pierwsza zgoda | GPS startuje dopiero po kliknięciu i po zgodzie systemowej. |
| Odmowa | Jasny komunikat i import GPX/ręczna alternatywa. |
| Słaby sygnał | Brak fałszywego ukończenia; odrzucenie <2 punktów lub <50 m. |
| Pauza/wznowienie | Pauza nie nalicza czasu i nie tworzy skoku dystansu. |
| Blokada ekranu | Zachowanie zgodne z zadeklarowanym trybem; brak obietnicy, jeśli iOS zatrzyma web. |
| Ubicie procesu | Brak uszkodzonego zapisu i komunikat o utracie biegu. |
| 5-min MAS | Dokładnie aktywne 5 min; niewiarygodny wynik nie aktualizuje profilu. |
| Prywatność | Ruch sieciowy nie zawiera punktów `lat/lng`; DB ma tylko wynik agregowany. |
| RLS | Konto A nie odczyta, nie zmieni i nie usunie wyniku konta B. |

## 5. Konto, zgody i prywatność

- rejestracja, potwierdzenie e-mail, logowanie, wylogowanie;
- reset hasła: prawidłowy link, wygasły link, ponowne użycie, inne urządzenie;
- zgoda health_data odmówiona/udzielona/cofnięta;
- consent log append-only także przez bezpośrednie wywołanie API;
- opiekun: błędny token, cudzy token, wygasły token, replay;
- granice wieku i przekazanie konta;
- eksport danych jest kompletny i nie zawiera danych innego użytkownika;
- usunięcie konta czyści Auth, tabele i obiekty Storage oraz wyjaśnia backupy;
- błąd sieci w połowie usuwania nie pozostawia aktywnego konta z częściowo usuniętymi danymi;
- aktualna subskrypcja: użytkownik dostaje instrukcję anulowania niezależnie od usunięcia konta.

## 6. Mecz i sesje

- zaplanowany mecz można rozpocząć tylko w dozwolonym stanie;
- dwa kliknięcia Start nie tworzą dwóch logów;
- stan `started` przeżywa odświeżenie i zmianę urządzenia;
- zakończenie zapisuje duration i status dokładnie raz;
- nie można zakończyć meczu innego użytkownika;
- anulowanie/ominięcie nie liczy jako ukończenie;
- strefa czasowa i przejście północy nie przypisują meczu do złej daty.

## 7. Testy iPhone i App Store

Urządzenia minimalne: mały obsługiwany iPhone i duży współczesny iPhone; aktualny i
poprzedni wspierany iOS. Testy:

- instalacja/aktualizacja/czysty start;
- cold start, wolna sieć, offline, powrót online, wygaśnięcie sesji;
- wszystkie uprawnienia: allow/deny/limited i późniejsza zmiana w Settings;
- Dynamic Type, VoiceOver, kontrast, landscape jeśli wspierany;
- klawiatura nie zasłania pól i przycisków;
- zakup sandbox, próba, odnowienie, anulowanie, refund, billing retry, restore;
- deep link resetu hasła i link opiekuna;
- usunięcie konta;
- brak pustych ekranów, debug tekstu, placeholderów i niedziałających URL-i;
- App Privacy zgodne z przechwyconym ruchem sieciowym.

## 8. Priorytet napraw

1. P0: operator/prawo, natywna aplikacja, StoreKit, produkcyjne wdrożenie i E2E.
2. P0: ekspercka walidacja generatora/Fuel oraz przegląd 36 wariantów IQ przez trenera bramkarzy.
3. P1: komplet 144 scenariuszy i usunięcie statusów `draft`.
4. P1: pełna dostępność i odporność GPS/lifecycle.
5. P1: App Store metadata, privacy, rating, review account i TestFlight.
6. P2: optymalizacje, analityka produktu i rozszerzenia niewymagane do bezpiecznego startu.
