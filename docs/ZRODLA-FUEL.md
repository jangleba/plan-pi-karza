# Źródła: Fuel

Zweryfikowane w wyszukiwaniu (oświadczenie grupy ekspertów UEFA, Collins i in., BJSM 2020):
- Węglowodany dziennie: zakres 3–8 g/kg zależnie od obciążenia; dzień przed meczem i dzień meczu 6–8 g/kg.
- Posiłek przedmeczowy 3–4 h przed startem, 1–3 g/kg węglowodanów; płyny 5–7 ml/kg w 2–4 h przed.
- W trakcie meczu 30–60 g/h węglowodanów; po meczu ok. 1 g/kg/h przez pierwsze 4 h.
- Białko: 1,6–2,2 g/kg dziennie w 3–4 posiłkach.
- Źródła: https://www.open-access.bcu.ac.uk/16453/1/s11332-025-01424-8.pdf, https://www.mysportscience.com/post/uefa-sports-nutrition, https://elearning.barcainnovationhub.com/nutritional-recommendations-for-before-during-and-after-a-football-match/
- Ogólna zasada posiłku przed wysiłkiem (dużo węglowodanów, mało tłuszczu i błonnika): stanowisko ACSM/ADA/DC 2000, https://lh-hsrc.pnu.edu.sa/wp-content/uploads/2018/11/Nutrition-and-Athletic-Performance-ACSM-2000.pdf

NIE zweryfikowane (oznaczone w aplikacji jako „orientacyjnie"):
- Podział dziennych węglowodanów na dni treningowe (5–8) i lekkie (3–5) w obrębie zakresu 3–8 g/kg.
- Wpływ celu (masa/redukcja) na położenie w zakresach.
- Ilości dla sesji treningowych (wzięte z zaleceń meczowych) oraz porady „1–3 h przed" i „poniżej 1 h".
- Lista zakupowa i szybkie opcje (praktyczne propozycje, nie badania).
- Brak danych o białku na porcję (g na posiłek); Fuel podaje tylko dzienne 1,6–2,2 g/kg.
- Badania dotyczą głównie mężczyzn; zalecenia dla kobiet są w dużej mierze ekstrapolowane.

## Plan dnia, posiłki i baza produktów (2026-11-19) – co jest zweryfikowane, a co nie
Zweryfikowane (UEFA, jak wyżej) i użyte w planie: duży posiłek 3–4 h przed meczem (w planie 3,5 h, 2 g/kg z zakresu 1–3 g/kg), 30–60 g/h w trakcie meczu (w planie 45 g na mecz), po meczu ok. 1 g/kg w pierwszej godzinie, dzień przed meczem i dzień meczu 6–8 g/kg, białko 1,6–2,2 g/kg w 3–4 posiłkach.

NIE zweryfikowane (oznaczone w aplikacji jako „podział orientacyjny”):
- Godziny i podział dziennych węglowodanów na posiłki (śniadanie 30%, obiad 35% itd.), przesuwanie zwykłych posiłków, gdy kolidują z posiłkiem przed/po wysiłku (±150 min), wchłanianie kolacji/obiadu przez posiłek „po treningu”.
- Ilości wokół treningu (nie meczu): 1,5 g/kg 3 h przed, 0,5 g/kg godzinę przed, 1 g/kg po (wzięte z logiki zaleceń meczowych).
- Nawodnienie: 30 ml/kg dziennie + 250 ml (dzień przed meczem) / 500 ml (trening) / 750 ml (mecz) – ogólna zasada, nie z badań UEFA.
- Masy porcji (banan 120 g, jajko 50 g, kromka 30–35 g, łyżka oliwy 13,5 g itd.) – typowe wartości, nie z tabel.
- Przykładowe posiłki (kombinacje produktów) i ich gramatury to propozycje praktyczne, nie wyniki badań; nie uwzględniają alergii, diety ani budżetu.
- Brak tłuszczów, kalorii i mikroskładników – Fuel liczy tylko węglowodany, białko i wodę.

Open Food Facts (wyszukiwarka produktów ze sklepów): otwarta baza (licencja ODbL, wymagane podanie źródła – jest w aplikacji), dane wpisywane przez użytkowników, więc mogą być błędne lub niepełne. Przeglądarka nie może pytać o nie bezpośrednio (brak nagłówków CORS), dlatego zapytania idą przez serwerową trasę aplikacji `/api/foods`. Sprawdzone tylko na lokalnym serwerze deweloperskim; działanie na hostingu podglądu (Lovable) NIE sprawdzone.

### Aktualizacja (2026-11-19): baza produktów z USDA, tłuszcze, liczba sesji
- Węglowodany, białko i tłuszcz na 100 g w bazie wbudowanej pochodzą z **USDA FoodData Central, SR Legacy** (domena publiczna, CC0; wersja z 2018-04), numer pozycji `fdc` w `src/engine/foods.ts`. To produkty amerykańskie – polskie mogą się różnić (np. skład jogurtu, pieczywa). Wcześniejsze wartości „z pamięci” były w kilku miejscach błędne (np. płatki owsiane, dżem, kasza gryczana) i zostały zastąpione. Szacunki bez pozycji w USDA (oznaczone `est`): twaróg półtłusty (wg etykiet polskich producentów), napój izotoniczny, żel węglowodanowy. „Warzywa (surówka)” = średnia z pomidora, ogórka i papryki czerwonej. Wymiana „kefir” → maślanka i „skyr” → jogurt grecki 0% to przybliżenia.
- Tłuszcz: oświadczenie UEFA (Collins i in., BJSM 2021) podaje 20–35% energii dla piłkarzy elity (potwierdzone w streszczeniu; wartości g/kg nie sprawdzałem). Położenie w zakresie jest orientacyjne: 22% w dni meczu/dzień przed i przy dwóch treningach, 25% przy jednym treningu, 30% w dni lekkie. Gramy wyliczone z energii węglowodanów i białka (4 kcal/g) i tłuszczu (9 kcal/g) – uproszczenie.
- Dwa treningi dziennie (klubowy + indywidualny): węglowodany 6,5–8 g/kg zamiast 5–8 g/kg – podział orientacyjny (UEFA: 3–8 g/kg zależnie od obciążenia). Białko bez zmian.
- Cel „Redukcja” usunięty (aplikacja dla osób od 16 lat); dawna zapisana wartość wraca do „Utrzymanie”.
- Posiłki wokół wysiłku mają mało tłuszczu (wolniejsze trawienie) – zasada ogólna, nie liczba z badań. Źródła tłuszczu dokładane do zwykłych posiłków (oliwa, awokado, orzechy, masło orzechowe) to propozycje praktyczne.
- Licencje i atrybucja: USDA prosi o wskazanie źródła (jest w stopce Fuel); Open Food Facts – ODbL, źródło wymagane, dane nie mogą trafiać do własnej współdzielonej bazy.
