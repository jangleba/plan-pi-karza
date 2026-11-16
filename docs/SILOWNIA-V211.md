# BallWise · pełne siłownie 16+ · V2.11

Wersja `ballwise-v2.11` kontynuuje [pełne A/B i katalog V2.10](SILOWNIA-V210.md). Paczka jest kumulacyjna: obejmuje poprzednią poprawkę oraz poniższe zmiany. Przygotowany kod nie oznacza wdrożenia do aplikacji.

## Co naprawiono po sprawdzeniu faktycznych sesji

- **Wyposażenie trafia do silnika.** Kanoniczny profil zawodnika otrzymuje `gymEquipmentMode`. Wcześniej jawne `selected` potrafiło zniknąć w konwersji. Same hantle nie dają sztangi, racka ani ławki; dodatkowa strefa skoków nie kasuje wcześniejszego domyślnego wyposażenia. Dostępne są dwa jawne tryby: „Podstawowe wyposażenie siłowni” i „Tylko wskazane wyposażenie”. Podstawowy tryb nie deklaruje trap bara, stanowiska Nordic ani strefy rzutów.
- **Krótszy czas nie chroni dodatku kosztem podstaw.** Samodzielny rzut w B jest usuwany przed redukcją zwykłej pracy. Przy dalszym skracaniu zachowane ćwiczenia nie są automatycznie rozdrabniane na jedną serię. Gdy minimum wraz z przygotowaniem i przerwami nie mieści się w czasie, silnik zgłasza niezrealizowany cel zamiast zaniżać czas.
- **Para wyciskania i rzutu rzeczywiście działa w jednej rundzie.** Jest świadomą opcją w A; opis, dawka, powiązanie B1/B2 i stoper korzystają z tych samych przerw. Nie jest dodatkową sesją mocy.
- **Ponowne przeliczenie nie mnoży rzutów.** Przed ponowną finalizacją po feedbacku przywracana jest zwykła dawka wyciskania i przyciągania. Potwierdzono również rzeczywistą ścieżkę usunięcia i przeniesienia sesji. Wyjaśnienie akcentu siły nie dopisuje się wielokrotnie.
- **Start sesji sprawdza dawkę widoczną w parze.** Walidator porównuje liczbę serii, powtórzenia, opis dawki, `engineDose`, kolejność i przerwy z recepturą. Renderowane 20 rund zamiast kanonicznych 2 nie przechodzi sprawdzenia.
- **Nowe warianty nie dostają cudzej animacji przez alias.** Blokada rozpoznaje nazwy EN/PL, formatowanie identyfikatora, aliasy i numery wystąpień. Preview tempa korzysta z liczbowego `engineDose.tempo`, także dla 0,5 s, zamiast starego opisu.

## Przykład wygenerowany przez aktualny silnik

Profil testowy: 27 lat, cel siły, wysoka kontrola, 36 miesięcy siłowni, poziom zaawansowany, pełny nadzór i wszystkie wymienione stanowiska. Tydzień od 16 listopada 2026, bez treningów klubowych i meczu. To przykład, nie szablon dla każdej osoby 16+.

| Ustawienie                             | Siłownia A                                 | Siłownia B                   |
| -------------------------------------- | ------------------------------------------ | ---------------------------- |
| Zwykłe A/B, limit 75 min               | 65 min, 9 ćwiczeń roboczych                | 70 min, 10 ćwiczeń roboczych |
| Opcjonalny kontrast góry, limit 90 min | 76 min, 10 ćwiczeń roboczych               | 70 min, 10 ćwiczeń roboczych |
| Opcjonalny kontrast góry, limit 75 min | 70 min, 9 ćwiczeń; bez dodatkowego RDL w A | 70 min, 10 ćwiczeń roboczych |

**A zwykłe:** CMJ, back squat, barbell RDL, Nordic, barbell bench press, one-arm dumbbell row, Copenhagen, Pallof i standing calf raise. Przygotowanie jest dodatkowe względem liczby ćwiczeń roboczych.

**B zwykłe:** broad jump, chest pass, trap-bar deadlift, loaded Bulgarian split squat, long-lever hamstring hold, pull-up, dumbbell OHP, side plank, Copenhagen i seated soleus raise. Rzut i pozostałe dodatki zależą od dostępności stanowisk oraz limitu czasu.

