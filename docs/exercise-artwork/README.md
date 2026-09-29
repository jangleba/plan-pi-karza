# BallWise — grafiki ćwiczeń

## Grafiki używane przez aplikację

Dwa systemy pozostają aktywne i nie są zamienne:

- **71 PNG techniki:** `public/strength/small` (44), `public/plyometric/small`
  (16), `public/power/small` (11). `getExerciseTechniqueImage` w
  `src/lib/loadwise/exerciseTechniqueImages.ts` tworzy adresy
  `/{kategoria}/small/{exerciseId}.png` z dokładnych kanonicznych ID.
  Brak bezpośredniego importu PNG nie oznacza, że plik jest nieużywany.
- **32 WebP blueprintów:** `src/assets/blueprints`. `MovementBlueprint.tsx`
  najpierw szuka PNG techniki po `exerciseId`, następnie rozwiązuje jawny
  `visualId` lub dokładne znormalizowane nazwy z biblioteki blueprintów.
  Identyfikatory mogą pochodzić również z zapisanych sesji. Brak dopasowania
  daje placeholder, bez wyboru przypadkowo podobnego ruchu.

PNG techniki mają 768 × 512 px i pokazują fazy ruchu; grafiki mocy i plyometrii
zawierają strzałki. Spisy kategorii są materiałem autorskim, nie rejestrem
ładowanym przez aplikację. Kolumna `file` jest względna wobec danego CSV:

- [Siła — manifest](strength/manifest.csv), [podgląd](preview/strength.jpg)
- [Plyometria — manifest](plyometric/manifest.csv), [podgląd](preview/plyometric.jpg)
- [Moc — manifest](power/manifest.csv), [instrukcja](power/README.md), [podgląd](preview/power.jpg)

## Materiały autorskie

[Wzorzec postaci](reference/ballwise-athlete-master.png) oraz trzy podglądy
pozostają w dokumentacji. Nie umieszczaj ich ponownie w `public`: katalog ten
jest kopiowany do wdrożenia webowego i paczki mobilnej.

Usunięto starsze PNG blueprintów zastąpione przez WebP i niepodłączone grafiki
z `public/sprint`. Nie usuwaj aktywnych PNG techniki, trzech grafik zawodników
Football IQ, favicony, licencji dostawców ani szablonów iOS na podstawie samego
wyszukiwania statycznych importów.

Po zmianie mapowań uruchom `npm test -- src/lib/loadwise/exerciseTechniqueImages.test.ts`
oraz `npm run verify:release`; sprawdź także widok ćwiczenia i zapisane wcześniej sesje.
