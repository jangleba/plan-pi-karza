import type { Profile, SessionDay } from "../types";
import type { EngineOptions, EngineSession } from "./model";
import { dayDistance, plusDays, weekday } from "./model";
import { hasStrengthExperience } from "../strengthExperience";
import { hasReadinessStop } from "./planStatus";

export interface SchedulingBlock {
  code: string;
  message: string;
}
export interface SchedulingTask<Recipe> {
  id: string;
  recipe: Recipe;
  priority: number;
}
export type PlacementAttempt<State> =
  { state: State; penalty?: number } | { blocked: SchedulingBlock };
export interface ExactScheduleInput<State, Recipe> {
  initialState: State;
  tasks: readonly SchedulingTask<Recipe>[];
  dayCount: number;
  /** Both callbacks must be pure; the solver never mutates a supplied state. */
  isCovered: (state: State, taskId: string) => boolean;
  tryPlace: (state: State, recipe: Recipe, dayIndex: number) => PlacementAttempt<State>;
}
export interface ExactScheduleResult<State> {
  state: State;
  covered: string[];
  unmet: string[];
  placements: Record<string, number>;
  rejections: Record<string, Array<SchedulingBlock & { dayIndex: number }>>;
  exploredNodes: number;
  objective: { fulfilled: number; priority: number; penalty: number };
}

/** Exhaustive search of the four weekly targets, including the choice to leave
 * a target unmet. At most 1+8+64+512+4096 nodes for seven dates and four tasks.
 * Cosmetic penalties cannot make a three-target plan beat a feasible full week. */
export function solveWeeklySchedule<State, Recipe>(
  input: ExactScheduleInput<State, Recipe>,
): ExactScheduleResult<State> {
  const { tasks, dayCount, isCovered, tryPlace } = input;
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 7)
    throw new Error("Weekly scheduling requires one to seven dates.");
  if (tasks.length > 4 || new Set(tasks.map((task) => task.id)).size !== tasks.length)
    throw new Error("Weekly scheduling requires at most four uniquely identified targets.");
  if (tasks.some((task) => !task.id || !Number.isFinite(task.priority) || task.priority < 0))
    throw new Error("Target priorities must be finite nonnegative numbers.");

  let exploredNodes = 0;
  let best:
    | {
        state: State;
        placements: Record<string, number>;
        objective: ExactScheduleResult<State>["objective"];
      }
    | undefined;
  const evaluate = (state: State, penalty: number) => {
    const covered = tasks.filter((task) => isCovered(state, task.id));
    return {
      fulfilled: covered.length,
      priority: covered.reduce((sum, task) => sum + task.priority, 0),
      penalty,
    };
  };
  const better = (
    a: ExactScheduleResult<State>["objective"],
    b: ExactScheduleResult<State>["objective"],
  ) =>
    a.fulfilled > b.fulfilled ||
    (a.fulfilled === b.fulfilled &&
      (a.priority > b.priority || (a.priority === b.priority && a.penalty < b.penalty)));
  function visit(state: State, index: number, penalty: number, placements: Record<string, number>) {
    exploredNodes += 1;
    if (index === tasks.length) {
      const objective = evaluate(state, penalty);
      if (!best || better(objective, best.objective)) best = { state, placements, objective };
      return;
    }
    const task = tasks[index];
    if (isCovered(state, task.id)) {
      visit(state, index + 1, penalty, placements);
      return;
    }
    for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
      const attempt = tryPlace(state, task.recipe, dayIndex);
      if (!("state" in attempt)) continue;
      const cost = attempt.penalty ?? 0;
      if (!Number.isFinite(cost) || cost < 0)
        throw new Error("Placement penalties must be finite nonnegative numbers.");
      visit(attempt.state, index + 1, penalty + cost, { ...placements, [task.id]: dayIndex });
    }
    visit(state, index + 1, penalty, placements);
  }
  visit(input.initialState, 0, 0, {});
  const chosen = best!;
  const covered = tasks.filter((task) => isCovered(chosen.state, task.id)).map((task) => task.id);
  const unmet = tasks.filter((task) => !isCovered(chosen.state, task.id)).map((task) => task.id);
  const rejections: ExactScheduleResult<State>["rejections"] = {};
  for (const task of tasks.filter((task) => unmet.includes(task.id))) {
    rejections[task.id] = [];
    for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
      const attempt = tryPlace(chosen.state, task.recipe, dayIndex);
      if ("blocked" in attempt) rejections[task.id].push({ ...attempt.blocked, dayIndex });
    }
  }
  return { ...chosen, covered, unmet, rejections, exploredNodes };
}

