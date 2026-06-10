import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
  SessionModification,
  ModificationType,
  SessionStatus,
  WeeklyTransition,
} from "./types";
import { generatePlan, PLAN_ENGINE_VERSION } from "./planEngine";
import { persistMonthlyPlan } from "./persist";
import { warsawToday, isoDate, parseIso } from "./labels";
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
  modifications: {},
  transitions: {},
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

const VALID_GOALS: Profile["goal"][] = [
  "speed",
  "strength",
  "endurance",
  "power",
  "agility",
  "general",
  "mobility",
  "return",
  "matchready",
];

/** Cel zawsze musi być prawidłowy — nigdy undefined. Fallback: gotowość meczowa. */
function normalizeGoal(v: unknown): Profile["goal"] {
  return VALID_GOALS.includes(v as Profile["goal"])
    ? (v as Profile["goal"])
    : "matchready";
}

function parseUsualMatchDay(v: unknown): Profile["usualMatchDay"] {
  if (v === null || v === undefined || v === "") return null;
  if (v === "no_fixed_day") return "no_fixed_day";
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? n : null;
}

function buildProfile(prof: AnyRow | null, ath: AnyRow | null): Profile | null {
  if (!prof || !prof.onboarding_completed || !ath) return null;
  return {
    name: (prof.full_name as string) ?? "",
    age: (ath.age as number) ?? 0,
    position: ath.position as Profile["position"],
    level: ath.level as Profile["level"],
    goal: normalizeGoal(ath.main_goal),
    clubTrainingDays: (ath.club_training_days as number[]) ?? [],
    individualTrainingDays: (ath.individual_training_days as number[]) ?? [],
    usualMatchDay: parseUsualMatchDay(ath.usual_match_day),
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

function rowToModification(row: AnyRow): SessionModification | null {
  const session = row.new_session_json as SessionDay | null;
  if (!session) return null;
  return {
    id: row.id as string,
    date: row.date as string,
    type: (row.type as ModificationType) ?? "add",
    reason: (row.reason as string) ?? "",
    safetyStatus: (row.safety_status as SessionStatus) ?? "planned",
    session,
    originalSession: (row.original_session_json as SessionDay | null) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
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
  restartOnboarding: () => Promise<void>;
  refreshPlanIfNeeded: () => void;
  completeSession: (
    session: SessionDay,
    rpe: number | null,
    notes: string,
  ) => Promise<void>;
  applyModification: (
    date: string,
    type: ModificationType,
    session: SessionDay,
    originalSession: SessionDay | null,
    reason: string,
  ) => Promise<void>;
  undoModification: (date: string, id: string) => Promise<void>;
  confirmWeeklyTransition: (
    weekNumber: number,
    nextMatchDate: string | null,
    noMatchNextWeek: boolean,
  ) => Promise<void>;
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
  const generatingRef = useRef(false);

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
      const [profRes, athRes, planRes, logRes, modRes, transRes] = await Promise.all([
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
        supabase
          .from("session_logs")
          .select("session_id, completed, rpe, notes")
          .eq("user_id", user.id),
        supabase
          .from("session_modifications" as never)
          .select("*")
          .eq("user_id", user.id)
          .eq("active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("weekly_transitions" as never)
          .select("*")
          .eq("user_id", user.id),
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

      const completions: Record<string, SessionCompletion> = {};
      for (const row of (logRes.data as AnyRow[] | null) ?? []) {
        const sid = row.session_id as string | null;
        if (!sid) continue;
        completions[sid] = {
          completed: Boolean(row.completed),
          rpe: (row.rpe as number) ?? null,
          notes: (row.notes as string) ?? "",
        };
      }

      const modifications: Record<string, SessionModification[]> = {};
      for (const row of (modRes.data as AnyRow[] | null) ?? []) {
        const mod = rowToModification(row);
        if (!mod) continue;
        (modifications[mod.date] ??= []).push(mod);
      }

      const transitions: Record<number, WeeklyTransition> = {};
      for (const row of (transRes.data as AnyRow[] | null) ?? []) {
        const wn = Number(row.week_number);
        if (!Number.isFinite(wn)) continue;
        transitions[wn] = {
          id: row.id as string,
          weekNumber: wn,
          nextMatchDate: (row.next_match_date as string) ?? null,
          noMatchNextWeek: Boolean(row.no_match_next_week),
          confirmedAt: (row.confirmed_at as string) ?? new Date().toISOString(),
        };
      }

      if (cancelled) return;
      setState({
        profile,
        plan,
        planGeneratedFor,
        readiness: local.readiness,
        completions,
        tests: local.tests,
        scouting: local.scouting,
        modifications,
        transitions,
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
      await persistMonthlyPlan(user.id, profile, plan);
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
        individual_training_days:
          profile.individualTrainingDays as unknown as never,
        usual_match_day:
          profile.usualMatchDay === null
            ? null
            : String(profile.usualMatchDay),
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

  // Resetuje onboarding (np. do testów). Użytkownik wypełni go ponownie.
  async function restartOnboarding() {
    if (!user) return;
    await supabase
      .from("profiles")
      .upsert(
        { user_id: user.id, onboarding_completed: false },
        { onConflict: "user_id" },
      );
    setState((s) => ({
      ...s,
      profile: s.profile ? { ...s.profile, onboardingComplete: false } : null,
    }));
  }


  // Nie regenerujemy planu przy każdym otwarciu ekranu.
  function refreshPlanIfNeeded() {
    const profile = state.profile;
    if (!profile?.onboardingComplete) return;
    // Regeneruj tylko, gdy brak planu lub plan pochodzi ze starej wersji
    // generatora (stare fallbacki/statyczne tygodnie nie mogą zostać aktywne).
    const hasMonthly =
      state.plan.length >= 14 && Boolean(state.plan[0]?.dbId);
    const isCurrentEngine = state.plan.every(
      (d) => d.generatorVersion === PLAN_ENGINE_VERSION,
    );
    if (hasMonthly && isCurrentEngine) return;
    if (generatingRef.current) return;
    generatingRef.current = true;
    (async () => {
      try {
        const plan = await savePlanToDb(profile);
        setState((s) => ({ ...s, plan, planGeneratedFor: todayIso }));
      } finally {
        generatingRef.current = false;
      }
    })();
  }

  async function completeSession(
    session: SessionDay,
    rpe: number | null,
    notes: string,
  ) {
    const sid = session.dbId;
    if (!user || !sid) return;
    const completion: SessionCompletion = { completed: true, rpe, notes };
    setState((s) => ({
      ...s,
      completions: { ...s.completions, [sid]: completion },
    }));
    await supabase.from("session_logs").upsert(
      {
        user_id: user.id,
        session_id: sid,
        completed: true,
        rpe,
        notes,
      },
      { onConflict: "user_id,session_id" },
    );
  }

  async function applyModification(
    date: string,
    type: ModificationType,
    session: SessionDay,
    originalSession: SessionDay | null,
    reason: string,
  ) {
    if (!user) return;
    const id = crypto.randomUUID();
    const safetyStatus: SessionStatus =
      type === "swap" ? "swapped_by_user" : "added_by_user";
    const mod: SessionModification = {
      id,
      date,
      type,
      reason,
      safetyStatus,
      session,
      originalSession,
      createdAt: new Date().toISOString(),
    };
    setState((s) => {
      const existing = s.modifications[date] ?? [];
      // Tylko jedna zamiana naraz na dany dzień.
      const filtered =
        type === "swap" ? existing.filter((m) => m.type !== "swap") : existing;
      return {
        ...s,
        modifications: { ...s.modifications, [date]: [...filtered, mod] },
      };
    });
    if (type === "swap") {
      await supabase
        .from("session_modifications" as never)
        .update({ active: false } as never)
        .eq("user_id", user.id)
        .eq("date", date)
        .eq("type", "swap");
    }
    await supabase.from("session_modifications" as never).insert({
      id,
      user_id: user.id,
      date,
      type,
      reason,
      safety_status: safetyStatus,
      original_session_id: originalSession?.dbId ?? null,
      new_session_id: session.dbId ?? null,
      original_session_json: originalSession,
      new_session_json: session,
      active: true,
    } as never);
  }

  async function undoModification(date: string, id: string) {
    if (!user) return;
    setState((s) => {
      const existing = s.modifications[date] ?? [];
      const next = existing.filter((m) => m.id !== id);
      const map = { ...s.modifications };
      if (next.length) map[date] = next;
      else delete map[date];
      return { ...s, modifications: map };
    });
    await supabase
      .from("session_modifications" as never)
      .update({ active: false } as never)
      .eq("user_id", user.id)
      .eq("id", id);
  }

  // Weekly gate: zapisuje datę kolejnego meczu i przebudowuje kolejny tydzień planu.
  async function confirmWeeklyTransition(
    weekNumber: number,
    nextMatchDate: string | null,
    noMatchNextWeek: boolean,
  ) {
    if (!user) return;
    const profile = state.profile;
    if (!profile) return;

    // weekNumber jest 1-based dla ZAKOŃCZONEGO tygodnia.
    // Kolejny tydzień zaczyna się od indeksu weekNumber*7 (0-based).
    const startIdx = weekNumber * 7;
    const current = state.plan;
    let newPlan = current;

    if (current[startIdx]) {
      const weekStart = parseIso(current[startIdx].date);
      // Profil tymczasowy: tylko podana data meczu steruje taperem.
      const tempProfile: Profile = {
        ...profile,
        usualMatchDay: "no_fixed_day",
        matchDate: noMatchNextWeek ? null : nextMatchDate,
      };
      const regenDays = Math.min(7, current.length - startIdx);
      const fresh = generatePlan(tempProfile, weekStart, regenDays, weekNumber);
      newPlan = [
        ...current.slice(0, startIdx),
        ...fresh,
        ...current.slice(startIdx + regenDays),
      ];
      // Zapisujemy cały plan ponownie (regeneruje identyfikatory sesji).
      await persistMonthlyPlan(user.id, profile, newPlan);
    }

    const id =
      state.transitions[weekNumber]?.id ?? crypto.randomUUID();
    const transition: WeeklyTransition = {
      id,
      weekNumber,
      nextMatchDate: noMatchNextWeek ? null : nextMatchDate,
      noMatchNextWeek,
      confirmedAt: new Date().toISOString(),
    };

    setState((s) => ({
      ...s,
      plan: newPlan,
      transitions: { ...s.transitions, [weekNumber]: transition },
    }));

    await supabase.from("weekly_transitions" as never).upsert(
      {
        id,
        user_id: user.id,
        week_number: weekNumber,
        next_match_date: transition.nextMatchDate,
        no_match_next_week: noMatchNextWeek,
        confirmed_at: transition.confirmedAt,
      } as never,
      { onConflict: "user_id,week_number" } as never,
    );
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

      // Zapisz powód korekty gotowości na dniu treningowym.
      const day = state.plan.find((p) => p.date === r.date);
      if (day?.dayDbId) {
        const adj =
          r.overall >= 8
            ? `Gotowość ${r.overall}/10 — plan bez zmian`
            : r.overall >= 6
              ? `Gotowość ${r.overall}/10 — redukcja objętości 10–20%`
              : r.overall >= 4
                ? `Gotowość ${r.overall}/10 — redukcja 30–40%, bez pracy o wysokiej intensywności`
                : `Gotowość ${r.overall}/10 — tylko regeneracja/mobilność`;
        supabase
          .from("training_days")
          .update({ readiness_adjustment: adj })
          .eq("id", day.dayDbId)
          .then(() => {});
      }
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
        restartOnboarding,
        refreshPlanIfNeeded,
        completeSession,
        applyModification,
        undoModification,
        confirmWeeklyTransition,
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
