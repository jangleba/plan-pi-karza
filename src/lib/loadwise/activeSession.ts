import { addIsoDays } from "@/lib/isoDate";
import type { SessionCompletion, SessionDay } from "./types";

export const ACTIVE_SESSION_GRACE_MS = 4 * 60 * 60 * 1000;

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** A bounded in-flight workout survives midnight; an old unfinished log does not. */
export function activeSessionGraceDeadline(
  sessionDate: string,
  completion: SessionCompletion | undefined,
  todayIso: string,
  nowMs = Date.now(),
): number | null {
  if (
    completion?.status !== "started" ||
    completion.completed ||
    !completion.startedAt ||
    !validCalendarDate(sessionDate) ||
    !validCalendarDate(todayIso) ||
    !Number.isFinite(nowMs)
  )
    return null;
  if (sessionDate !== todayIso && sessionDate !== addIsoDays(todayIso, -1)) return null;
  const startedMs = Date.parse(completion.startedAt);
  if (!Number.isFinite(startedMs) || startedMs > nowMs) return null;
  const deadline = startedMs + ACTIVE_SESSION_GRACE_MS;
  return nowMs < deadline ? deadline : null;
}

export function isActiveSessionWithinGrace(
  sessionDate: string,
  completion: SessionCompletion | undefined,
  todayIso: string,
  nowMs = Date.now(),
): boolean {
  return activeSessionGraceDeadline(sessionDate, completion, todayIso, nowMs) !== null;
}

/** Resolve only the requested slot, including its snapshot after a cycle rollover. */
export function activeSessionForRoute(
  resolvedPlan: SessionDay[],
  completions: Record<string, SessionCompletion>,
  requestedDate: string,
  slot: 1 | 2,
  todayIso: string,
  nowMs = Date.now(),
): SessionDay | null {
  const day = resolvedPlan.find((item) => item.date === requestedDate);
  const selected = slot === 2 ? day?.secondSession : day;
  if (
    selected?.dbId &&
    isActiveSessionWithinGrace(requestedDate, completions[selected.dbId], todayIso, nowMs)
  )
    return selected;
  for (const [id, completion] of Object.entries(completions)) {
    const snapshot = completion.executionSnapshot;
    if (
      snapshot?.dbId === id &&
      snapshot.date === requestedDate &&
      snapshot.executionSlot === slot &&
      isActiveSessionWithinGrace(requestedDate, completion, todayIso, nowMs)
    )
      return snapshot;
  }
  return null;
}
