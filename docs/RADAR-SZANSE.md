# Radar „Piłkarskie szanse” – architektura, wdrożenie, weryfikacja

Stan na 2026-11-19. **Nic z tego nie jest jeszcze wdrożone na serwerze** – w środowisku, w którym powstał kod, nie było projektu Supabase, kluczy ani Deno/CLI. Wszystko poniżej „co trzeba zrobić” jest dokładnie opisane w sekcji 4.

## 0. Kierunek: research klubów (główna funkcja)
Radar **nie przepisuje cudzych ogłoszeń**. Stale szuka klubów i akademii (wyszukiwanie ogólne: miejscowość + „klub/akademia … kontakt”, rotacja, budżet dzienny `club_daily_query_budget`), pobiera ich stronę główną i do 3 podstron kontaktowych (robots.txt, odstępy, SSRF), wyciąga **wyłącznie adresy organizacyjne** (biuro@, nabor@, ksorly@; adresy typu imie.nazwisko@ są pomijane; strony z ≥ 6 adresami = katalog, pomijane) razem z cytatem i adresem strony, sprawdza rekord MX domeny i zapisuje link do podstrony o naborze (bez treści). Nic nie jest zgadywane ani konstruowane. Nowy klub czeka na akceptację administratora (domyślnie); wycofany klub blokuje domenę. Adres niepotwierdzony na stronie klubu od 45 dni (`club_max_age_days`) znika; klub jest ponownie sprawdzany co 14 dni.
Zawodnik widzi kluby z promienia, a w aplikacji układa wiadomość (imię, rocznik – pełna data tylko po jawnym wyborze – pozycja, miejscowość, opcjonalnie klub, doświadczenie, nagranie, telefon), edytuje ją, kopiuje albo otwiera w swojej poczcie (`mailto:`). **Aplikacja niczego nie wysyła w jego imieniu i nie widzi treści.** Dziennik „wysłano” jest tylko na urządzeniu. Pliki: `clubs.ts`, `clubpipeline.ts`, `inquiry.ts` (shared), migracja `0004_radar_clubs.sql`, UI `src/radar/ClubUi.tsx`, panel: zakładka „Kluby”.
**Wygląd i interakcja:** pastelowe, kolorowe karty (6 odcieni, stały dla klubu), pośrodku animowany **radar** (obraca się; kluby jako kropki w kierunku geograficznym i odległości w skali promienia, dotknięcie kropki pokazuje klub i „Napisz”), szybkie przyciski promienia, animacja „wysłano” (samolocik i konfetti), licznik wysłanych zapytań. **Wizytówka zawodnika** (imię i nazwisko, klub, krótki opis, nagranie, telefon, cel) zapisuje się raz na urządzeniu (`radarInquiry`) i podstawia do każdej wiadomości; pojawia się też w „Kryteria”. Animacje respektują „ogranicz ruch”. Pliki: `RadarViz.tsx`, `viz.ts`, `ClubUi.tsx`, klasy `.bw-t0…5` i animacje w `index.css`.
Ogłoszenia z dopuszczonych źródeł (poniżej) są opcjonalnym dodatkiem.

## 1. Jak to działa (ogłoszenia z dopuszczonych źródeł)

```
 źródła (RSS / sitemap / lista z paginacją)   Brave Search API (zapytania ogólne, rotacja, budżet)
              │                                            │ wynik = KANDYDAT, nie dowód
              ▼                                            ▼
   radar-discover (co 12 h) ── kolejka adresów ── nowa domena → rejestr źródeł „candidate” (do oceny, bez pobierania)
              │   zatwierdzona domena → pobranie strony organizatora (SSRF, robots.txt, limity)
              ▼
   klasyfikacja strony (CAPTCHA / logowanie / pusta ≠ treść) → filtr słów → odczyt przez model z CYTATAMI
              ▼
   deterministyczna walidacja (cytat w tekście? liczby w cytacie? daty wiarygodne?) → szkic z OSOBNYMI sesjami
              ▼
   radar_upsert_listing  → published (jednoznaczne) | pending_review (niejasne → panel administratora)
              ▲
   radar-refresh (co 6 h): ponowne sprawdzanie aktywnych ofert (hash treści, zmiany, zamknięcia, 404)
   radar_run_expire (co 15 min, czysty SQL w pg_cron): wygaszanie + retencja
              ▼
   radar_feed() ← aplikacja (Start): gotowe, AKTUALNE oferty → dopasowanie lokalne (data urodzenia nie opuszcza telefonu)
```

