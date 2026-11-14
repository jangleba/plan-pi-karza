import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { trainingProfileRevision, trainingSetupRevision } from "../planIdentity";
import { ENGINE_VERSION } from "./model";

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
    .filter((s) => !executionStarted(s.dbId ? completions[s.dbId] : undefined));
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

/** Only new starts are gated; a pinned execution and its historical logging stay intact. */
export function sessionStartIssue({
  session,
  profile,
  readiness,
  todayIso,
  completion,
}: {
  session: SessionDay;
  profile: Profile | null;
  readiness?: Readiness;
  todayIso?: string;
  completion?: SessionCompletion;
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
  if (profile.painInjury || profile.seasonPhase === "return_injury")
    return "Automatyczny trening własny jest wstrzymany przy zgłoszonym bólu lub powrocie po urazie.";
  if (session.generatorVersion !== ENGINE_VERSION)
    return "Plan korzysta ze starszej wersji silnika. Przygotuj aktualny plan.";
  if (setupChanged(session, profile))
    return "Profil zmienił się. Przygotuj aktualny plan przed rozpoczęciem nowej sesji.";
  if (profile.healthPersonalizationEnabled && readiness) {
    if (hasReadinessStop(readiness))
      return "Bieżący check-in wstrzymuje trening własny. Nie rozpoczynaj tej sesji.";
    const supportOnly = session.engineV2?.roles.every((r) =>
      ["activation", "recovery", "mobility", "skills"].includes(r),
    );
    const jump = session.engineV2?.exercises.some(
      (e) => e.role === "power" || e.role === "landing",
    );
    if (readiness.overall <= 4 && (!supportOnly || jump))
      return "Bieżący check-in wymaga lżejszego planu. Przygotuj go ponownie przed startem.";
  }
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
