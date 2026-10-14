# BallWise — wygląd sesji siłowych

Nowe zachowanie:
- Mniejszy nagłówek i karty bloków; zachowana kolejność treningu.
- Krótka nazwa oraz osobny wariant, np. Przysiad / Sztanga z tyłu.
  Mapa dotyczy znanych pełnych nazw. Własne nazwy nie tracą swoich kwalifikatorów.
- Dawka widoczna od razu. RIR pozostaje; oznaczenie RPE nie dubluje go w wierszu siły.
- Przerwa ma wyraźny opis, w tym informację, czy jest po parze.
- Technika i zmiana niedostępnego sprzętu rozwijają się na żądanie.
- Pasek ukończenia zamiast długich powtarzanych komunikatów.
- Bez zdjęć i ilustracji w liście siły i w jej ekranie wykonywania/techniki.
- Czytelne przyciski serii z zaznaczeniem bieżącej i zapisanej serii.
- Poprawiona liczba serii: generator przechowuje sets jako tekst, np. "3".
  Wcześniej ekran sprawdzał liczbę i displayPrescription, więc taka sesja miała jeden przycisk serii.
  Teraz odczytuje także tekst oraz zakres i zachowuje wcześniejszy fallback.
- Timer odczytuje przerwę „60–180 s do A2”, nie licząc kodu A2 jako dodatkowego czasu.
- Pozostają rzeczywiste zapisy, historia, podpowiedzi ciężaru, szkic wpisu, timer i cofnięcie oznaczenia.
- Mapa nazw i wygląd nie zmieniają identyfikatorów ćwiczeń ani dawki silnika.

Załączony PODGLAD pochodzi z testowego konta i pokazuje rzeczywisty kod w Chromium.
Sprawdzono szerokości 320, 390 i 430 px. To podgląd przeglądarkowy, nie zrzut z fizycznego iPhone'a.

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
