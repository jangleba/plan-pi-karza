# BallWise jako PWA – wdrożenie, konfiguracja, testy

Zawodnik otwiera link, dodaje ikonę do ekranu głównego i loguje się kodem z e-maila. Każde kolejne dotknięcie ikony otwiera ekran **„Dziś”**: plan na dziś, start lub wznowienie treningu, zapis wykonania, wiadomość od trenera. Bez sklepu z aplikacjami.

## Kolejność wdrożenia (zrealizowana w tej gałęzi)

| Etap | Co | Gdzie w kodzie |
|---|---|---|
| 1 | Manifest, ikony, service worker, instrukcja dodania ikony (iPhone/Android), start z ikony na „Dziś”, pasek „Nowa wersja” | `public/manifest.webmanifest`, `public/sw.js`, `public/icons/`, `src/pwa/*`, `src/routes/__root.tsx` |
| 2 | Logowanie 6-cyfrowym kodem z e-maila wpisywanym w aplikacji (hasło jako alternatywa), trwała pamięć | `src/Auth.tsx`, `src/auth/otp.ts`, `requestPersistence()` |
| 3 | „Dziś”: stan zapisu i data planu, trening do wznowienia, wiadomość od trenera, powiadomienia | `src/today/TodayPanel.tsx`, `src/Start.tsx` |
| 4 | Tryb treningowy: duże przyciski, odliczanie liczone od zegara, ekran nie gaśnie (gdzie się da), zapis po każdej zmianie, wznowienie | `src/workout/*`, `src/SessionSheet.tsx` |
| 5 | Offline: kolejka zapisów z kluczem idempotencji, rozstrzyganie konfliktów, status synchronizacji | `src/sync/*`, migracja `0010` (`record_session_log`) |
| 6 | Role i uprawnienia: BallWise / klub / LoadWise, trener widzi tylko przypisanych zawodników z aktywną usługą; panel trenera `/trener` | migracja `0010`, `src/coach/*` |
| 7 | Powiadomienia za zgodą: wiadomość trenera, zmiana planu (przypomnienia – patrz „Do zrobienia”) | `src/pwa/push.ts`, `public/sw.js`, `supabase/functions/send-push` |

## Konfiguracja przed wdrożeniem

