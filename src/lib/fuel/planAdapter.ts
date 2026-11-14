import { addIsoDays } from "@/lib/isoDate";
/**
 * Adapter Plan → FuelWise (READ-ONLY).
 * Moduł Plan nie jest modyfikowany — czytamy wyłącznie jego istniejące typy.
 */

import type { SessionDay } from "@/lib/loadwise/types";
import { classifySession } from "@/lib/loadwise/sessionClassification";
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
  if (session.engineV2) {
    const classification = classifySession(session);
    if (classification.countsAsStrength) return "strength";
    if (classification.countsAsEndurance) return "endurance";
    if (classification.countsAsSpeed) return "speed";
    if (
      classification.isRecovery ||
      classification.isMobility ||
      classification.subcategory === "activation"
    )
      return "recovery";
    return classification.subcategory === "ball_technical" ? "football" : "none";
  }
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

export function sessionFromPlan(session: SessionDay | null, todayIso: string): FuelSessionInput {
  if (!session) return EMPTY_SESSION;
  const kind = sessionKindFrom(session);
  if (kind === "none") return EMPTY_SESSION;
  return {
    kind,
    intensity: session.engineV2
      ? classifySession(session).intensity
      : ((session.intensity as SessionIntensity | undefined) ?? null),
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
