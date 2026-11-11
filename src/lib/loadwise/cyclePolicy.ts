import type { WeekPhase } from "./types";

/**
 * Jak silnik zaczyna nowy cykl po podsumowaniu poprzedniego.
 *
 * Każdy cykl ma bazowy układ tygodni: wprowadzenie → budowanie → przeciążenie →
 * odciążenie (phaseOf). Rekomendacja z końca poprzedniego cyklu zmienia ten układ:
 *  - health: 2 tygodnie odciążenia na start, bez tygodni przeciążenia,
 *  - transition: tydzień odciążenia na start, bez przeciążenia,
 *  - deload: tydzień odciążenia, potem wprowadzenie i zwykły blok (Bell i in. 2023),
 *  - consistency / maintain: bez tygodni przeciążenia — objętość nie rośnie,
 *    dopóki zawodnik nie robi ≥ 80% planu (Gabbett 2016: bez skoków obciążenia),
 *  - vary: kolejność budowanie ↔ przeciążenie zamieniona (zmienny bodziec,
 *    periodyzacja falowa, Rhea i in. 2002),
 *  - progress: zwykły blok; u młodzieży (< 18 lat) najwyżej jeden tydzień
 *    przeciążenia (Lloyd i in. 2014, Faigenbaum i in. 2016).
 */
export type CycleRecommendationKind =
  "health" | "transition" | "deload" | "consistency" | "maintain" | "vary" | "progress";

export interface CycleStartPolicy {
  kind: CycleRecommendationKind;
  youth: boolean;
}

export function cycleWeekPhase(
  base: WeekPhase,
  weekIndex: number,
  totalWeeks: number,
  policy: CycleStartPolicy | null | undefined,
): WeekPhase {
  if (!policy || totalWeeks <= 1) return base;
  const last = weekIndex === totalWeeks - 1;
  const noOverload = base === "peak" ? "development" : base;
  switch (policy.kind) {
    case "health":
      return weekIndex <= 1 && !last ? "deload" : noOverload;
    case "transition":
      return weekIndex === 0 && !last ? "deload" : noOverload;
    case "deload":
      if (weekIndex === 0 && !last) return "deload";
      if (weekIndex === 1 && !last) return "adaptation";
      return weekIndex === 2 && !last ? "development" : base;
    case "consistency":
    case "maintain":
      return noOverload;
    case "vary":
      if (weekIndex === 1 && !last) return "peak";
      if (weekIndex === 2 && !last) return "development";
      return base;
    case "progress":
      return policy.youth && base === "peak" && weekIndex >= 3 ? "development" : base;
  }
}

/**
 * Tydzień lżejszego startu cyklu (zdrowie, roztrenowanie, zmęczenie): silnik
 * zabiera wtedy jedną własną sesję (najpierw drugą sesję dnia), nigdy poniżej
 * tygodniowego minimum.
 */
export function cycleStartLighterWeek(
  weekIndex: number,
  totalWeeks: number,
  policy: CycleStartPolicy | null | undefined,
): boolean {
  if (!policy || totalWeeks <= 1 || weekIndex === totalWeeks - 1) return false;
  if (policy.kind === "health") return weekIndex <= 1;
  if (policy.kind === "transition" || policy.kind === "deload") return weekIndex === 0;
  return false;
}
