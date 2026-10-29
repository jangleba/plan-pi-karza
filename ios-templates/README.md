# Szablony iOS

`npm run ios:setup` sprawdza konfigurację wydania, buduje mobilne SPA i
tworzy/synchronizuje projekt Capacitor na macOS z Xcode. `npm run ios:sync`
powtarza te kontrole dla istniejącego projektu. Oba polecenia wymagają tego
samego `BALLWISE_IOS_BUNDLE_ID` oraz konfiguracji domeny/logowania opisanej w
[instrukcji wdrożenia](../docs/WDROZENIE-2026-10-29.md).

Aktualny setup dodaje opis kamery i lokalizacji, tryb lokalizacji w tle,
Associated Domains oraz kopię pliku prywatności. Istniejące entitlements
zachowuje i wymaga uzgodnienia domeny. Samo skopiowanie pliku nie potwierdza
membership targetu ani poprawnego podpisywania w Xcode; sprawdź raport setupu
`ios/App/ballwise-capabilities.json` i target aplikacji.

Aktywny Lab `/lab` używa przeglądarkowego WebCodecs i kamery/importu filmu.
Adapter natywnej kamery 240 FPS jest zachowany, ale nie jest tą trasą. Nie
obiecuj 240 FPS w Safari/WKWebView: sprawdź tryb oferowany przez dane urządzenie
i znaczniki czasu gotowego filmu. Fuel może odczytać zdjęcie kodu lokalnie;
funkcja serwerowej analizy zdjęcia posiłku nie jest podłączona do obecnego UI.

[Info.plist-purpose-strings.template](Info.plist-purpose-strings.template)
to pomocniczy szablon par klucz/wartość, nie zamiennik całego `Info.plist`.
Obecny setup wpisuje opis kamery bez obietnicy konkretnego FPS. Opis mikrofonu
jest opcjonalny: dodaj go tylko, jeśli docelowe opakowanie rzeczywiście
udostępnia głosowy `SpeechRecognition` w Fuel. Kamera Lab nie nagrywa dźwięku;
alternatywa tekstowa pozostaje dostępna. Dodatkowe natywne API rozpoznawania
mowy lub biblioteki zdjęć wymagałyby własnej konfiguracji uprawnień.

Bieganie korzysta z natywnego runtime na iOS lub geolokalizacji przeglądarki.
Testy zgody, odmowy, przerwania i aktywnego biegu przy zablokowanym ekranie
muszą odbyć się na urządzeniu. Obecność `UIBackgroundModes` nie dowodzi
poprawności pomiaru w tle ani spełnienia wymagań App Review.

[PrivacyInfo.xcprivacy.template](PrivacyInfo.xcprivacy.template) jest szkieletem.
Uzupełnij kategorie i required-reason APIs po raporcie prywatności Xcode oraz
przeglądzie SDK, potwierdź nazwę `PrivacyInfo.xcprivacy` i dołączenie do targetu.
Puste tablice nie stanowią deklaracji gotowej do wysłania.
[App Privacy](../docs/apple/APP-PRIVACY-ANSWERS.md) jest roboczym materiałem do
uzgodnienia z faktycznym kodem/ruchiem, a [lista wydania](../docs/RELEASE-CHECKLIST.md)
zawiera wymagane kontrole. Żaden szablon nie stanowi dowodu publikacji.
