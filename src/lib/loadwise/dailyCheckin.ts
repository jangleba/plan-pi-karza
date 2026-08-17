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

/**
 * Jedno źródło prawdy dla Start / Plan / szczegółów sesji.
 * Zwraca zapisany, już dostosowany SessionDay albo dostosowuje go na żywo.
 * Nigdy nie nakłada adaptacji dwa razy.
 */
export function resolveAdjustedDay(
  day: SessionDay,
  readiness: Readiness | undefined,
  profile: Profile | null,
): SessionDay {
  if (!profile) return day;
  if (readiness && hasPersistedReadinessAdjustment(day, readiness.date)) {
    return day;
  }
  return applyReadiness(day, readiness, profile).session;
}

/** Najbliższy przyszły mecz z aktywnego planu (fallback: data z profilu). */
export function nextMatchDate(
  plan: SessionDay[],
  todayIso: string,
  profileMatchDate?: string | null,
): string | null {
  const fromPlan = plan
    .filter((d) => d.dayType === "match" && d.date >= todayIso)
    .map((d) => d.date)
    .sort();
  if (fromPlan.length > 0) return fromPlan[0];
  if (profileMatchDate && profileMatchDate >= todayIso) return profileMatchDate;
  return null;
}
