# BallWise — audyt blokerów wydania (11.09.2026)

## Naprawione w kodzie

- Zgoda zdrowotna jest opcjonalna. Bez niej aplikacja działa w trybie ostrożnym,
  nie pokazuje formularzy zdrowotnych i nie zapisuje check-inu bólu/gotowości.
- Włączenie personalizacji zdrowotnej jest dodatkowo blokowane w bazie, jeśli
  najnowszy audytowany wpis zgody nie jest pozytywny.
- Wycofanie zgody jest operacją serwerową: dopisuje zdarzenie audytowe, wyłącza
  tryb zdrowotny i usuwa zapisane logi gotowości/bólu.
- Dziennik zgód jest tylko do odczytu i dopisywania dla klienta. Aktualizacja,
  kasowanie i truncate są odebrane rolom przeglądarkowym.
- Dane opiekuna nie opierają się już wyłącznie na froncie: baza wiąże profil z
  `auth.uid()`, pobiera e-mail i czas potwierdzenia z `auth.users`, wylicza wiek
  z daty urodzenia profilu i sama nadaje czas oświadczenia.
- Dla wieku 13–15 baza odrzuca zapis bez konta opiekuna, potwierdzonego e-maila,
  imienia opiekuna i oświadczenia. Dla osoby dorosłej wymusza konto własne.
- Zaplanowany mecz ma pełny cykl: „Rozpocznij mecz” → stan rozpoczęty → zapis
  zakończenia. Czasy i status są normalizowane przez trigger bazy.
- Generator ma osobny test regresyjny dla piątego tygodnia przy gęstym układzie:
  zawodnik 14 lat, cel szybkość, cztery treningi klubowe i mecz.
- Interfejs odzyskiwania hasła obejmuje wysłanie linku, obsługę zdarzenia
  `PASSWORD_RECOVERY`, nowe hasło i jego potwierdzenie.
- Produkcyjny tryb aplikacji nie uruchomi się z brakującymi danymi prawnymi.
- Kod wymaga Node.js 22 lub nowszego.

## Wymagane na działającym środowisku

Te punkty nie mogą zostać potwierdzone samym kodem i muszą być wykonane przed
wydaniem:

1. Zastosować wszystkie migracje Supabase w kolejności nazw plików.
2. Uruchomić `supabase/verification/20260911_release_blockers.sql` i uzyskać
   komplet wyników OK oraz `4/4` dla polityk biegania.
3. Skonfigurować własny SMTP, produkcyjny Site URL i dokładny redirect `/auth`.
4. Wdrożyć Edge Function `delete-account` z włączoną weryfikacją JWT.
5. Uzupełnić prawdziwe dane usługodawcy i ustawić `VITE_RELEASE_MODE=production`.
6. Wykonać test E2E na osobnych kontach: dorosły, opiekun zawodnika 13–15,
   odzyskanie hasła, brak zgody zdrowotnej, wycofanie zgody, start/zakończenie
   meczu i usunięcie konta.

## Granica zabezpieczenia opiekuna

Baza potwierdza, że właściciel konta kontroluje zweryfikowany adres e-mail i że
złożył wymagane oświadczenie. Bez zewnętrznej weryfikacji dokumentu lub operatora
nie da się technicznie udowodnić, że dana osoba faktycznie jest opiekunem.
Przyjęty model minimalizuje zaufanie do frontendu, ale nadal opiera tożsamość
opiekuna na jego oświadczeniu. Decyzję, czy przed szerokim wydaniem potrzebna
jest mocniejsza weryfikacja, powinien zatwierdzić prawnik po poznaniu rynku,
skali i dokładnego modelu usługi.

## Wynik kontroli kodu

- TypeScript: OK
- Testy: 633/633
- ESLint: OK
- Build produkcyjny: OK
- Skan przypadkowo zapisanych kluczy/tokenów: brak dopasowań

