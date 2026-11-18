/**
 * Jak silnik V2 zaczyna nowy cykl po podsumowaniu poprzedniego. Każdy skutek jest mierzalny w
 * recepturach i sprawdzany testem (engineV2/cycleEffects.test.ts); komunikaty w cycleReview.ts
 * opisują wyłącznie to, co poniższa tabela naprawdę robi.
 *
 *  - health:      2 tygodnie lżejszego startu (mniej serii),
 *  - transition:  1 tydzień lżejszego startu,
 *  - deload:      1 tydzień lżejszego startu, potem zwykła dawka (Bell i in. 2023),
 *  - consistency: główne ćwiczenie siłowe w dawce utrzymaniowej, bez akcentu siły maksymalnej,
 *  - maintain:    jak consistency; dodatkowo bez dodatniej progresji skoków z siłowni,
 *  - vary:        inne ćwiczenia siłowe z tych samych grup (zmiana bodźca, nie większa dawka),
 *  - progress:    zwykły blok; dawka NIE rośnie za upływ czasu, tylko po potwierdzonych zapisach.
 *
 * Silnik V2 nie ma tygodni „przeciążenia”: żadna rekomendacja ich nie dodaje.
 */
export type CycleRecommendationKind =
  "health" | "transition" | "deload" | "consistency" | "maintain" | "vary" | "progress";

export interface CycleStartPolicy {
  kind: CycleRecommendationKind;
  youth: boolean;
}

/** Skutek rekomendacji na receptury nowego cyklu (jedno miejsce, czytane przez silnik). */
interface CycleStartEffect {
  /** Główne ćwiczenie siłowe w dawce utrzymaniowej; brak akcentu siły maksymalnej i progresji skoków. */
  hold: boolean;
  /** Inne ćwiczenia siłowe z tych samych grup, stałe w całym cyklu. */
  rotate: boolean;
}
export function cycleStartEffectOf(
  kind: CycleRecommendationKind | null | undefined,
): CycleStartEffect {
  return {
    hold: kind === "consistency" || kind === "maintain",
    rotate: kind === "vary",
  };
}
