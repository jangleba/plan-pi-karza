# Przebudowa TheBallLab — Scouting jako warstwa, nie produkt

Cel: plan + testy + progres pozostają fundamentem. Scouting to profesjonalna warstwa widoczności oparta **wyłącznie na realnych danych**. Zero mocków w produkcyjnym UI; wszędzie stany puste + statusy wiarygodności.

To duży projekt — dzielę go na fazy. Każda faza jest osobno testowalna. Migracja bazy wymaga Twojej akceptacji, więc idzie jako pierwszy krok każdej fazy z danymi.

## Faza 1 — Nawigacja i przeniesienie Analizy do Profilu (bez bazy)
Dolna nawigacja: **Plan · Testy · Progress · Scouting · Profil** (usuwamy „Start" i osobną „Analiza").
- `BottomNav.tsx`: nowe pozycje/ikony/trasy.
- Trasa `/progress` (nowa) — realny progres z istniejących danych (readiness, ukończone sesje, testy, transitions tygodniowe/miesięczne). Pusty stan gdy brak danych.
- Obecna zawartość „Analiza" (`_tabs.scouting.tsx`: mocne strony, priorytety, notatki, szanse) przenosi się do **Profilu** jako sekcja **Player Analysis / Analiza zawodnika**.
- Profil rozbudowany o sekcje: dane podstawowe (pozycja, wiek, wzrost, waga, noga, klub, poziom), Test History, Progress Report, Player Analysis (mocne/słabe/ryzyka + raport miesięczny generowany z realnych danych), Videos, Scouting Profile, Privacy/Visibility.
- Reguła: brak danych → „Brakuje danych do pełnej analizy. Wykonaj testy i zapisz minimum kilka treningów." Żadnych losowych insightów.
- `/scouting` staje się nową zakładką Scouting (zawodnika) — na razie stany puste.

## Faza 2 — Baza danych scoutingu + role
Migracja (do akceptacji): tabele `players`, `clubs`, `scouts`, `recruitment_needs`, `scouting_reports`, `watchlists` — z polami wg specyfikacji, `verification_status` (enum: self_reported, club_verified, scout_verified, admin_verified, source_verified, expired, unverified), `created_at`/`updated_at`, triggery updated_at.
- Rozszerzenie profilu zawodnika o brakujące pola (wzrost/waga/noga/klub/poziom/region/visibility_status/guardian_consent_status) — mapowane do `players`.
- Role: rozszerzenie `app_role` o `scout` i `club` (obok istniejących). Dostęp przez `has_role`.
- RLS + GRANTy dla każdej tabeli: zawodnik widzi swoje; scout/klub wg widoczności i zgód; admin pełny. Dane niepełnoletnich chronione zgodą opiekuna.
- Komponent `VerificationBadge` — wszędzie pokazuje: potwierdzone / niepotwierdzone / stare / self-reported / zweryfikowane przez kogo.

## Faza 3 — Scouting zawodnika (real data)
Zakładka Scouting (sekcje: Opportunities, Club Needs, Scout Reports, Watchlist, Transfer Fit, Visibility, Verification):
- status widoczności, kompletność i gotowość profilu, zaproszenia, zainteresowanie klubów, zapisane kluby, wymagane zgody, braki, rekomendowane kroki.
- Tryb prywatny gdy zawodnik nie chce być widoczny.
- Bramki zgody opiekuna dla niepełnoletnich (widoczność, dane dla klubów, kontakt scouta, zaproszenia, wideo).
- Puste stany gdy brak realnych zapotrzebowań: „Brak aktywnych zapotrzebowań scoutingowych w Twoim regionie."

## Faza 4 — Dashboard scouta i klubu
- Logowanie jako scout → osobny dashboard (bez planów treningowych): zawodnicy w regionie, mocny progres, dostępni na testy, watchlista, raporty do dokończenia, potrzeby klubów, do ponownej obserwacji, raporty wysłane. Wyszukiwanie/filtry, watchlista, raporty, porównywarka, udostępnianie.
- Panel klubu: dodaj potrzebę, kandydaci, scouting board (New candidate → … → Signed/Rejected/Archived), porównywarka, raporty, zaproszenia, statusy.

## Faza 5 — Transfer Fit + Panel admina
- Transfer Fit liczony tylko przy komplecie realnych danych (zawodnik, klub, potrzeba, dość danych, zgoda). Inaczej: „Nie można policzyć Transfer Fit. Brakuje: …". Pokazuje: dopasowanie/niedopasowanie, dane potwierdzające, braki, poziom pewności, ryzyka, następny krok.
- Panel admina: dodawanie/weryfikacja klubów, ligi, kategorie wiekowe, zatwierdzanie scoutów, oznaczanie danych zweryfikowanych, import CSV, źródła, data ostatniej weryfikacji, ukrywanie fałszywych danych, moderacja profili i raportów.

## Zasady przekrojowe
- UI zawsze rozdziela: dane zawodnika / klubu / scouta / raporty / AI inference / zweryfikowane / niezweryfikowane. Opinie AI nigdy nie mieszane z faktami.
- Zero mock/demo/fake w produkcyjnym widoku (dozwolone tylko dev/sandbox).
- Scouting korzysta z danych planów i testów; nie przyćmiewa ich.

## Szczegóły techniczne
- Stack: TanStack Start, trasy w `src/routes/`, `_tabs.*` layout. Dane user-scoped przez `createServerFn` + `requireSupabaseAuth`; publiczne odczyty przez klienta publishable + wąskie polityki `TO anon`.
- Role trzymane w `user_roles` (nigdy na profilu). Nowe role `scout`, `club` w enumie `app_role`.
- Każda migracja: CREATE TABLE → GRANT → ENABLE RLS → POLICY, trigger updated_at.
- Progress/Analysis generowane z: session_logs, readiness_logs, vision_tests, weekly_transitions, training_sessions.

## Sugerowana kolejność realizacji
Zaczynam od **Fazy 1** (nawigacja + przeniesienie Analizy do Profilu + Progress z realnych danych), bo daje natychmiastową, widoczną zmianę struktury bez ryzyka bazodanowego. Po akceptacji przechodzę do migracji Fazy 2.
