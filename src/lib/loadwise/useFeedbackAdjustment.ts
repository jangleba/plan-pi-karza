import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth";
import { resolveEffectivePlan } from "./effectivePlan";
import {
  proposalToEngineResult,
  proposeFeedbackAdjustment,
  type AdjustmentProposal,
} from "./engineV2/feedbackAdjustment";
import { useLoadwise } from "./store";
import { trainingStorageKey } from "./trainingDetails";
import { useTrainingLocalState } from "./useTrainingLocalState";
import { useGymEvidence } from "./useGymEvidence";
import { proposeGymAdjustment } from "./engineV2/gymAdjustment";
import { hasUnresolvedTrainingWrites } from "./offlineTrainingQueue";

import { planEvidenceIssue } from "./planEvidence";
import { useTrainingWriteStatus } from "./useTrainingWriteStatus";

const parseIds = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((v) => typeof v === "string") && value.length <= 200
    ? (value as string[])
    : undefined;

/**
 * One calm proposal after hard club/match feedback. Nothing is saved until "Zastosuj":
 * the proposal is rebuilt from the current state, compared with the one shown, and written
 * through the same version-checked activation as a new plan. "Zostaw plan" is remembered
 * on this device only; the saved plan is never changed by it.
 */
export function useFeedbackAdjustment() {
  const gym = useGymEvidence();
  const { state, hydrated, syncing, todayIso, activatePlanV2 } = useLoadwise();
  const { user } = useAuth();
  const userId = user?.id;
  const unresolvedWrites = useTrainingWriteStatus(userId);
  const dismissed = useTrainingLocalState(
    trainingStorageKey("feedback-adjustment", user?.id, "dismissed"),
    [] as string[],
    parseIds,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback((): AdjustmentProposal | null => {
    if (
      !hydrated ||
      syncing ||
      !state.profile ||
      !state.plan.length ||
      planEvidenceIssue(
        { records: gym.records, available: gym.available, loading: gym.loading },
        unresolvedWrites || (!!userId && hasUnresolvedTrainingWrites(userId)),
      )
    )
      return null;
    const effective = resolveEffectivePlan(state.plan, state.modifications, {
      completions: state.completions,
    });
    // One confirmation check for every source: club, match and gym share it.
    const hasUnconfirmedWrites = !!userId && hasUnresolvedTrainingWrites(userId);
    const modifiedDates = new Set(
      Object.entries(state.modifications)
        .filter(([, items]) => items.length > 0)
        .map(([date]) => date),
    );
    const excluded = new Set(dismissed.value ?? []);
    const external = proposeFeedbackAdjustment({
      excludedProposalIds: excluded,
      profile: state.profile,
      plan: effective,
      completions: state.completions,
      todayIso,
      planId: state.activePlanId ?? null,
      readiness: state.readiness,
      modifiedDates,
      hasUnconfirmedWrites,
    });
    if (external && !excluded.has(external.id)) return external;
    const strength = proposeGymAdjustment({
      hasUnconfirmedWrites,
      profile: state.profile,
      plan: effective,
      completions: state.completions,
      records: gym.records,
      todayIso,
      planId: state.activePlanId ?? null,
      readiness: state.readiness,
      modifiedDates,
    });
    return strength && !excluded.has(strength.id) ? strength : null;
  }, [
    hydrated,
    syncing,
    state,
    todayIso,
    gym.records,
    gym.loading,
    gym.available,
    userId,
    unresolvedWrites,
    dismissed.value,
  ]);
  const liveBuild = useRef(build);
  liveBuild.current = build;

  const proposal = useMemo(() => {
    const built = build();
    return built && !(dismissed.value ?? []).includes(built.id) ? built : null;
  }, [build, dismissed.value]);

  const apply = useCallback(async () => {
    if (!proposal || !state.profile || !activatePlanV2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      // A feedback or plan change since the card was shown voids the old proposal.
      const fresh = build();
      if (!fresh || fresh.id !== proposal.id || fresh.fingerprint !== proposal.fingerprint)
        throw new Error("Plan lub odpowiedzi po treningu zmieniły się. Sprawdź nową propozycję.");
      await activatePlanV2(
        proposalToEngineResult(fresh, state.profile),
        () => liveBuild.current()?.fingerprint === fresh.fingerprint,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się zapisać zmiany. Plan bez zmian.");
    } finally {
      setBusy(false);
    }
  }, [proposal, state.profile, activatePlanV2, busy, build]);

  const dismiss = useCallback(() => {
    if (proposal) dismissed.setValue((ids) => [...new Set([...ids, proposal.id])].slice(-100));
  }, [proposal, dismissed]);

  return { proposal, busy, error, apply, dismiss };
}
