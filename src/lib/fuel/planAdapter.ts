/**
 * Adapter Plan → Fuel Check (READ-ONLY).
 * Moduł Plan nie jest modyfikowany — czytamy wyłącznie jego istniejące typy.
 */

import type { Profile, SessionDay } from "@/lib/loadwise/types";
import type {
  FuelAthleteInput,
  FuelSessionInput,
  FuelWeekLoadInput,
  SessionKind,
  SessionIntensity,
} from "./types";

export function sessionKindFrom(session: SessionDay | null): SessionKind {
  if (!session) return "none";
  if (session.dayType === "match") return "match";
  if (session.dayType === "rest") return "none";
  if (session.dayType === "recovery") return "recovery";
  const text = `${session.sessionType} ${session.title} ${session.goalLabel}`.toLowerCase();
  if (/sprint|szybko|przyspiesz|akcelera/.test(text)) return "speed";
  if (/siła|siłow|strength|moc|power/.test(text)) return "strength";
  if (/wytrzyma|interwał|kondyc|tempo|aerob/.test(text)) return "endurance";
  if (/regenera|mobil|prehab/.test(text)) return "recovery";
  return "football";
}

export function athleteFromProfile(
  profile: Profile | null,
  extra: { sex: FuelAthleteInput["sex"]; bodyMassKg: number | null; heightCm: number | null },
): FuelAthleteInput {
  return {
    age: profile?.age ?? null,
    sex: extra.sex,
    bodyMassKg: extra.bodyMassKg,
    heightCm: extra.heightCm,
    position: profile?.position ?? null,
    level: profile?.level ?? null,
    goal: profile?.goal ?? null,
  };
}

export function sessionFromPlan(
  session: SessionDay | null,
  minutesToStart: number | null,
): FuelSessionInput {
  return {
    kind: sessionKindFrom(session),
    intensity: (session?.intensity as SessionIntensity | undefined) ?? null,
    durationMin: session?.durationMin ?? null,
    minutesToStart,
    title: session?.title ?? null,
  };
}

/** Obciążenie ostatnich 7 dni liczone z planu (bez zapisu do Planu). */
export function weekLoadFromPlan(
  plan: SessionDay[],
  todayIso: string,
): FuelWeekLoadInput {
  const start = shiftIso(todayIso, -6);
  const window = plan.filter((d) => d.date >= start && d.date <= todayIso);
  if (!window.length) return { hardSessions7d: null, totalMinutes7d: null };
  return {
    hardSessions7d: window.filter(
      (d) => d.intensity === "wysoka" || d.dayType === "match",
    ).length,
    totalMinutes7d: window.reduce((s, d) => s + (d.durationMin ?? 0), 0),
  };
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Minuty od teraz do godziny startu (HH:MM) tego samego dnia. */
export function minutesUntil(startClock: string, nowClock: string): number | null {
  const a = startClock.match(/^(\d{1,2}):(\d{2})$/);
  const b = nowClock.match(/^(\d{1,2}):(\d{2})$/);
  if (!a || !b) return null;
  const diff =
    (Number(a[1]) * 60 + Number(a[2])) - (Number(b[1]) * 60 + Number(b[2]));
  return diff < 0 ? null : diff;
}
