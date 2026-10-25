# Instalacja zestawu BallWise 01–04

Paczki 01–04 są jednym zestawem zmian do istniejącego projektu. Wgraj cały
zestaw na jedną gałąź i dopiero wtedy oceniaj kontrolę jakości. Paczka 01
importuje pliki i biblioteki dostarczane przez paczki 02 i 03.

## Kod i kontrola jakości

1. Zachowaj ścieżki z ZIP-ów względem głównego katalogu repozytorium.
2. Wgraj razem `package.json` i `package-lock.json` z paczki 03. Nie mieszaj
   starego manifestu z nowym lockfile. Wersje są przypięte, aby instalacja nie
   dobierała nowszego TanStack Start wymagającego innej wersji Vite.
3. Wymagane: Node.js >=22.12 oraz npm 11.9.0. Uruchom `npm ci`, następnie
   `npm run verify:release` (typy, testy, lint, build web i build mobilny).
4. Workflow `BallWise Quality` wykonuje te kontrole dla pull requesta.
   Nie obchodź konfliktów zależności przez `--force` lub `--legacy-peer-deps`.

## Istniejąca baza danych

Kod i skrypty w repozytorium nie potwierdzają wdrożenia do bazy.

1. Wybierz właściwy projekt i sprawdź aktualny stan oraz kopię bazy.
2. Najpierw sprawdź aktualizację na środowisku testowym z bazowym schematem.
3. W SQL Editor wykonaj `do-bazy/01-SPRAWDZ.sql`. Wymagane tabele i funkcje
   muszą istnieć; liczba zduplikowanych grup wyników musi wynosić zero.
4. Gdy `already_installed_stop_if_nonnull` nie jest NULL, nie wykonuj naprawy
   ponownie. Sprawdź `do-bazy/03-ZWERYFIKUJ.sql` i stan migracji.
5. Jeżeli aktualizacja nie jest zainstalowana i spełniono warunki wstępne,
   wykonaj `do-bazy/02-NAPRAW.sql`, a potem `do-bazy/03-ZWERYFIKUJ.sql`.
   To aktualizacja istniejącej bazy, nie inicjalizator pustego projektu.
6. Ręczna instalacja nie dopisuje historii migracji Supabase. Przed kolejnym
   wdrożeniem przez CLI uzgodnij historię z faktycznie wykonanymi zmianami.
   Nie wykonuj tych samych migracji drugi raz.

## Backend i subskrypcje

Wdróż funkcje `analyze-fuel-photo`, `training-coach`, `billing-status` oraz
`billing-webhook` do projektu używanego przez aplikację. Zweryfikuj project ID;
nie zakładaj, że zapisany w `supabase/config.toml` wskazuje Twoje środowisko.
Zachowaj konfigurację JWT z tego pliku. Webhook używa własnego sekretu w
nagłówku Authorization; pozostałe funkcje wymagają uwierzytelnienia użytkownika.

Sekrety backendu (nigdy w zmiennych `VITE_` ani w repozytorium):

- `OPENAI_API_KEY` dla funkcji AI.
- `REVENUECAT_SECRET_KEY`, `REVENUECAT_PRODUCT_IDS`,
  `REVENUECAT_ENTITLEMENT_ID` (domyślnie `pro`) i
  `REVENUECAT_WEBHOOK_SECRET` (co najmniej 32 znaki) dla subskrypcji.
- `BILLING_ALLOWED_ORIGINS`, `FUEL_ALLOWED_ORIGINS`, `COACH_ALLOWED_ORIGINS`:
  rzeczywiste originy aplikacji, rozdzielone przecinkami.
- `BILLING_ENFORCED=true` dla płatnego wydania backendu.

Skonfiguruj produkt subskrypcji w Apple i RevenueCat, przypisz go do entitlementu
i bieżącej oferty. Webhook RevenueCat kieruj do wdrożonego `billing-webhook`
z nagłówkiem `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`.

## Płatne wydanie iOS

Uzupełnij publiczne zmienne środowiska budowania:

- `VITE_RELEASE_MODE=production`, `VITE_BILLING_ENFORCED=true`.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `VITE_REVENUECAT_IOS_PUBLIC_KEY` (publiczny klucz zaczynający się od `appl_`),
  `VITE_REVENUECAT_PRODUCT_ID`.
- Rzeczywiste dane `VITE_LEGAL_*` z `.env.legal.example`.
- `BALLWISE_IOS_BUNDLE_ID`, `BALLWISE_IOS_ASSOCIATED_DOMAIN` oraz
  `VITE_AUTH_REDIRECT_URL=https://<ta-sama-domena>/auth`.

Skonfiguruj domenę AASA i dozwolony redirect Supabase Auth dla tej aplikacji.
Uruchom `npm run release:check`, a na Macu z Xcode `npm run ios:setup` i
`npm run ios:open`. Sprawdź podpisywanie i pliki prywatności w projekcie Xcode.
Konfiguracja wskazuje ofertę próbną 7 dni; produkt sklepu musi być z nią zgodny.

Build mobilny sprawdza pakowanie SPA i workerów. Nie zastępuje testu urządzenia:
na iPhonie/TestFlight sprawdź logowanie z powrotem do aplikacji, zakup i
przywracanie w sandboxie, nagrywanie Lab, pomiar biegu przy zablokowanym ekranie
oraz synchronizację treningu po utracie i przywróceniu połączenia.
