# BallWise — App Store, wiek i prywatność

Przegląd kodu: 29 września 2026. Dokument opisuje przyjęty model produktu oraz
pracę przed wydaniem; nie potwierdza wdrożenia ani indywidualnej oceny prawnej.
Wszystkie zadania i dowody zbieramy w [liście wydania](RELEASE-CHECKLIST.md).

## Model obecnego produktu

Konto spersonalizowane zaczyna się od 13 lat. Dla zawodnika 13–15 właścicielem
jest rodzic lub opiekun; aplikacja wymaga jego oświadczenia i potwierdzenia
e-maila. Potwierdzenie adresu nie weryfikuje tożsamości ani prawnego statusu
opiekuna. Poniżej 13 lat dostępne jest publiczne demo bez zapisu profilu.
Od 16 lat możliwe jest konto zawodnika, a przed 18 rokiem płatnikiem ma być
dorosły. Przekazanie konta obejmuje zmianę/potwierdzenie adresu i ponowne zgody.
Operator musi zatwierdzić adekwatność tego modelu dla docelowych odbiorców.

Decyzja dnia dotyczy organizacji planu i nie jest ankietą zdrowotną. Przetwarzanie
readiness, bólu i danych zdrowotnych pozostaje objęte osobną opcjonalną zgodą;
bez niej aplikacja stosuje ostrożny wariant. Wyniki biegowe są agregowane:
backend nie otrzymuje trasy GPS. Aplikacja nie diagnozuje ani nie leczy.

Fuel używa tekstu, lokalnego odczytu zdjęcia kodu oraz zewnętrznego odczytu produktu
z Open Food Facts. Głos zależy od usługi rozpoznawania mowy przeglądarki. Funkcja
OpenAI do zdjęć posiłków istnieje na serwerze, lecz bieżący UI jej nie wywołuje.
Nie należy przedstawiać jej jako działającego skanera posiłków.

Stary Vision Lab jest wycofany. Aktywny **BallWise Lab** nagrywa film na iPhonie
przez lokalny plugin 240 FPS i zapisuje wyniki/metadata pomiaru w Supabase; plik
roboczy pozostaje lokalny. Zasady pomiaru i wymagane testy opisuje
[protokół](BALLWISE-LAB-PROTOCOL.md).

## Stan implementacji a odbiór

Kod zawiera ekran praw do danych, eksport JSON, wycofanie zgód, usuwanie konta
przez Edge Function, RLS i mobilny build Capacitor. Nie dostarcza podpisanego
archiwum iOS ani wdrożonego IAP. Otwarta kompletność eksportu, czyszczenie nowych
lokalnych magazynów oraz zgodność treści prawnych z dzisiejszym Fuel są zapisane
w [liście wydania](RELEASE-CHECKLIST.md); nie są naprawione samą dokumentacją.

Apple wymaga możliwości rozpoczęcia usuwania konta w aplikacjach obsługujących
jego tworzenie. Obecna ścieżka to **Profil → Moje dane i prawa → Usuń konto i dane**;
trzeba potwierdzić jej działanie w wybranym backendzie.
[Wymogi Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

## Przygotowanie sklepu

Uzupełnij [konfigurację prawną](LEGAL-CONFIGURATION.md), publiczne adresy wsparcia
i prywatności, metadane, zrzuty oraz końcową listę SDK. App Privacy musi opisywać
rzeczywiste zbieranie danych przez aplikację i partnerów.
[Instrukcja Apple](https://developer.apple.com/app-store/app-privacy-details/).

Wypełnij kwestionariusz wieku na podstawie aktualnej treści. Jeśli ograniczenie
wieku usługi jest wyższe od wyniku, Apple przewiduje podniesienie oceny; wartości
mogą zależeć od regionu. Kids Category nie jest domyślnym wyborem BallWise.
[Ocena wieku](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).

Proponowany płatny wariant wymaga osobnego wdrożenia
[IAP i entitlementów](apple/IAP-SUBSCRIPTION-SPEC.md). Nie ma obecnie ekranu
zakupu, przywracania ani zarządzania subskrypcją. Nie wpisuj tych ścieżek do
[Review Notes](apple/APP-REVIEW-NOTES.md) przed ich implementacją i testami.

Przed review zapewnij pełny dostęp testowy, działający backend i instrukcję
funkcji wymagających kamery/sprzętu. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
Zamknięta beta TestFlight jest etapem do zaplanowania po testach lokalnych i
urządzeniowych, a jej konfiguracja/review ma własny proces.
[Testerzy zewnętrzni](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).
