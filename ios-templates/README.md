# Szablony iOS

`npm run ios:setup` tworzy/synchronizuje Capacitor na macOS i wpisuje opis kamery;
`npm run ios:sync` powtarza build i synchronizację istniejącego projektu. Oba
polecenia wymagają tego samego `BALLWISE_IOS_BUNDLE_ID`. Pozostałe ustawienia
podpisywania, uprawnień i manifestu należą do docelowego projektu Xcode.

[Info.plist-purpose-strings.template](Info.plist-purpose-strings.template)
zawiera parę dla kamery: aktywny Lab nagrywa próby 240 FPS, a Fuel może otworzyć
aparat przez pole zdjęcia kodu, jeśli platforma obsługuje tę ścieżkę. Skopiuj
parę do głównego `dict` właściwego `Info.plist`, nie cały plik jako zamiennik.

Opis mikrofonu jest w szablonie jako opcjonalna para: dodaj go, jeśli testowane
opakowanie natywne udostępnia głosowy `SpeechRecognition` z Fuel. Zawsze działa
alternatywa tekstowa. Kamera Lab nie nagrywa dźwięku. Nie dodawaj opisu analizy
zdjęć posiłków ani dostępu do całej biblioteki tylko dlatego, że istnieje
niepodłączona Edge Function. Jeśli później dodasz natywny dostęp do biblioteki
zdjęć lub rozpoznawania mowy, skonfiguruj wymagane klucze dla faktycznych API.

Bieganie korzysta z geolokalizacji; wymagane opisy i zachowanie zgody w docelowym
WKWebView należy potwierdzić na urządzeniu. Setup automatycznie dodaje wyłącznie
kamerę — nie jest pełną konfiguracją wszystkich uprawnień.

[PrivacyInfo.xcprivacy.template](PrivacyInfo.xcprivacy.template) jest szkieletem.
Uzupełnij kategorie i required-reason APIs po raporcie prywatności Xcode oraz
przeglądzie wszystkich SDK, nadaj nazwę `PrivacyInfo.xcprivacy` i dołącz do targetu.
Puste tablice nie stanowią deklaracji gotowej do wysłania.
[App Privacy](../docs/apple/APP-PRIVACY-ANSWERS.md) i
[lista wydania](../docs/RELEASE-CHECKLIST.md) zawierają otwarte kontrole.
