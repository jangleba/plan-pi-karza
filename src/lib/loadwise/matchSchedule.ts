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
 * Only for athletes who play every week.
 */
export function rememberedMatchWeekday(
  knownMatchDates: Array<string | null | undefined>,
  before: string,
  usualMatchDay?: Profile["usualMatchDay"],
  weeklyMatches?: boolean,
): number | null {
  // A single match is not a weekly habit: nothing is preselected, so a week
  // cannot get a match the athlete never named.
  if (weeklyMatches === false && typeof usualMatchDay !== "number") return null;
  const latest = normalizeMatchDates(knownMatchDates, Number.MAX_SAFE_INTEGER)
    .filter((date) => date < before)
    .at(-1);
  if (latest) return new Date(`${latest}T12:00:00Z`).getUTCDay() || 7;
  return typeof usualMatchDay === "number" && usualMatchDay >= 1 && usualMatchDay <= 7
    ? usualMatchDay
    : null;
}

/**
 * Weekday of the athlete's fixed weekly match, only when it was chosen on
 * purpose: matches every week AND a saved weekday. Anything else (a single
 * match, „no fixed day”, an old profile without a weekday) gives null.
 */
export function fixedMatchWeekday(
  profile: Partial<Pick<Profile, "weeklyMatches" | "usualMatchDay">>,
): number | null {
  const day = profile.usualMatchDay;
  return profile.weeklyMatches === true && typeof day === "number" && day >= 1 && day <= 7
    ? day
    : null;
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayIso(iso: string): string {
  const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;
  return addDaysIso(iso, 1 - weekday);
}

/**
 * Match dates the plan is built around for [startIso, startIso + days): the
 * saved fixtures, plus the fixed weekly match day in every calendar week that
 * has no saved fixture and comes after the next saved one. Without saved
 * fixtures and without a deliberately chosen weekly day there is no match —
 * the plan never assumes one (and so never adds an activation before it).
 */
export function scheduledMatchDates(
  profile: Partial<Pick<Profile, "matchDate" | "matchDates" | "weeklyMatches" | "usualMatchDay">>,
  startIso: string,
  days: number,
): string[] {
  const saved = profileMatchDates(profile);
  const weekday = fixedMatchWeekday(profile);
  if (weekday === null || days <= 0) return saved;
  const endIso = addDaysIso(startIso, days - 1);
  const nextSaved = saved.find((date) => date >= startIso);
  const savedWeeks = new Set(saved.map(mondayIso));
  const projected: string[] = [];
  for (let monday = mondayIso(startIso); monday <= endIso; monday = addDaysIso(monday, 7)) {
    if (savedWeeks.has(monday)) continue;
    // Before the next saved fixture the athlete told us when the next match is.
    if (nextSaved && monday <= mondayIso(nextSaved)) continue;
    const date = addDaysIso(monday, weekday - 1);
    if (date >= startIso && date <= endIso) projected.push(date);
  }
  return normalizeMatchDates([...saved, ...projected], Number.MAX_SAFE_INTEGER);
}
