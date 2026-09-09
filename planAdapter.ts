/**
 * Adapter Plan → FuelWise (READ-ONLY).
 * Moduł Plan nie jest modyfikowany — czytamy wyłącznie jego istniejące typy.
 */

import type { Profile, SessionDay } from "@/lib/loadwise/types";
import type {
  FuelAthleteContext,
  FuelSessionInput,
  SessionIntensity,
  SessionKind,
} from "./types";

export const EMPTY_SESSION: FuelSessionInput = {
  kind: "none",
  intensity: null,
  durationMin: null,
  minutesToStart: null,
  title: null,
  subtitle: null,
  date: null,
  startClock: null,
  dayLabel: null,
};

export function sessionKindFrom(session: SessionDay | null): SessionKind {
  if (!session) return "none";
  if (session.dayType === "match") return "match";
  if (session.dayType === "rest") return "none";
  if (session.dayType === "recovery") return "recovery";
  const text =
    `${session.type ?? ""} ${session.sessionType} ${session.title} ${session.goalLabel}`.toLowerCase();
  if (/sprint|szybko|przyspiesz|akcelera/.test(text)) return "speed";
  if (/siła|siłow|strength|moc|power/.test(text)) return "strength";
  if (/wytrzyma|interwał|kondyc|tempo|aerob|endurance/.test(text)) return "endurance";
  if (/regenera|mobil|prehab/.test(text)) return "recovery";
  return "football";
}

/** Najbliższa rzeczywista jednostka z planu: dziś lub później, bez dni wolnych. */
export function findNextSession(
  plan: SessionDay[],
  todayIso: string,
): SessionDay | null {
  const upcoming = plan
    .filter(
      (d) =>
        d.date >= todayIso &&
        d.dayType !== "rest" &&
        d.isUnavailable !== true &&
        (d.durationMin ?? 0) > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}

export function sessionFromPlan(
  session: SessionDay | null,
  todayIso: string,
): FuelSessionInput {
  if (!session) return EMPTY_SESSION;
  const kind = sessionKindFrom(session);
  if (kind === "none") return EMPTY_SESSION;
  return {
    kind,
    intensity: (session.intensity as SessionIntensity | undefined) ?? null,
    durationMin: session.durationMin ?? null,
    minutesToStart: null,
    title: session.title ?? null,
    subtitle: session.goalLabel ?? session.sessionType ?? null,
    date: session.date,
    startClock: null,
    dayLabel: dayLabelFor(session.date, todayIso, session.dayName),
  };
}

function dayLabelFor(date: string, todayIso: string, dayName: string): string {
  if (date === todayIso) return "Dzisiaj";
  const t = new Date(`${todayIso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (date === t.toISOString().slice(0, 10)) return "Jutro";
  return dayName;
}

export function athleteFromProfile(profile: Profile | null): FuelAthleteContext {
  return {
    age: profile?.age ?? null,
    position: profile?.position ?? null,
    level: profile?.level ?? null,
    goal: profile?.goal ?? null,
    restrictions: [],
  };
}
