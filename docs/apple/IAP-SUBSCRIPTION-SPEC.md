# Specyfikacja subskrypcji Apple IAP

## Produkt

- Typ: Auto-Renewable Subscription
- Grupa: BallWise Pro
- Product ID: `app.ballwise.pro.monthly` (ostatecznie dopasuj do bundle ID)
- Okres: 1 miesiąc
- Cena docelowa w Polsce: 119 PLN; faktyczną cenę wybiera się z price points Apple
- Introductory Offer: Free Trial, 3 days
- Dostęp: pełne moduły BallWise zgodnie z opisem produktu

## Ekran zakupu

Musi pokazywać przed zatwierdzeniem:

- nazwę planu;
- pełną cenę i okres rozliczeniowy;
- „3 dni bez opłaty”, jeżeli użytkownik kwalifikuje się do trialu;
- datę rozpoczęcia opłaty wynikającą z StoreKit;
- automatyczne odnawianie do anulowania;
- zakres funkcji;
- linki do Regulaminu/EULA i Polityki prywatności;
- przycisk zakupu;
- „Przywróć zakupy”;
- „Zarządzaj subskrypcją”.

Nie pokazuj trialu osobie, której StoreKit nie kwalifikuje do oferty.

## Backend

- weryfikuj transakcję po stronie serwera;
- użyj App Store Server API i Server Notifications V2;
- przechowuj minimalnie: user_id, original_transaction_id, product_id, status, expires_at, environment;
- obsłuż revocation, refund, expiration, grace period i billing retry;
- nigdy nie przyznawaj dostępu tylko na podstawie flagi z klienta;
- usunięcie konta powinno usunąć mapowanie użytkownika, ale nie wolno fałszywie obiecywać, że anuluje subskrypcję Apple.

## StoreKit test matrix

1. zakup bez trialu;
2. zakup z trialem;
3. restore na drugim urządzeniu;
4. anulowanie i dostęp do końca okresu;
5. wygaśnięcie;
6. billing retry/grace period;
7. refund/revocation;
8. usunięcie konta z aktywną subskrypcją;
9. ponowne konto i próba nieuprawnionego ponownego trialu.

