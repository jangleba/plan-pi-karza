# BallWise — jedna lista kontroli wydania

Stan: 29 września 2026. To lista do wykonania dla konkretnego commitu i środowiska.
Zaznaczenie wymaga dowodu i właściciela; brak zaznaczenia nie jest wynikiem testu.
Dawne checklisty Apple i prawne kierują tutaj.

## Kod i produkt

- [ ] Czyste `npm ci` i `npm run verify:release`; zapisz commit, log i pomiary wielkości web/mobile.
- [ ] Przejdź [macierz QA](QA-MATRIX.md): konta, plan, sesje, offline, IQ, Fuel, Lab i trening reaktywny; brak otwartych P0/P1.
- [ ] Trener i dietetyk zatwierdzili reguły/treść; Lab ma własne dowody walidacji przed deklarowaniem dokładności. Komunikaty nie obiecują diagnozy, leczenia ani zapobiegania urazom.
- [ ] Sprawdź wszystkie adresy zachowanych zasobów, placeholdery, linki i intent loading na świeżym buildzie; podglądy dokumentacyjne nie trafiają do paczki.

## Backend i prywatność

- [ ] Operator wybrał projekt Supabase; wszystkie migracje oraz odpowiednie odczytowe kontrole z `supabase/verification` wykonano i zapisano wyniki. Test A/B potwierdza RLS, zgody, Lab i usuwanie.
- [ ] Funkcja `delete-account` działa dla aktualnego JWT i usuwa właściwe konto oraz dane objęte kaskadą. Potwierdź zachowanie pozostałych sesji, backupów i ewentualnych obiektów Storage.
- [ ] **Otwarta luka eksportu:** `data-rights.tsx` eksportuje konto (ID/e-mail) i 17 tabel; nie obejmuje metadanych Auth, `lab_test_results` ani wszystkich danych lokalnych. Uzgodnij pełny zakres i popraw eksport przed obietnicą „wszystkich danych”.
- [ ] **Otwarta luka czyszczenia lokalnego:** `clearLocalUserData` nie obejmuje wszystkich nowszych kluczy, m.in. `ballwise:lab:results`, `ballwise:daily-plan-checkin:v2` i `ballwise:fuel:last-choice`. Sprawdź pełny wykaz kluczy i pliki robocze przy wylogowaniu/usunięciu; działająca obsługa starszych kluczy nie potwierdza pokrycia nowych.
- [ ] **Otwarta zgodność tekstów:** polityka i zgody w kodzie muszą odpowiadać aktywnemu Fuel (kod/Open Food Facts i opcjonalna mowa), natywnemu Lab oraz faktycznemu eksportowi/retencji. Opis zdjęć AI nie dowodzi podłączenia funkcji do UI.
- [ ] Jeśli utrzymujesz wdrożone `analyze-fuel-photo`, skonfiguruj originy, sekrety i quota RPC; przejdź testy odmowy i limitu z [instrukcji](../supabase/functions/analyze-fuel-photo/README.md). Nie opisuj jej jako funkcji obecnego ekranu Fuel.
- [ ] Jeżeli projekt miał Vision Lab, potwierdź jednorazowe usunięcie dawnego bucketa przez [Storage API](VISION-LAB-CLEANUP.md). Nie usuwaj danych aktywnego Lab.
- [ ] Operator potwierdził listę dostawców/SDK, region, retencję kont/zgód/backupów i transfery; audyt ruchu obejmuje także Open Food Facts, rozpoznawanie mowy oraz ewentualne raportowanie Lovable.

## Prawo, wiek i bezpieczeństwo

- [ ] Wszystkie dziesięć `VITE_LEGAL_*` zawiera zatwierdzone fakty; w buildzie ustawiono `VITE_RELEASE_MODE=production`. Sprawdź UI przy brakującej wartości oraz dokumenty po uzupełnieniu; same niepuste placeholdery przechodzą kontrolę techniczną.
- [ ] Operator i prawnik zatwierdzili dokumenty, podstawy przetwarzania, ocenę skutków, reklamacje i procedurę praw osób. Jest działający adres kontaktowy oraz procedura incydentów.
- [ ] Granice 13/16/18 i przekazanie konta sprawdzono; weryfikacja e-maila potwierdza adres, a status opiekuna opiera się na oświadczeniu. Zatwierdź, czy ten model jest wystarczający dla docelowego wydania.
- [ ] Odmowa/cofnięcie zgody zdrowotnej pozostawia działający ostrożny plan; usunięcie danych zdrowotnych i brak ich ponownego wysłania z kolejki potwierdzono na backendzie.
- [ ] Ocena wieku App Store odpowiada kwestionariuszowi i ograniczeniom produktu; Kids Category nie jest przyjmowane automatycznie.

## iOS, App Store i płatności

- [ ] Własny bundle ID, projekt z `ios:setup`, podpisywanie, App ID i archiwum w Xcode są gotowe; `ios:sync` używa tego samego bundle ID.
- [ ] Na fizycznych iPhone'ach sprawdzono kamerę Lab 240 FPS, odmowę/przerwanie, GPS, skanowanie kodu i opcjonalny głos. Uprawnienia i purpose strings odpowiadają wyłącznie rzeczywiście udostępnionym funkcjom.
- [ ] Uzupełniono [szablony iOS](../ios-templates/README.md), membership privacy manifest oraz deklaracje API/SDK według raportu Xcode. Sam pusty szablon nie jest gotowym manifestem.
- [ ] [App Privacy](apple/APP-PRIVACY-ANSWERS.md) zatwierdzono względem kodu, partnerów i ruchu sieciowego; publiczne HTTPS Privacy Policy/Support URL i metadane sklepu są prawdziwe.
- [ ] [Review Notes](apple/APP-REVIEW-NOTES.md) zawierają działające konto testowe, instrukcję Lab/sprzęt oraz środowisko; usługi dostępne podczas review. Demo publiczne nie zastępuje dostępu do wszystkich recenzowanych funkcji.
- [ ] **Warunkowo, przed płatnym wydaniem:** zaimplementowano [IAP](apple/IAP-SUBSCRIPTION-SPEC.md), serwerowe entitlementy, zakup/przywrócenie/zarządzanie oraz całą macierz StoreKit. Obecny kod nie ma tych ekranów; cena i trial w propozycji nie są zatwierdzoną ofertą.
- [ ] Przetestowano docelowe logowanie i linki Auth; jeśli dodano login społecznościowy, oceniono wymogi Guideline 4.8. Konfiguracji Apple nie potwierdza obecność opisu w repozytorium.

## Źródła platformowe

Sprawdzono 29 września 2026; ponownie sprawdź przy wysyłaniu wydania:
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[usuwanie konta](https://developer.apple.com/support/offering-account-deletion-in-your-app/),
[App Privacy](https://developer.apple.com/app-store/app-privacy-details/),
[ocena wieku](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).
