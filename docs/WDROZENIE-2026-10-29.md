# Wdrożenie poprawek BallWise — 29 października 2026

Projekt: **Plan Piłkarza / BallWise**, repozytorium `jangleba/plan-pi-karza`.
Baza przeglądu: `1780cf8cc460e1f727c6a52180aa159f63ecb729`.
Paczka nie wymaga wywoływania agenta Lovable ani kupowania jego kredytów.
Hosting, backend, zewnętrzne API i limity GitHub Actions pozostają osobnymi usługami.
Zbiorcza paczka **15** zastępuje paczkę 14: można ją zastosować do bazy przeglądu
albo po zainstalowaniu 14, bez uruchamiania poprzedniej paczki jako warunku.

## Instalacja ZIP przez GitHub

1. Pobierz i rozpakuj ZIP instalatora otrzymany w rozmowie.
2. W GitHub otwórz `jangleba/plan-pi-karza`, gałąź `main`, folder
   `.github/workflows`. Wybierz **Add file → Upload files** i wgraj plik
   `ballwise-stabilnosc-15.yml` z rozpakowanej paczki. Zapisz przez **Commit changes**.
   GitHub nie rozpakowuje ZIP automatycznie — wgrywasz plik `.yml`, nie ZIP.
3. Wejdź w **Actions → BallWise - 15 Stabilnosc i gotowosc kodu → Run workflow**.
   Wybierz `main` i uruchom. Jeżeli GitHub wyłączył Actions, najpierw je włącz.
4. Poczekaj na zielony wynik. Instalator sprawdza zgodność plików, nakłada
   poprawki i uruchamia typy, testy, lint oraz obie kompilacje. Dopiero po
   powodzeniu zapisuje commit na `main`. Nie wymusza zapisu ani nie pomija
   ochrony gałęzi. Przy konflikcie lub błędzie zatrzymuje się bez wysłania poprawek.
5. Lovable synchronizuje połączoną gałąź. Sprawdź **Git → In sync with GitHub**
   i podgląd. Aktualizacja kodu nie zastępuje **Publish** dla opublikowanej strony
   ani nowej kompilacji aplikacji zainstalowanej na iPhonie.
6. W aplikacji otwórz **Profil** lub **Pomoc i FAQ**. Na dole powinna być
   widoczna **Wersja aplikacji: 2026.10.29.15**. Ten numer sprawdza, czy telefon
   uruchamia nowy kod; sam zielony wynik Actions nie potwierdza publikacji strony.

Jeżeli reguły repozytorium wymagają pull requesta, wgraj plik przez pull request
i użyj opisanego niżej trybu plikowego na osobnej gałęzi; nie wyłączaj ochrony.
Instalator zapisuje podsumowanie w Actions. Ponowne uruchomienie rozpoznaje już
wgrane pliki, a nowszych sprzecznych zmian nie nadpisuje.

## Alternatywnie: pliki źródłowe

Paczka źródeł jest kopią całego poprawionego projektu. Przy ręcznej aktualizacji
zachowaj ścieżki od głównego katalogu repozytorium. Nie wrzucaj katalogu
`BallWise/` jako dodatkowego podfolderu aplikacji. Nie wgrywaj `node_modules`,
`.output`, `dist`, `.git` ani lokalnej konfiguracji z sekretami.

Manifest instalatora wskazuje pliki objęte zmianą. Zachowaj commit sprzed
instalacji. Nie uruchamiaj ponownie historycznych instalatorów 01–13 w celu
sprawdzenia tej paczki.

## Co zmienia paczka

- Logowanie i wylogowanie: odpowiedzi edytora Lovable, blokada pamięci w Safari,
  spóźnione odpowiedzi po zmianie konta i tryb offline.
- Sprawdzanie prawdziwych dat urodzenia, w tym 29 lutego.
- Potwierdzanie i odzyskiwanie zapisów treningowych w awaryjnym magazynie,
  gdy przeglądarka udostępnia IndexedDB, ale odmawia jego otwarcia.
- Import GPX i zapis biegu: brak fikcyjnego dystansu pomiędzy segmentami,
  odrzucenie cofającego się czasu, ochrona szkicu i podwójnego zapisu.
