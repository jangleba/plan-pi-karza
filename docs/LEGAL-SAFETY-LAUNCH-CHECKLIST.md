# BallWise — lista bezpieczeństwa przed publikacją

Ta lista ogranicza ryzyko, ale nie daje gwarancji, że nikt nie złoży roszczenia. Przed płatnym lub publicznym wydaniem dokumenty i model działania powinien sprawdzić polski radca prawny lub adwokat oraz specjalista od ochrony danych.

## 1. Operator i dokumenty

- [ ] Wpisz prawdziwą pełną nazwę przedsiębiorcy, adres, e-mail i okres przechowywania danych do zmiennych `VITE_LEGAL_*`.
- [ ] Upewnij się, że przedsiębiorca faktycznie prowadzi usługę, zawiera umowy, obsługuje płatności i dane — nie używaj wyłącznie „pożyczonego NIP-u”.
- [ ] Prawnik zatwierdził Regulamin, Politykę prywatności, zasady rezygnacji/reklamacji i informacje dla konsumentów.
- [ ] Lista dostawców danych i transferów poza EOG jest aktualna.
- [ ] Jest procedura obsługi żądań dostępu, pobrania, poprawienia i usunięcia danych.

## 2. Zawodnicy niepełnoletni

- [ ] Profil spersonalizowany nie zapisuje danych osoby poniżej 13 lat.
- [ ] Dla wieku 13–15 właścicielem konta jest zweryfikowany rodzic/opiekun.
- [ ] Zgoda opiekuna, jej wersja, czas i osoba składająca są zapisane w dzienniku zgód.
- [ ] Płatnikiem osoby poniżej 18 lat jest osoba dorosła.
- [ ] Proces przekazania konta po ukończeniu 16 lat wymaga ponownego potwierdzenia e-maila i dokumentów.

## 3. Dane o zdrowiu i prywatność

- [ ] Zgoda zdrowotna jest oddzielna, wyraźna, dobrowolna i domyślnie wyłączona.
- [ ] Brak lub wycofanie zgody nie blokuje aplikacji i uruchamia ostrożny wariant bez tych danych.
- [ ] Zgoda marketingowa jest oddzielna i domyślnie wyłączona.
- [ ] Trasa GPS i współrzędne nie trafiają do bazy; zapisywane są tylko wynikowe dystans, czas i tempo.
- [ ] Wykonano DPIA/ocenę skutków dla ochrony danych i zapisano decyzje dotyczące minimalizacji danych.
- [ ] Dostęp do Supabase ma MFA, najmniejsze potrzebne uprawnienia i okresowy przegląd RLS.

## 4. Bezpieczeństwo treningowe

- [ ] BallWise opisuje się jako narzędzie treningowe, nie jako diagnozę, leczenie, rehabilitację ani zgodę na powrót do gry.
- [ ] Ostry ból lub niepokojący objaw zatrzymuje własny trening i kieruje do opiekuna oraz odpowiedniego specjalisty.
- [ ] Test 5-minutowy wymaga przeczytania zasad, rozgrzewki i poprawnego pięciominutowego odcinka GPS.
- [ ] Test nie jest łączony z ciężką siłą nóg; dozwolony drugi blok to najwyżej lekka góra ciała i tułów.
- [ ] Bez wiarygodnego wyniku testu sesji nie można oznaczyć jako ukończonej, a MAS nie jest aktualizowany.
- [ ] Metody treningowe i progi ryzyka zostały podpisane przez kompetentnego trenera przygotowania motorycznego; przypadki zdrowotne konsultuje osoba z właściwymi kwalifikacjami medycznymi.

## 5. Operacje po wydaniu

- [ ] Jest adres do zgłoszeń bezpieczeństwa i procedura odpowiedzi na incydent.
- [ ] Można natychmiast wyłączyć wadliwą metodę lub wersję generatora bez czekania na nowe wydanie aplikacji.
- [ ] Każda wersja silnika, planu, zgody i wykonania sesji ma możliwy do odtworzenia zapis czasu oraz właściciela.
- [ ] Jest ubezpieczenie OC działalności dopasowane do cyfrowej usługi treningowej i użytkowników niepełnoletnich.
- [ ] Przed każdym wydaniem przechodzą testy typów, testy automatyczne, lint oraz build produkcyjny.

## Źródła do weryfikacji z prawnikiem

- Kodeks cywilny: https://eli.gov.pl/api/acts/DU/1964/93/text.html
- Kodeks karny: https://eli.gov.pl/api/acts/DU/1997/553/text.html
- RODO: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Rozporządzenie MDR: https://eur-lex.europa.eu/eli/reg/2017/745/oj
- Wytyczne App Store: https://developer.apple.com/app-store/review/guidelines/
