# BallWise V2.7 — MAS, wykonanie sesji i porównywalność wyników

Baza kodu: `62aea99dd73ac7500823dab72487c40789acf6f4` (PR #155).

## Zachowanie po poprawkach

1. Poprawna pięciominutowa próba wylicza terenowy MAS z dystansu odcinka próby: `metry / 300 × 3,6`. Rozgrzewka i schłodzenie nie wchodzą do wyniku. Przykład: 1300 m daje 15,6 km/h.
2. Podsumowanie od razu pokazuje wynik. Dowód jakości zostaje przypięty przed zapisaniem szkicu. Ponowne otwarcie podsumowania nie wymaga odtwarzania współrzędnych i nie odbiera poprawnego wyniku. Przerwana próba pozostaje przerwana po odtworzeniu.
3. Po potwierdzonym zapisie serwerowym nowe MAS i poziom biegania automatycznie uruchamiają przeliczenie niewykonanej części bieżącego planu. Nie ma dodatkowego ekranu akceptacji.
4. Przeliczenie korzysta z tego samego planera co zwykły plan: uwzględnia cel, przygotowanie, aktualność testu w dniu sesji, czas, mecz, klub, dostępność i odstępy ciężkich nóg. Może przełożyć nierozpoczęte jednostki, aby zmieścić główny bodziec celu. Nie każda spokojna jednostka staje się interwałami.
5. Dni historyczne, rozpoczęte/wykonane/opuszczone i wskazane dni ręcznych modyfikacji pozostają chronione. Końcowy efektywny plan jest walidowany. Zmiana sprzętu lub innych ustawień nie jest milcząco zatwierdzana przez kalibrację MAS.
6. Aktualizacja jest atomowo zapisywana istniejącym mechanizmem planu. Konflikt z nowszym planem na innym urządzeniu nie nadpisuje go. Ukończenie/start sesji czeka na trwający zapis planu. Po zapisie offline parametry są przeliczane po synchronizacji potwierdzonego wyniku, bez zgadywania MAS.
7. Instrukcja konkretnego wariantu sprintu jest przypięta do sesji i trafia do panelu wykonania. Ogólna instrukcja biblioteki nie zmienia 5+5 m w 8–10+8–10 m.
8. Hamowanie progresywne jest wykonywane jako sześć osobnych prób: 5/10/15 m, następnie 5/10/15 m, z odrębnymi kluczami i odpoczynkami. Są to dwa obwody trzech prób, a nie dwie próby po 15 m.
9. Drobienie z przejściem do przyspieszenia ma zapisane 10 m drobienia, 10 m przyspieszenia i 10 m strefy wyhamowania. Przyspieszenia w trzech rundach są uwzględnione w sumie szybkich metrów. Ten zestaw wymaga 30 m przestrzeni.
10. Nowy M09 prowadzi po jednej serii A1, następnie A2, po czym wraca do kolejnej rundy. Zapis zachowuje rzeczywiste numery serii. Moc zapisuje potwierdzenie wykonania, nie wymyśloną wysokość skoku, siłę ani RIR. Starsze rozpoczęte receptury zachowują swój protokół.
11. Natywne powiadomienia MAS przed gotowością zapowiadają tylko koniec rozgrzewki. Próba i schłodzenie nie są zapowiadane, zanim faktycznie wystartuje próba po odliczaniu.
12. Podsumowanie siły porównuje wyłącznie receptury potwierdzone w wykonanych snapshotach. Uwzględnia tempo i dawkę; odróżnia serie robocze od rozgrzewki. Historyczny wiersz bez dowodu porównywalności nie potwierdza progresu ani regresu.

## Wdrożenie i istniejące plany

- Silnik ma wersję `ballwise-v2.7`. Zapisane plany wcześniejszych wersji nadal dają się odczytać; rozpoczęte wykonania pozostają przypięte. Nierozpoczęty stary plan trzeba raz zaktualizować istniejącą akcją aktualizacji planu, aby otrzymał nowe receptury. Kolejne poprawne wyniki MAS aktualizują już jednostki automatycznie.
- W projekcie Lovable `de7e9c03-6af5-4ba0-9a0c-426417d42531` wdrożono 14 listopada 2026 brakującą migrację `20261114210001_mas_gps_evidence.sql` i wpis historii. Kontrola po wdrożeniu: 2 nowe kolumny, obsługa agregatu w RPC, poprawny dowód przyjęty, przerwanie i niezgodny dystans odrzucone. Nie wykonywano próbnych zapisów wyników do kont zawodników.
- Cztery wcześniejsze migracje były już wdrożone. Nie wykonywać ich ponownie. W innych środowiskach sprawdzić historię i wdrożyć brakujące migracje w kolejności.
- Klient sprzed obsługi agregatu jakości MAS nie jest klientem zgodnym z nową walidacją testu. Właściwy klient musi dostarczać dowód z przypiętej receptury.
- Merge, synchronizacja podglądu, publikacja web i kompilacja iOS są osobnymi krokami. Ten zapis w bazie nie publikuje frontendu.

## Zakres dalszej pracy

Zamknięto błędy wykonawcze R1–R8 z audytu po PR #155 oraz dodano automatyczne połączenie wyniku MAS z jednostkami. Pełna progresja trudności ćwiczeń z masą ciała, izometrii, mocy i sprintu pozostaje osobnym rozszerzeniem. W tej zmianie nie przypisano samej frekwencji ani RPE znaczenia pomiaru jakości ruchu. Reguły wzrostu wymagają odpowiednich danych i oddzielnych kryteriów dla każdego rodzaju pracy.

Build mobile nie zastępuje testu Xcode ani fizycznego iPhone’a. Odbiór urządzenia obejmuje GPS, tło, odliczanie, gotowość, dźwięk, blokadę, ponowne otwarcie, utratę sieci i duplikat zapisu.

## Weryfikacja

Testy regresji obejmują odzyskanie poprawnego dowodu MAS, odrzucenie pożyczonego/przerwanego dowodu, wszystkie 19 wariantów instrukcji sprintu, sześć odcinków hamowania, szybkie metry drilli, wszystkie rundy M09 i wznowienie zapisanej trzeciej serii, zmianę tempa w porównaniu siły, automatyczną kalibrację jednostek, chronione wykonania, zmianę planu na drugim urządzeniu, ponowienie po konflikcie i powrót sieci. Kalibracja ocenia świeże wykonania względem rzeczywistego dnia przeliczenia bez zmiany granic i kotwicy planu.

Weryfikacja wydania używa Node 22: lockfile, TypeScript, ESLint, pełny zestaw Vitest, osobny test z `TZ=Europe/Warsaw`, build web i mobile. Nie zmieniono binarnych animacji IQ.
