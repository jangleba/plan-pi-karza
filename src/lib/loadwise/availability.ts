import type { Profile } from "./types";

/**
 * Can the athlete do OWN training on this weekday (1 = Monday … 7 = Sunday)?
 * Days marked unavailable never get own work, and when the profile lists its
 * own training days, only those days do. The onboarding saves every day that
 * is not unavailable, club days included. One rule for the generator, the
 * final policy, the saved-plan check and the MD+1 adaptation.
 */
export function ownTrainingAllowed(
  profile: Partial<Pick<Profile, "unavailableDays" | "individualTrainingDays">>,
  weekday: number,
): boolean {
  if ((profile.unavailableDays ?? []).includes(weekday)) return false;
  const own = profile.individualTrainingDays;
  return !Array.isArray(own) || own.includes(weekday);
}
