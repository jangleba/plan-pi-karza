/** QA-only: a fixed two-week plan built from the kept session builders (no week engine). */
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { buildStrengthPowerStructured, structuredToFlat } from "@/lib/loadwise/strengthBlocks";
import { enforceStrengthEligibility } from "@/lib/loadwise/strengthEligibility";
import type { Profile, SessionDay } from "@/lib/loadwise/types";

const DAY_NAMES = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

function isoPlusDays(start: string, days: number): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayName(date: string): string {
  return DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/** A real strength session from the strength builder, checked by the profile gate. */
export function qaStrengthSession(profile: Profile, date: string, dbId: string): SessionDay {
  const plan = buildStrengthPowerStructured(profile, {
    mdLabel: "MD-5",
    weekPhase: "development",
    weekIndex: 1,
    gymSessionIndexInWeek: 0,
    gymSessionsThisWeekTotal: 2,
    readiness: 8,
    powerFocus: profile.goal === "power",
    history: { usedRolesThisWeek: [], usedMainThisWeek: [], usedMainLastWeek: [] },
  });
  if (!plan) throw new Error("QA fixture: the strength builder returned no session");
  return enforceStrengthEligibility(
    sessionFixture({
      dbId,
      date,
      dayName: dayName(date),
      type: "strength_power",
      title: plan.title,
      durationMin: plan.durationMin,
      sessionType: plan.sessionType,
      intensity: plan.intensity,
      mdLabel: "MD-5",
      blockPhaseLabel: "Tydz. 2 — budowanie",
      structuredSections: plan.sections,
      sections: structuredToFlat(plan.sections),
    }),
    profile,
  );
}

function restDay(date: string, dbId: string): SessionDay {
  return sessionFixture({
    dbId,
    date,
    dayName: dayName(date),
    dayType: "rest",
    type: "rest",
    title: "Wolne",
    sessionType: "Wolne",
    goalLabel: "Wolne",
    intensity: "niska",
    durationMin: 0,
  });
}

/** Strength on Monday and Tuesday of the first week, rest on the other days. */
export function qaPlan(profile: Profile, start: string, days = 14): SessionDay[] {
  return Array.from({ length: days }, (_, index) => {
    const date = isoPlusDays(start, index);
    return index < 2
      ? qaStrengthSession(profile, date, `qa-${index}`)
      : restDay(date, `qa-${index}`);
  });
}
