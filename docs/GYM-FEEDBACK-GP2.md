# GP2: kilogramy, decyzja zawodnika i aktualizacja przyszłych A/B

15 listopada 2026. Baza: `8b62f462fc6f5e30128ecf894af1e98c891c7546`, po scaleniu PR #159 (SP1.1). To przygotowane rozszerzenie kodu; jego obecność nie potwierdza wdrożenia migracji ani aplikacji.

## Zakres punktów 1–3

1. Zapisane odpowiedzi i rzeczywiste wykonanie mogą utworzyć propozycję aktualizacji niezaczętych siłowni w najbliższych siedmiu dniach.
2. Sugestie kg uwzględniają konkretne stanowisko, sposób liczenia kg i rzeczywiście dostępne obciążenia. Zawodnik zachowuje wybór i edycję.
3. Aplikacja zbiera opcjonalne obserwacje nowych ćwiczeń i rzeczywiste kalibracje gum, zapisuje je na koncie i doprowadza do GP1.

Pozostają sesje A/B, pary B1/B2 i C1/C2 oraz dotychczasowe kwalifikacje wieku, przygotowania i wyposażenia. Nie powstaje osobna jednostka mocy. Akcent siły maksymalnej nadal dobiera SP1, a nie etykieta „zaawansowany” sama w sobie. Brak danych nie służy do stwierdzania deficytu siły ani wymyślania 1RM.

## Ciężar jako sugestia

| Wybór zawodnika         | Działanie i interpretacja                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| „Spróbuję”              | Dopiero kliknięcie przenosi propozycję do edytowalnego pola kg. Wyższy ciężar nie wypełnia się sam.       |
| „Zostaję przy swoim”    | Zachowuje wpisany ciężar. Odmowa zwiększenia nie jest nieudaną serią, niskim RIR ani dowodem utraty siły. |
| „Dziś mniej”            | Proponuje niższy dostępny ciężar albo pozostawia ręczny dobór, gdy nie ma odpowiedniego niższego stopnia. |
| Brak wyboru / własne kg | Zapis `unanswered`, bez domniemanego przyjęcia lub odmowy. Zawodnik może wpisać własny ciężar.            |

Powód jest opcjonalny: własna preferencja, brak gotowości do próby albo niemożność wykonania. Nie ma dodatkowych pytań medycznych. Liczbę powtórzeń i RIR zapisuje się osobno; to rzeczywisty zapis serii, nie tłumaczenie decyzji przez algorytm. RIR z poprzedniej sesji nie jest kopiowany jako dzisiejszy odczuwany wysiłek.

Wybór zapisuje się przy zapisie serii, razem z kg, tożsamością sugestii i kopią konfiguracji sprzętu. Historia odmowy wyższej sugestii pozwala utrzymać ciężar, dopóki zawodnik sam nie wybierze ponownego sprawdzenia podwyżki. Nie tworzymy trwałej etykiety „słabszy zawodnik”.

Błąd dodatkowego zapisu decyzji nie blokuje zapisu faktycznych kg/powtórzeń. Aplikacja pokazuje, że seria została zapisana, ale decyzji nie potwierdzono. Niepotwierdzony wpis nie staje się dowodem do podwyżki.

Dwa wybory lżejszej siłowni spośród ostatnich trzech ukończonych siłowni w 14 dniach mogą dać propozycję akcentu utrzymania. Liczymy raz na sesję: check-in przed startem lub późniejszy wybór „Dziś mniej” w głównym ćwiczeniu kolanowym/biodrowym. Ukończona dzisiejsza sesja też się liczy. Samo „zostaję” nie jest taką prośbą. Faktyczne obniżki kg i wykonanie powtórzeń/RIR nadal analizuje SP1 na porównywalnych seriach.

## Rzeczywisty sprzęt i porównywalność

Konfiguracja dla ćwiczenia wymaga nazwy stanowiska oraz jawnego wyboru: cały ciężar ze sztangą, jedna hantla/ręka albo wskazanie tej konkretnej maszyny. Następnie zawodnik wpisuje najmniejszy faktycznie dostępny przyrost (np. 0,5 kg) lub listę dostępnych obciążeń oddzielonych średnikami. Lista ma pierwszeństwo nad krokiem.

Sugestia zwiększenia wymaga porównywalnych zapisów z tym samym sprzętem i konwencją. Zmiana nazwy stanowiska lub konwencji tworzy nową tożsamość konfiguracji; stara historia pozostaje czytelna, ale nie autoryzuje dokładnej podwyżki na innym stanowisku. Zmiana sprzętu w trakcie rozpoczętej sesji nie przepisuje jej wcześniejszego kontekstu. Nie przeliczamy wskazań różnych maszyn na wspólną siłę.

