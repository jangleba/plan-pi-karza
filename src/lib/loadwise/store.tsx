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
  SessionCompletion,
} from "./types";
import { generatePlan } from "./planEngine";
import { persistMonthlyPlan } from "./persist";
import { warsawToday, isoDate } from "./labels";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { LEGAL_VERSION } from "./legal";

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
  completions: {},
  tests: [],
  scouting: emptyScouting,
};

// ---- local-only state (readiness/tests/scouting), namespaced per user ----
function localKey(userId: string) {
  return `loadwise:v3:${userId}`;
}

interface LocalState {
  readiness: Record<string, Readiness>;
  tests: TestResult[];
  scouting: ScoutingData;
}

function loadLocal(userId: string): LocalState {
  if (typeof window === "undefined")
    return { readiness: {}, tests: [], scouting: emptyScouting };
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw) return { readiness: {}, tests: [], scouting: emptyScouting };
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return {
      readiness: parsed.readiness ?? {},
      tests: parsed.tests ?? [],
      scouting: { ...emptyScouting, ...(parsed.scouting ?? {}) },
    };
  } catch {
    return { readiness: {}, tests: [], scouting: emptyScouting };
  }
}

function saveLocal(userId: string, s: LocalState) {
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ---- map DB rows <-> Profile ----
type AnyRow = Record<string, unknown>;

function buildProfile(prof: AnyRow | null, ath: AnyRow | null): Profile | null {
  if (!prof || !prof.onboarding_completed || !ath) return null;
  return {
    name: (prof.full_name as string) ?? "",
    age: (ath.age as number) ?? 0,
    position: ath.position as Profile["position"],
    level: ath.level as Profile["level"],
    goal: ath.main_goal as Profile["goal"],
    clubTrainingDays: (ath.club_training_days as number[]) ?? [],
    matchDate: (ath.match_date as string) ?? null,
    equipment: (ath.equipment as string[]) ?? [],
    painInjury: Boolean(ath.pain_injury),
    doubleSessionsAllowed:
      (ath.double_sessions_allowed as Profile["doubleSessionsAllowed"]) ?? "no",
    guardianConsent: Boolean(ath.guardian_consent),
    onboardingComplete: true,
    createdAt: (ath.created_at as string) ?? new Date().toISOString(),
  };
}

interface LoadwiseContextValue {
  state: LoadwiseState;
  hydrated: boolean;
  completeOnboarding: (
    profile: Profile,
    consents?: Record<string, boolean>,
  ) => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
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
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<LoadwiseState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  const todayIso = isoDate(warsawToday());

  // Load everything for the current user.
  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setState(initialState);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    (async () => {
      const [profRes, athRes, planRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("athlete_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("training_plans")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const profile = buildProfile(
        profRes.data as AnyRow | null,
        athRes.data as AnyRow | null,
      );
      const local = loadLocal(user.id);

      let plan: SessionDay[] = [];
      let planGeneratedFor: string | null = null;
      const planRow = planRes.data as AnyRow | null;
      if (planRow && Array.isArray(planRow.plan_json)) {
        plan = planRow.plan_json as SessionDay[];
        planGeneratedFor = (planRow.created_at as string)?.slice(0, 10) ?? null;
      }

      if (cancelled) return;
      setState({
        profile,
        plan,
        planGeneratedFor,
        readiness: local.readiness,
        tests: local.tests,
        scouting: local.scouting,
      });
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  function persistLocal(next: LoadwiseState) {
    if (user) {
      saveLocal(user.id, {
        readiness: next.readiness,
        tests: next.tests,
        scouting: next.scouting,
      });
    }
  }

  async function savePlanToDb(profile: Profile): Promise<SessionDay[]> {
    const plan = generatePlan(profile, warsawToday());
    if (user) {
      await supabase
        .from("training_plans")
        .update({ status: "archived" })
        .eq("user_id", user.id)
        .eq("status", "active");
      await supabase.from("training_plans").insert({
        user_id: user.id,
        goal: profile.goal,
        plan_json: plan as unknown as never,
        status: "active",
      });
    }
    return plan;
  }

  async function saveProfileRows(profile: Profile, completed: boolean) {
    if (!user) return;
    await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        full_name: profile.name,
        onboarding_completed: completed,
        age_group: profile.age <= 17 ? "youth" : "adult",
      },
      { onConflict: "user_id" },
    );
    await supabase.from("athlete_profiles").upsert(
      {
        user_id: user.id,
        age: profile.age,
        position: profile.position,
        level: profile.level,
        main_goal: profile.goal,
        equipment: profile.equipment as unknown as never,
        club_training_days: profile.clubTrainingDays as unknown as never,
        match_date: profile.matchDate,
        pain_injury: profile.painInjury,
        double_sessions_allowed: profile.doubleSessionsAllowed,
        guardian_consent: profile.guardianConsent,
      },
      { onConflict: "user_id" },
    );
  }

  async function completeOnboarding(
    profile: Profile,
    consents?: Record<string, boolean>,
  ) {
    if (!user) return;
    await saveProfileRows(profile, true);

    await supabase.from("onboarding_answers").insert({
      user_id: user.id,
      answers_json: profile as unknown as never,
      completed_at: new Date().toISOString(),
    });

    if (consents) {
      const { CONSENTS } = await import("./legal");
      const rows = CONSENTS.map((c) => ({
        user_id: user.id,
        consent_type: c.type,
        accepted: Boolean(consents[c.type]),
        version: LEGAL_VERSION,
        text_snapshot: c.text,
      }));
      await supabase.from("consent_logs").insert(rows);
    }

    const plan = await savePlanToDb(profile);
    setState((s) => ({
      ...s,
      profile: { ...profile, onboardingComplete: true },
      plan,
      planGeneratedFor: todayIso,
    }));
  }

  async function updateProfile(profile: Profile) {
    if (!user) return;
    await saveProfileRows(profile, true);
    const plan = await savePlanToDb(profile);
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
      const profile = s.profile;
      // regenerate + persist asynchronously
      savePlanToDb(profile);
      return {
        ...s,
        plan: generatePlan(profile, warsawToday()),
        planGeneratedFor: todayIso,
      };
    });
  }

  function saveReadiness(r: Readiness) {
    setState((s) => {
      const next = { ...s, readiness: { ...s.readiness, [r.date]: r } };
      persistLocal(next);
      return next;
    });
    if (user) {
      supabase
        .from("readiness_logs")
        .insert({
          user_id: user.id,
          date: r.date,
          sleep: r.sleep,
          energy: r.energy,
          fatigue: r.fatigue,
          soreness: r.soreness,
          stress: r.stress,
          motivation: r.motivation,
          pain_status: r.jointPain >= 5,
        })
        .then(() => {});
    }
  }

  function addTest(t: TestResult) {
    setState((s) => {
      const next = { ...s, tests: [t, ...s.tests] };
      persistLocal(next);
      return next;
    });
  }

  function updateScouting(patch: Partial<ScoutingData>) {
    setState((s) => {
      const next = { ...s, scouting: { ...s.scouting, ...patch } };
      persistLocal(next);
      return next;
    });
  }

  function resetAll() {
    if (user) saveLocal(user.id, { readiness: {}, tests: [], scouting: emptyScouting });
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
