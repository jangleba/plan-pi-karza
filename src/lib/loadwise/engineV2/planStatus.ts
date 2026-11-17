import { planUnavailableForAge } from "../agePolicy";
import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { readinessScore } from "../readinessModel";
import { trainingProfileRevision, trainingSetupRevision } from "../planIdentity";
import { ENGINE_VERSION } from "./model";
import { validateEngineSession } from "./validation";

export type PlanStatusKind = "empty" | "active" | "expired" | "stale";
export interface PlanStatus {
  kind: PlanStatusKind;
  startDate: string | null;
  endDate: string | null;
  staleReason: "version" | "profile" | null;
}

const slots = (day: SessionDay) => [day, ...(day.secondSession ? [day.secondSession] : [])];
const executionStarted = (completion?: SessionCompletion) =>
  !!completion?.completed || ["started", "completed"].includes(completion?.status ?? "");
const completed = (completion?: SessionCompletion) =>
  !!completion?.completed || completion?.status === "completed";
/** Finished or deliberately skipped: the day moves on to its next slot. */
const handled = (completion?: SessionCompletion) =>
  completed(completion) || completion?.status === "missed";
const ownPrescription = (session: SessionDay) =>
  !!session.engineV2 ||
  (!session.externalCommitment && !["club", "match", "rest"].includes(session.dayType));
const setupChanged = (session: SessionDay, profile: Profile) =>
  session.trainingSetupRevision
    ? session.trainingSetupRevision !== trainingSetupRevision(profile)
    : session.canonicalRevision !== trainingProfileRevision(profile);

/** Historical/pinned work can belong to a prior engine; only unhandled future work needs migration. */
export function hasOutdatedPendingEngineWork(
  plan: readonly SessionDay[],
  completions: Record<string, SessionCompletion>,
  todayIso: string,
): boolean {
  return plan
    .filter((d) => d.date >= todayIso && !d.executionProtected)
    .flatMap(slots)
    .some(
      (s) =>
        ownPrescription(s) &&
        !s.executionProtected &&
        !executionStarted(s.dbId ? completions[s.dbId] : undefined) &&
        !handled(s.dbId ? completions[s.dbId] : undefined) &&
        s.generatorVersion !== ENGINE_VERSION,
    );
}

/** Read-only lifecycle state; opening the app never creates or replaces a plan. */
export function getPlanStatus({
  plan,
  profile,
  todayIso,
  completions = {},
}: {
  plan: readonly SessionDay[];
  profile: Profile | null;
  todayIso: string;
  completions?: Record<string, SessionCompletion>;
}): PlanStatus {
  if (!plan.length) return { kind: "empty", startDate: null, endDate: null, staleReason: null };
  const dates = plan.map((d) => d.date).sort();
  const startDate = dates[0],
    endDate = dates[dates.length - 1];
  if (endDate < todayIso) return { kind: "expired", startDate, endDate, staleReason: null };
  const pending = plan
    .filter((d) => d.date >= todayIso)
    .flatMap(slots)
    .filter((s) => {
      const completion = s.dbId ? completions[s.dbId] : undefined;
      return !executionStarted(completion) && !handled(completion);
    });
  const staleReason = pending.some(
    (s) => ownPrescription(s) && s.generatorVersion !== ENGINE_VERSION,
  )
    ? "version"
    : !profile || pending.some((s) => setupChanged(s, profile))
      ? "profile"
      : null;
  return { kind: staleReason ? "stale" : "active", startDate, endDate, staleReason };
}

/** Explicit symptoms cannot be cancelled by a favourable cached aggregate score. */
export function hasReadinessStop(readiness?: Readiness): boolean {
  return (
    !!readiness &&
    ((readiness.redFlags?.length ?? 0) > 0 || !!readiness.altersMovement || readiness.jointPain > 0)
  );
}

