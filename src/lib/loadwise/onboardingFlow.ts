import type {
  CompetitionLevel,
  CurrentPitchFeeling,
  DesiredPitchFeeling,
  DoubleSessions,
  Goal,
  Level,
  Position,
  Profile,
  SeasonPhase,
  SecondaryLimiter,
} from "./types";
import { validateSeason } from "./seasonValidation";
import {
  MAX_PITCH_FEELINGS,
  ONBOARDING_CURRENT_FEELINGS,
  ONBOARDING_DESIRED_FEELINGS,
} from "./playerDirection";

/**
 * Answers collected by the onboarding screens. They are saved in the profile
 * as input for the week-planning engine (to be rebuilt).
 */
export interface OnboardingAnswers {
  position: Position | null;
  level: Level | null;
  competitionLevel: CompetitionLevel | null;
  goal: Goal | null;
  secondaryLimiter: SecondaryLimiter | null;
  /** „Jak czujesz się teraz na boisku?” — 1–2 answers. */
  currentFeelings: CurrentPitchFeeling[];
  /** „Jak chcesz się czuć na boisku?” — 1–2 answers; the first one leads the accent. */
  desiredFeelings: DesiredPitchFeeling[];
  clubDays: number[];
  unavailableDays: number[];
  /** yyyy-MM-dd of the next match, empty when none. */
  matchDate: string;
  noMatch: boolean;
  weeklyMatches: boolean;
  seasonPhase: SeasonPhase | null;
  seasonPhaseOverride: boolean;
  hasGym: boolean;
  hasPitch: boolean;
  hasSprintSpace: boolean;
  hasWall: boolean;
  /** Labels from OWN_EQUIPMENT_OPTIONS (wall/rebounder is `hasWall`). */
  equipment: string[];
  doubleSessionsAllowed: DoubleSessions;
}

const WALL = /wall|rebounder|odbojnik|ściana/i;

export function hasWallEquipment(equipment: readonly string[]): boolean {
  return equipment.some((item) => WALL.test(item));
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a yyyy-MM-dd date. */
export function isoWeekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
}

/** Days that are not club days and that the athlete marked as unavailable. */
export function cleanUnavailableDays(unavailable: number[], clubDays: number[]): number[] {
  return [...new Set(unavailable)].filter((day) => !clubDays.includes(day)).sort((a, b) => a - b);
}

/** Double-session options offered for a level (a beginner gets at most a light second session). */
export function doubleSessionOptions(level: Level | null): DoubleSessions[] {
  return level === "beginner" ? ["no", "light_only"] : ["no", "light_only", "yes_if_safe"];
}

/** Season phase the calendar and the next match point to; used as the preselected answer. */
export function suggestedSeasonPhase(
  answers: Pick<OnboardingAnswers, "matchDate" | "noMatch" | "weeklyMatches">,
  today?: Date,
): SeasonPhase {
  return (
    validateSeason({
      seasonPhase: null,
      seasonStage: null,
      nextMatchDate: answers.noMatch ? null : answers.matchDate || null,
      weeklyMatches: answers.noMatch ? false : answers.weeklyMatches,
      today,
    }).suggestion ?? "inseason"
  );
}

export function seasonCheck(answers: OnboardingAnswers, today?: Date) {
  return validateSeason({
    seasonPhase: answers.seasonPhase,
    seasonStage: null,
    nextMatchDate: answers.noMatch ? null : answers.matchDate || null,
    weeklyMatches: answers.noMatch ? false : answers.weeklyMatches,
    seasonPhaseOverride: answers.seasonPhaseOverride,
    today,
  });
}

type TrainingFields = Pick<
  Profile,
  | "position"
  | "level"
  | "goal"
  | "secondaryLimiter"
  | "clubTrainingDays"
  | "individualTrainingDays"
  | "unavailableDays"
  | "usualMatchDay"
  | "matchDate"
  | "matchDates"
  | "equipment"
  | "doubleSessionsAllowed"
  | "seasonPhase"
  | "seasonStage"
  | "competitionLevel"
  | "weeklyMatches"
  | "seasonPhaseOverride"
  | "seasonValidationStatus"
  | "hasGym"
  | "hasPitch"
  | "hasSprintSpace"
  | "currentPitchFeelings"
  | "desiredPitchFeelings"
>;

/**
 * Profile fields the plan engine reads, built from the onboarding answers.
 * Throws when a required answer is missing (the screens do not let it happen).
 */
