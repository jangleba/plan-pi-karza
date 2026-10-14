# BallWise — płynność i stabilność, 10.10.2026

Pakiet przygotowano dla jangleba/plan-pi-karza na bazie commita 7ae0aea8b2e24f2b700961b2c9dd0d124cee1971.

Zmiany:
- Start korzysta z istniejącego zapisu urządzenia. Odczyt danych konta i kontrola dokumentów ruszają równolegle.
- Kontrola dokumentów ma jeden współdzielony odczyt i zweryfikowany zapis w sessionStorage ważny 5 minut. Wersja dokumentów i konto muszą się zgadzać. Zapis decyzji oraz wylogowanie unieważniają ten zapis.
- Rutynowe sprawdzanie dokumentów nie otwiera nakładki na już pokazanym ekranie. Jeżeli naprawdę jest potrzebna nowa decyzja, formularz nadal jest dostępny przed wejściem do aplikacji.
- Check-in pozostaje ręczną zmianą planu. Dzisiejsza sesja nie wymaga cofnięcia na Start ani udawania, że check-in został wykonany.
- Odczyt w tle scala dane z aktualnym stanem. Chroni nowe zapisy, usunięcia oraz spójność lokalnie zmienionego planu; nie przywraca starszego konta.
- Odczyty początkowe można przerwać; mają limit 15 sekund. Błąd pierwszego odczytu daje przycisk ponowienia zamiast przekierowania do formularza profilu.
- Automatyczne odświeżenie planu oraz rozliczanie pominiętych sesji czekają na zakończenie odczytu. Nie startują po jego błędzie.
- Odświeżenie tokenu nie wymienia obiektu użytkownika na identyczne konto. Poprawia to stabilność zależnych efektów.
- Zakładki przygotowują kod po pojawieniu się paska na ekranie. Kliknięcie aktywnej zakładki nie tworzy kolejnego przejścia. Usunięto domyślne przejście wizualne i minimalne sztuczne oczekiwanie routera.
- Wstecz sprawdza historię routera aplikacji; bez niej otwiera Plan.

Walidacja lokalna:
- TypeScript: wynik prawidłowy.
- 78 plików testowych, 679 testów: wszystkie przeszły.
- ESLint: 0 błędów; 1 istniejące ostrzeżenie w ExerciseRunnerScreen.tsx.
- Kompilacja webowa oraz statyczna mobilna: prawidłowe. Kompilacja mobilna obejmuje kod wykonawczy z tej paczki.
- Chromium, ekran 390 × 844, syntetyczne konto i przechwycone odpowiedzi API: zapisany Start podczas wolnego odczytu bez dialogu; przejście do Planu; ponowne kliknięcie aktywnej zakładki; dzisiejsza sesja bez check-inu; błąd początkowy bez przeniesienia do onboardingu. Brak wyjątków JavaScript w tych scenariuszach.

Ograniczenia:
Nie testowano na fizycznym iPhonie ani na rzeczywistym koncie użytkownika. Kontrola w przeglądarce używała odpowiedzi testowych. Pierwszy odczyt bez zapisu urządzenia, pierwsze pobranie kodu i operacje serwera wymagają czasu; ZIP nie daje gwarancji zerowego opóźnienia wszystkich funkcji. Jest to poprawka źródeł, nie podpisana aplikacja iOS i nie publikacja.

Instalacja:
Do .github/workflows wgraj tylko usprawnij-ballwise.yml, następnie w Actions uruchom „Usprawnij działanie BallWise” na main. Akcja dodaje poprawki, sprawdza obie kompilacje i zapisuje jeden commit dopiero po przejściu kontroli.
Jeżeli któryś objęty poprawką plik został zmieniony po przygotowaniu paczki, akcja zatrzyma się przed podmianą. Plików nie nadpisuje na siłę. Nie zmienia package.json ani kodu pomiaru skoku i Fuel.
Wgranie źródeł nie zastępuje dotychczasowego publikowania aplikacji. Zainstalowana aplikacja natywna wymaga nowej kompilacji i instalacji dotychczasową ścieżką.

Kontrola po aktualizacji na telefonie:
1. Otwórz istniejące konto, potem kolejno Start, Plan, Fuel, IQ i Progres.
2. Otwórz dzisiejszą sesję bez wykonania check-inu.
3. Zapisz serię/trening, wróć do Planu i sprawdź zapis.
4. Zmień zakładkę kilka razy, także podczas wolnego internetu.
5. Odśwież stronę oraz wyloguj się i zaloguj ponownie. Nowe logowanie po wylogowaniu ponownie odczytuje konto.

Dokumentacja użyta przy sprawdzaniu interfejsów bibliotek:
https://supabase.com/docs/reference/javascript/auth-onauthstatechange
https://supabase.com/docs/reference/javascript/abortsignal
https://tanstack.com/router/latest/docs/framework/react/guide/preloading