Kod wspólny dla aplikacji i funkcji Edge: `supabase/functions/_shared/radar/` (czysty TypeScript, importy `.ts`).
Aplikacja: `src/radar/` (UI Startu, panel `/admin/radar`), `src/Start.tsx` (sekcja pod check-inem).

## 2. Reguły (w testach: `src/radar/*.test.ts`)
- **Kwalifikacja** `MATCH / NO_MATCH / NEEDS_INFORMATION` jest deterministyczna (`eligibility.ts`). Najpierw kwalifikacja, potem sortowanie (odległość → najbliższy termin → id).
  „2010 i 2012” ≠ 2011; „2010 i młodsi” = rok ≥ 2010; „2010 i starsi” = rok ≤ 2010; limity wieku z operatorami (<, ≤, >, ≥, =) liczone na datę wskazaną przez organizatora (nieokreślona → NEEDS_INFORMATION); sam rok urodzenia przy zależności od dnia urodzin → NEEDS_INFORMATION; 29 lutego liczone obiema konwencjami; samo „U17/junior” bez zasad → NEEDS_INFORMATION; wyjątek za zgodą nie jest spełniony automatycznie; oferta bramkarska nie pasuje do gracza z pola; zgłoszenie drużynowe nie trafia do rekomendacji indywidualnych; brak współrzędnych ≠ wymyślone kilometry.
- **Sesje**: zasady wieku są PER SESJA (osobne wiersze `radar_sessions`, osobne dopasowania; sesja nie dziedziczy zasad innej).
- **Aktualność** (SQL `radar_listing_live` = TypeScript `listingFreshness`, parytet sprawdzony na 216 kombinacjach × 3 momentach): po terminie zgłoszeń (sama data = cały dzień lokalny Europe/Warsaw), po starcie sesji (sama data bez godziny = od początku dnia – godzin nie wymyślamy), po zamknięciu/odwołaniu/zapełnieniu, po 48 h bez POPRAWNEGO sprawdzenia źródła, nabór bezterminowy po 7 dniach bez potwierdzenia organizatora. `source_checked_at` ≠ `organizer_confirmed_at`; błąd, CAPTCHA, logowanie i pusta strona nie odnawiają znacznika; ponowne pobranie starej strony nie odnawia potwierdzenia. Ważność jest sprawdzana także przy odczycie (`radar_feed`, aplikacja).
- **Brak zgadywania**: każde pole wymaga cytatu występującego w tekście źródła; roczniki i wiek muszą występować jako liczby w cytacie; brak ceny ≠ bezpłatne; brak informacji o zapisach ≠ otwarte; brak ograniczeń we fragmencie ≠ oferta dla wszystkich.
- **Prywatność**: zapytania do wyszukiwarki to wyłącznie ogólne hasła/regiony/okresy z bieżącej daty; data urodzenia, pozycja i miejscowość zostają w aplikacji i nie trafiają do wyszukiwarki ani AI. Dopasowanie liczy się na urządzeniu.

## 3. Sekrety i miejsca ich dodania