export function trainingFieldsFromAnswers(
  answers: OnboardingAnswers,
  existing?: Pick<Profile, "matchDate" | "matchDates"> | null,
  today?: Date,
): TrainingFields {
  const { position, level, goal, competitionLevel, seasonPhase } = answers;
  if (!position || !level || !goal || !competitionLevel || !seasonPhase)
    throw new Error("Onboarding answers are incomplete.");
  const clubTrainingDays = [...new Set(answers.clubDays)].sort((a, b) => a - b);
  const unavailableDays = cleanUnavailableDays(answers.unavailableDays, clubTrainingDays);
  const matchDate = answers.noMatch ? null : answers.matchDate || null;
  const weeklyMatches = matchDate ? answers.weeklyMatches : false;
  const matchDates = !matchDate
    ? []
    : matchDate === existing?.matchDate
      ? (existing?.matchDates ?? [matchDate])
      : [matchDate];
  const equipment = [
    ...answers.equipment.filter((item) => !WALL.test(item)),
    ...(answers.hasWall ? ["rebounder"] : []),
  ];
  const doubleSessionsAllowed = doubleSessionOptions(level).includes(answers.doubleSessionsAllowed)
    ? answers.doubleSessionsAllowed
    : "light_only";
  const validation = seasonCheck(answers, today);
  return {
    position,
    level,
    goal,
    secondaryLimiter: answers.secondaryLimiter,
    clubTrainingDays,
    // BallWise picks the days itself: every day except the unavailable ones.
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7].filter((day) => !unavailableDays.includes(day)),
    unavailableDays,
    // A weekly match is remembered as the usual match day (preselected when a week is confirmed).
    usualMatchDay: matchDate && weeklyMatches ? isoWeekday(matchDate) : "no_fixed_day",
    matchDate,
    matchDates,
    equipment,
    doubleSessionsAllowed,
    seasonPhase,
    // The stage only restricted the season check and never changed the plan.
    seasonStage: null,
    competitionLevel,
    weeklyMatches,
    seasonPhaseOverride: answers.seasonPhaseOverride,
    seasonValidationStatus: answers.seasonPhaseOverride ? "override" : validation.status,
    hasGym: answers.hasGym,
    hasPitch: answers.hasPitch,
    hasSprintSpace: answers.hasSprintSpace,
    currentPitchFeelings: onlyOffered(answers.currentFeelings, ONBOARDING_CURRENT_FEELINGS),
    desiredPitchFeelings: onlyOffered(answers.desiredFeelings, ONBOARDING_DESIRED_FEELINGS),
  };
}

/** Answers from the onboarding list, without repeats, at most two, in the order picked. */
function onlyOffered<T extends string>(
  values: readonly T[] | undefined,
  offered: readonly T[],
): T[] {
  return [...new Set(values ?? [])]
    .filter((id) => offered.includes(id))
    .slice(0, MAX_PITCH_FEELINGS);
}

/** Toggles a feeling: a third pick replaces the older of the two. */
export function toggleFeeling<T extends string>(values: readonly T[], id: T): T[] {
  if (values.includes(id)) return values.filter((value) => value !== id);
  return [...values, id].slice(-MAX_PITCH_FEELINGS);
}

/** Initial answers: from a saved profile when editing, otherwise empty. */
export function answersFromProfile(profile?: Profile | null): OnboardingAnswers {
  return {
    position: profile?.position ?? null,
    level: profile?.level ?? null,
    competitionLevel: profile?.competitionLevel ?? null,
    goal: profile?.goal ?? null,
    secondaryLimiter: profile?.secondaryLimiter ?? null,
    currentFeelings: onlyOffered(profile?.currentPitchFeelings, ONBOARDING_CURRENT_FEELINGS),
    desiredFeelings: onlyOffered(profile?.desiredPitchFeelings, ONBOARDING_DESIRED_FEELINGS),
    clubDays: profile?.clubTrainingDays ?? [],
    unavailableDays: profile?.unavailableDays ?? [],
    matchDate: profile?.matchDate ?? "",
    noMatch: Boolean(profile?.onboardingComplete && !profile.matchDate),
    weeklyMatches: profile?.weeklyMatches ?? true,
    seasonPhase: profile?.seasonPhase ?? null,
    seasonPhaseOverride: profile?.seasonPhaseOverride ?? false,
    hasGym: profile?.hasGym ?? false,
    hasPitch: profile?.hasPitch ?? true,
    hasSprintSpace: profile?.hasSprintSpace ?? true,
    hasWall: hasWallEquipment(profile?.equipment ?? []),
    equipment: (profile?.equipment ?? []).filter((item) => !WALL.test(item)),
    doubleSessionsAllowed: profile?.doubleSessionsAllowed ?? "no",
  };
}
