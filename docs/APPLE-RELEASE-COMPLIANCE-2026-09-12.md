# BallWise — audyt zgodności Apple i plan wydania

Stan na 12 września 2026. Zakres: publiczne wydanie pełnej aplikacji BallWise na
iPhone w App Store. Ten dokument jest audytem produktu i implementacji, a nie
indywidualną poradą prawną ani gwarancją akceptacji przez Apple.

## Wniosek wykonawczy

BallWise **nie jest jeszcze gotowy do wysłania do App Review**, mimo że najważniejsze
blokery webowej wersji (zgoda zdrowotna, odzyskiwanie hasła, start meczu, audyt zgód,
potwierdzenie opiekuna i usuwanie konta) zostały naprawione w kodzie.

Najważniejsze pozostałe blokery:

1. nie istnieje projekt iOS, archiwum Xcode, konfiguracja uprawnień ani test na
   prawdziwym iPhonie;
2. nie ma StoreKit i systemu subskrypcji 119 zł/miesiąc z 3-dniowym okresem próbnym;
3. brakuje finalnych danych usługodawcy, publicznej domeny, Support URL i Privacy URL;
4. Football IQ ma już 36 technicznie zweryfikowanych wariantów bramkarskich L2–L5,
   ale wymagają one akceptacji trenera bramkarzy; część pozostałych scenariuszy ma
   status `draft`, a cała biblioteka jest mniejsza niż docelowe 144 sytuacje;
5. wymagane są testy urządzeniowe GPS, utraty sieci, blokady ekranu, powrotu aplikacji,
   płatności, odnowienia, anulowania i usunięcia konta na produkcyjnym backendzie;
6. trzeba wypełnić App Privacy, nowy kwestionariusz wieku oraz status tradera w UE.

## Legenda statusów

- **GOTOWE W KODZIE** — implementacja istnieje; nadal wymaga testu wdrożeniowego.
- **CZĘŚCIOWO** — kierunek jest prawidłowy, lecz brakuje elementu produkcyjnego.
- **BRAK — BLOKER** — bez tego nie wysyłamy buildu.
- **DO POTWIERDZENIA NA KONCIE** — wymaga App Store Connect, Supabase lub danych firmy.
- **NIE DOTYCZY TERAZ** — nie występuje przy obecnym zakresie funkcji.

## Macierz wymagań Apple

