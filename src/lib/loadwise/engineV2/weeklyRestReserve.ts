import type { SessionDay } from "../types";
import { dayDistance, plusDays } from "./model";

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
  plusDays(value, 0) === value;
const fullRest = (day: SessionDay) =>
  day.dayType === "rest" && !day.engineV2 && !day.secondSession && !day.externalCommitment;

/** Keep the saved reserve in the original plan's seven-day windows, including past dates.
 * Existing calendar/execution conflicts are preserved rather than rewritten by a proposal. */
export function preservesWeeklyRestReserve(
  before: readonly SessionDay[],
  after: readonly SessionDay[],
): boolean {
  const saved = before.find((d) => d.planInputs)?.planInputs;
  const requested = saved?.minFullRestDays ?? (saved?.fillRestDays === true ? 1 : 0);
  if (
    (saved?.minFullRestDays !== undefined && ![0, 1, 2].includes(saved.minFullRestDays)) ||
    (saved?.fillRestDays !== undefined && typeof saved.fillRestDays !== "boolean")
  )
    return false;
  if (!requested || !before.length) return true;
  if (before.some((d) => !validDate(d.date)) || after.some((d) => !validDate(d.date))) return false;
  const original = new Map(before.map((d) => [d.date, d]));
  const candidate = new Map(after.map((d) => [d.date, d]));
  if (original.size !== before.length || candidate.size !== after.length) return false;
  const anchor = [...original.keys()].sort()[0];
  const weeks = new Map<number, { before: number; after: number }>();
  for (const [date, day] of original) {
    const index = Math.floor(dayDistance(date, anchor) / 7);
    const counts = weeks.get(index) ?? { before: 0, after: 0 };
    if (fullRest(day)) counts.before++;
    const next = candidate.get(date);
    if (next && fullRest(next)) counts.after++;
    weeks.set(index, counts);
  }
  return [...weeks.values()].every((week) => week.after >= Math.min(requested, week.before));
}
