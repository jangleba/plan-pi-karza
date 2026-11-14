import { useCallback, useMemo, useState } from "react";
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
  const { state, hydrated, syncing, todayIso, activatePlanV2 } = useLoadwise();
  const { user } = useAuth();
  const dismissed = useTrainingLocalState(
    trainingStorageKey("feedback-adjustment", user?.id, "dismissed"),
    [] as string[],
    parseIds,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback((): AdjustmentProposal | null => {
    if (!hydrated || syncing || !state.profile || !state.plan.length) return null;
    return proposeFeedbackAdjustment({
      profile: state.profile,
      plan: resolveEffectivePlan(state.plan, state.modifications, {
        completions: state.completions,
      }),
      completions: state.completions,
      todayIso,
      planId: state.activePlanId ?? null,
      readiness: state.readiness,
      hasModificationsInWindow: Object.entries(state.modifications).some(
        ([date, items]) => date >= todayIso && items.length > 0,
      ),
    });
  }, [hydrated, syncing, state, todayIso]);

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
      await activatePlanV2(proposalToEngineResult(fresh, state.profile));
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
