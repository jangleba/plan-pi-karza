# BallWise — odstępy sesji siłowych

Problem: wcześniejsza kontrola działała przed końcową naprawą tygodnia, która mogła znowu
dodać siłownię. Kontrola pomijała drugi slot i część przejść między tygodniami.

Nowe zachowanie:
- Co najmniej jeden pełny dzień kalendarzowy bez siłowni między sesjami.
- Przysiad i martwy ciąg w sąsiednie dni są tym samym konfliktem siłowym.
- Kontrola obejmuje sesję główną, drugi slot, niepełny tydzień i niedzielę–poniedziałek.
- Obowiązuje także advanced/elite. Dwie siłownie tego samego dnia są blokowane.
- Najpierw przenosimy całą sesję w obrębie tygodnia, zachowując ćwiczenia i dawkę.
  Nie zmieniamy meczu, klubu ani dnia niedostępnego; kontrolujemy inne bodźce po przeniesieniu.
- Jeżeli nie ma bezpiecznego terminu, usuwamy konflikt. Nie zmieniamy samej nazwy ciężkiej sesji.
- Dwie sesje siłowe tygodniowo, jeśli da się je bezpiecznie rozstawić. Nadmiarowe siłownie są usuwane.
- Raport minimum nie uznaje sąsiadujących siłowni za poprawny tydzień.
- Zapisy starej wersji lub zawierające konflikt siłowy wymagają regeneracji przy odczycie konta.
  Sam boot cache nie jest migracją bazy; aktualizacja następuje przez dotychczasowy odczyt konta.
- Dodawanie, zamiana i ratowanie usuniętej sesji sprawdzają efektywny plan razem z aktywnymi zmianami.
  Przed zapisem do bazy ponownie sprawdzamy odstęp i limit tygodniowy.
- Każda końcowa sesja otrzymuje aktualny numer generatora v38, także po naprawie tygodnia.
- Końcowa kontrola istniejących reguł szybkości obejmuje również niepełne tygodnie, ponieważ
  ujawniony sprint w sesji z piłką powodował odrzucenie świeżo wygenerowanego planu przy ponownym odczycie.

Przykład: wtorek — przysiad, środa — bez siłowni, czwartek lub później — martwy ciąg.
Jeżeli ktoś ma dostępne wyłącznie dwa kolejne dni, aplikacja nie udaje, że dwie siłownie są bezpiecznie rozstawione.
Kalendarz nie zawiera godziny rozpoczęcia treningu. Reguła dnia przerwy nie mierzy dokładnych 48 godzin zegarowych.

Testy regresji odtworzyły wcześniejszy błąd (5 z 9 scenariuszy nie przechodziło), a po poprawce
przechodzą dla czterech poziomów, startu w poniedziałek i sobotę, obu slotów oraz gęstego klubu.
Osobne testy obejmują: stare zapisy, luki w kalendarzu, ID i dane sesji przy przeniesieniu,
niemożliwy grafik, ręczne dodatki i twardy raport końcowy.

Zasada produktowa jest zgodna z ogólną wskazówką NSCA o dniu przerwy między treningami
obciążającymi te same grupy mięśniowe. Nie jest zakazem wszystkich możliwych podziałów góra/dół.
https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/

Baza kodu: jangleba/plan-pi-karza, commit 2b7beacce0a1d81914412da55b4fd564998f0cd6.
Pakiety są niezależne i mają osobne pliki źródłowe. Można zastosować oba, jeden po drugim.
Instalator sprawdza każdą zawartość przed podmianą. Jeśli kod danego pliku już się zmienił,
zatrzymuje się bez nadpisywania go. Ponowne uruchomienie tej samej paczki nie dodaje kolejnych zmian.
Akcja wykonuje TypeScript, wszystkie testy, ESLint, kompilację webową oraz mobilną.
Commit i push następują dopiero po przejściu kontroli. Zmieniane są tylko pliki wskazane w manifeście.
Pakiety nie zawierają danych konta, pliku .env, kluczy ani node_modules.

To poprawki kodu. Nie są podpisaną aplikacją iOS. Zainstalowana aplikacja natywna wymaga
nowej kompilacji i instalacji dotychczasową ścieżką. Strona wymaga zwykłego wdrożenia aktualnego main.

Wspólna kontrola lokalna obu paczek: 688 testów w 78 plikach, TypeScript i ESLint bez błędów;
kompilacja webowa i mobilna. Testy przeglądarkowe: Chromium z syntetycznym kontem
oraz przechwyconymi odpowiedziami API. Nie był to test fizycznego iPhone'a ani prawdziwego konta.
