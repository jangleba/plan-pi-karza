import type { SessionDay } from "../types";

export type SessionDurationMode = "full" | "limited";
export interface SessionDurationOptions {
  sessionDurationMode?: SessionDurationMode;
  minutesPerSession?: number;
}

/** An explicit time is a deliberate limit. A new plan without one keeps whole recipes. */
export function resolveSessionDurationMode(options: SessionDurationOptions): SessionDurationMode {
  return (
    options.sessionDurationMode ?? (options.minutesPerSession === undefined ? "full" : "limited")
  );
}

/** Infinity is an internal comparison bound only; it is never persisted in a plan. */
export function sessionTimeBudget(options: SessionDurationOptions): number {
  return resolveSessionDurationMode(options) === "full"
    ? Number.POSITIVE_INFINITY
    : (options.minutesPerSession ?? 75);
}

/** Compatibility numeric field; the separate mode determines whether it is a limit. */
export function serializedSessionMinutes(options: SessionDurationOptions): number {
  const value = options.minutesPerSession;
  return typeof value === "number" && Number.isFinite(value) ? value : 75;
}

/** A legacy saved limit remains a limit until the athlete explicitly chooses a new full plan. */
export function savedSessionDurationMode(plan: readonly SessionDay[]): SessionDurationMode {
  const saved = plan.find((day) => day.planInputs)?.planInputs?.sessionDurationMode;
  if (saved) return saved;
  for (const day of plan)
    for (const session of [day, ...(day.secondSession ? [day.secondSession] : [])])
      if (session.engineV2?.sessionDurationMode) return session.engineV2.sessionDurationMode;
  return "limited";
}
