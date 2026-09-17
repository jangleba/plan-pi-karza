# App Store Connect — proponowane odpowiedzi App Privacy

To wariant konserwatywny dla audytowanego kodu. Po dodaniu natywnych SDK zaktualizuj odpowiedzi.

Na pytanie „czy aplikacja lub partnerzy zbierają dane?” odpowiedź: **Tak**.

| Kategoria Apple | Dane BallWise | Cel | Linked to user | Tracking |
|---|---|---|---:|---:|
| Contact Info — Name | imię właściciela/zawodnika | App Functionality | Tak | Nie |
| Contact Info — Email Address | konto/opiekun | App Functionality | Tak | Nie |
| Identifiers — User ID | UUID Supabase | App Functionality | Tak | Nie |
| Health — Health | ból, sen, energia, zmęczenie, stres, alergie, nietolerancje, masa | App Functionality, Product Personalization | Tak | Nie |
| Health — Fitness | treningi, RPE, wyniki, dystans, tempo | App Functionality, Product Personalization | Tak | Nie |
| User Content — Other User Content | notatki sesji, opis posiłku użyty lokalnie | App Functionality | Tak dla notatek; oceń opis skanu | Nie |
| User Content — Photos or Videos | zdjęcie posiłku przesyłane do OpenAI | App Functionality | Oznacz konserwatywnie Tak | Nie |
| Diagnostics — Crash Data | jeśli produkcyjne raportowanie Lovable/SDK jest aktywne | App Functionality | [POTWIERDŹ] | Nie |
| Diagnostics — Other Diagnostic Data | route/error metadata, jeśli aktywne | App Functionality | [POTWIERDŹ] | Nie |
| Purchases | status subskrypcji/identyfikator transakcji, gdy wdrożysz backend IAP | App Functionality | Tak | Nie |

## Nie zaznaczaj bez dowodu

- Precise Location / Coarse Location — audytowany backend nie zapisuje GPS.
- Advertising Data, Product Interaction dla analityki, Device ID, Other Data — dopiero jeśli konkretny SDK naprawdę je zbiera.
- Data Used to Track You — obecny produkt nie powinien śledzić; nie dodawaj SDK reklamowego.

## Ważne

Apple wymaga ujęcia danych zbieranych przez partnerów i SDK, nie tylko własną bazę. `store:false` nie usuwa obowiązku opisania przesłania zdjęcia do partnera.