- Zachowanie sesji reakcyjnej po błędzie historii, aktualizacja przypomnień Fuel.
- Ponowne pobieranie oferty Apple po chwilowym błędzie i ochrona przed
  odtworzeniem usuniętej lokalnej kopii wyników Lab.
- Kontrola rodzaju publicznego klucza Supabase przed wydaniem i dokumentacja
  zgodna z aktualnymi modułami. Wgrany workflow instalatora zawiera też stałą
  kontrolę jakości kolejnych zmian i pull requestów.

Nie zmienia schematu bazy, reguł treningowych, cen ani konfiguracji kont usług.

## Backend

Ta aktualizacja nie dodaje migracji SQL. Jeżeli obecna baza już obsługuje wersję
październikową, nie wykonuj ponownie starych skryptów naprawczych.
Sprawdzenie zgodności istniejącego środowiska opisują
[instrukcje październikowe](INSTALLATION-2026-10.md) i `supabase/verification`.
Samo wgranie źródeł na GitHub nie wykonuje SQL w bazie ani nie wdraża Edge Functions.

Jedyna zmiana źródła funkcji serwerowej to przypięcie biblioteki w
`supabase/functions/delete-account/index.ts` do `2.111.0`. Do objęcia wdrożenia
tą zmianą trzeba ponownie wdrożyć **delete-account** we właściwym projekcie
Supabase. Nie dodaje ona nowych sekretów, tabel ani uprawnień.

Przed wydaniem sprawdź istniejące funkcje: `delete-account`, `training-coach`,
`billing-status`, `billing-webhook`; `analyze-fuel-photo` jest nadal funkcją
opcjonalną, nie podłączoną do aktualnego Fuel. Wybierz właściwy projekt —
`supabase/config.toml` nie jest dowodem, że to Twoje środowisko docelowe.

## Test po instalacji na telefonie

1. Zaloguj się, przejdź Start → Plan → dzisiejsza sesja, zapisz wynik i wróć do Planu.
2. Odśwież stronę i sprawdź wynik, następnie wyloguj się i zaloguj ponownie.
3. Zapisz trening bez internetu i przywróć połączenie; sprawdź synchronizację
   i brak podwójnego wyniku.
4. Otwórz Fuel i IQ, zapisz zestaw reakcyjny oraz wynik Lab z prawdziwego filmu.
5. Na natywnym iOS sprawdź przypomnienia, GPS po zablokowaniu ekranu oraz
   zakup i przywrócenie w środowisku testowym Apple/RevenueCat.

Testy lokalne nie wykonują tych operacji na Twoim koncie i telefonie.

## iPhone, TestFlight i produkcja

ZIP nie jest podpisanym IPA. Projekt iOS tworzysz na macOS z Xcode lub we
własnej usłudze budowania macOS. Kod zawiera `ios:setup`, `ios:sync` i bramkę
konfiguracji płatnego wydania. Sprawdź dane operatora, publiczny klucz backendu,
RevenueCat, bundle ID, domenę Universal Links i redirect Auth według
[INSTALLATION-2026-10.md](INSTALLATION-2026-10.md).

`npm run release:check` ma zatrzymać wydanie, gdy brakuje prawdziwej konfiguracji;
nie podstawiaj fikcyjnych wartości, żeby go ominąć. Przejście bramki potwierdza
format i kompletność konfiguracji, nie poprawność usług zewnętrznych.
Pełna lista odbioru: [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).

## Cofnięcie

W GitHub utwórz commit odwracający commit instalatora, a potem sprawdź kontrolę
jakości w Actions i synchronizację Lovable. Nie cofaj przez nadpisanie całej historii ani
`force push`. Usunięcie samego pliku instalatora nie cofa kodu.
Opublikowana strona wymaga ponownej publikacji, aplikacja natywna nowego buildu.
Jeżeli ponownie wdrożono `delete-account`, cofnięcie jej wersji wymaga osobnego
wdrożenia poprzedniego źródła. Dane użytkowników i baza nie są kopiowane do ZIP.