Bez konfiguracji lub przy braku danego historycznego ciężaru na aktualnej liście aplikacja proponuje dobór podczas rozgrzewki. Ręczny zapis serii jest dostępny. Krok edycji pola nie jest deklaracją, że taki ciężar istnieje na siłowni.

## Przepływ do planu

`check-in + zapis serii + odpowiedź + obserwacja → potwierdzona synchronizacja → propozycja → jawne zastosowanie → zapis planu`

`proposeGymAdjustment` odświeża wyłącznie niezaczęte A/B w oknie dziś…dziś+6. Nie przesuwa dni i nie zmienia innych domen treningu. Chroniony jest cały dzień, jeżeli którykolwiek slot rozpoczęto, ukończono lub oznaczono jako opuszczony. Ręcznie zmodyfikowane dni i wykonane migawki pozostają chronione.

Karta pokazuje konkretne zmiany ćwiczeń: przed/po, serie, powtórzenia lub sekundy, zapas, przerwy i kalibrację gumy. „Zastosuj” zapisuje kandydata dopiero po ponownym odczycie wersji planu, sprawdzeniu aktualności dowodów i walidacji całości. Zmiana danych podczas oczekiwania unieważnia stary podgląd. „Zostaw plan” zapamiętuje odrzucenie na danym urządzeniu; sam kolejny dzień nie tworzy nowego identycznego zdarzenia.

Nierozwiązany zapis treningowy w kolejce, również konflikt lub błąd wymagający działania, wstrzymuje nową propozycję siłową. Zaplanowane przyszłe sesje nie liczą się jako sukcesy i nie powodują nakładania kolejnych podwyżek.

GP1 zachowuje domyślne rygorystyczne zachowanie dla starszych wywołań. Nowy tryb `proposalOnly` dopuszcza przygotowanie podglądu dla przyszłej daty lub bez numerycznej gotowości. To jawna decyzja produktu: nie produkuje wyniku gotowości, nie przewiduje samopoczucia w przyszłym dniu i nie stosuje zwiększenia bez decyzji zawodnika. Znany niski wynik dla właściwej daty, nieznane przeszłe obciążenie klubu, kalendarz meczu, limity tygodnia i kwalifikacje nadal ograniczają dawkę. Aktualny wybór przed rozpoczęciem i rzeczywiste serie nadal sterują bieżącą sugestią kg.

## Obserwacje skoków i gum

- „Cała zaplanowana dawka, pod kontrolą” jest jawnym potwierdzeniem wszystkich zaplanowanych serii i stron. Nie wybiera się samoczynnie po timerze. To samoobserwacja, nie obiektywna ocena techniki.
- „Utrata kontroli / przerwano z tego powodu” zapisuje utratę kontroli bez wymyślania liczby ukończonych powtórzeń. GP1 może zredukować wariant lub pominąć dynamiczny dodatek.
- „Nie potrafię ocenić jakości” nie jest pozytywnym dowodem do progresji. Brak obserwacji również nim nie jest.
- Opcjonalny pomiar to rzeczywisty najniższy wynik ze wszystkich serii/stron i wskazana metoda: urządzenie lub analiza nagrania. Wysokość cm dotyczy CMJ, a pełne cykle/s szybkiego uginania. Nie przypisujemy wysokości skoku do jakości skoku w dal, bocznego zatrzymania lub pulsacji mostu.
- Nie dodano automatycznej analizy filmu, pomiaru z czujnika, dystansu skoku poziomego ani diagnozy techniki. Pozostałe zadania wykorzystują jawną kontrolę wykonanej dawki.

Kalibracja gumy jest opcjonalna i wymaga rzeczywiście zmierzonych sił w N w dwóch nazwanych położeniach, długości, fizycznego zestawu gum i geometrii stanowiska. Sama nazwa lub kolor nie wystarcza. Wybór ustawienia do przyszłego planu jest oddzielny od jego zapisu. Zmiana wyboru przerywa porównywalność; zachowanie pierwotnego wyboru nie cofa ustawienia już rozwiniętego po rzeczywistych ekspozycjach. GP1 nadal nie traktuje zwiększenia asysty jako uniwersalnej progresji.

## Podstawa naukowa i granice

Pełne uzasadnienie doboru siły, RIR, tygodnia, wieku i deloadu znajduje się w [SP1](SILA-PROGRESJA-SP1.md); mechanika i ograniczenia nowych ćwiczeń w [GP1](SILOWNIA-V28-PROGRESJA.md).

