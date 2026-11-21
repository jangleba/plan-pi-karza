# Mapa danych (stan kodu)

Mapa opisuje, gdzie trafiają dane w aplikacji. To dokument roboczy dla operatora i prawnika, nie gotowa klauzula informacyjna. Podstawy prawne poszczególnych operacji są **oznaczone jako do zatwierdzenia prawnego** i nie są tu rozstrzygane.

## 1. Tylko na urządzeniu (localStorage w przestrzeni gościa lub konta)
Przestrzenie: `bw:guest:*` oraz `bw:u:<id konta>:*`. Zmiana konta nie kopiuje ani nie łączy danych; stare klucze są migrowane wyłącznie do przestrzeni gościa; import danych gościa do konta jest jawny (`src/lib/store.ts`).

| Dane | Klucz | Uwagi |
|---|---|---|
| **Pełna data urodzenia / rocznik** | `private` | Nigdy nie trafia do chmury, wyszukiwarki, AI ani logów |
| Profil (imię, pozycja, masa ciała, cel, dni treningowe…) | `profile` | Do chmury trafia tylko podzbiór z listy dozwolonych pól (sekcja 2) |
| Rozpoczęty, niedokończony onboarding (krok i dotychczasowe odpowiedzi) | `onboardingDraft` | Tylko na urządzeniu, żeby przeładowanie karty nie cofało do początku; usuwany po ukończeniu onboardingu; nie jest synchronizowany |
| Wygląd własnego zawodnika w IQ (odcień skóry, fryzura, budowa, wzrost, numer, kolor stroju, buty) | `look` | Tylko na urządzeniu; nie jest synchronizowany; kosmetyczne, bez danych zdrowotnych |
| Zaproszenie partnera na trening (ćwiczenie, termin, rodzaj i nazwa miejsca, opcjonalnie imię i notatka) | **nie jest zapisywane** | Cała treść jest w linku, który użytkownik wysyła sam wybranym kanałem (np. komunikator, SMS). Nic nie trafia do nas ani na serwer; odbiorca otwiera link w aplikacji. Imię jest dodawane tylko za zgodą (pole domyślnie wyłączone). |
| Historia, ciężary (`weightLog`), MAS, odczucia, biegi (w tym **trasa GPS**: do 500 punktów [szerokość, długość, czas w s] na bieg) | `history`, `weightLog`, `masDistance`, `feelings`, `runs` | Do chmury tylko za zgodą na synchronizację zdrowia |
| Check-iny | `checkIn:*` | j.w. |
| Zgłoszenia „nie mogę zrobić dzisiejszych treningów” (dzień, którego dotyczą, i dzień zgłoszenia) | `skippedDays` | Tylko na urządzeniu; porządkowane po ok. 10 tygodniach; nie jest synchronizowane |
| Fuel: posiłki, cele, ulubione, **alergeny i dieta** | `meals`, `fuelGoal`, `fuelFavs`, `fuelDiet`… | Nie są synchronizowane |
| **Piłkarski angielski**: poziom trudności, ukończone lekcje, etap powtórek zwrotów i fiszek, miejsce przerwania lekcji | `english` | Po zalogowaniu synchronizowane z kontem (dane edukacyjne, nie zdrowotne) |
| Wybrany głos syntezy mowy | `englishVoice` | Tylko na urządzeniu |
| Potwierdzenia lokalne (umowa, zasady bezpieczeństwa) | `agreement*`, `consent*` | Kopia lokalna; dowód w chmurze tylko dla konta |