export type PlacementMode = "new" | "club_second" | "append_second";
export type PlacementAssessment =
  | { allowed: true; mode: PlacementMode; slot: 0 | 1; minutes: number }
  | { allowed: false; code: string; message: string };

const sessions = (day: SessionDay) => [day, ...(day.secondSession ? [day.secondSession] : [])];
const ownSessions = (day: SessionDay) => sessions(day).filter((session) => !!session.engineV2);
const lightCompanion = (recipe: EngineSession) =>
  !recipe.highLower && recipe.roles.length === 1 && recipe.roles[0] === "endurance";
const external = (day: SessionDay) =>
  day.dayType === "club" || day.dayType === "match" || day.externalCommitment === true;

/** Known load only: a club label or its guessed duration is not evidence of
 * heavy legs. Explicit club-strength weekdays and immutable classified sessions are. */
export function hasKnownHighLowerLoad(day: SessionDay, profile: Profile): boolean {
  if (sessions(day).some((session) => session.engineV2?.highLower)) return true;
  if (
    sessions(day).some(
      (session) =>
        session.classification?.isHeavyLegs || session.classification?.isHighImpactRunning,
    )
  )
    return true;
  return day.dayType === "club" && (profile.clubStrengthDays ?? []).includes(weekday(day.date));
}

export interface PlacementConstraintInput {
  days: readonly SessionDay[];
  dayIndex: number;
  recipe: EngineSession;
  profile: Profile;
  options: EngineOptions;
  matchDates: ReadonlySet<string>;
  precedingDays?: readonly SessionDay[];
  /** Caller calculates actual merged minutes from the same numeric dose used by execution. */
  combinedMinutes: (existing: EngineSession, added: EngineSession) => number;
}

/** The shared placement gate. This function diagnoses; it never repairs or
 * rewrites a session. Rendering and final validation can consume the same gate. */
