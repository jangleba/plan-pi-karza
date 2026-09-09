import type { SessionCompletion, SessionDay } from "./types";

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
): boolean {
  return session.date < todayIso && isMissableSession(session) && !completion;
}

export function expiredUnfinishedSessions(
  plan: SessionDay[],
  todayIso: string,
  completions: Record<string, SessionCompletion>,
): SessionDay[] {
  return plan
    .flatMap((day) => [day, day.secondSession].filter(Boolean) as SessionDay[])
    .filter((session) =>
      isExpiredUnfinishedSession(
        session,
        todayIso,
        session.dbId ? completions[session.dbId] : undefined,
      ),
    );
}
