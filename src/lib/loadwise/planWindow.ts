import { addIsoDays } from "@/lib/isoDate";
import { weekdayFromIso } from "./weeklyNavigation";

/** Minimum length of a generated training block. */
export const PLAN_WINDOW_MIN_DAYS = 28;

/** Sunday that closes the Monday–Sunday week containing `date`. */
export function calendarSunday(date: string): string {
  return addIsoDays(date, 7 - weekdayFromIso(date));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/**
 * Number of days to generate from `start`.
 *
 * A block is at least {@link PLAN_WINDOW_MIN_DAYS} long, always ends on a
 * Sunday (so the last week is a full Monday–Sunday week) and never ends before
 * a date the current block already covers (weeks confirmed with a match date
 * extend the block; a rebuild must not cut them off again).
 */
export function planWindowDays(
  start: string,
  ...coveredUntil: Array<string | null | undefined>
): number {
  let end = addIsoDays(start, PLAN_WINDOW_MIN_DAYS - 1);
  for (const date of coveredUntil) if (date && date > end) end = date;
  return daysBetween(start, calendarSunday(end)) + 1;
}

/** True when a stored block stops before the Sunday of its last week. */
export function planEndsMidWeek(dates: readonly string[]): boolean {
  const last = dates.at(-1);
  return !!last && weekdayFromIso(last) !== 7;
}

/**
 * Latest end of a still-relevant confirmed week. A rebuild keeps the block long
 * enough to contain it, so a saved match date is not dropped with its week.
 * Only weeks ending within three weeks of today count.
 */
export function latestConfirmedWeekEnd(
  transitions: Record<number, { weekEnd?: string }>,
  today: string,
): string | null {
  const limit = addIsoDays(today, 21);
  let latest: string | null = null;
  for (const { weekEnd } of Object.values(transitions))
    if (weekEnd && weekEnd >= today && weekEnd <= limit && (!latest || weekEnd > latest))
      latest = weekEnd;
  return latest;
}
