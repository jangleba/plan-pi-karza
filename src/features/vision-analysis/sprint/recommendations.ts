/**
 * Katalog zaleceń Vision — mapuje POTWIERDZONY limiter na jedną krótką
 * wskazówkę i 2-3 identyfikatory istniejących ćwiczeń.
 *
 * Vision NIE modyfikuje planu. Zwracamy wyłącznie identyfikatory (string),
 * bez importu modułu Plan/Loadwise. Brak pewnego mapowania → brak zalecenia.
 */

import type { SprintLimiterId, SprintRecommendation } from "./types";

const CATALOG: Record<SprintLimiterId, SprintRecommendation> = {
  acceleration_position: {
    limiterId: "acceleration_position",
    cue: "Utrzymaj niską sylwetkę przez pierwsze kroki — pchaj podłoże do tyłu.",
    exerciseIds: ["wall_drill_march", "sled_push", "acceleration_starts"],
  },
  braking_contact: {
    limiterId: "braking_contact",
    cue: "Stawiaj stopę pod biodrem, nie przed sobą.",
    exerciseIds: ["a_switch_progression", "dribble_bleeds", "skip_a"],
  },
  step_rhythm: {
    limiterId: "step_rhythm",
    cue: "Skróć kontakt z podłożem i przyspiesz zmianę nóg.",
    exerciseIds: ["ankling", "skip_a", "pogo_jumps"],
  },
  side_asymmetry: {
    limiterId: "side_asymmetry",
    cue: "Wyrównaj strony jednonóż, zanim zwiększysz objętość sprintu.",
    exerciseIds: ["single_leg_rdl", "split_squat", "single_leg_hop"],
  },
};

/** Zwraca zalecenie tylko dla potwierdzonego limitera. */
export function recommendationForLimiter(
  limiterId: SprintLimiterId | null | undefined,
): SprintRecommendation | null {
  if (!limiterId) return null;
  return CATALOG[limiterId] ?? null;
}

export const SPRINT_RECOMMENDATION_CATALOG = CATALOG;