/** The time budget the plan was generated with; never a silent default when the plan records one. */
export function planTimeBudget(plan: readonly SessionDay[], fallback = 75): number {
  const first = plan.find((d) => d.engineTimeBudgetMin || d.planInputs?.minutesPerSession);
  const value = first?.engineTimeBudgetMin ?? first?.planInputs?.minutesPerSession;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Only new starts are gated; a pinned execution and its historical logging stay intact. */
export function sessionStartIssue({
  session,
  profile,
  readiness,
  todayIso,
  completion,
  minutesPerSession,
}: {
  session: SessionDay;
  profile: Profile | null;
  readiness?: Readiness;
  todayIso?: string;
  completion?: SessionCompletion;
  /** The budget the plan was generated with (planTimeBudget); not a fixed default. */
  minutesPerSession?: number;
}): string | null {
  if (executionStarted(completion)) return null;
  if (completion?.status === "missed")
    return "Ta sesja została opuszczona. Nie jest przekładana automatycznie.";
  if (todayIso && session.date !== todayIso)
    return "Nową sesję można rozpocząć tylko w dniu treningu.";
  if (session.isUnavailable || session.dayType === "rest")
    return "Ten dzień nie zawiera dostępnego treningu.";
  if (session.loadLabelOverride === "Wstrzymaj trening")
    return "Ta sesja została wstrzymana ze względów ostrożnościowych.";
  if (!ownPrescription(session)) return null;
  if (!profile) return "Poczekaj na wczytanie profilu.";
  const ageBlock = planUnavailableForAge(profile);
  if (ageBlock) return ageBlock;
  if (profile.painInjury || profile.seasonPhase === "return_injury")
    return "Automatyczny trening własny jest wstrzymany przy zgłoszonym bólu lub powrocie po urazie.";
  // A health stop is not solved by a new plan: the session simply must not start.
  if (profile.healthPersonalizationEnabled && readiness && hasReadinessStop(readiness))
    return "Bieżący check-in wstrzymuje trening własny. Nie rozpoczynaj tej sesji.";
  return sessionPlanUpdateReason({ session, profile, readiness, minutesPerSession });
}

/**
 * A new start is not possible only because the saved plan is out of date: an older generator, a
 * changed profile or equipment setup, a check-in that asks for a lighter plan, or a recipe the
 * current rules no longer accept. The answer is the preview and activation of an updated plan
 * (never a Start that is known to fail). Null when the session can start as it is.
 */
export function sessionPlanUpdateReason({
  session,
  profile,
  readiness,
  minutesPerSession,
}: {
  session: SessionDay;
  profile: Profile | null;
  readiness?: Readiness;
  minutesPerSession?: number;
}): string | null {
  if (!ownPrescription(session) || !profile) return null;
  if (planUnavailableForAge(profile)) return null;
  if (profile.painInjury || profile.seasonPhase === "return_injury") return null;
  if (session.isUnavailable || session.dayType === "rest") return null;
  if (session.loadLabelOverride === "Wstrzymaj trening") return null;
  if (session.generatorVersion !== ENGINE_VERSION)
    return "Plan korzysta ze starszej wersji silnika. Przygotuj aktualny plan.";
  if (setupChanged(session, profile))
    return "Profil zmienił się. Przygotuj aktualny plan przed rozpoczęciem nowej sesji.";
  if (profile.healthPersonalizationEnabled && readiness) {
    if (hasReadinessStop(readiness)) return null;
    const supportOnly = session.engineV2?.roles.every((r) =>
      ["activation", "recovery", "mobility", "skills"].includes(r),
    );
    const jump = session.engineV2?.exercises.some(
      (e) => e.role === "power" || e.role === "landing",
    );
    if ((readinessScore(readiness) ?? readiness.overall) <= 4 && (!supportOnly || jump))
      return "Bieżący check-in wymaga lżejszego planu. Przygotuj go ponownie przed startem.";
  }
  const recipeIssue = validateEngineSession(session, profile, { minutesPerSession })[0];
  if (recipeIssue)
    return `Receptura wymaga poprawy przed startem: ${recipeIssue.message} Przygotuj aktualny plan.`;
  return null;
}

/** The next real slot of today, using the same effective plan as session execution. */
export function todayTrainingState(
  plan: readonly SessionDay[],
  completions: Record<string, SessionCompletion>,
  todayIso: string,
): { session: SessionDay | null; slot: 1 | 2; complete: boolean } {
  const day = plan.find((d) => d.date === todayIso);
  if (!day) return { session: null, slot: 1, complete: false };
  const real = slots(day)
    .map((session, i) => ({ session, slot: (i + 1) as 1 | 2 }))
    .filter(({ session }) => session.dayType !== "rest" && !session.isUnavailable);
  const next = real.find(
    ({ session }) => !handled(session.dbId ? completions[session.dbId] : undefined),
  );
  return next
    ? { ...next, complete: false }
    : { session: null, slot: 1, complete: real.length > 0 };
}