| Obszar | Status | Stan BallWise | Warunek zamknięcia |
|---|---|---|---|
| 1.4 Bezpieczeństwo fizyczne | CZĘŚCIOWO | Są komunikaty przerwania treningu, konsultacji z lekarzem/fizjoterapeutą i brak diagnozy. | Ekspert sportowy zatwierdza reguły obciążenia, Fuel i wszystkie treści; opis sklepu nie obiecuje leczenia ani diagnozy. |
| 1.5 Kontakt z twórcą | BRAK — BLOKER | Brak finalnego operatora, adresu i publicznego Support URL. | Uzupełnić dane firmy/osoby, aktywny e-mail i stronę pomocy. |
| 1.6 Bezpieczeństwo danych | CZĘŚCIOWO | RLS, usuwanie konta, audyt zgód i minimalizacja GPS są przygotowane. | Wdrożyć wszystkie migracje, uruchomić testy autoryzacji między dwoma kontami i sprawdzić logi/backupy. |
| 2.1 Kompletność | BRAK — BLOKER | Web działa i ma demo, ale nie ma finalnego buildu iOS ani zweryfikowanego produkcyjnego backendu. | Build bez placeholderów i pustych ekranów; konto recenzenta; backend dostępny przez cały review. |
| 2.2 Beta | GOTOWE ORGANIZACYJNIE | Plan zakłada TestFlight przed sklepem. | Nie publikować 3-dniowej „niepełnej aplikacji” jako wersji App Store; beta tylko w TestFlight. |
| 2.3 Metadata | BRAK — BLOKER | Brak finalnych zrzutów, opisu, słów kluczowych, kategorii, ratingu i Review Notes. | Materiały pokazują prawdziwy produkt i jasno oznaczają funkcje płatne. |
| 2.5 API i system | BRAK — BLOKER | Repo jest aplikacją webową; brak projektu natywnego, manifestu prywatności i purpose strings. | Projekt iOS z publicznymi API, wymaganym SDK, opisem lokalizacji i audytem SDK. |
| 3.1.1 Zakup funkcji cyfrowych | BRAK — BLOKER | Brak In-App Purchase. | Odblokowanie pełnej wersji na iOS przez StoreKit, bez własnego obejścia płatności w aplikacji. |
| 3.1.2 Subskrypcja | BRAK — BLOKER | Cena 119 zł i 3 dni próbne to decyzja biznesowa, nie implementacja. | Auto-renewable subscription, wartość ciągła, odtwarzanie zakupów, synchronizacja uprawnień i czytelny paywall. |
| 4.2 Minimalna funkcjonalność | BRAK — RYZYKO ODRZUCENIA | Prosty wrapper strony może wyglądać jak przepakowany serwis WWW. | Natywna nawigacja i zachowania iOS, solidny GPS/lifecycle, właściwe loading/offline/error states i test użyteczności. |
| 4.8 Logowanie | NIE DOTYCZY TERAZ | Jest własny e-mail/hasło, bez Google/Facebook. | Jeśli dodamy social login, ponownie ocenić obowiązek Sign in with Apple. |
| 5.1.1 Polityka prywatności | CZĘŚCIOWO | Ekran polityki jest w aplikacji, lecz dane operatora i publiczny URL nie są finalne. | Pełny tekst: dane, cele, odbiorcy, retencja, cofanie zgody i usunięcie; link w aplikacji i App Store Connect. |
| 5.1.1 Usunięcie konta | GOTOWE W KODZIE | Widoczny ekran i Edge Function `delete-account`. | Test E2E: Auth user, dane tabel, Storage, retencja backupu i obsługa aktywnej subskrypcji. |
| 5.1.1 Minimalizacja | GOTOWE W KODZIE | Współrzędne GPS pozostają w pamięci; do Supabase trafiają dystans, czas i tempo. | Test sieciowy ma potwierdzić, że natywny wrapper ani SDK nie wysyłają współrzędnych. |
| 5.1.2 Zgoda i udostępnianie | CZĘŚCIOWO | Osobna zgoda zdrowotna i jej cofnięcie są zaimplementowane. | Finalna lista procesorów/SDK, zgodne logi zgody i brak zmiany celu bez ponownej zgody. |
| Małoletni | CZĘŚCIOWO | Progi 13/16/18, właściciel/opiekun/płatnik i serwerowe zabezpieczenia istnieją. | Prawnik potwierdza model dla Polski/rynków; E2E konta opiekuna, przekazania konta i ponownej akceptacji. |
| App Privacy | BRAK — BLOKER | Repo pozwala sporządzić inwentarz, lecz odpowiedzi nie są zapisane w App Store Connect. | Zadeklarować wszystkie dane aplikacji i SDK, ich cele oraz powiązanie z użytkownikiem. |
| Age Rating 2026 | DO POTWIERDZENIA NA KONCIE | Produkt ma własny próg 13+, ale wynik zależy od odpowiedzi w App Store Connect. | Wypełnić aktualny kwestionariusz i zastosować co najmniej próg usługi. |
| DSA trader (UE) | BRAK — BLOKER UE | Nie ustalono podmiotu sprzedającego. | Firma/JDG, adres, telefon/e-mail i weryfikacja statusu tradera w App Store Connect. |
| Dostępność | CZĘŚCIOWO | Część UI ma etykiety i semantykę, brak audytu całej aplikacji. | VoiceOver, Dynamic Type/zoom, kontrast, orientacja, sterowanie bez koloru i cele dotykowe. |

Apple wymaga wersji finalnej, działającego backendu i pełnego dostępu dla recenzenta.[^1]
Wersje beta należą do TestFlight, a nie do zwykłego wydania App Store.[^2]
Od 28 kwietnia 2026 upload musi być zbudowany w Xcode 26 lub nowszym z SDK iOS 26
lub nowszym.[^3]

## Subskrypcja 119 zł i trzy dni próbne

BallWise sprzedaje cyfrową funkcjonalność używaną w aplikacji, więc domyślny model
wydania na iOS to StoreKit/In-App Purchase.[^4] Zalecany produkt:

- jedna auto-odnawialna subskrypcja miesięczna w grupie `BallWise Premium`;
- cena odpowiadająca wybranemu przez Apple poziomowi cenowemu około 119 zł;
- 3-dniowy `free trial` skonfigurowany jako introductory offer;
- ekran przed potwierdzeniem pokazuje: długość próby, cenę po próbie, okres
  rozliczeniowy, automatyczne odnowienie, sposób anulowania, regulamin i prywatność;
- przyciski: „Rozpocznij okres próbny”, „Odtwórz zakupy”, „Zarządzaj subskrypcją”;
- backend przyjmuje wyłącznie zweryfikowany stan transakcji, nie flagę z frontendu;
- entitlement działa na wszystkich urządzeniach użytkownika i nie pozwala kupić
  kilku wariantów tej samej subskrypcji jednocześnie.

