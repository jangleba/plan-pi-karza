# App Store Connect — robocze odpowiedzi App Privacy

Przegląd kodu: 29 września 2026. To mapa danych do końcowej deklaracji, nie gotowy
formularz do wysłania. Operator musi sprawdzić docelowy build, ruch sieciowy,
retencję dostawców i wszystkie SDK. Konto i historia trafiają do Supabase,
więc aplikacja zbiera dane; brak zapisu obrazu nie oznacza braku danych wynikowych.

| Dane w kodzie | Kandydat kategorii Apple | Stan / cel / powiązanie |
| --- | --- | --- |
| Imię zawodnika/właściciela, e-mail, dane opiekuna | Contact Info | Funkcjonalność konta; powiązane z użytkownikiem |
| UUID konta | Identifiers — User ID | Funkcjonalność i synchronizacja; powiązane |
| Data urodzenia, profil sportowy, zgody | Przyporządkuj według aktualnych definicji formularza | Personalizacja i obsługa konta; powiązane |
| Zapisane dane gotowości, ból, alergie/nietolerancje, opcjonalna masa | Health & Fitness | Zakres zależny od zgód; powiązane, personalizacja |
| Sesje, serie, RPE, czas/dystans/tempo biegu, wyniki i metadata Lab | Health & Fitness | Historia/personalizacja; powiązane |
| Notatki sesji | User Content — Other User Content | Zapis podlega regułom zgody zdrowotnej; powiązane |
| Kod produktu i zapytanie do Open Food Facts | Do oceny na podstawie faktycznego przetwarzania partnera | Kod wysyłany bez danych profilu w payloadzie; sprawdź także metadata sieciowe/retencję |
| Głos w opcjonalnym SpeechRecognition | Do oceny usługi mowy na wspieranej platformie | Nie zakładaj przetwarzania wyłącznie lokalnego; sprawdź Audio Data i partnerów |
| Błędy/metadata trasy | Diagnostics, jeśli wysyłane w buildzie produkcyjnym | Potwierdź działanie raportowania Lovable i każdego SDK |

## Obrazy, lokalizacja i funkcje niewdrożone

Zdjęcie kodu Fuel dekoduje się na urządzeniu. Film Lab jest lokalnym plikiem
roboczym, natomiast wynik trafia do bazy. Trasa GPS służy lokalnym obliczeniom;
backend otrzymuje agregaty. Sprawdź sieć i natywne SDK przed zaznaczeniem lub
pominięciem Photos or Videos / Location. Według Apple dane przetwarzane wyłącznie
na urządzeniu nie są „collected”; dane pochodne wysłane na serwer ocenia się
osobno. [Definicje Apple](https://developer.apple.com/app-store/app-privacy-details/).

Funkcja `analyze-fuel-photo` jest zachowana, ale obecny ekran Fuel jej nie wywołuje.
Po podłączeniu zdjęć AI ponownie oceń obrazy, metadane, notice i retencję partnera.
`store: false` w kodzie nie stanowi kompletnej deklaracji retencji. Purchases
zależą od przyszłego IAP; bieżące repozytorium nie ma backendu transakcji.

Nie deklaruj tracking jako potwierdzonego „Nie” bez audytu partnerów i SDK.
W źródłach nie ma funkcji reklamowego śledzenia; to nie jest weryfikacja wdrożenia.
Dane zdrowotne nie powinny być używane do reklam. Puste tablice w szablonie
`PrivacyInfo.xcprivacy` wymagają przeglądu, nie są dowodem braku zbierania danych.

Otwarte braki eksportu, czyszczenia urządzenia oraz zgodności polityki są w
[liście wydania](../RELEASE-CHECKLIST.md). Zmiany deklaracji sklepowej nie naprawiają
tych zachowań kodu.
