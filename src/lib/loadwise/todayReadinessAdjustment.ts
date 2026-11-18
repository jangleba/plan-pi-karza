import type {
  Profile,
  Readiness,
  SessionCompletion,
  SessionDay,
  SessionModification,
} from "./types";
import { hasMedicalRedFlag, readinessScore } from "./readinessModel";
import { sessionPrescription } from "./planIdentity";
import { ENGINE_VERSION, type EngineOptions } from "./engineV2/model";
import {
  capEnduranceSession,
  lighterRecipes,
  placeRecipeOnDate,
  removeOwnSession,
  validateTrainingPlan,
} from "./engineV2/planner";
import { hasReadinessStop, readinessKey } from "./engineV2/planStatus";
import { validateEngineSession } from "./engineV2/validation";
import { changedRows, slots, todayTimeChoiceSession } from "./todaySessionTimeChoice";

/**
 * Today's own session recalculated from the athlete's real check-in. It applies the rule the app
 * already had (a low overall score asks for a lighter plan, pain or red flags stop the start) and
 * does not add thresholds of its own. Without a check-in nothing is assumed and the full session
 * stands. The recipe itself changes (sets, intensity, sprint or running work); the warm-up, the
 * order of work and the rests of the lighter recipe come from the same builders as a planned
 * session. Only one unstarted own session of today is touched.
 */
export const READINESS_ADJUSTMENT_REASON = "[daily-checkin:readiness]";
/** The existing policy: at or below this overall score the session asks for a lighter plan. */
export const LOW_READINESS_SCORE = 4;

const SUPPORT_ROLES = ["activation", "recovery", "mobility", "skills"];

/** Only our own sole overlay is managed here; other manual changes belong to the plan editor. */
export function readinessAdjustmentModification(
  modifications: readonly SessionModification[],
): SessionModification | null {
  return modifications.length === 1 &&
    modifications[0].type === "swap" &&
    modifications[0].reason.startsWith(READINESS_ADJUSTMENT_REASON)
    ? modifications[0]
    : null;
}

export type ReadinessDecision =
  | { kind: "none" }
  /** Red flags or pain: the start stays blocked (planStatus). The recipe is not rewritten. */
  | { kind: "stop" }
  /** The check-in is adequate again (edited) and the overlay of an earlier answer can go. */
  | { kind: "restore"; modificationId: string }
  | { kind: "adjust"; day: SessionDay; session: SessionDay; original: SessionDay }
  | { kind: "unavailable"; reason: string };

export interface ReadinessDecisionInput {
  profile: Profile;
  /** The effective plan: saved days with their overlays resolved. */
  plan: readonly SessionDay[];
  completions: Record<string, SessionCompletion>;
  readiness: Readiness | undefined;
  modifications: readonly SessionModification[];
  date: string;
}

const lowFor = (session: SessionDay, score: number) => {
  const recipe = session.engineV2;
  if (!recipe || score > LOW_READINESS_SCORE) return false;
  const supportOnly = recipe.roles.every((role) => SUPPORT_ROLES.includes(role));
  const jump = recipe.exercises.some((e) => e.role === "power" || e.role === "landing");
  return !supportOnly || jump;
};

