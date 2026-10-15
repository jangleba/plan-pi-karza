import { classifySession } from "../loadwise/sessionClassification";
import { addIsoDays } from "@/lib/isoDate";
/**
 * Adapter Plan → FuelWise (READ-ONLY).
 * Moduł Plan nie jest modyfikowany — czytamy wyłącznie jego istniejące typy.
 */

import type { SessionDay } from "@/lib/loadwise/types";
import type { FuelSessionInput, SessionIntensity, SessionKind } from "./types";

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
  const category = classifySession(session).category;
  if (category === "match") return "match";
  if (category === "rest") return "none";
  if (category === "gym_strength") return "strength";
  if (category === "endurance_conditioning") return "endurance";
  if (category === "speed_sprint") return "speed";
  if (category === "recovery_prehab" || category === "mobility") return "recovery";
  return "football";
}

export function sessionFromPlan(session: SessionDay | null, todayIso: string): FuelSessionInput {
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
  if (date === addIsoDays(todayIso, 1)) return "Jutro";
  return dayName;
}
