# BallWise — silnik techniki pozycyjnej V2

## Zaimplementowane zachowanie

Sesja techniki korzysta z pozycji zapisanej w onboardingu. Lokalne ustawienia pozwalają doprecyzować rolę (CB, FB/WB, 6, 8, 10, skrzydłowy, napastnik, bramkarz), poziom **techniczny**, nogę, stronę układu, czas i dzisiejszy sprzęt. Staż siłowy nie jest miarą poziomu piłkarskiego. Stare profile nie wymagają migracji ani zmiany kontraktu Supabase.

Biblioteka obejmuje **25 rodzin**, każdą z dwoma przebiegami A/B. Odbicie lustrzane i tryb podającego są wariantami tej samej rodziny, nie dodatkowymi ćwiczeniami. Każda rodzina określa cel, kryterium udanej próby, poziom wejścia, intensywność, miejsce, sprzęt, role, wzorzec ruchu oraz źródła. Ruchy zapisane są w metrach; silnik nie ściska pola ani nie skraca odległości, żeby zmieścić niedostępny układ.

### Wykonalność i dobór

1. Sprawdzenie wieku 16+, poprawnej daty i pozycji. Dzień meczu blokuje dodatkową sesję tego modułu.
2. Twarde filtrowanie przestrzeni, piłki, znaczników, bramki, poziomu i trybu podającego. Ściana i rebounder są osobnymi zasobami. Rebounder wymagany przy kombinacji w ruchu nie jest zastępowany przypadkową ścianą.
3. Ćwiczenia z aktywną presją wymagają obrońcy. W `Receive & Escape Live Pressure` potrzeba dwóch partnerów: podającego i obrońcy. `Wide 1v1 & Finish` wymaga jednego obrońcy, zawodnik rozpoczyna z piłką.
4. Priorytet pozycji, wskazanego celu, obszaru z niską skutecznością i zgodności nogi ze stroną. Niedawno wykonywane rodziny dostają karę za powtórzenia. W jednej sesji nie powtarzamy tego samego wzorca pod inną nazwą.
5. Maksymalnie 3 bloki (4 przy budżecie >=35 min), najwyżej dwa tego samego obszaru i jeden o wysokiej intensywności. Zakończenie wykończeniem; wcześniej kontrola, przyjęcia i podania.
6. MD-1, MD+1, zagęszczony terminarz, lżejszy wariant lub pogorszenie check-inu: do 20 min, niska intensywność, jedna seria, prostszy warunek. MD-2 odrzuca wysoką intensywność. Dla 16–17 lat jedna seria i do 12 strzałów; pozostałe pełne sesje do 24 strzałów.
7. Czas obejmuje przygotowanie, pracę, powrót/zebranie piłki i przerwy. Powrót jest szacowany z końcowej pozycji zawodnika, końcowej pozycji piłki i startu (orientacyjny chód 1,3 m/s + 5 s); zachowany jest minimalny odpoczynek zależny od intensywności. Jest to konserwatywny szacunek dla jednej piłki; zapas piłek nie zwiększa automatycznie dawki. Jeśli budżet nie mieści całego bloku, silnik zmniejsza liczbę serii/powtórzeń do minimum 1×3 albo pomija blok. Nie wymusza liczby ćwiczeń.

Wynik doboru jest deterministyczny dla daty, warunków i wcześniejszej historii. Zamknięcie i ponowne otwarcie ekranu nie losuje sesji. Wyniki z bieżącego dnia nie przestawiają otwartego planu.

### Progresja

Progresja ma trzy etapy: poznanie układu, dokładność przy mniejszym celu i zmienność A/B przy dalszym zmniejszeniu celu. Dla ćwiczeń z obrońcą wzrasta swoboda aktywnej presji. Diagram pokazuje przykład, nie przewiduje ruchów przeciwnika.

Stan jest osobny dla rodziny, trybu, strony, mocniejszej nogi i przebiegu A/B. Awans wymaga dwóch pełnych wykonań na różnych dniach, po co najmniej 6 prób, z co najmniej 85% skuteczności, bez zgłoszenia „za trudno”. Dwa pełne wyniki poniżej 60% lub zgłoszenie „za trudno” powodują uproszczenie. Poziom samooceny ogranicza maksymalny etap.

Brak wyniku, mała próba, samo obejrzenie animacji, upływ tygodnia i kliknięcie „Koniec sesji” nie powodują awansu. Wyniki z lżejszego dnia są oznaczone `adapted` i nie kasują wcześniej wypracowanego etapu. Progresja **nie dodaje automatycznie objętości**.

Wynik to deklaracja gracza: liczba wykonanych i udanych prób oraz trudność. Aplikacja nie mierzy automatycznie celności, jakości przyjęcia ani talentu. Korekta wyniku zastępuje poprzedni wpis tej samej sesji i warunków. Przyszłe daty nie są zaliczane.

### Scena i odtwarzanie

`Drill` rozszerzono zgodnie wstecz o pozycje startowe zawodników, podającego i obrońcy, fizyczne stacje odbijające, strefy celu, start piłki i wykonawcę każdej akcji.

