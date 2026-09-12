# Supabase — dokładnie co zrobić teraz

Nie wklejaj do SQL Editora raportu CSV ani tekstu zaczynającego się od
`kontrola;wynik`. Wkleja się wyłącznie zawartość plików `.sql`.

## Krok 1 — dziennik zgód i dane zdrowotne

1. Otwórz właściwy projekt **Plan Piłkarza** w Supabase.
2. Kliknij **SQL editor** → **New query**.
3. Otwórz plik
   `supabase/migrations/20260911213000_harden_consent_and_health_data.sql`.
4. Skopiuj cały plik, wklej do pustego edytora i kliknij **Run**.
5. Jeżeli pojawi się okno „Confirm destructive operation”, kliknij
   **Run anyway**. Migracja tworzy funkcję wycofania zgody; samo uruchomienie
   migracji nie wycofuje niczyjej zgody.

## Krok 2 — opiekun i rozpoczęcie meczu

1. W SQL Editor utwórz kolejne **New query**.
2. Wklej cały plik
   `supabase/migrations/20260911220000_match_and_guardian_hardening.sql`.
3. Kliknij **Run**.

## Krok 3 — kontrola

1. Utwórz trzecie **New query**.
2. Wklej cały plik
   `supabase/verification/20260911_release_blockers.sql`.
3. Kliknij **Run**.
4. Oczekiwany wynik: `OK` przy kontrolach, `4/4` przy politykach biegania oraz
   `BRAK — RLS jest włączone` w wierszu RLS.

Jeżeli którykolwiek wiersz pokaże `BRAK`, nie wklejaj wyniku jako SQL. Zrób
zrzut tabeli **Results** albo użyj **Export CSV** i wyślij ten wynik do analizy.

