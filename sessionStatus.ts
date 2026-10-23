import type { SessionCompletion, SessionDay } from "./types";
import { isActiveSessionWithinGrace } from "./activeSession";

export function isMissableSession(session: SessionDay): boolean {
  return Boolean(
    session.dbId &&
    !session.isUnavailable &&
    session.dayType !== "rest" &&
    session.dayType !== "recovery",
  );
}

export function isExpiredUnfinishedSession(
  session: SessionDay,
  todayIso: string,
  completion: SessionCompletion | undefined,
  nowMs = Date.now(),
): boolean {
  return (
    session.date < todayIso &&
    isMissableSession(session) &&
    !completion?.completed &&
    completion?.status !== "completed" &&
    completion?.status !== "missed" &&
    !isActiveSessionWithinGrace(session.date, completion, todayIso, nowMs)
  );
}

export function expiredUnfinishedSessions(
  plan: SessionDay[],
  todayIso: string,
  completions: Record<string, SessionCompletion>,
  nowMs = Date.now(),
): SessionDay[] {
  return plan
    .flatMap((day) => [day, day.secondSession].filter(Boolean) as SessionDay[])
    .filter((session) =>
      isExpiredUnfinishedSession(
        session,
        todayIso,
        session.dbId ? completions[session.dbId] : undefined,
        nowMs,
      ),
    );
}
