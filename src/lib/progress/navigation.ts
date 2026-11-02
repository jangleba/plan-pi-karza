import type { SessionDay, SessionModification } from "@/lib/loadwise/types";
import { categoryOf, validProgressDate } from "./progress";

export interface ProgressSessionTarget {
  date: string;
  slot: 1 | 2;
  mod?: string;
  sessionId: string;
}
/** Only sessions still resolvable by the real session route receive a link. */
export function progressSessionTargets(
  plan: SessionDay[],
  modifications: Record<string, SessionModification[]> = {},
) {
  const targets: Record<string, ProgressSessionTarget> = {};
  for (const day of plan) {
    if (!validProgressDate(day.date) || day.isUnavailable) continue;
    const sessions = [day, ...(day.secondSession ? [day.secondSession] : [])];
    sessions.forEach((session, index) => {
      const id = session.dbId || session.sessionId;
      if (
        !id ||
        session.dayType === "rest" ||
        session.isUnavailable ||
        categoryOf(session) === null
      )
        return;
      const addition = modifications[day.date]?.find(
        (mod) => mod.type === "add" && (mod.session.dbId || mod.session.sessionId) === id,
      );
      targets[id] = {
        date: day.date,
        slot: index === 0 ? 1 : 2,
        sessionId: id,
        ...(addition ? { mod: addition.id } : {}),
      };
    });
  }
  return targets;
}
