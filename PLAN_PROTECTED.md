# PLAN_PROTECTED — granica modułów Plan ↔ Vision Lab

Ten dokument zamraża granicę architektoniczną między modułem **Plan**
(planowanie treningu) a modułem **Vision / Vision Lab** (analiza wideo).

## Moduł Plan (chroniony)

Kod należący do modułu Plan:

- `src/routes/_tabs.plan.tsx` — widok tygodnia planu
- `src/routes/sesja.$date.tsx` — ekran szczegółów jednostki treningowej
- `src/components/loadwise/**` — karty dni, sekcje treningu, UI
- `src/lib/loadwise/**` — silnik planowania, biblioteka ćwiczeń, typy, etykiety

## Zasady

1. **Vision nie może modyfikować Planu.**
   Zmiany w `src/features/vision-analysis/**` NIE mogą modyfikować ani zależeć
   od modułu Plan w sposób, który zmienia jego wygląd lub zachowanie.

2. **Plan nie zależy od Vision.**
   Żaden plik `src/lib/loadwise/**`, `src/routes/_tabs.plan.tsx`,
   `src/routes/sesja.$date.tsx` ani `src/components/loadwise/**` nie może
   importować z `src/features/vision-analysis/**` ani `src/lib/vision/**`.

3. **Dozwolony kierunek zależności.**
   Vision może czytać *tylko typy i etykiety* Planu
   (`@/lib/loadwise/types`, `@/lib/loadwise/labels`). To jedyny dozwolony
   przepływ i nie wolno go rozszerzać o logikę ani UI.

4. **Plan zmieniany tylko na jawne polecenie.**
   Moduł Plan wolno modyfikować wyłącznie na osobne, wyraźne polecenie
   dotyczące Planu — nigdy „przy okazji" prac nad Lab/Vision.

## Egzekwowanie

Granica jest pilnowana testem regresji:
`src/lib/loadwise/planBoundary.test.ts`.
Test sprawdza, że pliki Planu nie importują kodu Vision oraz że
`src/features/vision-analysis` nie sięga do modułu Plan.
