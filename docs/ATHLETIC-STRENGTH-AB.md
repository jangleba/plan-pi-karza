# Sportowe dni siłowe A/B

## Zakres

Notatki zawodnika są wzorcem struktury dwóch osobnych dni. Nie stanowią uniwersalnej listy ćwiczeń, zalecenia kilogramów ani potwierdzenia superserii. Numeracja 1/2 nie zmienia sposobu wykonania.

Nowe plany z dostępem do siłowni domyślnie korzystają z `athletic_ab`. Jawnie wybrane `balanced` i `paired_power` zachowują odrębne zachowanie. Wybór jest widoczny bez rozwijania ustawień sprzętu: Plan → Dopasuj trening siłowy / Doświadczenie siłowe → Układ jednostki.

Wewnętrzne A zachowuje główną rolę przysiadu, B — ruchu biodrowego. Kolejność liter nie jest kolejnością fotografii. Pozwala to zachować istniejące reguły progresji, historii obciążenia i doboru akcentu siły.

## Dobór i wykonanie

Układ obejmuje jawną rozgrzewkę, przygotowanie ruchowe, moc lub kontrolę lądowania, główne ćwiczenie siłowe i uzupełnienie. Konkretne warianty i dawki wynikają z profilu, sprzętu, fazy oraz istniejących reguł kalendarza i obciążenia. Priorytet wydolności sam nie usuwa sportowej struktury siłowni.

Ćwiczenia nieobecne w zatwierdzonym katalogu nie są dopisywane pod nazwą podobnego ruchu. Nie utożsamiamy sprintu z saniami z dowolnym ćwiczeniem na saniach w siłowni. Niejasne skróty z notatek nie odblokowują technicznych wariantów.

`EngineSession.strengthStructure` identyfikuje układ, a `ExerciseDecision.strengthStage` wskazuje część sesji. Render i lista ćwiczeń zachowują tę kolejność. Domyślny układ zawiera osobne ćwiczenia. Prawdziwe pary lub kontrast wymagają istniejącej, jawnie wybranej metody i jej kwalifikacji.

Lekka praca przygotowawcza korzysta z prowadzenia czasowego. Praca robocza pozostaje w części głównej lub uzupełniającej: zachowuje zapis ciężaru, powtórzeń lub czasu oraz dotychczasowe klucze historii. Rozgrzewka ma osobny zakres historii `#warmup`.

Lżejszy i skrócony wariant stosuje istniejące reguły redukcji. Układ nie omija ograniczeń dnia po meczu, dostępnego czasu, bólu, przygotowania ani sprzętu i nie dopisuje sesji tylko po to, by osiągnąć cel tygodniowy.

W krótkim wariancie metoda M08 może przejść z klastrów na zwykłe serie, zgodnie z dotychczasową regułą. Znika wtedy również instrukcja klastrowa. Ćwiczenia pominięte z braku czasu są opisane oddzielnie od funkcji niedostępnych przy zadanym sprzęcie.

## Zapis planu

Zmiana receptury powstała jako `ballwise-v2.14` paczki; w repozytorium, po połączeniu z niezależnymi V2.13–V2.15 (sesja z piłką, siła bez siłowni, rozkład tygodnia), ma wersję `ballwise-v2.16`. Każdą wcześniejszą wersję 2.N nadal można odczytać bez przebudowy. Aktualizacja planu pozostaje jawną akcją z podglądem; rozpoczęte i zakończone jednostki zachowują zapisane wykonanie. Nowe metadane mieszczą się w istniejącym JSON planu i kodeku preferencji; zmiana schematu bazy nie jest potrzebna.

## Weryfikacja

Weryfikację końcową i zakres sprawdzeń zapisano w pliku przekazania dołączonym do paczki 2.14. Testy obejmują strukturę A/B, kalendarz meczowy, krótki budżet, rzeczywisty render i historię serii. Lokalny adapter przeglądarki i PGlite nie potwierdzają działania produkcyjnego backendu ani aplikacji na fizycznym iPhonie.

Sprawdzone scenariusze:

- Cztery tygodnie z klubem w środę/piątek i meczem w każdą niedzielę: przy budżecie 75 minut pozostają dwie siłownie, jeden sprint, jeden bieg i co najmniej jeden pełny dzień odpoczynku. Drugi żądany sprint ma jawne ograniczenie. Fixture dodatkowo zakłada pełne przygotowanie, nadzór i sprzęt; nie dopisuje tych danych do konta zawodnika.
- Przy 35 minutach M08 zachowuje dwie sesje w zwykłych seriach, gdy klastry się nie mieszczą. M09 może przejść na oddzielną moc i siłę z przywróconymi pełnymi przerwami. Nadzorowany primer M14 zachowuje cały protokół.
- Przy 30 minutach wymagane minimum dnia B może się nie mieścić. Plan zgłasza `TIME_LIMIT`, zamiast usuwać podstawowy wzorzec lub skracać przerwy.
- Przeglądarka: A/B przed rozpoczęciem i w trakcie, szerokości 320/390 px, brak poziomego overflow i niejawnych par. Zapis 60 kg × 6 oraz odczyt po przeładowaniu. Widoczny wybór układu w ustawieniach i anulowanie bez zmiany profilu.
- Lokalny SQL roundtrip: generator → przygotowanie planu → atomowy RPC w PGlite → JSONB → odczyt → hydratacja → runner. Zachowane etapy, dawki, pięć zadań rozgrzewki i odrębne klucze historii roboczej oraz przygotowania, także dla prostych ćwiczeń z masą ciała.
