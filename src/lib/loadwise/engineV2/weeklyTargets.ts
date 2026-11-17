import type { SessionDay } from "../types";
import { dayDistance, plusDays, type WeeklyTargets } from "./model";
import { strengthCoverageOf } from "./strengthCompleteness";

export interface WeeklyTargetCoverage {
  startDate: string;
  endDate: string;
  requested: WeeklyTargets;
  /** `strength` counts only sessions with the full strength stimulus (or the MD+1 upper exception). */
  planned: { strength: number; speed: number; endurance: number };
  /** Strength sessions that carry support work only; not counted as coverage of the target. */
  partialStrength: number;
  fullRestDays: number;
}

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
  plusDays(value, 0) === value;

/** The generator's rolling seven-day windows, counted from saved physical slots.
 * Missing dates are unknown, never inferred rest days or fulfilled sessions. */
export function weeklyTargetCoverage(
  plan: readonly SessionDay[],
  targets: WeeklyTargets,
): WeeklyTargetCoverage[] {
  const days = plan
    .filter((day) => validDate(day.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return [];
  const anchor = days[0].date;
  const count = Math.floor(dayDistance(days[days.length - 1].date, anchor) / 7) + 1;
  // Saved plans share the generator's four-week contract. Reject corrupt ranges
  // and duplicate days rather than inventing counts or allocating unbounded windows.
  if (count > 4 || new Set(days.map((day) => day.date)).size !== days.length) return [];
  return Array.from({ length: count }, (_, index) => {
    const startDate = plusDays(anchor, index * 7);
    const endDate = plusDays(startDate, 6);
    const week = days.filter((day) => day.date >= startDate && day.date <= endDate);
    const planned = { strength: 0, speed: 0, endurance: 0 };
    let partialStrength = 0;
    const restDates = new Set<string>();
    for (const day of week) {
      if (day.dayType === "rest" && !day.engineV2 && !day.secondSession && !day.externalCommitment)
        restDates.add(day.date);
      for (const session of [day, ...(day.secondSession ? [day.secondSession] : [])]) {
        const roles = session.engineV2?.roles ?? [];
        if (roles.some((role) => role === "strengthA" || role === "strengthB")) {
          if (strengthCoverageOf(session) === "partial") partialStrength++;
          else planned.strength++;
        }
        if (roles.includes("speed")) planned.speed++;
        if (roles.includes("endurance")) planned.endurance++;
      }
    }
    return {
      startDate,
      endDate,
      requested: { ...targets },
      planned,
      partialStrength,
      fullRestDays: restDates.size,
    };
  });
}
