import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  LoadwiseState,
  Profile,
  Readiness,
  TestResult,
  ScoutingData,
  SessionDay,
} from "./types";
import { generatePlan } from "./planEngine";
import { warsawToday, isoDate } from "./labels";

const STORAGE_KEY = "loadwise:v2";

const emptyScouting: ScoutingData = {
  strengths: "",
  priorities: "",
  notes: "",
  opportunities: [],
};

const initialState: LoadwiseState = {
  profile: null,
  plan: [],
  planGeneratedFor: null,
  readiness: {},
  tests: [],
  scouting: emptyScouting,
};

function load(): LoadwiseState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<LoadwiseState>;
    return {
      ...initialState,
      ...parsed,
      scouting: { ...emptyScouting, ...(parsed.scouting ?? {}) },
    };
  } catch {
    return initialState;
  }
}

interface LoadwiseContextValue {
  state: LoadwiseState;
  hydrated: boolean;
  completeOnboarding: (profile: Profile) => void;
  updateProfile: (profile: Profile) => void;
  refreshPlanIfNeeded: () => void;
  saveReadiness: (r: Readiness) => void;
  addTest: (t: TestResult) => void;
  updateScouting: (s: Partial<ScoutingData>) => void;
  resetAll: () => void;
  todayIso: string;
  todaySession: SessionDay | null;
}

const LoadwiseContext = createContext<LoadwiseContextValue | null>(null);

export function LoadwiseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadwiseState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota errors */
    }
  }, [state, hydrated]);

  const todayIso = isoDate(warsawToday());

  function completeOnboarding(profile: Profile) {
    const plan = generatePlan(profile, warsawToday());
    setState((s) => ({
      ...s,
      profile: { ...profile, onboardingComplete: true },
      plan,
      planGeneratedFor: todayIso,
    }));
  }

  function updateProfile(profile: Profile) {
    const plan = generatePlan(profile, warsawToday());
    setState((s) => ({
      ...s,
      profile,
      plan,
      planGeneratedFor: todayIso,
    }));
  }

  function refreshPlanIfNeeded() {
    setState((s) => {
      if (!s.profile?.onboardingComplete) return s;
      if (s.planGeneratedFor === todayIso && s.plan.length > 0) return s;
      return {
        ...s,
        plan: generatePlan(s.profile, warsawToday()),
        planGeneratedFor: todayIso,
      };
    });
  }

  function saveReadiness(r: Readiness) {
    setState((s) => ({
      ...s,
      readiness: { ...s.readiness, [r.date]: r },
    }));
  }

  function addTest(t: TestResult) {
    setState((s) => ({ ...s, tests: [t, ...s.tests] }));
  }

  function updateScouting(patch: Partial<ScoutingData>) {
    setState((s) => ({ ...s, scouting: { ...s.scouting, ...patch } }));
  }

  function resetAll() {
    setState(initialState);
  }

  const todaySession =
    state.plan.find((p) => p.date === todayIso) ?? state.plan[0] ?? null;

  return (
    <LoadwiseContext.Provider
      value={{
        state,
        hydrated,
        completeOnboarding,
        updateProfile,
        refreshPlanIfNeeded,
        saveReadiness,
        addTest,
        updateScouting,
        resetAll,
        todayIso,
        todaySession,
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
