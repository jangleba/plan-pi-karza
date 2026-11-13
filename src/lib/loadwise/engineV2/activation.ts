import type { Profile, Readiness, SessionCompletion, SessionDay } from "../types";
import { sessionPrescription, trainingProfileRevision } from "../planIdentity";
import { ENGINE_VERSION, type EngineResult } from "./model";
import { validateTrainingPlan } from "./planner";
import { lockedExecutionDays } from "./locks";

export interface ActivationSnapshot {
  ownerId: string;
  profile: Profile;
  observedPlanId: string | null;
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  readiness: Record<string, Readiness>;
}
interface ActivationServices {
  current: () => ActivationSnapshot | null;
  load: () => Promise<{ id?: string; plan: SessionDay[] }>;
  persist: (ownerId: string, profile: Profile, plan: SessionDay[]) => Promise<SessionDay[]>;
}
/** The preview keeps its original lease. A fresh read can reject it, never rebase it. */
export async function activateTrainingPlan(
  result: EngineResult,
  services: ActivationServices,
): Promise<SessionDay[]> {
  const captured = services.current();
  if (!captured) throw new Error("Poczekaj na wczytanie profilu.");
  const revision = trainingProfileRevision(captured.profile);
  if (
    result.version !== ENGINE_VERSION ||
    !result.plan.length ||
    result.expectedPlanId !== captured.observedPlanId
  )
    throw new Error("Podgląd planu jest nieaktualny. Przygotuj go ponownie.");
  const assertCurrent = () => {
    const now = services.current();
    if (
      !now ||
      now.ownerId !== captured.ownerId ||
      now.observedPlanId !== captured.observedPlanId ||
      trainingProfileRevision(now.profile) !== revision
    )
      throw new Error("Profil lub zapisany plan zmienił się. Odśwież podgląd.");
    if (result.plan.some((d) => !d.executionProtected && d.canonicalRevision !== revision))
      throw new Error("Profil zmienił się. Przygotuj plan ponownie.");
    for (const frozen of lockedExecutionDays(now.plan, now.completions)) {
      const next = result.plan.find((d) => d.date === frozen.date);
      if (frozen.date < result.plan[0].date) continue;
      if (
        !next ||
        next.dbId !== frozen.dbId ||
        next.dayDbId !== frozen.dayDbId ||
        sessionPrescription(next) !== sessionPrescription(frozen) ||
        JSON.stringify(next.secondSession) !== JSON.stringify(frozen.secondSession)
      )
        throw new Error("Rozpoczęta lub ukończona sesja zmieniła się. Odśwież podgląd.");
    }
    if (
      !Number.isFinite(result.minutesPerSession) ||
      result.minutesPerSession < 10 ||
      result.minutesPerSession > 120
    )
      throw new Error("Nieprawidłowy budżet czasu planu.");
    const violations = validateTrainingPlan(result.plan, now.profile, {
      startDate: result.plan[0].date,
      minutesPerSession: result.minutesPerSession,
      precedingDays: now.plan.filter((d) => d.date < result.plan[0].date),
      readiness: now.profile.healthPersonalizationEnabled ? now.readiness : undefined,
    });
    if (violations.length) throw new Error(violations[0].message);
    return now;
  };
  assertCurrent();
  const stored = await services.load();
  if ((stored.id ?? null) !== result.expectedPlanId)
    throw new Error(
      "Plan zmienił się na innym urządzeniu. Odśwież podgląd; niczego nie nadpisano.",
    );
  const current = assertCurrent();
  const input = result.plan.map((d) => ({ ...d, planDbId: result.expectedPlanId ?? undefined }));
  return services.persist(current.ownerId, current.profile, input);
}