| Sekret | Gdzie | Po co | Wymagany |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Lovable → zmienne projektu (albo `.env`) | aplikacja czyta `radar_feed()` | tak |
| `RADAR_CRON_SECRET` | `supabase secrets set` (sekrety funkcji) **oraz** Vault `radar_cron_secret` | uwierzytelnia wywołania pg_cron → Edge Functions | tak |
| `ANTHROPIC_API_KEY` | `supabase secrets set` | odczyt ogłoszeń (bez niego adresy czekają w kolejce kontroli, nic się nie publikuje) | dla publikacji |
| `BRAVE_SEARCH_API_KEY` | `supabase secrets set` | cykliczne wyszukiwanie (bez niego krok jest pomijany; zostaje monitorowanie źródeł) | dla wyszukiwania |
| `RADAR_CONTACT_URL` | `supabase secrets set` | adres kontaktowy w User-Agencie (`BallwiseRadar/1.0 (+url)`) | zalecany |
| `RADAR_EXTRACT_MODEL` | `supabase secrets set` | domyślnie `claude-haiku-5-5` | nie |
| `RADAR_ALERT_WEBHOOK_URL` | `supabase secrets set` | webhook (`{"text": ...}`) przy awarii zadania/źródeł | nie |
| `RADAR_RUNTIME_MS` | `supabase secrets set` | limit czasu partii (10–140 s, domyślnie 100 s) | nie |
| Vault `radar_project_url` | SQL Editor | adres projektu dla pg_cron → pg_net | tak |

`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` są dostępne w funkcjach automatycznie – klucz serwisowy nigdy nie trafia do przeglądarki.

## 4. Wdrożenie (polecenia)
```bash
supabase link --project-ref <ref>
# Dashboard → Database → Extensions: włącz pg_cron i pg_net (Vault jest domyślnie)
supabase db push                         # 0001_init, 0002_radar, 0003_radar_schedules
supabase secrets set RADAR_CRON_SECRET="$(openssl rand -hex 32)" ANTHROPIC_API_KEY=... BRAVE_SEARCH_API_KEY=... RADAR_CONTACT_URL=https://twoja-strona.pl/radar
supabase functions deploy radar-discover radar-refresh --no-verify-jwt
```
W SQL Editor (ten sam sekret co `RADAR_CRON_SECRET`):
```sql
select vault.create_secret('https://<ref>.supabase.co', 'radar_project_url');
select vault.create_secret('<RADAR_CRON_SECRET>', 'radar_cron_secret');
select public.radar_register_schedules();             -- idempotentne; po zmianie radar_settings uruchom ponownie
insert into public.radar_admins (user_id) values ('<uuid konta administratora z auth.users>');
```

## 5. Uruchomienie i sprawdzenie zadań
```sql
select jobname, schedule, active from cron.job where jobname like 'radar-%';                       -- 3 zadania: 15 min / 6 h / 12 h
select * from cron.job_run_details where jobid in (select jobid from cron.job where jobname like 'radar-%') order by start_time desc limit 10;
select job, status, started_at, finished_at, stats, error from public.radar_job_runs order by started_at desc limit 10;
select public.radar_feed();                                                                          -- to widzi aplikacja
```
Ręczne wywołanie: `curl -X POST https://<ref>.supabase.co/functions/v1/radar-discover -H "x-radar-secret: <RADAR_CRON_SECRET>"` (to samo dla `radar-refresh`). Bez prawidłowego nagłówka funkcja odpowiada 403.
Panel: `https://<aplikacja>/admin/radar` (konto z wpisem w `radar_admins`): Źródła, Do kontroli, Zgłoszenia, Zadania (pg_cron + przebiegi + kolejka).

**Pierwsze uruchomienie:** radar nic nie opublikuje, dopóki administrator nie dopuści co najmniej jednego źródła (Panel → Źródła → Zatwierdź: nazwa, **podstawa dopuszczenia** ≥ 10 znaków, zakres pobierania/publikacji, adresy RSS/mapy witryny/listy aktualności). Nowe domeny z wyszukiwarki same trafiają do kandydatów.

