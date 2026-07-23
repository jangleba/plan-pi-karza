# PLAN_MODULE_PROTECTED — twarda granica Plan ↔ Vision Lab

Ten dokument uzupełnia `PLAN_PROTECTED.md` i zamraża twarde zasady na
poziomie procesu i CI. Obowiązuje bez wyjątków.

## Zakres chroniony

- `src/routes/_tabs.plan.tsx`
- `src/routes/sesja.$date.tsx`
- `src/components/loadwise/**`
- `src/lib/loadwise/**` (silnik planowania, biblioteka ćwiczeń, typy, etykiety,
  generator sesji, reguły tygodniowe)

## Twarde zasady

1. **Prace nad Vision Lab NIE mogą modyfikować modułu Plan.**
   Zmiany w `src/features/vision-analysis/**`, `src/lib/vision/**` ani
   `src/components/vision/**` nie mogą dotykać generatora treningów,
   biblioteki ćwiczeń, reguł planowania ani UI Planu.

2. **Zakaz wyników demo i fallbacków.**
   Vision Lab nigdy nie zwraca:
   - wyników losowych,
   - wyników z placeholderami,
   - sztucznego postępu (`setTimeout`/animowanego progressu bez rzeczywistych
     kroków pipeline'u),
   - fallbacku „zwróć jakikolwiek wynik, żeby UI coś pokazało".
   Jedyne akceptowalne stany końcowe to: **poprawny pomiar** albo
   **twardy błąd z kodem i instrukcją retake**.

3. **Testy syntetyczne nie są dowodem działania na prawdziwym filmie.**
   Wynik zielonego `vitest` z syntetycznymi landmarkami NIE uprawnia do
   deklaracji, że test działa end-to-end na uploadzie użytkownika.
   Weryfikacja end-to-end wymaga logu z rzeczywistego przebiegu w preview.

4. **Zakres stabilny.**
   Aktywne w UI są wyłącznie testy z `SUPPORTED_VISION_TESTS`
   (`src/lib/vision/supportedTests.ts`). Pozostałe testy są ukryte za flagą
   `VITE_VISION_EXPERIMENTAL_TESTS`.

## Egzekwowanie

- `src/lib/loadwise/planBoundary.test.ts` — pilnuje, że Plan nie importuje
  Vision, a Vision nie importuje modułu Plan poza dozwolonymi typami.
- `src/lib/loadwise/planRegression.test.ts` — zamraża strukturę i etykiety
  Planu.
- `src/features/vision-analysis/planIsolation.test.ts` — pilnuje, że pliki
  Vision nie importują generatora, biblioteki ćwiczeń ani reguł Planu.

Każde złamanie tych reguł jest błędem CI, nie stylistyczną uwagą.
