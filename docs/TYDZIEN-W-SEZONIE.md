# Tydzień meczowy: siłownia dzień po meczu · silnik V2.12

Decyzja zawodnika z 16 listopada 2026, dotycząca tygodnia z meczem, w którym nie mieszczą się dwie siłownie:
**najpierw dzień po meczu, potem jedna siłownia w tygodniu.**

## Reguła

1. Generator układa tydzień tak jak dotąd: siła A, siła B, sprint i wydolność przechodzą wszystkie bramki kalendarza.
2. Jeśli siła A lub B nie dostała terminu, silnik sprawdza dzień po meczu (MD+1). Ten dzień jest dozwolony tylko wtedy,
   gdy w nim ani w dwóch kolejnych dniach nie ma meczu. W tygodniu z dwoma meczami MD+1 bywa też MD-2 i pozostaje wolny.
   - Poziom zaawansowany lub elita: pełna sesja (`postMatch: "full"`).
   - Pozostali: sesja „Upper Body & Trunk” (`postMatch: "upper"`): rozgrzewka, pchanie, przyciąganie, tułów i rzut piłką.
     Ta sesja nie obciąża nóg. Nie blokuje siły nóg dzień przed ani dzień po niej i nie liczy się jako nogi
     przy naprzemienności A/B, więc sesja nóg zmienia się między A i B z tygodnia na tydzień.
3. Jeśli również dzień po meczu nie pasuje (klub, dostępność, czas, brak sprzętu), tydzień z meczem ma jedną siłownię.
   Nie pojawia się wtedy ostrzeżenie o brakującej sile. Wyjątek: gdy siła jest celem głównym (cel siła lub moc),
   ostrzeżenie zostaje, zgodnie z kontraktem celu głównego.

## Kod

- `engineV2/postMatch.ts`: `isPostMatchDate`, `postMatchMode`, `upperBodyOnly`, `POST_MATCH_UPPER_ROLES`.
- `planner.ts`: próba MD+1 po rozwiązaniu tygodnia, także dla siły B przy celu mobilności.
  `finalizeStrengthRecipe` zachowuje kształt sesji po meczu, a `refreshStrengthSession` i `lighterRecipes` go przenoszą.
- `scheduling.ts` i walidator planu dopuszczają w buforze meczu wyłącznie sesję `postMatch` na MD+1.
- `validation.ts`: `POST_MATCH_UPPER_ONLY` (w sesji upper nie może być pracy nóg) i `POST_MATCH_FULL`
  (pełna sesja tylko dla zaawansowanych i elity).
- Testy: `postMatch.test.ts`.

Zmiana wersji na `ballwise-v2.12` oznacza zapisane plany jako wymagające aktualizacji przez podgląd, tak jak przy poprzednich wersjach.