| Literatura                                                                 | Co wspiera                                                                                             | Czego nie dowodzi                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [ACSM 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/)            | Dobór obciążenia do celu; cięższy trening może wspierać siłę dorosłych, a upadek nie jest konieczny.   | Nie wyznacza obowiązkowej podwyżki kg ani algorytmu dla niepełnoletniego piłkarza.            |
| [Lloyd i wsp., konsensus 2014](https://pubmed.ncbi.nlm.nih.gov/24055781/)  | Znaczenie przygotowania, kompetencji, nadzoru i pozostałego treningu młodzieży.                        | Sam wiek lub sportowe „advanced” nie potwierdza przygotowania do dużego ciężaru.              |
| [Januševičius i wsp., 2017](https://www.jssm.org/jssm-16-239.xml-Fulltext) | Krótkie próby szybkiego uginania, rzeczywiste liczenie ruchów i określone warunki pomiaru u dorosłych. | Nie waliduje naszej małej dawki dla juniorów ani wymyślonego pomiaru częstotliwości z timera. |

Trzy przyciski, okno siedmiu dni, dwie prośby z trzech, ważność kalibracji 30 dni, ograniczenie kroku oporu do 5% i liczba porównywalnych ekspozycji są decyzjami projektowymi. Literatura nie przetestowała kodu BallWise. Próg 16/18 lat to ograniczenie produktu, nie pomiar dojrzałości biologicznej. Odmowa zwiększenia jest preferencją; nie dorabiamy jej fizjologicznego uzasadnienia.

## Zapis, prywatność i wdrożenie

Migracja: `supabase/migrations/20261115101142_gym_training_evidence.sql`. Nowe `gym_records` przechowują konfiguracje, odpowiedzi, obserwacje i kalibracje; `gym_record_receipts` zapewnia idempotentny zapis. RLS ogranicza odczyt i zapis do właściciela. Dowód dotyczący sesji musi należeć do jej właściciela i ćwiczenia w rozpoczętej/ukończonej migawce A/B. CAS i potwierdzenia operacji chronią przed nadpisaniem zmian z drugiego urządzenia.

Lokalna kolejka jest trwała i rozdzielona na konta. Przy odtwarzaniu najpierw zapisuje rodzica sesji; zależny dowód czeka na jego potwierdzenie. Pozytywne oczekujące obserwacje nie trafiają do progresji. Wylogowanie/zmiana konta nie odsłania starego cache; usunięcie lokalnych danych blokuje również spóźniony wynik zapisu. Nowe tabele objęto eksportem, lokalny cache czyszczeniem, a usunięcie konta kaskadą w bazie.

Odczyt obejmuje ostatnie 90 dni historii (maks. 1000 rekordów) i osobno maks. 1000 konfiguracji. Brak starszych danych nie daje zgody na zwiększenie. Odrzucenie propozycji pozostaje lokalne dla urządzenia; nie jest jeszcze synchronizowaną preferencją między urządzeniami.

Zalecana kolejność wdrożenia na osobnej gałęzi i środowisku testowym:

1. Sprawdź zgodność z bazą i zastosuj patch. Nie nadpisuj późniejszych zmian całymi plikami.
2. Przejrzyj i zastosuj migrację przed udostępnieniem klienta; skrypt `supabase/verification/gym_training_evidence.sql` wykonuje tylko odczyty kontrolne.
3. Uruchom `npm ci` i `npm run verify:release` na Node 22. Testy korzystają z osobnej konfiguracji Vitest, blokady nieoczekiwanego `fetch` oraz lokalnego PGlite; nie potrzebują produkcyjnej bazy.
4. Sprawdź na środowisku testowym: akceptację/odmowę/własne kg, ponowne wejście, offline→online, konflikt dwóch urządzeń, zmianę konta, eksport/czyszczenie i propozycję po rzeczywiście ukończonej sesji. Następnie sprawdź fizyczny iPhone.
5. Po akceptacji wyniku zdecyduj o publikacji. Nie wykonano tutaj migracji produkcyjnej, scalenia ani publikacji.

Przy braku schematu interfejs nowych zapisów jest niedostępny; istniejący ręczny zapis serii nadal działa. Wycofanie klienta może ukryć nowy interfejs bez usuwania rzeczywistych danych. Nie usuwaj tabel ani zapisów użytkowników jako rutynowego rollbacku. Zielone testy kodu nie zastępują kontroli wdrożenia i testu urządzenia ani nie potwierdzają fizjologicznej skuteczności progów.
