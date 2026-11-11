import type {
  CompetitionLevel,
  DoubleSessions,
  Goal,
  Level,
  Position,
  Profile,
  SeasonPhase,
  SecondaryLimiter,
  SessionDay,
} from "./types";
import { validateSeason } from "./seasonValidation";
import { ISO_DAY_LABELS } from "./labels";

/**
 * Answers collected by the onboarding screens that drive the training plan.
 * Every field here changes the generated plan for at least one athlete
 * (see onboardingAnswersDrivePlan.test.ts); questions that changed nothing
 * ("Etap w sezonie", "Jak czujesz się / chcesz się czuć na boisku") are no
 * longer asked.
 */
export interface OnboardingAnswers {
  position: Position | null;
  level: Level | null;
  competitionLevel: CompetitionLevel | null;
  goal: Goal | null;
  secondaryLimiter: SecondaryLimiter | null;
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
  };
}

/** Initial answers: from a saved profile when editing, otherwise empty. */
export function answersFromProfile(profile?: Profile | null): OnboardingAnswers {
  return {
    position: profile?.position ?? null,
    level: profile?.level ?? null,
    competitionLevel: profile?.competitionLevel ?? null,
    goal: profile?.goal ?? null,
    secondaryLimiter: profile?.secondaryLimiter ?? null,
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

// ---------------------------------------------------------------------------
// Summary: what follows from the answers (facts only, no reasons)
// ---------------------------------------------------------------------------

export interface PlanFact {
  id: "week" | "first" | "match" | "strength" | "focus" | "off";
  label: string;
  value: string;
}

const SHORT_DAY = ["nd", "pn", "wt", "śr", "cz", "pt", "so"];

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${SHORT_DAY[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${Number(day)}.${month}`;
}

function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return `${count} ${one}`;
  const last = count % 10;
  const tens = count % 100;
  return `${count} ${last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many}`;
}

const FOCUS_LABELS: Record<Goal, string> = {
  speed: "Szybkość",
  strength: "Siła",
  endurance: "Wytrzymałość",
  power: "Moc",
  agility: "Zwrotność i hamowanie",
  general: "Gra z piłką",
  mobility: "Mobilność i prehab",
  return: "Powrót po przerwie",
  matchready: "Gotowość meczowa",
};

/** Limiter that names the same quality as the goal (then it is not repeated). */
const SAME_AS_GOAL: Partial<Record<Goal, SecondaryLimiter>> = {
  speed: "speed",
  strength: "strength",
  endurance: "endurance",
  power: "power",
  agility: "cod",
  general: "ball",
  return: "return",
};

const LIMITER_FOCUS: Record<SecondaryLimiter, string> = {
  speed: "szybkość",
  strength: "siła",
  endurance: "wytrzymałość",
  cod: "zwrotność",
  power: "moc",
  ball: "gra z piłką",
  fatigue: "mniej zmęczenia",
  return: "powrót po przerwie",
};

/**
 * Short facts about the first seven days of the generated plan and the
 * settings it follows. Counts come from the real plan, so the summary shows
 * exactly what the athlete will get.
 */
export function onboardingPlanFacts(profile: Profile, plan: SessionDay[]): PlanFact[] {
  const week = plan.slice(0, 7);
  const own = week.filter((day) => day.dayType === "training").length;
  const extra = week.filter((day) => day.secondSession).length;
  const club = week.filter((day) => day.dayType === "club").length;
  const facts: PlanFact[] = [];
  const parts = [
    plural(own, "trening własny", "treningi własne", "treningów własnych"),
    ...(club ? [plural(club, "klubowy", "klubowe", "klubowych")] : []),
    ...(extra ? [plural(extra, "dodatkowa sesja", "dodatkowe sesje", "dodatkowych sesji")] : []),
  ];
  facts.push({ id: "week", label: "Pierwsze 7 dni", value: parts.join(" · ") });
  const first = week.find((day) => day.dayType === "training");
  if (first)
    facts.push({
      id: "first",
      label: "Pierwszy trening",
      value: `${shortDate(first.date)} · ${first.title}`,
    });
  const match = week.find((day) => day.dayType === "match");
  const usual =
    typeof profile.usualMatchDay === "number"
      ? ISO_DAY_LABELS.find((item) => item.value === profile.usualMatchDay)?.label.toLowerCase()
      : null;
  facts.push({
    id: "match",
    label: "Mecz",
    value: match
      ? `${shortDate(match.date)}${usual ? ` · co tydzień: ${usual}` : ""}`
      : profile.matchDate
        ? `${shortDate(profile.matchDate)}${usual ? ` · co tydzień: ${usual}` : ""}`
        : "Bez meczu",
  });
  const tools = profile.equipment.filter((item) => !WALL.test(item) && !/bramk/i.test(item));
  facts.push({
    id: "strength",
    label: "Siła",
    value: profile.hasGym
      ? "Na siłowni"
      : tools.length
        ? `Bez siłowni: ${tools.join(", ").toLowerCase()}`
        : "Bez siłowni: masa ciała",
  });
  facts.push({
    id: "focus",
    label: "Akcent",
    value: `${FOCUS_LABELS[profile.goal]}${
      profile.secondaryLimiter && SAME_AS_GOAL[profile.goal] !== profile.secondaryLimiter
        ? ` · dodatkowo ${LIMITER_FOCUS[profile.secondaryLimiter]}`
        : ""
    }`,
  });
  const off = profile.unavailableDays ?? [];
  if (off.length)
    facts.push({
      id: "off",
      label: "Bez treningu",
      value: off.map((day) => ISO_DAY_LABELS.find((item) => item.value === day)?.short).join(", "),
    });
  return facts;
}