Apple wymaga IAP do odblokowania funkcji cyfrowych i mechanizmu odtworzenia
odtwarzalnych zakupów.[^4] Subskrypcja musi dawać ciągłą wartość, trwać co najmniej
siedem dni i działać na urządzeniach użytkownika.[^5]

**Nie wdrażać teraz własnego licznika 72 godzin w Supabase jako zamiennika próby
StoreKit.** Może on służyć webowi, ale nie powinien samodzielnie odblokowywać płatnej
wersji iOS.

## App Privacy — robocze odpowiedzi

Ostateczne odpowiedzi trzeba porównać z ruchem sieciowym finalnego buildu i listą
SDK. Apple wymaga uwzględnienia danych zbieranych przez aplikację i partnerów
trzecich.[^6]

| Typ danych Apple | Czy prawdopodobnie zbieramy | Powiązane z użytkownikiem | Cel |
|---|---:|---:|---|
| Name | Tak | Tak | Funkcjonalność/personalizacja |
| Email Address | Tak | Tak | Logowanie, konto, kontakt |
| User ID | Tak | Tak | Konto, bezpieczeństwo, RLS |
| Fitness | Tak | Tak | Plan, ukończenia, wyniki biegu |
| Health | Tak, tylko po zgodzie | Tak | Readiness/personalizacja planu |
| Product Interaction | Do potwierdzenia | Prawdopodobnie tak | Funkcjonalność/diagnostyka, jeśli telemetria to wysyła |
| Crash/Diagnostic Data | Do potwierdzenia | Do potwierdzenia | Obsługa błędów przez zintegrowane SDK |
| Purchase History | Po StoreKit | Tak | Uprawnienie premium |
| Precise Location | Obecnie nie do serwera | Nie deklarować bez testu | GPS jest lokalny; deklaracja zmieni się, jeśli wrapper/SDK wyśle współrzędne |
| Photos/Videos | Nie w obecnym zakresie | — | Vision Lab i bucket usunięto |
| Device ID / Tracking | Nie planowano | — | Brak reklam i śledzenia między aplikacjami |

Apple rozumie „zbieranie” jako transmisję poza urządzenie na dłużej niż obsługa
żądania w czasie rzeczywistym.[^6] Fitness obejmuje dane o ćwiczeniach, a Health
także dane zdrowotne podane przez użytkownika.[^7]

## GPS i uprawnienia iOS

W kodzie webowym śledzenie zaczyna się dopiero po kliknięciu. Punkty trasy są używane
do obliczeń w pamięci, a zapis Supabase zawiera tylko `duration_sec`, `distance_m`
i `avg_pace_sec_per_km`. To dobry kierunek minimalizacji.

W aplikacji iOS trzeba:

1. używać wyłącznie lokalizacji „When In Use”;
2. wpisać konkretny purpose string, np. „BallWise używa lokalizacji podczas biegu,
   aby na urządzeniu obliczyć dystans i tempo”;
3. nie uruchamiać śledzenia w tle, dopóki nie istnieje uzasadniony i przetestowany
   przypadek użycia;
4. zapewnić ręczną alternatywę/import GPX, jeśli użytkownik odmówi lokalizacji;
5. przetestować: odmowę, ograniczoną dokładność, tunel/utracony sygnał, telefon,
   blokadę ekranu, ubicia procesu, pauzę, wznowienie i duplikację punktów;
6. przechwycić ruch sieciowy i potwierdzić brak `lat/lng` poza urządzeniem.

Apple wymaga zgody, zrozumiałych opisów celu i — gdzie to możliwe — alternatywy dla
odmowy uprawnienia.[^8]

## Zdrowie, trening i odpowiedzialność

Gotowe elementy: brak diagnozy, ostrzeżenia o bólu, możliwość działania bez zgody
zdrowotnej, cofnięcie zgody oraz usunięcie logów readiness. Przed wydaniem:

- niezależny trener przygotowania motorycznego zatwierdza reguły obciążeń;
- dietetyk sportowy zatwierdza wszystkie reguły Fuel, szczególnie kofeinę, posiłki
  dla 13–17 lat i komunikaty „PASUJE”;
- fizjoterapeuta/lekarz sportowy zatwierdza progi bólu i return-to-play;
- aplikacja nie podaje, że mierzy stan zdrowia lub diagnozuje kontuzję;
- Review Notes wyjaśniają, że to narzędzie edukacyjno-treningowe, nie wyrób medyczny;
- każda istotna teza o skuteczności ma źródło i nie jest przedstawiana jako pewnik.

