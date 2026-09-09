# BallWise — App Store, wiek i prywatność

Stan checklisty: 9 września 2026. To robocza checklista produktu i wdrożenia,
nie indywidualna porada prawna ani gwarancja akceptacji przez Apple.

## Ustalone zasady produktu

- BallWise nie trafia do kategorii Kids i nie jest opisywany jako aplikacja
  „dla dzieci”. Docelowe oznaczenie wieku: co najmniej 13+.
- Poniżej 13 lat dostępny jest tylko publiczny tryb demonstracyjny bez konta i
  bez zapisu danych osobowych.
- Dla zawodnika 13–15 właścicielem konta, osobą akceptującą dokumenty i
  płatnikiem jest rodzic lub opiekun. Jest to zgodne z przyjętym modelem dla
  usług elektronicznych: UODO wskazuje, że w Polsce dla osoby poniżej 16 lat o
  zgodzie na przetwarzanie danych w takiej usłudze decyduje rodzic lub opiekun:
  https://uodo.gov.pl/pl/493/2261
- Od 16 lat zawodnik może mieć własne konto. Do ukończenia 18 lat płatnikiem
  pozostaje dorosły. Istniejące konto opiekuna można przekazać zawodnikowi przez
  zmianę i potwierdzenie e-maila bez zmiany identyfikatora ani utraty historii.
- Data urodzenia służy do progów 13/16/18. Nie żądamy dokumentu tożsamości.
- Zgoda na cztery dane gotowości — sen, energia, zmęczenie nóg i ból — jest
  osobna, dobrowolna i możliwa do wycofania. Bez niej aplikacja działa w trybie
  ostrożnym i nie zapisuje tych odpowiedzi.
- Dane zdrowotne i treningowe nie są używane do reklam ani marketingowego
  profilowania. BallWise nie diagnozuje, nie leczy i nie udaje pomiaru medycznego
  ani czasu reakcji.
- Przy biegu do bazy trafiają tylko dystans, czas i średnie tempo oraz niezbędne
  identyfikatory techniczne. Współrzędne i przebieg trasy służą do obliczeń w
  pamięci urządzenia i nie są zapisywane zdalnie.

Apple rozróżnia wymogi prywatności dotyczące małoletnich od bramki rodzicielskiej
w kategorii Kids. Apple pozwala też podnieść wyliczoną kategorię wiekową; gdy
minimalny wiek w warunkach usługi jest wyższy niż wynik kwestionariusza, trzeba
zastosować wyższe oznaczenie:
https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/

## Co zostało przygotowane w kodzie

- bramka wieku i model właściciel/opiekun/płatnik;
- audytowane, rozdzielone zgody i ponowna akceptacja po przekazaniu konta;
- publiczny tryb demo dla osób bez konta;
- pobranie danych, wycofanie zgody zdrowotnej i widoczne usunięcie całego konta;
- serwerowa funkcja usuwania Auth usera i kaskadowe usuwanie danych;
- RLS dla wyników biegowych i minimalizacja danych GPS;
- pełne usunięcie interfejsu, biblioteki, tabeli i docelowo bucketa Vision Lab;
- komunikaty bezpieczeństwa bez obietnic medycznych;
- tygodniowe minima oraz limit maksymalnie dwóch sesji treningowych dziennie.

Apple wymaga, aby aplikacja tworząca konta umożliwiała rozpoczęcie usuwania
całego konta w aplikacji. Sama dezaktywacja nie wystarcza. Przygotowany ekran i
Edge Function realizują ten kierunek, ale trzeba je sprawdzić na wdrożonym
środowisku:
https://developer.apple.com/support/offering-account-deletion-in-your-app/

## Blokery przed prawdziwym wydaniem

1. **Dane usługodawcy.** Uzupełnij pełną nazwę administratora, adres, e-mail do
   spraw prywatności i rzeczywisty okres retencji. Nie wolno zostawić
   placeholderów.
2. **Rzeczywista infrastruktura.** Potwierdź region Supabase, listę podmiotów
   przetwarzających, kopie zapasowe i prawdziwy czas usuwania danych z backupów.
3. **Natywna aplikacja.** Ten projekt jest obecnie aplikacją webową. Trzeba
   utworzyć i przetestować projekt iOS, podpisać go w Xcode i zbudować archiwum.
4. **Lokalizacja.** Dodać jasny opis uprawnienia lokalizacji „podczas używania”.
   Nie włączać śledzenia w tle bez rzeczywistej potrzeby. Przetestować blokadę
   ekranu, utratę GPS, telefon i wznowienie biegu na prawdziwym iPhonie.
5. **App Privacy i manifesty.** Zadeklarować faktycznie zbierane dane, w tym
   e-mail, identyfikator, datę urodzenia, profil treningowy, dane fitness i — po
   zgodzie — odpowiedzi związane ze zdrowiem. Lokalizację oznaczyć jako
   „zbieraną” tylko wtedy, jeśli natywny kod lub którekolwiek SDK rzeczywiście
   wysyła ją poza urządzenie. Zrobić końcowy audyt wszystkich SDK.
6. **Karta sklepu.** Potrzebne są ikona, zrzuty z iPhone'a, opis, słowa kluczowe,
   Support URL, publiczny Privacy Policy URL, kategoria, informacje kontaktowe i
   komplet odpowiedzi age rating. Ustawić 13+ albo użyć override do 13+, jeśli
   Apple wyliczy mniej.
7. **Review.** Backend musi działać. Przygotować stabilne konto recenzenta z
   pełnym dostępem lub uzgodniony pełny tryb demo oraz dokładne Review Notes.
8. **Płatności.** Jeżeli funkcje cyfrowe albo subskrypcja będą sprzedawane w
   aplikacji, osobno zaprojektować zgodny model In-App Purchase. W tej paczce nie
   ma gotowego systemu płatności.
9. **Sprzedaż w UE.** Uzupełnić wymagane przez App Store Connect dane statusu
   przedsiębiorcy/tradera, podatki i umowy konta deweloperskiego zgodnie z
   faktycznym modelem działalności.

Pełne wytyczne Apple obejmują m.in. bezpieczeństwo fizyczne, minimalizację danych,
zgody, dzieci, lokalizację, dane zdrowotne, płatności i kompletność aplikacji:
https://developer.apple.com/app-store/review/guidelines/

## TestFlight czy od razu App Store

Można wysłać ukończoną aplikację bez publicznej bety prosto do App Review.
Wersji beta nie wolno jednak publikować jako zwykłej aplikacji w App Store — do
tego służy TestFlight. Dla planowanych 10 osób najlepsza jest zamknięta grupa
zewnętrzna TestFlight, jeśli testerzy nie są użytkownikami App Store Connect.
Apple dopuszcza do 10 000 testerów zewnętrznych; build dla nich przechodzi etap
TestFlight App Review:
https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/

Praktyczna kolejność:

1. wdrożenie bazy, Edge Function i konfiguracji prawnej na środowisko testowe;
2. natywny build i test na co najmniej dwóch rzeczywistych iPhone'ach;
3. zamknięty TestFlight dla 10 osób, w tym konto opiekuna i zawodnika;
4. poprawienie błędów krytycznych, finalne App Privacy i materiały sklepu;
5. wysłanie produkcyjnego buildu do App Review.

TestFlight nie zastępuje zgodności prawnej, ale bardzo zmniejsza ryzyko, że
pierwsi użytkownicy sklepu znajdą błąd w logowaniu, GPS lub usuwaniu konta.

