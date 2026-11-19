# Radar „Piłkarskie szanse” – uruchomienie krok po kroku (bez terminala)

> **Jak to działa teraz:** radar to **research klubów**. Stale szuka klubów i akademii, czyta z ich oficjalnych stron **prawdziwe adresy e-mail** (z cytatem i linkiem do strony) i pokazuje je zawodnikowi razem z gotową wiadomością do skopiowania. Zawodnik **sam** wysyła zapytanie o testy/trening ze swojej poczty. Aplikacja nie przepisuje cudzych ogłoszeń. Ogłoszenia z dopuszczonych źródeł (krok 8) to opcjonalny dodatek.

Wszystko robisz w przeglądarce. Czas: ok. 45–60 min. Opis techniczny: `docs/RADAR-SZANSE.md`.
Zasada bezpieczeństwa: **sekretów (hasło do bazy, tokeny, klucze API) nie wklejaj do czatu ani do kodu** – tylko w miejsca wskazane niżej.

## Krok 0. Scal PR #212 w GitHubie („Squash and merge”)
Workflow wdrożenia pojawia się w zakładce Actions dopiero po scaleniu do `main`.

## Krok 1. Projekt Supabase
1. Wejdź na supabase.com → załóż konto → **New project**. Nazwa: `ballwise`. Region: **Frankfurt (eu-central-1)** (najbliżej Polski).
2. Wymyśl **hasło do bazy** (zapisz w menedżerze haseł). To jest `SUPABASE_DB_PASSWORD`.
3. Gdy projekt się utworzy, zapisz cztery rzeczy:
   - **Project URL** (np. `https://abcd1234.supabase.co`) – Project Settings → API.
   - **Publishable key** (dawniej „anon”) – ta sama strona. **To jest klucz publiczny** (nie „service_role”!).
   - **Project ID / Reference ID** (np. `abcd1234`) – Project Settings → General. To jest `SUPABASE_PROJECT_REF`.
   - **Access token**: supabase.com/dashboard/account/tokens → *Generate new token* (nazwa `github-radar`). To jest `SUPABASE_ACCESS_TOKEN`.
4. Dashboard → **Database → Extensions** → włącz **pg_cron** i **pg_net**.
> Uwaga: darmowe projekty Supabase mogą być wstrzymywane po okresie braku aktywności (sprawdź aktualne zasady). Wstrzymany projekt = radar nie działa.

## Krok 2. Klucze API
- **Research klubów nie wymaga Anthropic** (adresy wyciąga deterministyczny kod). Do odkrywania nowych klubów potrzebny jest **Brave** – bez niego możesz dodawać kluby ręcznie w panelu (zakładka „Kluby” → „Dodaj klub do zbadania”).
- **Anthropic** jest potrzebny tylko do odczytu ogłoszeń z dopuszczonych źródeł (krok 8).
- **Anthropic** (odczyt ogłoszeń): console.anthropic.com → *Settings → API keys → Create key*. Doładuj konto (billing) i ustaw limit wydatków. Dzienny limit odczytów w radarze to `ai_daily_extraction_budget` (domyślnie 200) w tabeli `radar_settings`.
- **Brave Search** (wyszukiwanie nowych źródeł, można pominąć – monitorowanie dopuszczonych źródeł działa bez niego): api-dashboard.search.brave.com → wybierz plan (nawet darmowy wymaga subskrypcji, może wymagać karty; sprawdź aktualne warunki) → *API Keys* → utwórz klucz.

## Krok 3. Sekrety w GitHubie
Repozytorium → **Settings → Secrets and variables → Actions → New repository secret**. Dodaj (nazwa dokładnie taka):

| Nazwa | Wartość |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token z kroku 1 |
| `SUPABASE_DB_PASSWORD` | hasło do bazy z kroku 1 |
| `SUPABASE_PROJECT_REF` | Project ID z kroku 1 |
| `RADAR_CRON_SECRET` | wymyśl **długi losowy ciąg (min. 40 znaków)**, np. z generatora haseł; **zapisz go**, bo wpiszesz go jeszcze w kroku 6 |
| `ANTHROPIC_API_KEY` | klucz z kroku 2 (opcjonalnie) |
| `BRAVE_SEARCH_API_KEY` | klucz z kroku 2 (opcjonalnie) |
| `RADAR_CONTACT_URL` | adres, pod którym organizatorzy mogą się z Tobą skontaktować (np. strona/e-mail), trafia do nagłówka User-Agent |
| `RADAR_ALERT_WEBHOOK_URL` | opcjonalnie: webhook (np. Slack/Discord/ntfy) na alerty o awarii |

## Krok 4. Uruchom wdrożenie
GitHub → zakładka **Actions** → **Radar – wdrożenie na Supabase** → **Run workflow** → „wszystko”. Zielony znaczek = migracje bazy, sekrety funkcji i obie funkcje są wdrożone. Czerwony: otwórz przebieg i wklej mi komunikat błędu (bez sekretów).

