import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { LoadwiseState } from "../types";
import type { StateSetter } from "./model";
import { trainingProfileRevision } from "../planIdentity";
import { calibratePendingRunningPlan } from "../engineV2/runningCalibration";
import { runningCalibrationKey } from "../engineV2/runningCalibrationKey";
import { loadV2Plan } from "../engineV2/persistence";
import { persistMonthlyPlan } from "../persist";
import { guardedPlanWrite, trackPlanWrite } from "./planWriteGuard";
import { resolveEffectivePlan } from "../effectivePlan";
import { validateTrainingPlan } from "../engineV2/planner";
import { gymPlanContext, type GymRecord } from "../gymEvidence";

import { planEvidenceIssue, planEvidenceKey } from "../planEvidence";
import { useTrainingWriteStatus } from "../useTrainingWriteStatus";
import { hasUnresolvedTrainingWrites } from "../offlineTrainingQueue";

/** Server-confirmed MAS/progression updates future runs without a manual plan preview. */
export function useRunningCalibration({
  ownerId,
  ready,
  state,
  getState,
  setState,
  todayIso,
  gym,
}: {
  ownerId?: string;
  ready: boolean;
  state: LoadwiseState;
  getState: () => LoadwiseState;
  setState: StateSetter;
  todayIso: string;
  /** Gym evidence from the same source as every other rebuild; calibration waits until it is known. */
  gym: { records: GymRecord[]; loading: boolean; available: boolean };
}) {
  const unresolvedWrites = useTrainingWriteStatus(ownerId);
  const flight = useRef<string | null>(null);
  const attempted = useRef<string | null>(null);
  const [retryRevision, retry] = useState(0);
  const live = useRef({ ownerId, getState, setState, gym });
  live.current = { ownerId, getState, setState, gym };
  useEffect(() => {
    const online = () => {
      attempted.current = null;
      retry((n) => n + 1);
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  useEffect(() => {
    const profile = state.profile;
    if (!ready || !ownerId || !profile || !state.activePlanId || navigator.onLine === false) return;
    // Rebuilding without the gym decisions would undo them; wait for confirmed evidence.
    if (
      planEvidenceIssue(
        { records: gym.records, available: gym.available, loading: gym.loading },
        unresolvedWrites,
      )
    )
      return;
    const evidenceKey = planEvidenceKey({
      records: gym.records,
      available: gym.available,
      loading: gym.loading,
    });
    const gymContext = gymPlanContext(gym.records);
    if (!gymContext.confirmed) return;
    const executionLease = JSON.stringify(
      Object.entries(state.completions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, c]) => [id, c.status, c.completed, c.writeVersion ?? 0]),
    );
    const key = `run-calibration:${ownerId}:${state.activePlanId}:${runningCalibrationKey(profile)}:${todayIso}:${executionLease}:${JSON.stringify(gym.records.map((r) => [r.record_key, r.revision]))}`;
    if (flight.current || attempted.current === key) return;
    const plan = calibratePendingRunningPlan({
      profile,
      plan: state.plan,
      completions: state.completions,
      todayIso,
      readiness: profile.healthPersonalizationEnabled ? state.readiness : undefined,
      gymProgression: gymContext.gymProgression,
      strengthLoadResponses: gymContext.strengthLoadResponses,
      modifiedDates: new Set(
        Object.keys(state.modifications).filter((d) => state.modifications[d]?.length),
      ),
    });
    if (!plan) return;
    if (
      validateTrainingPlan(
        resolveEffectivePlan(plan, state.modifications, { completions: state.completions }),
        profile,
        {
          startDate: plan[0].date,
          minutesPerSession: plan[0].engineTimeBudgetMin ?? 75,
          readiness: profile.healthPersonalizationEnabled ? state.readiness : undefined,
          gymProgression: gymContext.gymProgression,
          strengthLoadResponses: gymContext.strengthLoadResponses,
        },
      ).length
    )
      return;
    flight.current = key;
    attempted.current = key;
    const revision = trainingProfileRevision(profile),
      expectedPlanId = state.activePlanId;
    let rerun = false;
    const stillCurrent = () =>
      live.current.ownerId === ownerId &&
      live.current.getState().activePlanId === expectedPlanId &&
      live.current.getState().profile &&
      trainingProfileRevision(live.current.getState().profile!) === revision &&
      live.current.getState().completions === state.completions &&
      live.current.getState().plan === state.plan &&
      live.current.getState().readiness === state.readiness &&
      live.current.getState().modifications === state.modifications &&
      !planEvidenceIssue(live.current.gym, hasUnresolvedTrainingWrites(ownerId)) &&
      planEvidenceKey(live.current.gym) === evidenceKey;
    void trackPlanWrite(
      ownerId,
      guardedPlanWrite(key, async () => {
        const stored = await loadV2Plan(ownerId);
        if (!stillCurrent() || stored.id !== expectedPlanId)
          throw new Error("Plan zmienił się podczas przeliczania biegania. Odśwież aplikację.");
        return persistMonthlyPlan(ownerId, profile, plan);
      }),
    )
      .then((saved) => {
        if (!saved) {
          if (live.current.ownerId === ownerId)
            window.dispatchEvent(new Event("ballwise:server-state-changed"));
          return;
        }
        if (!stillCurrent()) {
          if (live.current.ownerId === ownerId)
            window.dispatchEvent(new Event("ballwise:server-state-changed"));
          return;
        }
        live.current.setState((s) => ({
          ...s,
          plan: saved,
          activePlanId: saved[0]?.planDbId ?? null,
        }));
        toast.success("Jednostki biegowe przeliczono według aktualnego wyniku i poziomu.");
      })
      .catch(() => {
        if (!stillCurrent() && live.current.ownerId === ownerId) {
          attempted.current = null;
          rerun = true;
          return;
        }
        if (live.current.ownerId === ownerId)
          toast.error(
            "Wynik zapisany. Nie udało się jeszcze przeliczyć przyszłych biegów — odśwież aplikację po połączeniu z internetem.",
          );
      })
      .finally(() => {
        flight.current = null;
        if (rerun) retry((n) => n + 1);
      });
  }, [
    ownerId,
    ready,
    state,
    todayIso,
    retryRevision,
    gym.records,
    gym.loading,
    gym.available,
    unresolvedWrites,
  ]);
}
