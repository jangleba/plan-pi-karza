import type { Profile, SessionCompletion } from "./types";
import { parseCompletionNotes } from "./sessionPresentation";

/** Recorded answers only. A new daily check-in takes precedence in the plan adapter. */
export function recentSessionFeedback(
  profile: Profile | null | undefined,
  completions: Record<string, SessionCompletion>,
  date: string,
  excludeId?: string,
) {
  const rows = Object.entries(completions ?? {})
    .filter(
      ([id, c]) =>
        id !== excludeId &&
        c.completed &&
        c.status !== "missed" &&
        c.executionSnapshot?.date &&
        c.executionSnapshot.date <= date &&
        (Date.parse(date) - Date.parse(c.executionSnapshot.date)) / 86400000 <= 1,
    )
    .sort((a, b) =>
      (b[1].endedAt ?? b[1].executionSnapshot!.date).localeCompare(
        a[1].endedAt ?? a[1].executionSnapshot!.date,
      ),
    );
  if (!rows.length) return null;
  const [id, completion] = rows[0];
  const health =
    profile?.healthPersonalizationEnabled === true ? parseCompletionNotes(completion.notes) : null;
  return {
    id,
    rpe: completion.rpe,
    pain: health?.pain ?? 0,
    legFatigue: health?.legFatigue ?? 0,
    key: `${id}:${completion.writeVersion ?? 0}:${completion.rpe}:${health?.pain ?? 0}:${health?.legFatigue ?? 0}`,
  };
}
