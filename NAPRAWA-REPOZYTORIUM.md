# Naprawa repozytorium BallWise

Poprzednie paczki zostały przeciągnięte bezpośrednio z widoku folderu skompresowanego Windows. GitHub wgrał pliki bez części ścieżek, dlatego w katalogu głównym powstały nieprawidłowe duplikaty. Tej paczki nie należy wgrywać przez `Add file -> Upload files`.

## Wymagany sposób

1. Zainstaluj GitHub Desktop i zaloguj się do GitHuba.
2. Wybierz `File -> Clone repository` i sklonuj `jangleba/plan-pi-karza`.
3. W GitHub Desktop wybierz `Repository -> Show in Explorer`.
4. W otwartym katalogu repozytorium usuń całą zawartość poza ukrytym katalogiem `.git`.
5. Skopiuj do niego całą zawartość folderu `BALLWISE-CZYSTA-WERSJA` z tej paczki.
6. W GitHub Desktop wpisz podsumowanie `Napraw strukturę repozytorium BallWise`.
7. Kliknij `Commit to main`, a następnie `Push origin`.
8. W GitHubie otwórz `Actions` i sprawdź najnowszy proces `BallWise Quality`.

Nie kopiuj folderu `BALLWISE-CZYSTA-WERSJA` jako dodatkowego katalogu. Pliki `package.json`, `src`, `supabase` i `.github` mają znaleźć się bezpośrednio w katalogu sklonowanego repozytorium.

## Zweryfikowany stan

- Node.js 22
- npm 10
- instalacja `npm ci`
- ESLint
- TypeScript
- 628 testów
- produkcyjny build

Wszystkie powyższe kontrole przeszły przed utworzeniem paczki.
