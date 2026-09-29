# Konfiguracja prawna wydania

Źródłem kluczy jest `src/lib/loadwise/legal.ts`. Wartości z
[.env.legal.example](../.env.legal.example) przenieś do konfiguracji środowiska
budującego aplikację. Plik przykładowy nie jest automatycznie ładowany przez Vite.

| Klucz | Wymagana treść |
| --- | --- |
| `VITE_LEGAL_ADMIN_NAME` | Pełna nazwa administratora/usługodawcy |
| `VITE_LEGAL_BUSINESS_ADDRESS` | Adres przedsiębiorcy |
| `VITE_LEGAL_REGISTRY_DETAILS` | Właściwe dane rejestrowe, np. CEIDG/KRS/NIP |
| `VITE_LEGAL_CONTACT_EMAIL` | Obsługiwany kontakt do praw osób i reklamacji |
| `VITE_LEGAL_ACCOUNT_RETENTION` | Retencja konta, profilu i powiązanych danych |
| `VITE_LEGAL_CONSENT_RETENTION` | Retencja dowodów zgód zgodna z kaskadą usunięcia |
| `VITE_LEGAL_BACKUP_RETENTION` | Faktyczny okres retencji kopii zapasowych |
| `VITE_LEGAL_SUPABASE_REGION` | Region wybranego projektu Supabase |
| `VITE_LEGAL_SUBSCRIPTION_PRICE` | Obecna cena i okres lub opis braku sprzedaży |
| `VITE_LEGAL_TRIAL_DESCRIPTION` | Obecne warunki próby lub opis jej niedostępności |

`VITE_RELEASE_MODE=production` włącza aplikacyjną bramkę brakujących wartości.
Tryb Vite `production` ani `npm run build` nie ustawiają tej zmiennej za operatora.
Bramka sprawdza tylko, czy dziesięć wartości jest niepustych: nie wykryje
przykładowej nazwy, błędnego adresu ani nieprawdziwej ceny. Placeholdery należy
usunąć ręcznie i sprawdzić wyrenderowane dokumenty w docelowym buildzie.

Przed publikacją operator potwierdza region, dostawców, transfery, retencję i
kopie zapasowe. Dane administratora są publiczną konfiguracją, a nie sekretami.
Klucze OpenAI i `service_role` należą wyłącznie do konfiguracji serwerowej.

StoreKit i paywall nie są wdrożone; wartości prawne nie mogą sugerować aktywnej
sprzedaży lub trialu tylko dlatego, że opisuje je dokument propozycji. Jeśli
funkcja zdjęć Fuel zostanie podłączona, trzeba ponownie zatwierdzić informację
o przesyłaniu danych do dostawcy i faktyczne warunki ich retencji. `store: false`
w żądaniu nie jest dowodem braku wszystkich kopii po stronie dostawcy.

Do zamknięcia pozostają również zgodność tekstów prawnych z obecnym Fuel,
kompletność eksportu oraz czyszczenie wszystkich lokalnych magazynów. Są
wymienione w [jednej liście wydania](RELEASE-CHECKLIST.md), aby nie traktować
samego uzupełnienia zmiennych jako odbioru prawnego lub technicznego.