Pełny sprzęt w tym przykładzie obejmuje również piłkę, strefę rzutu, Nordic i trap bar. Brak takiego stanowiska zmienia dobór. Krótszy limit, mniejszy staż, kalendarz i faza planu mogą wymagać mniejszej dawki.

## Opcjonalna para góry ciała

W ekranie doświadczenia siłowego, w zwykłym układzie A/B, dostępny jest wybór „Kontrast góry ciała · wyciskanie i rzut sprzed klatki”. Jego włączenie wybiera chest pass. W B rzut pozostaje zwykłym samodzielnym zadaniem.

| Krok jednej rundy                    | Początkowa dawka produktu                    |
| ------------------------------------ | -------------------------------------------- |
| B1: barbell lub dumbbell bench press | 5 powtórzeń, zapas 2, kontrolowane wykonanie |
| Przerwa przed rzutem                 | 240 sekund                                   |
| B2: medicine-ball chest pass         | 3 osobne szybkie rzuty lekką piłką           |
| Przerwa po rzucie                    | 180 sekund                                   |
| Łącznie                              | 2 rundy                                      |

Warunki tej specjalistycznej opcji: dorosły, zaawansowany staż co najmniej 24 miesiące, wysoka kontrola ruchu, obecność trenera, dostępne wyciskanie, piłka i zabezpieczona strefa rzutów, pełny wariant i faza rozwoju. To konserwatywne reguły produktu, nie biologiczna granica wyznaczona badaniem.

Opcja nie nakłada się na klastry M08, dolny kontrast M09, specjalistyczne pary mocy ani maksymalny primer izometryczny M14. Nie jest stosowana przy utrzymaniu, deloadzie, powrocie i wariancie podstawowym. Zwykła siłownia pozostaje dostępna według jej odrębnych kwalifikacji.

Gdy krótki limit wymaga usunięcia tej opcji, znika **cała para**, a wyciskanie oraz przyciąganie odzyskują zwykłą dawkę i przerwy. Pozostawione samodzielne ćwiczenie nie dziedziczy 30 sekund będących wcześniej tylko przejściem do partnera.

### Co wynika z badań, a co jest wyborem produktu

[Finlay i in., 2022 — przegląd systematyczny i metaanaliza](https://pubmed.ncbi.nlm.nih.gov/34826109/) opisuje efekty specyficzne dla danego ruchu. Dla ciężkiego bench press i późniejszego ballistic bench throw korzystne wyniki dotyczyły m.in. odpoczynku 8–12 minut. [Pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC8938350/) pokazuje również wyniki bez poprawy oraz różnice między rodzajami i ciężarami rzutu.

Ballistic bench throw ze sztangą i rzut piłką sprzed klatki to różne zadania. **Dwie rundy 5+3 i przerwy 240/180 sekund są startową organizacją treningu w produkcie. Badania nie dowodzą, że ten dokładny układ gwarantuje PAPE, jest optymalny dla wszystkich ani poprawi grę piłkarską.** Silnik nie wylicza procentu 1RM z samego RIR i nie wymusza prób maksymalnych. Przy spowolnieniu rzutu lub utracie kontroli zawodnik kończy zadanie, zamiast wykonywać dodatkowe próby.

Pozostałe źródła do doboru ćwiczeń, treningu młodzieży, progresji i porównania konkurencji są w [dokumencie V2.10](SILOWNIA-V210.md). Nie przypisujemy każdej wartości w kodzie odrębnego potwierdzenia naukowego.

## Weryfikacja i granice

Regresje obejmują wybór wyposażenia w UI, trwały zapis i ponowne odczytanie profilu, rzeczywiste A/B, brak sprzętu, kwalifikacje 16/17/dorosły, M08/M09/M14, limity czasu, runner i przerwy, przenoszenie przez feedback, idempotencję oraz niezgodność renderowanej dawki. Dodatkowe testy obejmują aliasy animacji i liczbowe tempo. Pełny wynik techniczny znajduje się w manifeście paczki.

Trzynaście nowych tożsamości ćwiczeń z V2.10 nadal ma szczegółowe instrukcje zamiast własnych zweryfikowanych animacji. Ta zmiana uszczelnia ten stan; nie dodaje udawanych modeli. Build mobilny nie oznacza testu na fizycznym iPhonie.

Zmieniony silnik wymaga podglądu i przyjęcia nowej propozycji planu. Rozpoczęte i ukończone sesje pozostają chronione. Poprawka nie wymaga migracji bazy ani zmian zgód.
