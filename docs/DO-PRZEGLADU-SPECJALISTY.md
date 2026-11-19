# Treści do przeglądu przez specjalistę (zwłaszcza dla osób 16–17 lat)

**Status: przegląd NIE został wykonany.** Poniższa lista nie oznacza, że treści zostały sprawdzone; to wykaz miejsc, które powinien ocenić trener przygotowania motorycznego lub dietetyk sportowy (a w sprawach prawnych: prawnik) przed komercyjnym udostępnieniem aplikacji. Dopóki przegląd się nie odbędzie, aplikacja nazywa te treści propozycjami ogólnymi (patrz „Zasady bezpiecznego korzystania”).

## Trening (trener przygotowania motorycznego)
| Obszar | Gdzie w kodzie | Co ocenić |
|---|---|---|
| Szablony sesji siłowych i sprintu | `src/engine/library.ts`, `docs/SESJE-SILOWE-TRENERA.md`, `docs/SESJE-SPRINT-TRENERA.md` | Dobór ćwiczeń, objętość i intensywność dla 16–17 lat; ćwiczenia o wysokim obciążeniu (np. hang power clean, back squat); zamienniki (`substitutes`) |
| Progresja ciężarów | `src/engine/progress.ts` (`stepFor`, `suggestNext`) | Krok zmiany (góra 1,25 kg, reszta 2,5%) to **konwencja aplikacji**, nie wynik badań; czy jest odpowiednia dla nastolatków; warunki, w których nie proponować zwiększenia |
| Rozładowanie i mezocykl | `src/engine/adapt.ts`, `src/engine/week.ts` | Częstotliwość rozładowań, reakcja na „Dziś mniej” |
| Testy maksymalne (CMJ, Yo-Yo IR1, test MAS) | `src/engine/lab.ts`, `src/engine/mas.ts` | Czy testy maksymalne są właściwe dla 16–17 lat bez nadzoru; jakie ostrzeżenia dodać |
| Wynik gotowości | `src/engine/adapt.ts` (`readinessScore`) | Wynik jest orientacyjny i zależy tylko od snu i samopoczucia – czy opis jest wystarczający |

## Żywienie (dietetyk sportowy)
| Obszar | Gdzie w kodzie | Co ocenić |
|---|---|---|
| Cele dzienne z masy ciała | `src/engine/fuel.ts`, `src/engine/mealplan.ts` | Zakresy węglowodanów/białka/tłuszczu dla nastolatków (liczby UEFA dotyczą dorosłych piłkarzy elity); nawodnienie 30 ml/kg + dodatek |
| Pomysły na posiłki | `IDEAS` w `src/engine/mealplan.ts` | Wartość odżywcza i różnorodność; pomysły bez nabiału/glutenu/jajek |
| Alergeny i ograniczenia | `src/engine/allergens.ts` | Poprawność przypisań (`FOOD_TAGS`); czy komunikaty nie sugerują bezpieczeństwa; brak danych o produktach spoza bazy |
| Cel „przyrost masy” | `src/fuel/Goal.tsx` | Czy proponować go osobom niepełnoletnim |

## Język (nauczyciel angielskiego / native speaker)
| Obszar | Gdzie w kodzie | Co ocenić |
|---|---|---|
| 12 lekcji, 72 zwroty z ćwiczeniami | `src/english/content.ts` | Naturalność angielskiego piłkarskiego (brytyjski/amerykański), poprawność polskich znaczeń i wyjaśnień, trafność pytań i dystraktorów, akceptowane ułożenia zdań |
| Słowa i hasła/powiedzonka (fiszki) | `src/english/cards.ts` | Poprawność tłumaczeń i uwag o rejestrze (potoczne, komentatorskie), brak treści niewłaściwych dla osób 16–17 lat |
| Wiadomość zgłoszeniowa do klubu | lekcja `application` | Poprawność formalnego stylu i rad dotyczących danych osobowych w wiadomości |

Treści są autorskie; nie kopiowano cudzych kursów, pytań ani nagrań. Przegląd językowy **nie został wykonany**.

## Prawo (prawnik) – poza zakresem specjalisty sportowego
Dokumenty w `src/legal/docs.ts` są szkicami. Wymagają zatwierdzenia, uzupełnienia danych operatora i oceny podstaw prawnych (patrz `docs/AUDYT-STATUS.md`, sekcja „Do decyzji i zatwierdzenia”).

## Jak odnotować przegląd
Po przeglądzie zmień w `src/legal/config.ts` status odpowiedniego dokumentu na `approved` wraz z osobą i datą (kod sam nigdy nie uznaje szkicu za zatwierdzony). Dla treści sportowych dodaj datę i osobę przeglądającej do tego pliku.
