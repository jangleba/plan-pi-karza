import type { Profile } from "./types";

export function normalizeMatchDates(
  dates: Array<string | null | undefined>,
  limit = 2,
): string[] {
  return Array.from(
    new Set(dates.filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))),
  )
    .sort()
    .slice(0, limit);
}

export function profileMatchDates(
  profile: Pick<Profile, "matchDate" | "matchDates"> | Partial<Pick<Profile, "matchDate" | "matchDates">>,
): string[] {
  return normalizeMatchDates([profile.matchDate, ...(profile.matchDates ?? [])]);
}

export function isProfileMatchDate(
  profile: Partial<Pick<Profile, "matchDate" | "matchDates">>,
  date: string,
): boolean {
  return profileMatchDates(profile).includes(date);
}