export function assessPlacement(input: PlacementConstraintInput): PlacementAssessment {
  const { days, dayIndex, recipe, profile: p, options, matchDates } = input;
  const current = days[dayIndex];
  const block = (code: string, message: string): PlacementAssessment => ({
    allowed: false,
    code,
    message,
  });
  if (!current) return block("INVALID_DATE", "Nie znaleziono daty treningu.");
  const date = current.date;
  const budget = options.minutesPerSession ?? 75;
  if (!Number.isFinite(budget) || budget <= 0)
    return block("INVALID_BUDGET", "Nie można potwierdzić dostępnego czasu sesji.");
  if (!Number.isFinite(recipe.minutes) || recipe.minutes <= 0)
    return block("INVALID_RECIPE", "Brak wiarygodnego czasu sesji.");
  if (p.painInjury || p.seasonPhase === "return_injury")
    return block("RETURN_REVIEW", "Automatyczny plan powrotu po urazie jest wstrzymany.");
  if (sessions(current).some((session) => session.executionProtected))
    return block("EXECUTION_LOCK", "Dzień zawiera rozpoczętą lub ukończoną sesję.");
  if (
    current.isUnavailable ||
    (p.unavailableDays ?? []).includes(weekday(date)) ||
    !p.individualTrainingDays.includes(weekday(date))
  )
    return block("UNAVAILABLE", "Ten dzień nie jest dostępny na trening własny.");
  if (
    current.dayType === "match" ||
    [...matchDates].some((match) => Math.abs(dayDistance(date, match)) <= 1)
  )
    return block("MATCH_BUFFER", "Mecz lub dzień bezpośrednio przed albo po meczu.");
  const readiness = options.readiness?.[date];
  if (readiness && (readiness.overall <= 4 || hasReadinessStop(readiness)))
    return block("READINESS_CONFLICT", "Bieżący check-in wymaga zmiany treningu.");

  if (recipe.highLower) {
    const knownAdjacent = [...(input.precedingDays ?? []), ...days].some(
      (day) => Math.abs(dayDistance(date, day.date)) === 1 && hasKnownHighLowerLoad(day, p),
    );
    const declaredAdjacent = [-1, 1].some((offset) => {
      const adjacentDate = plusDays(date, offset);
      return (
        !matchDates.has(adjacentDate) &&
        p.clubTrainingDays.includes(weekday(adjacentDate)) &&
        (p.clubStrengthDays ?? []).includes(weekday(adjacentDate))
      );
    });
    if (knownAdjacent || declaredAdjacent)
      return block(
        "ADJACENT_HIGH_LOWER",
        "Ciężka praca nóg koliduje z poprzednim lub następnym dniem.",
      );
  }
  const own = ownSessions(current);
  if (own.some((session) => session.engineV2!.roles.some((role) => recipe.roles.includes(role))))
    return block("ROLE_ALREADY_PRESENT", "Ten bodziec jest już zaplanowany w tym dniu.");
  const hasClub = current.dayType === "club";
  const doubles = ["light_only", "yes_if_safe"].includes(p.doubleSessionsAllowed)
    ? p.doubleSessionsAllowed
    : "no";
  const qualifiedDoubleHigh =
    p.age >= 17 &&
    hasStrengthExperience(p) &&
    ["intermediate", "advanced"].includes(p.gymExperienceLevel ?? "") &&
    Number.isFinite(p.strengthTrainingMonths) &&
    (p.strengthTrainingMonths ?? 0) >= 6 &&
    recipe.tier !== "foundation" &&
    p.movementCompetence === "high" &&
    doubles === "yes_if_safe";
  if (hasClub && doubles === "no")
    return block("DOUBLE_SESSION_DISABLED", "Nie wybrano drugiej sesji obok treningu klubowego.");
  if (hasClub && doubles === "light_only" && !lightCompanion(recipe))
    return block("LIGHT_SECOND_ONLY", "Obok klubu dopuszczono tylko lekką sesję.");
  if (
    hasClub &&
    (p.clubStrengthDays ?? []).includes(weekday(date)) &&
    recipe.highLower &&
    !qualifiedDoubleHigh
  )
    return block(
      "DOUBLE_HIGH_NOT_ELIGIBLE",
      "Nie są spełnione warunki dwóch ciężkich bodźców jednego dnia.",
    );

  const strength = (r: EngineSession) => r.roles.some((role) => role.startsWith("strength"));
  if (own.some((s) => strength(s.engineV2!) && strength(recipe)))
    return block("TWO_STRENGTH_SAME_DAY", "Siła A i B wymagają osobnych dni.");
  if (
    own.some(
      (s) =>
        (strength(s.engineV2!) && recipe.roles.includes("speed")) ||
        (s.engineV2!.roles.includes("speed") && strength(recipe)),
    )
  )
    return block("STRENGTH_SPEED_SEPARATE", "Sprint i siłownia mają osobne dni w tym programie.");
  if (recipe.minutes > budget) return block("TIME_BUDGET", "Sesja przekracza dostępny czas.");
  if (!own.length && !external(current) && current.dayType !== "training")
    return { allowed: true, mode: "new", slot: 0, minutes: recipe.minutes };
  const count = sessions(current).filter(
    (session) => !!session.engineV2 || external(session) || session.dayType === "training",
  ).length;
  if (count >= 2 || current.secondSession)
    return block("MAX_DAILY_SESSIONS", "Dzień zawiera już dwie sesje; nie dodano trzeciej.");
  if (doubles === "no")
    return block("DOUBLE_SESSION_DISABLED", "Nie wybrano dwóch sesji jednego dnia.");
  const anotherHigh = own.some((session) => session.engineV2!.highLower);
  if (anotherHigh && recipe.highLower)
    return block(
      "DOUBLE_HIGH_NOT_ELIGIBLE",
      "Nie są spełnione warunki dwóch ciężkich bodźców jednego dnia.",
    );
  if (
    doubles === "light_only" &&
    !lightCompanion(recipe) &&
    !own.some((session) => lightCompanion(session.engineV2!))
  )
    return block("LIGHT_SECOND_ONLY", "Druga sesja musi pozostać lekka.");
  return {
    allowed: true,
    mode: hasClub ? "club_second" : "append_second",
    slot: 1,
    minutes: recipe.minutes,
  };
}
