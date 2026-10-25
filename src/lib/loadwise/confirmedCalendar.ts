import { generatePlanAsync } from "./generatePlanAsync";
import { parseIso } from "./labels";
import type { Profile, SessionDay, WeeklyTransition } from "./types";

export function transitionMatchesBlock(
  plan: SessionDay[],
  transition: WeeklyTransition | undefined,
  weekNumber: number,
): boolean {
  if (!transition || !plan[0]?.cycleId || transition.cycleId !== plan[0].cycleId) return false;
  const groups: SessionDay[][] = [];
  for (const day of plan) {
    const date = parseIso(day.date);
    if (!groups.length || date.getDay() === 1) groups.push([]);
    groups.at(-1)!.push(day);
  }
  const week = groups[weekNumber];
  return (
    !!week?.length &&
    transition.weekStart === week[0].date &&
    transition.weekEnd === week[week.length - 1].date &&
    (
      transition.nextMatchDates ?? (transition.nextMatchDate ? [transition.nextMatchDate] : [])
    ).every((date) => date >= week[0].date && date <= week[week.length - 1].date)
  );
}

/** Confirmed matches remain inputs when an engine refresh rebuilds prescriptions. */
export async function applyConfirmedCalendar(
  plan: SessionDay[],
  profile: Profile,
  transitions: Record<number, WeeklyTransition>,
  signal?: AbortSignal,
): Promise<SessionDay[]> {
  if (!plan.length || !Object.keys(transitions).length) return plan;
  const { weekRanges } = await import("./planEngine");
  const ranges = weekRanges(parseIso(plan[0].date), plan.length);
  const next = [...plan];
  for (const [key, transition] of Object.entries(transitions)) {
    const index = Number(key),
      range = ranges[index];
    if (!range || !transitionMatchesBlock(plan, transition, index)) continue;
    const weekStart = plan[range.start]?.date;
    const weekEnd = plan[range.end - 1]?.date;
    const cycleId = plan[0]?.cycleId;
    if (
      !weekStart ||
      !weekEnd ||
      (transition.cycleId && cycleId && transition.cycleId !== cycleId) ||
      transition.weekStart !== weekStart ||
      transition.weekEnd !== weekEnd
    )
      continue;
    const dates = transition.noMatchNextWeek
      ? []
      : (transition.nextMatchDates ?? (transition.nextMatchDate ? [transition.nextMatchDate] : []));
    if (dates.some((date) => date < weekStart || date > weekEnd)) continue;
    const fresh = await generatePlanAsync(
      { ...profile, usualMatchDay: "no_fixed_day", matchDate: dates[0] ?? null, matchDates: dates },
      parseIso(plan[range.start].date),
      range.end - range.start,
      index,
      signal,
    );
    next.splice(
      range.start,
      fresh.length,
      ...fresh.map((day) => ({ ...day, cycleId: plan[0].cycleId })),
    );
  }
  return next;
}
