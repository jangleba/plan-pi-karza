export type TrainingDecisionMode = "planned" | "confirmed" | "other_day";

interface TrainingDecisionGateInput {
  isToday: boolean;
  hasTodayCheckin: boolean;
}

/**
 * Jedna reguła wejścia do dzisiejszej sesji dla ekranu Start i deep linku.
 * Check-in dotyczy operacji na planie i jest opcjonalny; nie blokuje treningu.
 */
export function resolveTrainingDecisionMode({
  isToday,
  hasTodayCheckin,
}: TrainingDecisionGateInput): TrainingDecisionMode {
  if (!isToday) return "other_day";
  return hasTodayCheckin ? "confirmed" : "planned";
}

export function canOpenTrainingSession(mode: TrainingDecisionMode): boolean {
  return mode === "planned" || mode === "confirmed" || mode === "other_day";
}