## 2. Synchronizacja z chmurą (Supabase) – tylko po zalogowaniu
| Tabela | Zawartość | Warunek |
|---|---|---|
| `profiles` | Wyłącznie pola z `REMOTE_PROFILE_FIELDS` (`src/lib/sync-map.ts`); wyzwalacz w bazie odrzuca datę urodzenia, rocznik, pola spoza kontraktu i wiek < 16 | konto |
| `check_ins`, `weight_log`, `mas_tests` | Dane o samopoczuciu i treningu | **zgoda na synchronizację danych zdrowotnych** (RLS); wycofanie usuwa te dane z chmury |
| `age_declarations` | Grupa wieku (16–17 / 18+) z czasem; bez daty urodzenia | konto; deklaracja ≠ weryfikacja tożsamości |
| `agreement_events`, `consent_events` | Dowody: kto, wersja dokumentu, czas, metoda; tylko do dopisywania | konto |
| `guardian_confirmations` | Stan potwierdzenia opiekuna, skrót tokenu (SHA-256), terminy; bez danych opiekuna | tylko 16–17 lat |
| `paid_access` | Dostęp płatny aktywowany wyłącznie funkcją serwerową | po integracji płatności (obecnie brak) |
| `english_progress` | Postęp nauki angielskiego: poziom, lekcje, zwroty, fiszki, miejsce przerwania (jeden wiersz = jeden element, z kontrolą kształtu i limitem 400 elementów) | konto; RLS: tylko własne wiersze |
| `account_deletion_log` | Pseudonimowy skrót identyfikatora, status usunięcia | administrator |

Eksport: `export_my_data()`; usunięcie: funkcja `delete-account` + `erase_user_data()` (wszystkie powyższe tabele). Kopie zapasowe dostawcy: czas ich wygasania zależy od ustawień projektu Supabase – **nie obiecujemy natychmiastowego usunięcia ze wszystkich kopii**.

## 3. Radar „Piłkarskie szanse” został usunięty
Moduł, jego tabele i zadania cykliczne zostały usunięte (migracja `0007_remove_radar.sql`), a lokalne dane radaru (zapisane oferty, wizytówka z imieniem i telefonem) są jednorazowo kasowane z urządzeń. Pozostałe po nim wdrożone funkcje i sekrety trzeba usunąć ręcznie w panelu Supabase (patrz `docs/AUDYT-STATUS.md`).

## 4. Usługi zewnętrzne
| Usługa | Co jest tam wysyłane | Kto wysyła | Uwagi |
|---|---|---|---|
| Supabase (baza, logowanie, funkcje) | dane konta i synchronizacji z sekcji 2 | przeglądarka/serwer | region i umowa powierzenia – **do ustalenia przez operatora** |
| Open Food Facts | wpisane hasło wyszukiwania produktu (przez trasę `/api/foods`) | serwer aplikacji | wynik wybrany przez użytkownika zostaje lokalnie |
| Mapbox / OpenStreetMap | adres IP i obszar mapy (kafelki) | przeglądarka | tylko gdy ustawiono `VITE_MAPBOX_TOKEN` |
| jsDelivr, Google Cloud Storage | adres IP (pobranie biblioteki i modelu pozy MediaPipe) | przeglądarka | analiza nagrań odbywa się w przeglądarce; wideo nie jest wysyłane |
| Rozpoznawanie mowy przeglądarki (Fuel, „Dyktuj”) | dźwięk | przeglądarka (Apple/Google) | **może być przetwarzane po stronie serwera dostawcy** – aplikacja nie obiecuje przetwarzania lokalnego |
| Synteza mowy przeglądarki (Piłkarski angielski, odsłuch zwrotów) | **tekst zwrotu** do odczytania (nie dźwięk z mikrofonu; mikrofon nie jest używany) | przeglądarka/system | niektóre głosy (zależnie od przeglądarki) mogą działać przez usługę dostawcy; aplikacja preferuje głosy lokalne; lekcje działają także bez dźwięku |

## 5. Czego aplikacja NIE robi
- Nie wysyła daty urodzenia do żadnej usługi zewnętrznej. Nie ma analityki ani reklam. Nie łączy postępu nauki angielskiego z gotowością fizyczną, oceną talentu ani szansą na karierę.
- Nie żąda skanów dokumentów i nie weryfikuje tożsamości (wiek to deklaracja).

## 6. Podstawy prawne – do zatwierdzenia
Operacje, których podstawę prawną trzeba ustalić i zatwierdzić prawnie: świadczenie usługi konta; synchronizacja danych o samopoczuciu i treningu (obecnie oparta na osobnej, wycofywalnej zgodzie użytkownika); dziennik dowodów oświadczeń; dziennik usunięć; logi techniczne dostawców; postęp nauki angielskiego (synchronizacja z kontem; dane edukacyjne). Informacja o prywatności nie jest zgodą.
