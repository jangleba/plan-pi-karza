import { applyReadiness } from "./planEngine";
import type { Profile, Readiness, SessionDay } from "./types";

function stripReadinessMetadata(session: SessionDay): SessionDay {
  const next: SessionDay = {
    ...session,
    readinessAdjustedDate: null,
    readinessOriginalSession: null,
  };
  if (session.secondSession) {
    next.secondSession = stripReadinessMetadata(session.secondSession);
  }
  return next;
}

export function hasPersistedReadinessAdjustment(
  session: SessionDay,
  date: string,
): boolean {
  return session.readinessAdjustedDate === date;
}

export function applyCheckInToPlanDay(
  plan: SessionDay[],
  date: string,
  readiness: Readiness,
  profile: Profile,
): { plan: SessionDay[]; changed: boolean; adjusted: SessionDay | null } {
  const index = plan.findIndex((day) => day.date === date);
  if (index === -1) {
    return { plan, changed: false, adjusted: null };
  }

  const current = plan[index];
  const base = stripReadinessMetadata(current.readinessOriginalSession ?? current);
  const adapted = applyReadiness(base, readiness, profile).session;
  const adjusted: SessionDay = {
    ...adapted,
    readinessAdjustedDate: date,
    readinessOriginalSession: base,
  };

  const unchanged = JSON.stringify(current) === JSON.stringify(adjusted);
  if (unchanged) {
    return { plan, changed: false, adjusted };
  }

  const nextPlan = [...plan];
  nextPlan[index] = adjusted;
  return { plan: nextPlan, changed: true, adjusted };
}
