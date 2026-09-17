# Apple release gate — BallWise

## P0

- [ ] Istnieje natywny projekt iOS (Capacitor lub inna zatwierdzona warstwa), bundle ID i podpisy.
- [ ] Zakup 119 zł/mies. jest wdrożony jako auto-renewable subscription w StoreKit/IAP.
- [ ] Trzydniowy trial jest introductory offer w App Store Connect, nie własnym licznikiem omijającym IAP.
- [ ] Są „Przywróć zakupy” i „Zarządzaj subskrypcją”.
- [ ] Cena, okres, automatyczne odnowienie i anulowanie są pokazane przed zakupem.
- [ ] Polityka prywatności ma publiczny HTTPS URL i jest dostępna w aplikacji.
- [ ] Usunięcie konta działa wewnątrz aplikacji i wyjaśnia osobno aktywną subskrypcję.
- [ ] App Privacy odpowiada rzeczywistemu kodowi oraz wszystkim partnerom.
- [ ] `Info.plist` ma dokładne purpose strings dla kamery, zdjęć i mikrofonu.
- [ ] `PrivacyInfo.xcprivacy` jest w target membership i został uzupełniony po analizie SDK.
- [ ] Brak placeholderów prawnych i pustych URL.
- [ ] App Review ma działające konto testowe albo w pełni funkcjonalne demo.
- [ ] Backend i skaner AI działają w czasie review.

## Zdrowie i bezpieczeństwo

- [ ] Opis aplikacji nie używa słów „diagnozuje”, „leczy”, „zapobiega kontuzjom” ani gwarancji wyników.
- [ ] Rekomendacje i pomiary są opisane jako szacunki.
- [ ] Ból i czerwone flagi zatrzymują ryzykowną sesję.
- [ ] Fuel nie udaje wykrywania alergenów lub dokładności laboratoryjnej.
- [ ] App Review Notes wyjaśniają metodologię: profil + kalendarz + dobrowolny check-in, bez urządzeń medycznych.
- [ ] Dane zdrowotne i fitness nie są używane do reklam ani data miningu.

## Konto i wiek

- [ ] Własne członkostwo Apple Developer Program jest aktywne.
- [ ] Apple login jest skonfigurowany na własnym App ID, Services ID i kluczu; tryb Managed by Lovable nie został użyty dla kont produkcyjnych.
- [ ] Przycisk „Zaloguj przez Apple” pojawia się dopiero po poprawnej konfiguracji i został przetestowany także z Hide My Email.
- [ ] 13–15: konto opiekuna, zweryfikowany e-mail, brak zakupu przez dziecko.
- [ ] Poniżej 13 lat: wyłącznie demo bez zapisu.
- [ ] Age Rating w App Store Connect odpowiada treści i nie używa Kids Category bez świadomej decyzji.
- [ ] Jeśli później pojawi się Google/Facebook login, dodano równoważną opcję logowania spełniającą Guideline 4.8. Przy własnym e-mail/haśle dodatkowy login Apple nie jest obecnie wymagany.

## Techniczne

- [ ] Test na urządzeniu: kamera, biblioteka zdjęć, mikrofon, offline, przerwanie uploadu.
- [ ] Test zakupu: nowy zakup, trial, odnowienie, anulowanie, wygaśnięcie, billing retry, restore.
- [ ] Test usunięcia: konto z aktywną i wygasłą subskrypcją.
- [ ] Brak sekretnych kluczy w bundle; klucz OpenAI wyłącznie w Edge Function.
- [ ] HTTPS i ATS bez wyjątków.
