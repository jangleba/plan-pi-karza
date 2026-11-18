import type {
  Profile,
  Readiness,
  SessionCompletion,
  SessionDay,
  SessionModification,
} from "./types";
import { getExerciseDefinition } from "./exerciseLibrary";
import { sessionPrescription } from "./planIdentity";
import { ENGINE_VERSION, type EngineOptions, type ExerciseDecision } from "./engineV2/model";
import { placeRecipeOnDate, removeOwnSession, validateTrainingPlan } from "./engineV2/planner";
import { sessionStartIssue } from "./engineV2/planStatus";
import { validateEngineSession } from "./engineV2/validation";

export const TODAY_TIME_CHOICE_REASON = "[daily-checkin:time]";
export const slots = (day: SessionDay) => [day, ...(day.secondSession ? [day.secondSession] : [])];
export const executed = (session: SessionDay, completions: Record<string, SessionCompletion>) => {
  const log = session.dbId ? completions[session.dbId] : undefined;
  return (
    session.executionProtected ||
    !!log?.completed ||
    ["started", "completed"].includes(log?.status ?? "")
  );
};
export const mainWork = (session: SessionDay) =>
  !!session.engineV2?.roles.some((role) =>
    ["strengthA", "strengthB", "speed", "endurance"].includes(role),
  );

/** The next own main session, including one after a club commitment. */
export function todayTimeChoiceSession(
  day: SessionDay | undefined,
  completions: Record<string, SessionCompletion>,
): SessionDay | null {
  return day
    ? (slots(day).find(
        (session) =>
          mainWork(session) &&
          !executed(session, completions) &&
          !(session.dbId && completions[session.dbId]?.status === "missed"),
      ) ?? null)
    : null;
}

/** Only our sole overlay can be undone here. Other manual changes belong to the plan editor. */
export function todayTimeChoiceModification(
  modifications: readonly SessionModification[],
): SessionModification | null {
  return modifications.length === 1 &&
    modifications[0].type === "swap" &&
    modifications[0].reason.startsWith(TODAY_TIME_CHOICE_REASON)
    ? modifications[0]
    : null;
}

export interface TodayTimeChoiceInput {
  profile: Profile;
  plan: readonly SessionDay[];
  completions: Record<string, SessionCompletion>;
  readiness?: Record<string, Readiness>;
  date: string;
  sessionId: string;
  minutes: number;
}
export interface TodayTimeChoiceProposal {
  day: SessionDay;
  session: SessionDay;
  minutes: number;
  beforeMinutes: number;
  afterMinutes: number;
  changes: string[];
  fingerprint: string;
}
export type TodayTimeChoiceResult = { proposal: TodayTimeChoiceProposal } | { error: string };

function doseText(row: ExerciseDecision): string {
  const dose = row.dose;
  const work =
    dose.holdReps !== undefined
      ? `${dose.holdReps} × ${dose.seconds ?? "?"} s`
      : dose.seconds !== undefined
        ? `${dose.seconds} s`
        : dose.distanceM !== undefined
          ? `${dose.distanceM} m`
          : `${dose.reps ?? "?"} powt.`;
  return `${dose.sets} × ${work}${dose.perSide ? " / stronę" : ""} · przerwa ${dose.restSeconds} s`;
}
export function changedRows(
  before: SessionDay,
  after: SessionDay,
  omitted = "pominięte w krótszym wariancie.",
): string[] {
  const rows = after.engineV2!.exercises;
  return before.engineV2!.exercises.flatMap((old) => {
    const current = rows.find((row) => row.exerciseId === old.exerciseId && row.role === old.role);
    const name = getExerciseDefinition(old.exerciseId)?.displayNamePl ?? old.exerciseId;
    if (!current) return [`${name}: ${omitted}`];
    return JSON.stringify(old.dose) === JSON.stringify(current.dose)
      ? []
      : [`${name}: ${doseText(old)} → ${doseText(current)}.`];
  });
}

/**
 * A voluntary time choice is a preview of one slot of today. No health answer,
 * completion, identity or other day's prescription is written by this function.
 */