export function decideReadinessAdjustment(input: ReadinessDecisionInput): ReadinessDecision {
  const { profile, completions, readiness, date } = input;
  if (!profile.healthPersonalizationEnabled || !readiness || readiness.date !== date)
    return { kind: "none" };
  const own = readinessAdjustmentModification(input.modifications);
  const effectiveDay = input.plan.find((day) => day.date === date);
  if (!effectiveDay) return { kind: "none" };
  // The day before our overlay is the base; without an overlay the effective day is the base.
  const base = own ? (effectiveDay.readinessOriginalSession ?? null) : effectiveDay;
  if (!base) return { kind: "none" };
  const target = todayTimeChoiceSession(base, completions);
  const current = todayTimeChoiceSession(effectiveDay, completions);
  // Started, completed and skipped sessions are never rewritten.
  if (!target || !current) return { kind: "none" };
  if (hasMedicalRedFlag(readiness) || hasReadinessStop(readiness)) return { kind: "stop" };
  const score = readinessScore(readiness) ?? readiness.overall;
  if (!lowFor(target, score))
    return own ? { kind: "restore", modificationId: own.id } : { kind: "none" };
  if (input.modifications.length > 0 && !own)
    return {
      kind: "unavailable",
      reason: "Ten dzień ma już zapisaną zmianę. Sprawdź ją w planie, zanim dostosujemy trening.",
    };
  if (own && current.readinessAdjustmentKey === readinessKey(readiness)) return { kind: "none" };
  if (!base.dayDbId || !base.planDbId || !target.dbId)
    return { kind: "unavailable", reason: "Najpierw zapisz aktualny plan." };
  if (target.generatorVersion !== ENGINE_VERSION)
    return {
      kind: "unavailable",
      reason: "Zapisana jednostka pochodzi ze starszej wersji silnika. Najpierw zaktualizuj plan.",
    };
  if (!target.engineV2 || target.externalCommitment)
    return { kind: "unavailable", reason: "Ta jednostka nie jest własną sesją do dostosowania." };

  const planBase = input.plan.map((day) => (day.date === date ? base : day));
  const budget = base.engineTimeBudgetMin ?? target.engineV2.minutes;
  const routes = lighterRecipes(target, profile, budget);
  const route = routes.find((item) => item.kind === "lighter") ?? routes[0];
  if (!route)
    return {
      kind: "unavailable",
      reason:
        "Nie ma lżejszej wersji tej jednostki, która zachowuje wymagane zadania i przerwy. Nie rozpoczynaj jej dziś w pełnej dawce.",
    };
  const snapshot = planBase.find((day) => day.planInputs)?.planInputs;
  const mode = target.engineV2.sessionDurationMode ?? "limited";
  // The check-in is applied by this function; placing the lighter recipe must not be refused
  // again by the very rule it answers, so the placement runs without the readiness gate.
  const options: EngineOptions = {
    startDate: planBase[0]?.date ?? date,
    asOfDate: date,
    weeks: Math.max(1, Math.min(4, Math.ceil(planBase.length / 7))),
    minutesPerSession: Number.isFinite(budget) ? budget : 75,
    sessionDurationMode: mode,
    weeklyTargets: snapshot?.weeklyTargets,
    fillRestDays: snapshot?.fillRestDays,
    minFullRestDays: snapshot?.minFullRestDays,
    cycleAnchorDate: target.engineV2.cycle?.anchorDate,
    previousPlan: [...planBase],
    completions,
  };
  const removed = removeOwnSession([...planBase], target.dbId, profile, options);
  if (!removed)
    return {
      kind: "unavailable",
      reason: "Nie można zmienić tej jednostki bez naruszenia zapisanego dnia.",
    };
  const placed = placeRecipeOnDate(
    removed,
    date,
    { ...structuredClone(route.recipe), sessionDurationMode: mode },
    profile,
    options,
    true,
  );
  if ("blocked" in placed) return { kind: "unavailable", reason: placed.blocked.message };
  // A calm run is re-resolved for the date; if that gave back the same run, shorten it.
  if (
    target.engineV2.roles.includes("endurance") &&
    placed.session.engineV2 &&
    !(placed.session.engineV2.minutes < target.engineV2.minutes)
  ) {
    const capped = capEnduranceSession(placed.session, profile);
    if (!capped)
      return {
        kind: "unavailable",
        reason:
          "Nie ma krótszej wersji tego biegu, która zachowuje wymagane zadania. Nie rozpoczynaj go dziś w pełnej dawce.",
      };
    placed.session = capped;
  }
  const slot = slots(base).findIndex((item) => item.dbId === target.dbId);
  const adjusted: SessionDay = {
    ...target,
    ...placed.session,
    dbId: undefined,
    dayDbId: base.dayDbId,
    planDbId: base.planDbId,
    cycleId: base.cycleId,
    secondSession: null,
  };
  if (adjusted.durationMin > target.durationMin)
    return {
      kind: "unavailable",
      reason: "Lżejszy wariant nie jest krótszy od zapisanej jednostki.",
    };
  const issue = validateEngineSession(adjusted, profile, options)[0];
  if (issue) return { kind: "unavailable", reason: issue.message };

  const changes = changedRows(target, adjusted, "pominięte w lżejszym wariancie.");
  adjusted.readinessAdjustedDate = date;
  adjusted.readinessAdjustmentKey = readinessKey(readiness);
  adjusted.readinessAdjustment = {
    kind: route.kind,
    score,
    reason: `Check-in: ogólna gotowość ${score}/10 (próg lżejszego planu: ${LOW_READINESS_SCORE}/10).`,
    changes,
    beforeMinutes: target.durationMin,
    afterMinutes: adjusted.durationMin,
  };
  const nextDay: SessionDay =
    slot === 0
      ? { ...adjusted, secondSession: base.secondSession ?? null }
      : { ...base, secondSession: adjusted };
  // Plan-level metadata and the day's other slot belong to the saved plan, not to this change.
  nextDay.planInputs = base.planInputs;
  nextDay.engineTimeBudgetMin = base.engineTimeBudgetMin;
  nextDay.enginePlanIssues = base.enginePlanIssues;
  nextDay.cycleStart = base.cycleStart;
  nextDay.readinessAdjustedDate = date;
  nextDay.readinessAdjustmentKey = readinessKey(readiness);
  nextDay.readinessOriginalSession = structuredClone(base);
  const candidate = planBase.map((day) => (day.date === date ? nextDay : day));
  const key = (value: { code: string; date?: string; message: string }) =>
    `${value.code}:${value.date ?? ""}:${value.message}`;
  const baseline = new Set(validateTrainingPlan([...planBase], profile, options).map(key));
  const newIssue = validateTrainingPlan(candidate, profile, options).find(
    (value) => !baseline.has(key(value)),
  );
  if (newIssue) return { kind: "unavailable", reason: newIssue.message };
  const other = slot === 0 ? base.secondSession : base;
  const nextOther = slot === 0 ? nextDay.secondSession : nextDay;
  if (
    other &&
    (!nextOther ||
      other.dbId !== nextOther.dbId ||
      sessionPrescription(other) !== sessionPrescription(nextOther))
  )
    return { kind: "unavailable", reason: "Nie można zmienić drugiej jednostki tego dnia." };
  return { kind: "adjust", day: nextDay, session: adjusted, original: effectiveDay };
}
