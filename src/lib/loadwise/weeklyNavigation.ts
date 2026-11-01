import { addIsoDays } from "@/lib/isoDate";
export const weekdayFromIso = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

export type WeekBounds = { startDate: string; endDate: string };
export function weeklyConfirmationBounds(dates: string[], index: number): WeekBounds {
  if (!dates.length || !Number.isInteger(index) || index < 0)
    throw new Error("Nie znaleziono tygodnia.");
  const offset = weekdayFromIso(dates[0]) - 1;
  const count = Math.ceil((offset + dates.length) / 7);
  if (index > count) throw new Error("Najpierw przygotuj poprzedni tydzień.");
  const monday = addIsoDays(dates[0], -offset + index * 7);
  return { startDate: index === 0 ? dates[0] : monday, endDate: addIsoDays(monday, 6) };
}
export function currentWeekIndex(weeks: WeekBounds[], today: string): number {
  return weeks.findIndex((week) => week.startDate <= today && week.endDate >= today);
}
export function weekBounds(weeks: WeekBounds[], index: number): WeekBounds | null {
  if (weeks[index]) return weeks[index];
  if (index !== weeks.length || !weeks.length) return null;
  const startDate = addIsoDays(weeks[weeks.length - 1].endDate, 1);
  return { startDate, endDate: addIsoDays(startDate, 6) };
}
export function weeklyPromptTarget(
  weeks: WeekBounds[],
  today: string,
  confirmed: (index: number) => boolean,
  firstWeekNeedsConfirmation = false,
) {
  const current = currentWeekIndex(weeks, today);
  if (current < 0) return null;
  const index =
    weekdayFromIso(today) === 7 ? current + 1 : (current > 0 || firstWeekNeedsConfirmation) && !confirmed(current) ? current : -1;
  const bounds = index >= 0 ? weekBounds(weeks, index) : null;
  return bounds ? { ...bounds, index, isNext: index > current } : null;
}