export function prepareTodayTimeChoice(input: TodayTimeChoiceInput): TodayTimeChoiceResult {
  const { profile, plan, completions, date, sessionId, minutes } = input;
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 120)
    return { error: "Wybierz czas od 10 do 120 minut." };
  const source = plan.find((day) => day.date === date);
  if (!source?.dayDbId || !source.planDbId) return { error: "Najpierw zapisz aktualny plan." };
  const slot = slots(source).findIndex((session) => session.dbId === sessionId);
  if (slot < 0) return { error: "Ta jednostka nie należy do dzisiejszego planu." };
  const target = slots(source)[slot];
  if (!mainWork(target) || !target.engineV2 || target.externalCommitment)
    return { error: "Limit czasu dotyczy własnej sesji siły, sprintu lub biegu." };
  if (executed(target, completions) || completions[sessionId]?.status === "missed")
    return { error: "Nie zmieniamy rozpoczętej, wykonanej ani opuszczonej jednostki." };
  if (target.generatorVersion !== ENGINE_VERSION)
    return { error: "Najpierw zaktualizuj plan do bieżącej wersji." };
  if (minutes >= target.durationMin)
    return { error: "Pełna jednostka już mieści się w wybranym czasie." };
  const issue = sessionStartIssue({
    session: target,
    profile,
    todayIso: date,
    completion: completions[sessionId],
    readiness: input.readiness?.[date],
    minutesPerSession: source.engineTimeBudgetMin,
  });
  if (issue) return { error: issue };

  const snapshot = plan.find((day) => day.planInputs)?.planInputs;
  const options: EngineOptions = {
    startDate: plan[0]?.date ?? date,
    asOfDate: date,
    weeks: Math.max(1, Math.min(4, Math.ceil(plan.length / 7))),
    minutesPerSession: minutes,
    sessionDurationMode: "limited",
    weeklyTargets: snapshot?.weeklyTargets,
    fillRestDays: snapshot?.fillRestDays,
    minFullRestDays: snapshot?.minFullRestDays,
    cycleAnchorDate: target.engineV2.cycle?.anchorDate,
    previousPlan: [...plan],
    completions,
    readiness: profile.healthPersonalizationEnabled ? input.readiness : undefined,
  };
  const removed = removeOwnSession([...plan], sessionId, profile, options);
  if (!removed) return { error: "Nie można zmienić tej jednostki bez naruszenia zapisanego dnia." };
  const placed = placeRecipeOnDate(
    removed,
    date,
    { ...structuredClone(target.engineV2), sessionDurationMode: "limited" },
    profile,
    options,
  );
  if ("blocked" in placed) return { error: placed.blocked.message };
  const adjusted: SessionDay = {
    ...target,
    ...placed.session,
    dbId: undefined,
    dayDbId: source.dayDbId,
    planDbId: source.planDbId,
    cycleId: source.cycleId,
    secondSession: null,
    checkinTimeBudgetMin: minutes,
  };
  if (adjusted.durationMin > minutes || adjusted.durationMin >= target.durationMin)
    return { error: "Nie ma krótszego wariantu, który zachowuje wymagane zadania i przerwy." };
  const doseIssue = validateEngineSession(adjusted, profile, options)[0];
  if (doseIssue) return { error: doseIssue.message };
  // Restore the original physical order after the placement primitive promoted a sibling.
  const nextDay: SessionDay =
    slot === 0
      ? { ...adjusted, secondSession: source.secondSession ?? null }
      : { ...source, secondSession: adjusted };
  // First-day plan inputs and cycle metadata belong to the saved plan, not the time variant.
  nextDay.planInputs = source.planInputs;
  nextDay.engineTimeBudgetMin = source.engineTimeBudgetMin;
  nextDay.enginePlanIssues = source.enginePlanIssues;
  nextDay.cycleStart = source.cycleStart;
  nextDay.checkinTimeBudgetMin = minutes;
  nextDay.checkinBaseSession = structuredClone(source);
  const candidate = plan.map((day) => (day.date === date ? nextDay : day));
  const wholeWeek: EngineOptions = { ...options, sessionDurationMode: "full" };
  const key = (value: { code: string; date?: string; message: string }) =>
    `${value.code}:${value.date ?? ""}:${value.message}`;
  const baseline = new Set(validateTrainingPlan([...plan], profile, wholeWeek).map(key));
  const newIssue = validateTrainingPlan(candidate, profile, wholeWeek).find(
    (value) => !baseline.has(key(value)),
  );
  if (newIssue) return { error: newIssue.message };
  const other = slot === 0 ? source.secondSession : source;
  const nextOther = slot === 0 ? nextDay.secondSession : nextDay;
  if (
    other &&
    (!nextOther ||
      other.dbId !== nextOther.dbId ||
      sessionPrescription(other) !== sessionPrescription(nextOther))
  )
    return { error: "Nie można zmienić drugiej jednostki tego dnia." };
  return {
    proposal: {
      day: nextDay,
      session: adjusted,
      minutes,
      beforeMinutes: target.durationMin,
      afterMinutes: adjusted.durationMin,
      changes: changedRows(target, adjusted),
      fingerprint: sessionPrescription(source),
    },
  };
}