| Linia | Znaczenie |
|---|---|
| Niebieska przerywana | Podanie po ziemi |
| Niebieska krzywa, osobny rytm przerywania | Podanie górą / dośrodkowanie |
| Pomarańczowa falista | Prowadzenie |
| Turkusowa kropkowana | Ruch bez piłki |
| Fioletowa krótka | Pierwszy kontakt |
| Czerwona gruba | Strzał |

Akcje z tym samym numerem etapu są równoczesne: np. ruch zawodnika i powrót podania. Istnieje jeden tor piłki; dwie osoby mogą poruszać się jednocześnie. Podgląd pełnej akcji, wybrany etap, pauza, przewijanie i 0,5× korzystają z tej samej osi czasu. Rysunek, instrukcje i animacja powstają z tych samych danych. Identyfikatory znaczników SVG są osobne dla każdego rysunku.

Walidator sprawdza granice pola, strefy celu, tożsamość wykonawców, kolejne etapy, zerowe ścieżki, ciągłość pozycji piłki i graczy, jedną akcję piłką w etapie oraz istnienie bramki dla strzału. Lewa strona odbija wszystkie warstwy, łącznie z rebounderem i celami. Odtwarzacz nie jest symulatorem biomechaniki ani fizycznego lotu piłki.

### Dane i integracja

- `src/engine/technical/types.ts`: publiczne typy wejścia, sesji, dawki i wyniku.
- `catalog.ts`: 25 rodzin oraz 9 źródeł pierwotnych FIFA.
- `scene.ts`: kompletne przebiegi i stabilne referencje dla zaproszeń.
- `validate.ts`: walidacja spójności sceny.
- `planner.ts`: normalizacja, filtrowanie, ranking, budżet i progresja.
- `src/lib/technical.ts`: zapis w istniejącej przestrzeni gościa/konta; bez bezpośredniego dostępu do pamięci poza `scoped`.
- `src/TechniqueSession.tsx`: ustawienia, wyjaśnienia doboru, lista bloków, warianty A/B, instrukcje i ręczne wyniki.
- `src/SessionSheet.tsx`: nowy silnik jest używany w prawdziwej gałęzi sesji `technique`.
- `src/Pitch.tsx`, `src/HalfPitch.tsx`, `src/engine/drillAnim.ts`: wspólny diagram i odtwarzanie.

Ustawienia `technicalSettings:v2` i do 500 wyników `technicalResults:v2` pozostają na urządzeniu w przestrzeni użytkownika. Nie zmieniają profilu synchronizowanego z chmurą. Link zaproszenia zawiera stabilne ID rodziny/trybu/strony/przebiegu, bez historii i wyników. Stare ID szkiców nadal działają.

## Status zasad treningowych

Źródła FIFA dostarczają zasad działań pozycyjnych, przyjęć, kombinacji, wykończenia i przejścia od izolacji do aktywnej presji. Ich tytuły i adresy są przypisane do każdej rodziny; w aplikacji można je otworzyć.

Układy solo, konkretny dobór dawek, priorytety rankingu, ograniczenia dnia meczowego i progi 85%/60% są **jawnymi heurystykami BallWise**, a nie protokołem FIFA ani parametrami potwierdzonymi badaniem klinicznym. Nie skopiowano filmów ani grafik źródłowych. Dalsza ocena trenerska powinna dotyczyć wykonania na boisku, tolerancji dawek i przełożenia umiejętności na grę.

## Weryfikacja

`npm run typecheck`, `npm test`, `npm run build`.

Na współdzielonym wykonawcy pełny zestaw uruchomiono jako `npm test -- --maxWorkers=2 --testTimeout=30000`: istniejące testy baz PGlite i modelu 3D potrafią przekroczyć domyślne 5 s przy konkurencji o CPU. Limitu czasu nie zmieniono w konfiguracji projektu. Testy formularzy korzystają z jsdom; nie zastępują sprawdzenia na fizycznym iPhonie / WebKit.

Testy obejmują wszystkie dostępne tryby, oba przebiegi i obie strony scen, równoczesne ruchy, ciągłość piłki, budżety wielu kombinacji pozycji/wieku/czasu/poziomu, brak zasobów, terminy meczowe, progresję, brak nieuprawnionych zaliczeń, izolację kont i odmowę zapisu.

## Przekazanie do Claude Code

> Przejrzyj zmiany silnika techniki pozycyjnej V2 na tej gałęzi i dokument `docs/TECHNIQUE-ENGINE-V2.md`. Kod jest podłączony do `SessionSheet`, a nie pozostawiony jako osobne demo. Zachowaj istniejące ID zaproszeń, pozycję z onboardingu, lokalny zapis przez `scoped`, twarde wymagania sprzętu i przestrzeni oraz progresję wyłącznie z ręcznie potwierdzonych wyników. Sprawdź pełną sesję na telefonie, oba warianty, odtwarzanie, zapis wyniku i ponowne otwarcie. Nie zastępuj biblioteki generowaniem dowolnych strzałek ani codziennymi wywołaniami AI. Uruchom typecheck, testy i build; zgłoś konkretne znalezione problemy przed zmianą zasad silnika.