## 6. Testy
`npx vitest run src/radar` (≈ 140 testów): rdzeń kwalifikacji i aktualności, parsery, SSRF, robots, ekstrakcja z dowodami, **prawdziwy Postgres (PGlite)**: migracje, RLS i uprawnienia, parytet reguł SQL↔TS, upsert/sesje/duplikaty, wygasanie, blokady, budżet, kolejka, rejestracja harmonogramów (na atrapach pg_cron/pg_net/Vault), pełne przebiegi discover/refresh na kontrolowanym „internecie” (RSS, paginacja, mapy witryn, robots, CAPTCHA, logowanie, 404, zmiana strony, zamknięcie zapisów, wyszukiwarka z budżetem, brak klucza, awarie).
Test na żywo (domyślnie wyłączony, tylko technika, tymczasowa baza, bez publikacji): `RADAR_LIVE=1 NODE_USE_ENV_PROXY=1 npx vitest run src/radar/live.test.ts`.

## 7. Czego NIE ma / ograniczenia (uczciwie)
- **Powiadomienia** (dzienny zbiorczy komunikat, zmiany zapisanych ofert): NIE zaimplementowane. Aplikacja nie ma systemu push; wymaga PWA (manifest, service worker – na iPhonie tylko po dodaniu do ekranu głównego), kluczy VAPID i funkcji wysyłającej z ponownym sprawdzeniem profilu i aktualności.
- **Zapisane oferty** są lokalne (z migawką i odświeżaniem statusu z serwera). Tabela `radar_saved` z RLS istnieje i jest przetestowana, ale aplikacja jeszcze jej nie synchronizuje.
- Kluby: adresy wyciąga prosta heurystyka (nie model); adres osobisty może czasem uchodzić za organizacyjny (np. inicjał+nazwisko), dlatego domyślnie jest akceptacja administratora. Poczta (MX) potwierdza domenę, nie istnienie skrzynki. Nazwy klubu i miejscowości też są heurystyką. Przetwarzanie adresów e-mail na stronach klubów podlega RODO (adresy organizacyjne są mniej wrażliwe niż osobiste) – dla wątpliwości skonsultuj prawnika; w aplikacji jest zgłoszenie „adres nieprawidłowy / klub prosi o usunięcie”.
- Duplikaty: oferta, której WSZYSTKIE sesje już istnieją w starszej opublikowanej, dostaje status `duplicate`. Częściowe nakładanie się i sprzeczności między publikacjami nie są automatycznie wykrywane (trafiają do kontroli tylko przy niejednoznacznym odczycie).
- Funkcje Edge (`edge.ts`, `radar-*/index.ts`) NIE były uruchamiane w Deno (brak Deno/CLI w środowisku); ich logika (`jobs.ts`, `pipeline.ts`) jest przetestowana w Node, a część zależna od Deno (`Deno.serve`, `createClient`, `Deno.resolveDns` z zapasem DoH) – nie. Kontrola DNS ma okno rebindingu między sprawdzeniem a połączeniem (opisane w `fetcher.ts`).
- pg_cron/pg_net/Vault testowane na atrapach (sprawdzony jest nasz SQL i generowane polecenia, nie sam pg_cron).
- Model odczytu (`claude-haiku-5-5`), format odpowiedzi narzędzia i adapter Brave nie były uruchamiane z prawdziwymi kluczami; testy używają atrap.
- Zbiór miejscowości: GeoNames, ≥ 3000 mieszkańców (≈ 1100). Mniejsze miejscowości w ogłoszeniach nie mają współrzędnych → przy ograniczonym promieniu `distance_unknown` (nie pokazujemy ich w „Dla Ciebie”); „cała Polska” je pokazuje.
- Aplikacja jest dla zawodników od 16 lat; radar dopasowuje według faktycznej daty urodzenia, więc oferty dla młodszych roczników nie będą pasować.
- Uwagi prawne (nie jest to porada prawna): przed zatwierdzeniem źródła ustal licencję/zgodę; sprawdź warunki Brave Search API (przechowywanie wyników) i Anthropic (retencja); GeoNames wymaga uznania autorstwa (jest przy wyborze miejscowości); zgłoszenia nieaktualności są anonimowe i idą do administratora.
