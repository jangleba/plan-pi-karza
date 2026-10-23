import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { initialState, type LoadwiseContextValue } from "./store/model";
import { createPlanActions } from "./store/planActions";
import { createProfileActions } from "./store/profileActions";
import { createPlanPersistence } from "./store/repository";
import { createSessionActions } from "./store/sessionActions";
import { useHydration } from "./store/useHydration";
import {
  useMissedSessionSync,
  useOfflineTrainingSync,
  usePersistedState,
  useTodayIso,
} from "./store/useLifecycle";
import type { LoadwiseState } from "./types";

export { applyExerciseReplacements } from "./store/model";
export { shouldReusePersistedPlan } from "./store/repository";

const LoadwiseContext = createContext<LoadwiseContextValue | null>(null);

export function LoadwiseProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, recoveryMode } = useAuth();
  const [state, setState] = useState<LoadwiseState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const generatingRef = useRef(false);
  const [planGenerating, setPlanGenerating] = useState(false);
  const replacementInFlightRef = useRef(new Set<string>());
  const todayIso = useTodayIso();
  const [syncing, setSyncing] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const hydrated = useHydration({
    user,
    authLoading,
    recoveryMode,
    todayIso,
    setState,
    state,
    setSyncing,
    setHydrationError,
  });
  const persistence = createPlanPersistence(user, todayIso, state, () => stateRef.current);
  const activeUser = useRef(user?.id);
  activeUser.current = user?.id;
  const ownerId = user?.id;
  const guardedSetState: typeof setState = (update) => {
    setState(current => activeUser.current === ownerId ? (typeof update === "function" ? update(current) : update) : current);
  };
  const context = { user, state, setState: guardedSetState, getState: () => stateRef.current, todayIso, ...persistence };
  useOfflineTrainingSync(user, { setState: guardedSetState });
  usePersistedState(user, hydrated && !syncing, state);
  useMissedSessionSync({ ...context, hydrated: hydrated && !syncing && !hydrationError });
  const profileActions = createProfileActions({ ...context, generatingRef, setPlanGenerating });
  const sessionActions = createSessionActions(context);
  const planActions = createPlanActions({ ...context, replacementInFlightRef });
  const todaySession = state.plan.find((p) => p.date === todayIso) ?? null;

  return (
    <LoadwiseContext.Provider
      value={{
        state,
        hydrated,
        syncing,
        hydrationError,
        todayIso,
        todaySession,
        planGenerating,
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
