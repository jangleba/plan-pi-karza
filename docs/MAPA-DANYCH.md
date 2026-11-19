# Mapa danych (stan kodu)

Mapa opisuje, gdzie trafiają dane w aplikacji. To dokument roboczy dla operatora i prawnika, nie gotowa klauzula informacyjna. Podstawy prawne poszczególnych operacji są **oznaczone jako do zatwierdzenia prawnego** i nie są tu rozstrzygane.

## 1. Tylko na urządzeniu (localStorage w przestrzeni gościa lub konta)
Przestrzenie: `bw:guest:*` oraz `bw:u:<id konta>:*`. Zmiana konta nie kopiuje ani nie łączy danych; stare klucze są migrowane wyłącznie do przestrzeni gościa; import danych gościa do konta jest jawny (`src/lib/store.ts`).

| Dane | Klucz | Uwagi |
|---|---|---|
| **Pełna data urodzenia / rocznik** | `private` | Nigdy nie trafia do chmury, wyszukiwarki, AI ani logów; w wiadomości do klubu tylko jeśli użytkownik sam ją doda |
| Profil (imię, pozycja, masa ciała, cel, dni treningowe…) | `profile` | Do chmury trafia tylko podzbiór z listy dozwolonych pól (sekcja 2) |
| Historia, ciężary (`weightLog`), MAS, odczucia, biegi | `history`, `weightLog`, `masDistance`, `feelings`, `runs` | Do chmury tylko za zgodą na synchronizację zdrowia |
| Check-iny | `checkIn:*` | j.w. |
| Fuel: posiłki, cele, ulubione, **alergeny i dieta** | `meals`, `fuelGoal`, `fuelFavs`, `fuelDiet`… | Nie są synchronizowane |
| Radar: preferencje, **kategoria rozgrywek**, zapisane oferty, wizytówka | `radarPrefs`, `radarSaved`, … | Nie są synchronizowane |
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
| `radar_saved` | Zapisane oferty | konto |
| `account_deletion_log` | Pseudonimowy skrót identyfikatora, status usunięcia | administrator |

Eksport: `export_my_data()`; usunięcie: funkcja `delete-account` + `erase_user_data()` (wszystkie powyższe tabele). Kopie zapasowe dostawcy: czas ich wygasania zależy od ustawień projektu Supabase – **nie obiecujemy natychmiastowego usunięcia ze wszystkich kopii**.

## 3. Dane radaru (nie dane użytkowników)
Oferty i kluby pochodzą z publicznych stron; źródła dopuszcza administrator. Dla klubów zapisywane są adresy organizacyjne (nie osobiste) z dowodem na stronie klubu, sprawdzane cyklicznie (wygasają po 45 dniach bez potwierdzenia).

## 4. Usługi zewnętrzne
| Usługa | Co jest tam wysyłane | Kto wysyła | Uwagi |
|---|---|---|---|
| Supabase (baza, logowanie, funkcje) | dane konta i synchronizacji z sekcji 2 | przeglądarka/serwer | region i umowa powierzenia – **do ustalenia przez operatora** |
| Anthropic API | **tekst publicznej strony ogłoszenia** z usuniętymi adresami e-mail i numerami telefonu; adres strony | serwer radaru | żadne dane użytkowników; retencja wg umowy organizacji – do potwierdzenia |
| Brave Search API | ogólne hasła wyszukiwania (rodzaj oferty, miejscowość) | serwer radaru | bez danych użytkowników; warunki przechowywania wyników – do sprawdzenia |
| Open Food Facts | wpisane hasło wyszukiwania produktu (przez trasę `/api/foods`) | serwer aplikacji | wynik wybrany przez użytkownika zostaje lokalnie |
| Mapbox / OpenStreetMap | adres IP i obszar mapy (kafelki) | przeglądarka | tylko gdy ustawiono `VITE_MAPBOX_TOKEN` |
| jsDelivr, Google Cloud Storage | adres IP (pobranie biblioteki i modelu pozy MediaPipe) | przeglądarka | analiza nagrań odbywa się w przeglądarce; wideo nie jest wysyłane |
| Rozpoznawanie mowy przeglądarki (Fuel, „Dyktuj”) | dźwięk | przeglądarka (Apple/Google) | **może być przetwarzane po stronie serwera dostawcy** – aplikacja nie obiecuje przetwarzania lokalnego |
| GeoNames | (dane wbudowane w aplikację, bez zapytań) | – | licencja CC BY 4.0 |

## 5. Czego aplikacja NIE robi
- Nie wysyła w imieniu użytkownika żadnych wiadomości do klubów (zapytanie wysyła on sam ze swojej poczty).
- Nie wysyła daty urodzenia do wyszukiwarki, modelu językowego ani analityki. Nie ma analityki ani reklam.
- Nie żąda skanów dokumentów i nie weryfikuje tożsamości (wiek to deklaracja).

## 6. Podstawy prawne – do zatwierdzenia
Operacje, których podstawę prawną trzeba ustalić i zatwierdzić prawnie: świadczenie usługi konta; synchronizacja danych o samopoczuciu i treningu (obecnie oparta na osobnej, wycofywalnej zgodzie użytkownika); dziennik dowodów oświadczeń; dziennik usunięć; logi techniczne dostawców; kontakt z klubami (działanie użytkownika). Informacja o prywatności nie jest zgodą.
