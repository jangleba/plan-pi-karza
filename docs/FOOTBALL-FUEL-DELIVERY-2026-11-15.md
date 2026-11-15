# Trening piłkarski i Fuel — zakres zmian, 15 listopada 2026

## Wdrożone w tej gałęzi
- Schematy wszystkich 20 istniejących ćwiczeń solo, włączone w ExerciseQuickGuide.
- Instrukcje, sprzęt, oryginalne odległości, kontrola jakości i błędy z jednej biblioteki. Brak nowej, konkurencyjnej bazy ćwiczeń.
- Odtwarzanie toru piłki i kroki instrukcji, domyślnie zatrzymane. Pauza po ukryciu aplikacji, czyszczenie timerów po zamknięciu.
- Kierunki i kolory w trzech zadaniach: bramki, orientacja, przyjęcie kierunkowe. Kierunek opisany słowem, nie tylko kolorem. Stałe oznaczenia celów: lewo–niebieski, prawo–zielony, przód–żółty, tył–czerwony. Wspólna paleta z istniejącym ReactiveTrainer. To wariant ćwiczenia orientacji, nie pomiar reakcji ani symulacja żywego przeciwnika.
- Schemat nie określa dawki. Serie/przerwy/czas pozostają z planu. Odtwarzanie można zwolnić; nie jest instrukcją tempa biomechanicznego.
- Mecz bez długości pozostaje kontekstem Fuel z durationMin=null. Dotychczas znikał. Mecz ma pierwszeństwo przed klasyfikacją engineV2.
- Jutrzejszy mecz daje widoczne wskazówki również w lżejszym dniu i wpływa na ranking propozycji z węglowodanami. Wpisane przez zawodnika porcje nie są zmieniane. W trakcie sesji pierwszeństwo ma doraźna tolerancja i możliwość jedzenia/picia.

## Partnerzy: wynik analizy i projekt, bez uruchomienia wyszukiwarki
RODO nie ustanawia ogólnego zakazu funkcji wspólnego treningu. Zgodność zależy od podstaw przetwarzania, minimalizacji danych, wieku uczestników, sposobu kontaktu, moderacji i faktycznego działania usługi. Zgoda rodzica nie zastępuje pozostałych obowiązków. Art. 8 dotyczy przetwarzania opartego na zgodzie przy usługach społeczeństwa informacyjnego oferowanych bezpośrednio dziecku; nie jest uniwersalnym progiem wieku dla wszystkich operacji.

Wytyczne KE dotyczące małoletnich zalecają prywatne konta, wyłączoną geolokalizację i ochronę przed wyszukiwaniem/kontaktem przez obcych. Zakres zastosowania art. 28 DSA wymaga ustalenia statusu usługi; istnieją wyjątki dotyczące mikro- i małych przedsiębiorstw. Nie należy przedstawiać wszystkich zaleceń jako bezwarunkowego obowiązku BallWise.

Proponowany zakres pierwszej wersji (decyzja projektowa, nie ustawowy próg 18 lat):
1. Dobrowolne ogłoszenia o treningu dla pełnoletnich z odpowiednim potwierdzeniem wieku. Wiek z edytowalnego profilu i JWT user_metadata nie wystarczy do autoryzacji.
2. Wyszukiwanie ręcznie wybraną miejscowością i publicznym boiskiem. Bez GPS użytkowników, śledzenia na żywo, adresów domu, odległości do człowieka i historii lokalizacji.
3. Prośba o wspólny trening i obustronna akceptacja. Bez publikacji telefonu, maila i danych logowania. Dorośli nie znajdują kont niepełnoletnich.
4. Blokowanie i zgłoszenia, moderacja z obsługą zgłoszeń, limity publikacji i próśb, usuwanie i anulowanie spotkań, retencja oraz procedura usuwania danych.
5. RLS i weryfikacja wieku po stronie serwera na każdej operacji, testy dostępu obcego konta, osoby niepełnoletniej, zablokowanej i konta bez potwierdzenia wieku.
6. Niepełnoletni: odrębny projekt grup zamkniętych pod nadzorem klubu/opiekuna, po ustaleniu odpowiedzialności i zasad kontaktu. Bez otwartej wyszukiwarki osób.

Nie ma tu backendu partnerów, migracji ani przycisku udającego działającą wyszukiwarkę. Do ukończenia: podstawa prawna i ocena potrzeby DPIA, model potwierdzenia wieku, zasady moderacji/retencji, backend z kontrolą dostępu i frontend. Sam ekran bez tych elementów nie kończy punktu 8.

## Odbiór i ograniczenia
To rozwinięcie istniejącego treningu solo; nie dodaje generatora sesji z partnerem ani nowych progresji ćwiczeń. Nie zmienia reguł układania siłowni, sprintu i wydolności. Punkt 10 obejmuje testy regresji dostępne w repozytorium, nie poświadcza zakończenia całego audytu ani pomiaru wydajności na fizycznym iPhonie. Schematy są poglądowe; nie stanowią pomiaru odległości aparatem.

## Podstawa źródłowa
- Collins i wsp., UEFA expert group statement on nutrition in elite football (2021): https://bjsm.bmj.com/content/55/8/416 . Obejmuje dni treningowe, meczowe, regenerację i młodszych zawodników. Wskazówek ilościowych dorosłych zawodników elity nie przeniesiono automatycznie na użytkowników 13–20 lat.
- RODO: https://eur-lex.europa.eu/eli/reg/2016/679 — art. 5, 6, 8, 12, 25, 35. Ocena zastosowania do konkretnego produktu pozostaje zależna od projektu i przepływu danych.
- Wytyczne KE C/2025/5519: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52025XC05519 — prywatność kont, geolokalizacja i kontakt z nieznajomymi; zakres DSA należy ocenić odrębnie.
