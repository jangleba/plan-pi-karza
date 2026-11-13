import type { ProfileSaveRefs, ProfileSaveStage } from "./profileSave";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { initialState, type LoadwiseContextValue } from "./store/model";
import { createPlanActions } from "./store/planActions";
import { createProfileActions } from "./store/profileActions";
import { createSessionActions } from "./store/sessionActions";
import { useHydration } from "./store/useHydration";
import { useOfflineTrainingSync, usePersistedState, useTodayIso } from "./store/useLifecycle";
import type { LoadwiseState } from "./types";
import type { EngineResult } from "./engineV2/model";

import { loadV2Plan } from "./engineV2/persistence";

import { resolveEffectivePlan } from "./effectivePlan";

export { applyExerciseReplacements } from "./store/model";

const LoadwiseContext = createContext<LoadwiseContextValue | null>(null);

export function LoadwiseProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, recoveryMode } = useAuth();
  const [state, setState] = useState<LoadwiseState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const profileSaveRefs = useRef<ProfileSaveRefs>({ attempt: null, flight: null, key: null });
  const [profileSaveStage, setProfileSaveStage] = useState<ProfileSaveStage | null>(null);
  const replacementInFlightRef = useRef(new Set<string>());
  const todayIso = useTodayIso();
  const [syncing, setSyncing] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const hydrated = useHydration({
    user,
    authLoading,
    recoveryMode,
    profileWritePending: profileSaveStage !== null,
    setState,
    state,
    setSyncing,
    setHydrationError,
  });
  const activeUser = useRef(user?.id);
  activeUser.current = user?.id;
  const ownerId = user?.id;
  useEffect(() => {
    profileSaveRefs.current = { attempt: null, flight: null, key: null };
    setProfileSaveStage(null);
  }, [ownerId]);
  const guardedSetState: typeof setState = (update) => {
    setState((current) =>
      activeUser.current === ownerId
        ? typeof update === "function"
          ? update(current)
          : update
        : current,
    );
  };
  const context = {
    user,
    state,
    setState: guardedSetState,
    getState: () => stateRef.current,
    todayIso,
  };
  useOfflineTrainingSync(user, { setState: guardedSetState });
  usePersistedState(user, hydrated && !syncing, state);
  const profileActions = createProfileActions({
    ...context,
    profileSaveRefs,
    isProfileOwnerCurrent: () => activeUser.current === ownerId,
    onProfileSaveStage: (stage) => {
      if (activeUser.current === ownerId) setProfileSaveStage(stage);
    },
  });
  const sessionActions = createSessionActions(context);
  const planActions = createPlanActions({ ...context, replacementInFlightRef });
  const todaySession = state.plan.find((p) => p.date === todayIso) ?? null;
  const activatingV2 = useRef(false);
  async function activatePlanV2(result: EngineResult) {
    if (activatingV2.current) return;
    if (!user || !hydrated || syncing || profileSaveStage)
      throw new Error("Poczekaj na wczytanie profilu.");
    activatingV2.current = true;
    const owner = user.id;
    try {
      const [{ activateTrainingPlan }, { persistMonthlyPlan }] = await Promise.all([
        import("./engineV2/activation"),
        import("./persist"),
      ]);
      const saved = await activateTrainingPlan(result, {
        current: () => {
          const value = stateRef.current;
          return activeUser.current === owner && value.profile
            ? {
                ownerId: owner,
                profile: value.profile,
                observedPlanId: value.activePlanId ?? null,
                plan: resolveEffectivePlan(value.plan, value.modifications, {
                  completions: value.completions,
                }),
                completions: value.completions,
                readiness: value.readiness,
              }
            : null;
        },
        load: () => loadV2Plan(owner),
        persist: persistMonthlyPlan,
      });
      if (activeUser.current !== owner) return;
      guardedSetState((s) => ({
        ...s,
        plan: saved,
        activePlanId: saved[0]?.planDbId ?? null,
        planGeneratedFor: saved[0]?.date ?? null,
      }));
    } finally {
      activatingV2.current = false;
    }
  }

  return (
    <LoadwiseContext.Provider
      value={{
        state,
        hydrated,
        syncing,
        hydrationError,
        todayIso,
        todaySession,
        activatePlanV2,
        profileSaveStage,
        ...profileActions,
        ...sessionActions,
        ...planActions,
      }}
    >
      {children}
    </LoadwiseContext.Provider>
  );
}

export function useLoadwise() {
  const ctx = useContext(LoadwiseContext);
  if (!ctx) throw new Error("useLoadwise must be used within LoadwiseProvider");
  return ctx;
}