## Krok 5. Konto administratora
1. Supabase → **Authentication → Users → Add user → Create new user** (Twój e-mail i hasło, zaznacz „Auto confirm user”).
2. Supabase → **SQL Editor** → wklej i uruchom (wstaw swój e-mail):
```sql
insert into public.radar_admins (user_id) select id from auth.users where email = 'twoj@email.pl';
```

## Krok 6. Harmonogramy (SQL Editor, wstaw swoje wartości)
```sql
select vault.create_secret('https://TWOJ-PROJECT-ID.supabase.co', 'radar_project_url');
select vault.create_secret('TEN-SAM-SEKRET-CO-RADAR_CRON_SECRET', 'radar_cron_secret');
select public.radar_register_schedules();
```
Wynik powinien pokazać trzy interwały (15 min / 6 h / 12 h). Sprawdź:
```sql
select jobname, schedule, active from cron.job where jobname like 'radar-%';
```
Powinny być trzy wiersze: `radar-expire`, `radar-refresh`, `radar-discover`.

## Krok 7. Połącz aplikację z Supabase
Napisz mi w czacie **tylko dwie wartości publiczne**: Project URL i Publishable key (nie „service_role”!). Wpiszę je do `src/lib/public-config.ts`, zrobię PR, a po scaleniu Lovable je zbuduje. (Albo ustaw `VITE_SUPABASE_URL` i `VITE_SUPABASE_PUBLISHABLE_KEY`, jeśli Twoje środowisko je wczytuje.)
Aplikacja **nadal nie wymaga logowania** (wymusza je dopiero `VITE_REQUIRE_LOGIN=true`).

## Krok 8 (opcjonalny). Akceptacja klubów i dopuszczenie źródeł ogłoszeń
**Kluby:** panel `/admin/radar` → zakładka **Kluby** → „Do akceptacji”. Każdy klub ma adres, cytat ze strony i wynik sprawdzenia poczty (MX). Akceptuj tylko adresy organizacyjne (biuro@, nabor@…). „Odrzuć” blokuje domenę na stałe. Automatyczną akceptację włączysz w SQL Editor: `update public.radar_settings set value = 'true' where key = 'club_auto_publish';` (nadal wymaga potwierdzonej miejscowości i działającej poczty).

**Źródła ogłoszeń (dodatek):**
1. Wejdź na `https://TWOJA-APLIKACJA/admin/radar`, zaloguj się kontem z kroku 5 → zakładka **Źródła**.
2. Radar nic nie opublikuje, dopóki nie zatwierdzisz źródła. Wymagana jest **podstawa dopuszczenia** (umowa, zgoda organizatora lub licencja). Publiczna strona, oficjalna domena, RSS ani robots.txt same nie są licencją.
3. Najprostsza droga: napisz do klubu/akademii/związku z prośbą o zgodę. Wzór:

> Dzień dobry, tworzę aplikację treningową dla młodych piłkarzy (Ballwise). Chciałbym/chciałabym, aby aplikacja pokazywała zawodnikom krótkie informacje o Państwa otwartych naborach, testach i treningach (termin, miejsce, roczniki, koszt) wraz z linkiem do oryginalnego ogłoszenia na Państwa stronie – zapisy i kontakt zawsze odbywają się u Państwa. Czy wyrażają Państwo na to zgodę i czy możemy pobierać ogłoszenia z adresu: [adres RSS / działu aktualności]? Pobieramy rzadko (kilka razy dziennie), z identyfikacją „BallwiseRadar” i zgodnie z robots.txt. W razie próśb o usunięcie lub zmianę – reagujemy od razu. Pozdrawiam, [imię, kontakt]

4. Po zgodzie: **Zatwierdź** → wpisz nazwę, **podstawę** (np. „Zgoda e-mail od [osoba], 2026-11-20”), zaznacz „Wolno pobierać” i „Wolno publikować własne opisy faktów z linkiem”, wklej adres RSS / mapy witryny / działu aktualności (po jednym w wierszu).

## Krok 9. Sprawdź, że działa
- Odczekaj do następnego uruchomienia (discover co 12 h) **albo** wywołaj od razu: Supabase → **Edge Functions → radar-discover → Test/Invoke**, nagłówek `x-radar-secret` = Twój `RADAR_CRON_SECRET`. (Bez nagłówka funkcja odpowiada 403 – to prawidłowo.)
- SQL Editor:
```sql
select job, status, started_at, stats, error from public.radar_job_runs order by started_at desc limit 10;
select count(*) from public.radar_listings;
select public.radar_feed();   -- to widzi aplikacja
```
- Kluby czekające na Twoją akceptację: panel → **Kluby**. Oferty niejednoznaczne: panel → **Oferty** (cytaty obok interpretacji).
- W aplikacji: ekran Start → „Piłkarskie szanse” → **Kryteria** → data urodzenia, miejscowość, promień.

## Gdy coś nie działa
Wklej mi: komunikat z GitHub Actions, wynik `radar_job_runs` (kolumny `status`, `error`) albo zrzut ekranu. Nie wklejaj sekretów.
