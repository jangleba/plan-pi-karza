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

export type CompletedSessionEntry = SessionHistoryRecord & { durationEstimated?: boolean };
export type ProgressPeriod = 7 | 28;

export function validProgressDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function uniqueTrainingHistory(
  rows: readonly CompletedSessionEntry[],
): CompletedSessionEntry[] {
  const byId = new Map<string, CompletedSessionEntry>();
  for (const row of rows) {
    if (
      !row.key ||
      !validProgressDate(row.date) ||
      !Object.hasOwn(TRAINING_CATEGORY_LABELS, row.category)
    )
      continue;
    byId.set(row.key, {
      ...row,
      durationMin:
        Number.isFinite(row.durationMin) && row.durationMin >= 0 && row.durationMin <= 1440
          ? row.durationMin
          : 0,
      rpe:
        typeof row.rpe === "number" && Number.isFinite(row.rpe) && row.rpe >= 0 && row.rpe <= 10
          ? row.rpe
          : null,
    });
  }
  return [...byId.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key),
  );
}

export function categoryOf(day: SessionDay): TrainingCategoryKey | null {
  const type = (day.type || day.sessionType || "").toLowerCase();
  if (type === "testing" || /\btest/.test(type)) return null;
  // The second session's own prescription wins over the match/club calendar day.
  if (type === "match") return "match";
  if (type === "club_training") return "club";
  if (type === "strength_power") return "gym";
  if (type === "sprint_acceleration" || type === "cod_agility") return "speed";
  if (type === "endurance_running") return "endurance";
  if (type === "football_technical") return "ball";
  // Older plans store Polish display names instead of the canonical enum.
  if (/mecz/.test(type)) return "match";
  if (/klub/.test(type)) return "club";
  if (/sił|moc|power/.test(type)) return "gym";
  if (/sprint|szybko|agility|cod|motory/.test(type)) return "speed";
  if (/wydol|wytrzyma|tlen|rsa/.test(type)) return "endurance";
  if (/piłk|technik/.test(type)) return "ball";
  if (
    type === "recovery" ||
    type === "prehab_mobility" ||
    type === "activation" ||
    day.isRecoveryOrPrehab ||
    /regener|prehab|mobil|aktywac/.test(type)
  ) {
    return "recovery";
  }
  if (day.dayType === "match") return "match";
  if (day.isClubSession || day.dayType === "club") return "club";
  return null;
}

/** Ukończone sesje widoczne w aktualnym planie. */
export function buildTrainingHistory(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
): CompletedSessionEntry[] {
  const history: CompletedSessionEntry[] = [];
  const metadata = new Map<string, SessionDay>();
  for (const day of plan) {
    const sessions = day.secondSession ? [day, { ...day.secondSession, date: day.date }] : [day];
    for (const session of sessions) {
      const id = session.dbId || session.sessionId;
      if (id) metadata.set(id, session);
    }
  }
  for (const [id, completion] of Object.entries(completions)) {
    if (!completion.completed || completion.status === "missed" || completion.status === "started")
      continue;
    const session = completion.executionSnapshot ?? metadata.get(id);
    if (!session || session.dayType === "rest") continue;
    const category = categoryOf(session);
    if (!category) continue;
    history.push({
      key: id,
      date: session.date,
      title: session.title,
      category,
      durationMin: completion.durationMin ?? session.durationMin ?? 0,
      durationEstimated: completion.durationMin == null,
      rpe: completion.rpe,
      notes: completion.notes ?? "",
    });
  }
  return uniqueTrainingHistory(history);
}

/** Łączy historię archiwalną z bezpiecznym fallbackiem z aktywnego planu. */
export function mergeTrainingHistory(
  persisted: CompletedSessionEntry[],
  currentPlan: CompletedSessionEntry[],
  completions?: Record<string, SessionCompletion>,
): CompletedSessionEntry[] {
  const rows = uniqueTrainingHistory([...persisted, ...currentPlan]);
  if (!completions) return rows;
  return uniqueTrainingHistory(
    rows.flatMap((item) => {
      const log = completions[item.key];
      if (!log) return [item];
      if (!log.completed || log.status === "missed" || log.status === "started") return [];
      return [
        {
          ...item,
          rpe: log.rpe,
          notes: log.notes,
          ...(log.durationMin != null
            ? { durationMin: log.durationMin, durationEstimated: false }
            : {}),
        },
      ];
    }),
  );
}
