import type { Profile } from "./types";

export function normalizeMatchDates(dates: Array<string | null | undefined>, limit = 2): string[] {
  return Array.from(
    new Set(dates.filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))),
  )
    .sort()
    .slice(0, limit);
}

export function profileMatchDates(
  profile:
    Pick<Profile, "matchDate" | "matchDates"> | Partial<Pick<Profile, "matchDate" | "matchDates">>,
): string[] {
  return normalizeMatchDates([profile.matchDate, ...(profile.matchDates ?? [])], 64);
}

export function isProfileMatchDate(
  profile: Partial<Pick<Profile, "matchDate" | "matchDates">>,
  date: string,
): boolean {
  return profileMatchDates(profile).includes(date);
}

/**
 * Weekday (1 = Monday … 7 = Sunday) of the player's most recent known match
 * before `before`: saved week confirmations, matches in the plan and profile
 * dates. Falls back to the usual match day from the profile. Used to preselect
 * the match day when a new week is confirmed, so it is not picked every week.
 */
export function rememberedMatchWeekday(
  knownMatchDates: Array<string | null | undefined>,
  before: string,
  usualMatchDay?: Profile["usualMatchDay"],
): number | null {
  const latest = normalizeMatchDates(knownMatchDates, Number.MAX_SAFE_INTEGER)
    .filter((date) => date < before)
    .at(-1);
  if (latest) return new Date(`${latest}T12:00:00Z`).getUTCDay() || 7;
  return typeof usualMatchDay === "number" && usualMatchDay >= 1 && usualMatchDay <= 7
    ? usualMatchDay
    : null;
}
