# Apple release gate — BallWise

Aktualną bramką jest [wspólna lista wydania](../RELEASE-CHECKLIST.md), sekcja
iOS, App Store i płatności, wraz z [macierzą QA](../QA-MATRIX.md).
Nie utrzymujemy drugiej kopii tych samych checkboxów.

Kod paywalla, zakupu/przywracania przez RevenueCat/Apple, zarządzania subskrypcją
i serwerowych entitlementów jest obecny. [Opis subskrypcji](IAP-SUBSCRIPTION-SPEC.md)
rozdziela implementację od konfiguracji produktów, webhooka i testów sandbox,
które nadal wymagają potwierdzenia dla wybranego środowiska. Sam build mobilny
nie potwierdza podpisania archiwum ani gotowości App Review.
