# Do zrobienia (stan na 2026-11-18)

## Wygląd – priorytet wskazany przez użytkownika
- Obecny wygląd jest za bardzo kolorowy i za mało profesjonalny.
- Cel: stonowana paleta, elegancja; małe, delikatne szkice (ilustracje liniowe) dla każdej zakładki oraz lekkie elementy w tle.
- Kolory znaczeniowe (zielony, żółty/pomarańczowy, czerwony) zostają, ale subtelniej i tylko tam, gdzie niosą informację.

## IQ – dokończyć
- Zasady oceny do przeglądu przez użytkownika: docs/ZRODLA-IQ.md. Najpierw dośrodkowanie, potem 1 na 1 i kiwnięcie, 11 na 11 z pressingiem, strzał po dograniu.
- Poziomy trudności: mniej czasu na decyzję i więcej zawodników.
- Test prototypu na telefonie (wydajność) – po stronie użytkownika.

## Pozostałe
- Supabase: klucze, migracja 0001_init.sql, synchronizacja historii, Labu i Fuel.
- Lab: automat wykrywania odbicia/lądowania (model pozy) – czeka na nagranie CMJ.
- Do przeglądu przez trenera: dawki biegowe, drabinki bez siłowni, szkice techniki, zamienniki ćwiczeń, progi poziomu.

## Wygląd – wdrożone (2026-11-18)
- Paleta ciepły beż i grafit, stonowane kolory znaczeniowe, cienkie obramowania zamiast cieni.
- Cienkie szkice liniowe w nagłówku każdej zakładki (`src/Sketch.tsx`), w pustych stanach i ledwo widoczny wzór boiska w tle.
- Do dopracowania po Twojej ocenie na telefonie: rozmiar i charakter szkiców, siła tła, kolory kostek na boisku (wciąż nasycone, bo muszą się różnić).

## Lovable: podgląd (2026-11-18)
- Przyczyna „Couldn't update the preview": projekt Lovable jest z szablonu TanStack Start (`.lovable/project.json`), a nowa aplikacja była zwykłym Vite bez `@lovable.dev/vite-tanstack-config`.
- Naprawa: przywrócony szablon (TanStack Start, konfiguracja Lovable, wersje paczek jak w ostatniej działającej wersji, bun.lock). Aplikacja renderowana tylko w przeglądarce (`ClientOnly`).
- Nie usuwać `.lovable/project.json`, `vite.config.ts` z konfiguracją Lovable ani `bun.lock`.
- „Not Found" w podglądzie: Lovable otwierał zapamiętany adres starej aplikacji (np. /start). Trasa `src/routes/$.tsx` pokazuje aplikację pod każdym adresem.
- Przepływ pracy: PR-y scalane przez „Squash and merge"; przed każdym nowym PR gałąź jest synchronizowana z main, żeby nie było konfliktów.
