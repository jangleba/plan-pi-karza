# BallWise — instrukcja użycia tej paczki

Zestaw aktualizacyjny wgrywa się do bieżącego repozytorium z zachowaniem
struktury katalogów i zastąpieniem plików o tych samych nazwach. Nie zawiera
`node_modules`, wyniku kompilacji, historii Git ani pliku z sekretami. Nie jest
to plik IPA i nie można wysłać go bezpośrednio do App Store Connect.

## 1. Wgranie kodu

Najbezpieczniej utworzyć nową gałąź w repozytorium połączonym z Lovable,
rozpakować pliki do katalogu repozytorium i zastąpić ich starsze wersje.
Następnie:

```sh
git rm -r --ignore-unmatch WGRYWAJ-DO-GITHUBA
git add -A
git commit -m "Prepare BallWise release foundation"
git push
```

`git add -A` jest ważne: zapisuje także usunięcie starego, zduplikowanego
katalogu `WGRYWAJ-DO-GITHUBA`. Samo przeciągnięcie nowych plików na stare nie
usuwa plików, których w paczce już nie ma.

Jeżeli projekt Lovable jest zsynchronizowany z tym repozytorium GitHub, po
wysłaniu commita pracuj dalej na tej samej gałęzi/projekcie. Nie wgrywaj do
GitHuba żadnego klucza `service_role` ani lokalnego `.env`.

## 2. Konfiguracja środowiska

Frontend i SSR potrzebują konfiguracji Supabase:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Kod serwerowy może dodatkowo korzystać z `SUPABASE_SERVICE_ROLE_KEY`. To sekret:
może znajdować się wyłącznie w bezpiecznych zmiennych środowiska backendu lub
Supabase Edge Functions, nigdy w zmiennej zaczynającej się od `VITE_`.

Przed wydaniem produkcyjnym trzeba też uzupełnić:

```text
VITE_RELEASE_MODE
VITE_LEGAL_ADMIN_NAME
VITE_LEGAL_BUSINESS_ADDRESS
VITE_LEGAL_REGISTRY_DETAILS
VITE_LEGAL_CONTACT_EMAIL
VITE_LEGAL_ACCOUNT_RETENTION
VITE_LEGAL_CONSENT_RETENTION
VITE_LEGAL_BACKUP_RETENTION
VITE_LEGAL_SUPABASE_REGION
VITE_LEGAL_SUBSCRIPTION_PRICE
VITE_LEGAL_TRIAL_DESCRIPTION
```

Pełny wzór znajduje się w `.env.legal.example`.
Na testach ustaw `VITE_RELEASE_MODE=test`. Przy prawdziwej publikacji ustaw
`VITE_RELEASE_MODE=production`; wtedy brak którejkolwiek z dziesięciu wartości
prawnych blokuje uruchomienie aplikacji zamiast pokazać dokument z placeholderem.

## 3. Supabase — kolejność wdrożenia

Projekt: `bdfatyynxbzspjzkrjgg`.

1. Zrób kopię bazy albo użyj najpierw środowiska testowego.
2. Zastosuj migracje w kolejności nazw plików, w tym:
   - `supabase/migrations/20260909090000_release_foundation.sql`,
   - `supabase/migrations/20260911213000_harden_consent_and_health_data.sql`,
   - `supabase/migrations/20260911220000_match_and_guardian_hardening.sql`,
   - wszystkie późniejsze migracje aż do
     `supabase/migrations/20260918183000_secure_defaults_and_health_cleanup.sql`.
3. Wdróż funkcję usuwania konta:

   ```sh
   supabase functions deploy delete-account --project-ref bdfatyynxbzspjzkrjgg
   ```

4. Sprawdź w Supabase Auth, że potwierdzanie adresu e-mail jest włączone. Jest
   potrzebne także do bezpiecznego przekazania konta zawodnikowi po 16. roku
   życia.
5. W **Authentication → URL Configuration** ustaw produkcyjny `Site URL` i
   dodaj dokładny adres `https://TWOJA-DOMENA/auth` do dozwolonych redirect URL.
6. W **Authentication → SMTP Settings** skonfiguruj własny SMTP. Domyślny
   serwer Supabase jest wyłącznie testowy i bez tego reset hasła nie zadziała
   niezawodnie dla zwykłych użytkowników.
7. Po wykonaniu kopii bezpieczeństwa usuń pliki Vision Lab zgodnie z
   `docs/VISION-LAB-CLEANUP.md`. Ten krok jest celowo osobny i nieodwracalny.
8. Na końcu uruchom w SQL Editor wyłącznie odczytowy plik
   `supabase/verification/20260918_secure_defaults_and_health_cleanup.sql`.
   Każde z czterech zapytań ma zwrócić zero wierszy.

Migracja tworzy model kont opiekunów dla zawodników 13–15, osobne zgody,
podsumowania biegów bez trasy GPS, polityki RLS, mechanizm przekazania konta po
16. roku życia oraz usuwa tabelę Vision Lab. Funkcja Edge usuwa konto Auth i
powiązane dane po stronie serwera; klucz administracyjny nie trafia do klienta.

## 4. Kontrola lokalna

Wymagany jest aktualny Node.js z npm:

```sh
npm ci
npm run verify
npm run dev
```

`verify` uruchamia kontrolę TypeScript, wszystkie testy, ESLint i produkcyjną
kompilację. Aby uruchomić lokalnie dokładnie wynik produkcyjnego buildu
Cloudflare, po `npm run build` użyj `npm run preview`.

Ręcznie sprawdź co najmniej:

- rejestrację zawodnika 16+;
- rejestrację opiekuna dla zawodnika 13–15 i potwierdzenie e-maila;
- blokadę konta dla osoby poniżej 13 lat oraz publiczny tryb demo;
- działanie bez zgody zdrowotnej i po jej wycofaniu;
- odzyskanie hasła z wiadomości e-mail aż do ustawienia nowego hasła;
- rozpoczęcie dzisiejszego meczu, odświeżenie strony i zakończenie meczu;
- odrzucenie profilu 13–15, gdy e-mail konta opiekuna nie jest potwierdzony;
- zapis biegu — w bazie tylko dystans, czas i średnie tempo;
- usunięcie konta w Profil → Prywatność i dane;
- maksymalnie dwie sesje dziennie i minima tygodniowe dla celu szybkościowego
  oraz wydolnościowego.

## 5. Co jeszcze oddziela kod od App Store

Repozytorium jest aplikacją webową TanStack Start. Do App Store potrzebny jest
jeszcze natywny projekt iOS (np. świadomie przygotowany wrapper), archiwum z
Xcode, podpisy, uprawnienia lokalizacji, ikony i zrzuty, App Privacy, adresy
Support/Privacy oraz kompletna karta aplikacji. Pełna lista jest w
`docs/APP-STORE-I-PRAWO.md`.
