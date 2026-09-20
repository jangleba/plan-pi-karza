export type TrainingDecisionMode =
  "checkin_required" | "confirmed" | "other_day";

interface TrainingDecisionGateInput {
  isToday: boolean;
  hasTodayCheckin: boolean;
}

/**
 * Jedna reguła wejścia do dzisiejszej sesji dla ekranu Start i deep linku.
 * Check-in dotyczy wyłącznie operacji na planie, nie danych zdrowotnych.
 */
export function resolveTrainingDecisionMode({
  isToday,
  hasTodayCheckin,
}: TrainingDecisionGateInput): TrainingDecisionMode {
  if (!isToday) return "other_day";
  return hasTodayCheckin ? "confirmed" : "checkin_required";
}

export function canOpenTrainingSession(mode: TrainingDecisionMode): boolean {
  return mode !== "checkin_required";
}