1. **Kopia zapasowa bazy**, potem migracja `supabase/migrations/0010_pwa_roles_sync.sql`.
2. **Szablon e-maila „Magic Link”** w Supabase (Authentication → Email Templates) musi zawierać `{{ .Token }}` – inaczej przyjdzie link zamiast kodu. Przykład: `<p>Twój kod do BallWise: <b>{{ .Token }}</b></p>`. Długość kodu w panelu = `VITE_OTP_LENGTH` (domyślnie 6).
3. **Klucze VAPID**: `npx web-push generate-vapid-keys`. Publiczny → `VITE_VAPID_PUBLIC_KEY` (klient). Prywatny i publiczny → sekrety funkcji: `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (`mailto:` operatora), `PUSH_WEBHOOK_SECRET` (losowy ciąg).
4. `supabase functions deploy send-push` i **Database Webhook**: tabela `public.coach_messages`, zdarzenie INSERT, typ „Supabase Edge Functions” → `send-push`, nagłówek `x-webhook-secret: <PUSH_WEBHOOK_SECRET>`.
5. Uprawnienia i przypisania trenerów nadaje administrator (tabela `app_admins`) lub serwer (service_role), np. po płatności: `entitlements` (`ballwise` / `loadwise` / `club`), `clubs`, `club_staff`, `coach_assignments`.
6. Plik `public/_headers` (Cloudflare) wyłącza buforowanie `sw.js` i manifestu. Po zmianie logiki `sw.js` podnieś w nim `VERSION`.

## Najważniejsze decyzje

- **Kod zamiast linku.** Na iPhonie aplikacja z ekranu początkowego ma osobną sesję niż Safari, więc link z e-maila zalogowałby Safari, a nie aplikację. Kod wpisuje się w aplikacji.
- **Odliczanie z zegara.** Przeglądarka usypia stronę w tle; czas liczony jest z różnicy znaczników czasu, więc po powrocie jest poprawny. Nie obiecujemy dźwięku/alarmu przy zablokowanym ekranie.
- **Wake Lock** jest zwalniany przez system po przejściu w tło; bierzemy go ponownie po powrocie, a na iOS – przy pierwszym dotknięciu (Safari wymaga gestu).
- **Synchronizacja przy otwartej aplikacji** (start, powrót sieci, powrót do aplikacji, co minutę). Background Sync działa tylko w Chromium, więc nie jest wymagany.
- **Idempotencja i konflikty.** Każdy zapis wykonania ma stały identyfikator dnia i sesji. Serwer: ten sam identyfikator = `duplicate`/`updated`; inny identyfikator tego samego treningu z innego urządzenia = wygrywa pełniejsze wykonanie (`done` > więcej serii > późniejsze zakończenie), przegrany zapis zostaje w `replaced`, zawodnik dostaje komunikat.
- **Zgoda.** Zapis wykonania to dane treningowe – jak dziennik ciężarów wymaga zgody na synchronizację; bez niej zostaje na urządzeniu (status to pokazuje), a wycofanie zgody usuwa wpisy z serwera.
- **Aktualizacje.** Nowy service worker czeka na „Odśwież” (nie podmieniamy wersji w trakcie treningu); HTML zawsze najpierw z sieci, więc zwykłe wdrożenie trafia do zawodnika od razu.

## Testy

### Wykonane w tym środowisku

| Zakres | Jak | Wynik |
|---|---|---|
| Logika: odliczanie, wznowienie, podwójne „Zakończ”, kolejka offline, ponowna wysyłka po utracie odpowiedzi, konflikty, rozpoznanie iPhone/Android/przeglądarki w aplikacji, cel z ikony/powiadomienia, kody logowania, funkcja push | testy jednostkowe (`src/workout`, `src/sync`, `src/pwa`, `src/auth`) uruchomione w Node | 31/31 |
| Regresja | wszystkie istniejące testy, które da się uruchomić bez `node_modules` (48 plików) | bez zmian względem stanu wyjściowego |
| Baza: idempotencja, konflikty, brak zgody, RLS trenera (LoadWise, klub, wygaśnięcie usługi, inny trener), uprawnienia, wiadomości, push po zmianie konta, eksport, wycofanie zgody, usunięcie konta | `supabase/tests/run.sh` na PostgreSQL 16 z atrapami Supabase | 38/38 |
| Service worker w Chrome: manifest bez błędów, kryteria instalacji Chrome, ponowne wejście, offline z ikony i na inny adres, API nie jest buforowane, aktualizacja czeka na zgodę, czyszczenie starej pamięci, push → powiadomienie z bezpiecznym adresem | `scripts/pwa/test_sw.py` (Playwright + Chrome) | 14/14 |
| Typy w zmienionych plikach | `tsc` z uproszczonymi deklaracjami zależności (brak `node_modules`) | bez błędów w nowym kodzie |

### Wymagają fizycznego iPhone'a / Androida (lista kontrolna)

- [ ] iPhone (iOS 16.4+), Safari: „Do ekranu początkowego” → ikona → logowanie kodem → zamknięcie → ponowne otwarcie z ikony trafia na „Dziś”, zalogowany.
- [ ] iPhone: tryb samolotowy → otwarcie z ikony → plan widoczny → trening → „Zakończ” → status „Offline · 1 zapis czeka” → wyłączenie trybu samolotowego → „Wszystko zapisane”.
- [ ] iPhone i Android: trening, blokada ekranu na 2 min w trakcie przerwy, powrót – poprawny pozostały czas; wymuszone zamknięcie aplikacji w trakcie treningu → „Trening w toku” na „Dziś” → wznowienie.
- [ ] Ekran nie gaśnie w trybie treningowym (iOS z Safari 16.4+, Android Chrome); po powrocie z ekranu głównego – po pierwszym dotknięciu.
- [ ] Powiadomienia: zgoda po dotknięciu „Włącz”, wiadomość z panelu trenera → powiadomienie → dotknięcie otwiera „Dziś” z wiadomością (aplikacja zamknięta i otwarta).
- [ ] Android: przycisk „Zainstaluj” (okno przeglądarki), skrót „Trening w toku” z długiego przytrzymania ikony.
- [ ] Aktualizacja: wdrożenie nowej wersji `sw.js` → pasek „Jest nowa wersja” → „Odśwież”; w trakcie treningu pasek czeka.
- [ ] Dwa urządzenia, ten sam trening offline na obu → po synchronizacji jeden wpis i komunikat o rozstrzygnięciu.

## Ograniczenia

- Brak niezawodnych alarmów i GPS przy zablokowanym ekranie (przeglądarka wstrzymuje stronę); czas jest poprawny po powrocie, sygnał końca przerwy – tylko przy otwartej aplikacji.
- iPhone: powiadomienia tylko z aplikacji z ekranu początkowego (iOS 16.4+); przeglądarki wbudowane w Instagram/Facebook nie dodają ikony.
- Synchronizacja działa, gdy aplikacja jest otwarta; zapis czeka bezpiecznie na urządzeniu do następnego otwarcia.
- Plan liczy silnik na urządzeniu z profilu; trener zmienia plan przez wiadomość „Zmiana planu” (zmiana parametrów silnika przez trenera – do zrobienia).
- Pliki ładowane dopiero przy otwarciu zakładki (np. IQ z Three.js) są offline dopiero po pierwszym użyciu.
- Całej aplikacji nie zbudowano w tym środowisku (brak dostępu do npm): przed wdrożeniem `npm ci && npm run typecheck && npm test && npm run build`.

## Do zrobienia

- Przypomnienia o treningu (zaplanowane przez `pg_cron` → `send-push`, temat `reminder`, godzina z `push_subscriptions.reminder_hour`).
- Panel administratora do nadawania uprawnień i przypisań (dziś SQL / service_role); powiązanie z płatnościami (`entitlements.source = 'payment'`).
- Edycja planu przez trenera (nadpisanie parametrów silnika per zawodnik) i „data zmiany planu” z serwera.
- Testy komponentów React (Vitest + jsdom) i test end-to-end na zbudowanej aplikacji.
- Aktualizacja `docs/DO-PRZEGLADU-SPECJALISTY.md` / dokumentów prawnych o dane trenera, klubu i powiadomienia (podstawa prawna, retencja).
