import type { SessionCompletion, SessionDay } from "../types";

/** Keep the entire day if either slot has immutable execution evidence. */
export function lockedExecutionDays(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
): SessionDay[] {
  return plan
    .filter((d) =>
      [d, d.secondSession].some(
        (s) =>
          s &&
          (s.executionProtected ||
            (s.dbId &&
              (completions[s.dbId]?.completed ||
                ["started", "completed"].includes(completions[s.dbId]?.status ?? "")))),
      ),
    )
    .map((d) => ({ ...d, executionProtected: true }));
}
