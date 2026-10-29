# Subskrypcje iOS — implementacja i odbiór

Stan kodu: 29 października 2026. To opis istniejącej implementacji i wymaganej
konfiguracji, nie potwierdzenie aktywnej sprzedaży, wdrożenia ani testów Apple.

## Co jest w kodzie

- `src/features/billing`: paywall, pobranie oferty, zakup i przywracanie przez
  RevenueCat/Apple, stan dostępu i link do zarządzania subskrypcją Apple.
- `billing-status` i `billing-webhook`: weryfikacja dostępu na backendzie,
  aktualizacja entitlementów i obsługa zdarzeń RevenueCat.
- Dostęp jest przypisany do konta BallWise; rozpoczęta sesja treningowa nie
  powinna zostać przerwana przez wygaśnięcie subskrypcji.
- Zakup jest oferowany w skonfigurowanej aplikacji iOS; przeglądarka może
  sprawdzić dostęp istniejącego konta, ale nie udaje natywnego zakupu.

## Produkt i konfiguracja

Kod wybiera miesięczny produkt wskazany przez `VITE_REVENUECAT_PRODUCT_ID` z
bieżącej oferty RevenueCat. Cenę i walutę pokazuje z danych sklepu — w repozytorium
nie ustalamy ceny handlowej ani nie deklarujemy zatwierdzonej oferty.

Jeżeli oferta obejmuje darmowy trial, kod dopuszcza **7 dni** i pokazuje go
wyłącznie przy potwierdzonej kwalifikacji użytkownika. Inny darmowy okres blokuje
zakup do uzgodnienia oferty. Nie obiecuj trialu każdemu użytkownikowi.

Wymagane są konfiguracja produktu i oferty w Apple/RevenueCat, publiczny klucz
iOS `appl_…`, klucze/identyfikatory backendu, sekret webhooka oraz dozwolone
originy. `VITE_BILLING_ENFORCED=true` i `BILLING_ENFORCED=true` włączają odpowiednie
bramki klienta i backendu. Sekrety nigdy nie należą do `VITE_*` ani ZIP-a z kodem.
Szczegóły instalacji: [bieżące wdrożenie](../WDROZENIE-2026-10-29.md) oraz
[konfiguracja październikowa](../INSTALLATION-2026-10.md).

## Odbiór ekranu zakupu

Sprawdź na urządzeniu rzeczywistą cenę i okres rozliczeniowy, kwalifikację do
trialu, automatyczne odnawianie, informację o pierwszej opłacie, zakres funkcji,
Regulamin/Politykę prywatności oraz zakup, przywracanie i zarządzanie.
Usunięcie konta BallWise nie anuluje subskrypcji Apple; tekst interfejsu musi to
jasno wyjaśniać. Potwierdzenie klienta nie zastępuje weryfikacji backendu.

## Macierz Apple/RevenueCat sandbox

1. Zakup bez trialu i z kwalifikacją do zgodnego trialu; anulowanie okna zakupu.
2. Przywrócenie na drugim urządzeniu i zalogowanie do właściwego konta BallWise.
3. Anulowanie odnowienia oraz dostęp do końca okresu.
4. Wygaśnięcie, grace/billing retry, refund/revocation i opóźniony webhook.
5. Błąd sieci/oferty/backendu, ponowienie oraz stary lub uszkodzony cache dostępu.
6. Wylogowanie lub zmiana konta podczas zakupu i sprawdzania entitlementu.
7. Wygaśnięcie podczas rozpoczętego treningu; historia i prawa do danych pozostają dostępne.
8. Usunięcie konta z aktywną subskrypcją i ponowne konto bez nieuprawnionego trialu.

Każdy wynik zapisz z commitem/buildem, urządzeniem, środowiskiem sklepu i dowodem.
Testy kodu nie potwierdzają przejścia powyższych operacji w Apple sandbox.
Przed płatnym wydaniem zamknij [listę wydania](../RELEASE-CHECKLIST.md) i sprawdź
aktualne [wytyczne zakupów Apple](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase).
