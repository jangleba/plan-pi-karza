# BallWise

BallWise to mobilna aplikacja webowa dla piłkarzy, która zaczyna od decyzji:
co zrobić dzisiaj, dlaczego i z jaką intensywnością. Łączy profil zawodnika,
treningi klubowe, mecze, cel, dostępny sprzęt i — wyłącznie po osobnej zgodzie —
krótki check-in gotowości.

Aplikacja nie jest wyrobem medycznym, nie diagnozuje, nie leczy i nie zastępuje
konsultacji ze specjalistą.

## Najważniejsze zasady wydania

- spersonalizowane konto jest dostępne od 13 lat;
- dla zawodnika 13–15 właścicielem konta jest rodzic lub opiekun;
- osoba poniżej 13 lat ma tylko publiczne demo bez zapisu danych;
- od 16 lat zawodnik może posiadać konto, a do 18 lat płatnikiem pozostaje
  dorosły;
- check-in zawiera wyłącznie sen, energię, zmęczenie nóg i ból;
- odmowa zgody zdrowotnej nie blokuje aplikacji — uruchamia tryb ostrożny;
- bieg zapisuje zdalnie tylko dystans, czas i średnie tempo, bez trasy GPS;
- Vision Lab i zależność MediaPipe zostały usunięte;
- maksymalnie dwie sesje treningowe mogą znaleźć się jednego dnia;
- pełny tydzień ma własne minima siły, szybkości, wydolności i pracy z piłką,
  zwiększane zgodnie z celem, gdy kalendarz ma na to bezpieczne miejsce.

## Technologie

- React 19 i TypeScript;
- TanStack Start / Router;
- Vite i Tailwind CSS;
- Supabase Auth, Postgres, RLS i Edge Functions;
- Vitest i ESLint.

## Uruchomienie

Potrzebny jest aktualny Node.js z npm oraz skonfigurowane zmienne środowiska
Supabase.

```sh
npm ci
npm run dev
```

Pełna kontrola wydania:

```sh
npm run verify
```

Polecenie uruchamia TypeScript, testy, ESLint i produkcyjną kompilację. Po
zbudowaniu lokalny wynik dla Cloudflare można uruchomić przez:

```sh
npm run preview
```

## Wdrożenie

Zacznij od [INSTRUKCJA-WGRANIA.md](INSTRUKCJA-WGRANIA.md). Zawiera kolejność
wgrania kodu, migracji Supabase, Edge Function usuwającej konto i trwałego
czyszczenia Vision Lab.

Przed App Store przeczytaj [docs/APP-STORE-I-PRAWO.md](docs/APP-STORE-I-PRAWO.md)
oraz [docs/LEGAL-CONFIGURATION.md](docs/LEGAL-CONFIGURATION.md). To repozytorium
jest kodem aplikacji webowej; natywny projekt iOS i plik IPA nie są częścią tej
paczki.

Projekt Lovable:
https://lovable.dev/projects/de7e9c03-6af5-4ba0-9a0c-426417d42531
