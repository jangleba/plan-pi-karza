import type {
  SessionCompletion,
  SessionDay,
  SessionHistoryCategory,
  SessionHistoryRecord,
} from "@/lib/loadwise/types";

/** Kategorie treningu używane w historii i na pulpicie Postępu. */
export type TrainingCategoryKey = SessionHistoryCategory;

export const TRAINING_CATEGORY_LABELS: Record<TrainingCategoryKey, string> = {
  gym: "Siła",
  speed: "Szybkość",
  endurance: "Wydolność",
  ball: "Piłka",
  club: "Klub",
  match: "Mecz",
  recovery: "Regeneracja",
};

export type CompletedSessionEntry = SessionHistoryRecord;

function categoryOf(day: SessionDay): TrainingCategoryKey | null {
  const type = day.type ?? day.sessionType ?? "";
  if (type === "testing") return null;
  if (day.dayType === "match" || type === "match") return "match";
  if (day.isClubSession || type === "club_training") return "club";
  if (type === "strength_power") return "gym";
  if (type === "sprint_acceleration" || type === "cod_agility") return "speed";
  if (type === "endurance_running") return "endurance";
  if (type === "football_technical") return "ball";
  if (
    type === "recovery" ||
    type === "prehab_mobility" ||
    type === "activation" ||
    day.isRecoveryOrPrehab
  ) {
    return "recovery";
  }
  return "gym";
}

/** Ukończone sesje widoczne w aktualnym planie. */
export function buildTrainingHistory(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
): CompletedSessionEntry[] {
  const history: CompletedSessionEntry[] = [];
  for (const day of plan) {
    const sessions = day.secondSession ? [day, day.secondSession] : [day];
    for (const session of sessions) {
      const id = session.dbId ?? session.sessionId;
      if (!id || session.dayType === "rest") continue;
      const completion = completions[id];
      if (!completion?.completed) continue;
      const category = categoryOf(session);
      if (!category) continue;
      history.push({
        key: id,
        date: session.date,
        title: session.title,
        category,
        durationMin: session.durationMin ?? 0,
        rpe: completion.rpe,
        notes: completion.notes ?? "",
      });
    }
  }
  return history.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Łączy historię archiwalną z bezpiecznym fallbackiem z aktywnego planu. */
export function mergeTrainingHistory(
  persisted: CompletedSessionEntry[],
  currentPlan: CompletedSessionEntry[],
): CompletedSessionEntry[] {
  const byId = new Map<string, CompletedSessionEntry>();
  for (const item of currentPlan) byId.set(item.key, item);
  for (const item of persisted) byId.set(item.key, item);
  return Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
}