Apple może odrzucić aplikację, która grozi szkodą fizyczną; aplikacje medyczne i
twierdzenia o dokładności są oceniane szczególnie rygorystycznie.[^9]

## Małoletni i konto opiekuna

BallWise nie powinien być zgłaszany do Kids Category. Własny minimalny wiek usługi
to 13 lat. Obecny model 13–15 opiekun / 16–17 zawodnik z dorosłym płatnikiem / 18+
samodzielnie musi być potwierdzony przez prawnika dla każdego rynku.

Testy obowiązkowe:

- 12 lat i 364 dni: brak konta, tylko demo bez zapisu;
- dokładnie 13, 16 i 18 lat: prawidłowa zmiana właściciela/płatnika;
- opiekun nie może potwierdzić się samymi polami przesłanymi z UI;
- link/token opiekuna jest jednorazowy, wygasa i jest związany z właściwym kontem;
- przekazanie konta zachowuje historię, zmienia e-mail przez bezpieczną procedurę i
  wymusza ponowną akceptację właściwych dokumentów;
- usunięcie konta małoletniego usuwa dane zgodnie z tym samym standardem.

## Funkcje, które obecnie nie uruchamiają dodatkowego obowiązku

- **Sign in with Apple:** nie jest wymagane przy wyłącznie własnym e-mailu i haśle;
  obowiązek trzeba ponownie ocenić po dodaniu Google/Facebook.[^10]
- **App Tracking Transparency:** brak reklam i śledzenia między aplikacjami; jeśli
  pojawi się tracking, zgoda ATT musi poprzedzać śledzenie.[^11]
- **UGC/moderacja:** brak publicznych postów, czatu i treści użytkowników.
- **HealthKit:** obecny projekt nie korzysta z HealthKit; nie dodawać uprawnień na
  zapas.
- **Background location:** nie należy go deklarować bez realnej potrzeby.

## Kolejność bezpiecznego wydania

1. Ustalić operatora (najpewniej JDG ojca po zgodzie i formalnym sprawdzeniu), adres,
   e-mail, domenę, podatki i status tradera.
2. Zamknąć krytyczne luki treści: ekspercki przegląd Football IQ bramkarza, wersje
   `draft` oraz ekspercki przegląd generatora i Fuel.
3. Utworzyć aplikację iOS oraz projekt Xcode, dodać purpose strings i manifesty.
4. Zaimplementować StoreKit, 3-dniową ofertę próbną i backendową weryfikację
   entitlementu.
5. Wdrożyć migracje/Edge Functions na właściwy Supabase i wykonać test izolacji dwóch
   kont, zgód, hasła, meczu i usunięcia konta.
6. Wykonać pełną macierz automatyczną i testy urządzeniowe na co najmniej dwóch
   iPhone'ach oraz różnych rozmiarach ekranu.
7. Zamknięty TestFlight; zebrać błędy, nie pobierać opłaty od testerów.
8. Zamrozić build, przechwycić ruch sieciowy, wypełnić App Privacy i age rating.
9. Przygotować konto recenzenta, Review Notes, Support URL, zrzuty i wysłać do review.

## Źródła

[^1]: Apple, [App Review Guidelines — Before You Submit i 2.1](https://developer.apple.com/app-store/review/guidelines/).
[^2]: Apple, [App Review Guidelines — 2.2 Beta Testing](https://developer.apple.com/app-store/review/guidelines/).
[^3]: Apple, [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/).
[^4]: Apple, [App Review Guidelines — 3.1.1 In-App Purchase](https://developer.apple.com/app-store/review/guidelines/).
[^5]: Apple, [App Review Guidelines — 3.1.2 Subscriptions](https://developer.apple.com/app-store/review/guidelines/).
[^6]: Apple, [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/).
[^7]: Apple, [App privacy details — Types of data](https://developer.apple.com/app-store/app-privacy-details/).
[^8]: Apple, [App Review Guidelines — 5.1.1 Permission, Minimization and Access](https://developer.apple.com/app-store/review/guidelines/).
[^9]: Apple, [App Review Guidelines — 1.4 Physical Harm](https://developer.apple.com/app-store/review/guidelines/).
[^10]: Apple, [App Review Guidelines — 4.8 Login Services](https://developer.apple.com/app-store/review/guidelines/).
[^11]: Apple, [App Review Guidelines — 5.1.2 Data Use and Sharing](https://developer.apple.com/app-store/review/guidelines/).
[^12]: Apple, [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
[^13]: Apple, [Upcoming Requirements — DSA trader status and age ratings](https://developer.apple.com/news/upcoming-requirements/).
