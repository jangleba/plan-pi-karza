import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  LoadwiseState,
  Profile,
  Readiness,
  TestResult,
  ScoutingData,
  ExerciseItem,
  SessionDay,
  SessionCompletion,
  SessionModification,
  ModificationType,
  SessionStatus,
  WeeklyTransition,
  ExerciseReplacement,
  TrainingExercise,
} from "./types";
import { generatePlan, weekRanges, PLAN_ENGINE_VERSION } from "./planEngine";
import { persistMonthlyPlan } from "./persist";
import { persistedPlanNeedsRegeneration } from "./persistedPlanValidation";
import { applyCheckInToPlanDay, normalizeLegacyPersistedPlan } from "./dailyCheckin";
import { localToday, isoDate, parseIso } from "./labels";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { LEGAL_VERSION } from "./legal";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { selectEquipmentAwareReplacement } from "./exerciseLibrary";
import { migratePersistedSpeedSessions } from "./speedSessionMigration";

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
  exerciseReplacements: {},
  equipmentNotice: null,
};

const ONBOARDING_SCHEMA_VERSION = 1;

/**
 * Sprawdza, czy zapisany plan jest zgodny z aktualnymi dniami treningu klubowego.
 * Trening klubowy może wystąpić WYŁĄCZNIE w dniach wybranych w onboardingu
 * (profile.clubTrainingDays, 1=pon ... 7=niedz). Jeśli plan zawiera klub w innym
 * dniu, jest nieaktualny i musi zostać wygenerowany ponownie.
 */

// ---- local-only state (readiness/tests/scouting), namespaced per user ----
function localKey(userId: string) {
  return `loadwise:v3:${userId}`;
}

interface LocalState {
  readiness: Record<string, Readiness>;
  tests: TestResult[];
  scouting: ScoutingData;
  unavailableEquipmentIds: string[];
  exerciseReplacements: Record<string, ExerciseReplacement[]>;
}

function loadLocal(userId: string): LocalState {
  if (typeof window === "undefined")
    return {
      readiness: {},
      tests: [],
      scouting: emptyScouting,
      unavailableEquipmentIds: [],
      exerciseReplacements: {},
    };
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw)
      return {
        readiness: {},
        tests: [],
        scouting: emptyScouting,
        unavailableEquipmentIds: [],
        exerciseReplacements: {},
      };
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return {
      readiness: parsed.readiness ?? {},
      tests: parsed.tests ?? [],
      scouting: { ...emptyScouting, ...(parsed.scouting ?? {}) },
      unavailableEquipmentIds: Array.isArray(parsed.unavailableEquipmentIds)
        ? parsed.unavailableEquipmentIds
        : [],
      exerciseReplacements: parsed.exerciseReplacements ?? {},
    };
  } catch {
    return {
      readiness: {},
      tests: [],
      scouting: emptyScouting,
      unavailableEquipmentIds: [],
      exerciseReplacements: {},
    };
  }
}

function saveLocal(userId: string, s: LocalState) {
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function replaceExerciseInSession(
  session: SessionDay,
  exerciseId: string,
  replacement: TrainingExercise,
): SessionDay {
  const replace = (exercise: TrainingExercise) =>
    exercise.id === exerciseId ? replacement : exercise;
  const replaceFlat = (item: ExerciseItem) =>
    item.exerciseId === exerciseId
      ? { ...item, name: replacement.name, exerciseId: replacement.exerciseId }
      : item;
  return {
    ...session,
    structuredSections: session.structuredSections?.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map(replace),
      })),
    })),
    sections: {
      warmup: session.sections.warmup.map(replaceFlat),
      main: session.sections.main.map(replaceFlat),
      accessory: session.sections.accessory.map(replaceFlat),
      footballTransfer: session.sections.footballTransfer.map(replaceFlat),
      cooldown: session.sections.cooldown.map(replaceFlat),
    },
  };
}

export function applyExerciseReplacements(
  session: SessionDay,
  replacements: ExerciseReplacement[],
): SessionDay {
  return replacements.reduce(
    (current, item) => replaceExerciseInSession(current, item.exerciseId, item.replacement),
    session,
  );
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
  return VALID_GOALS.includes(v as Profile["goal"]) ? (v as Profile["goal"]) : "matchready";
}

const VALID_LIMITERS: NonNullable<Profile["secondaryLimiter"]>[] = [
  "speed",
  "strength",
  "endurance",
  "cod",
  "power",
  "ball",
  "fatigue",
  "return",
];

function normalizeLimiter(v: unknown): Profile["secondaryLimiter"] {
  return VALID_LIMITERS.includes(v as NonNullable<Profile["secondaryLimiter"]>)
    ? (v as Profile["secondaryLimiter"])
    : null;
}

function parseUsualMatchDay(v: unknown): Profile["usualMatchDay"] {
  if (v === null || v === undefined || v === "") return null;
  if (v === "no_fixed_day") return "no_fixed_day";
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? n : null;
}

const VALID_SEASON_PHASES: Profile["seasonPhase"][] = [
  "offseason",
  "preseason",
  "inseason",
  "transition",
  "return_injury",
];

function normalizeSeasonPhase(v: unknown): Profile["seasonPhase"] {
  return VALID_SEASON_PHASES.includes(v as Profile["seasonPhase"])
    ? (v as Profile["seasonPhase"])
    : "inseason";
}

const VALID_COMP_LEVELS: Profile["competitionLevel"][] = [
  "academy",
  "b_klasa",
  "a_klasa",
  "okregowka",
  "iv_liga",
  "iii_liga",
  "ii_liga_plus",
  "semi_pro",
  "pro",
];

function normalizeCompLevel(v: unknown): Profile["competitionLevel"] {
  return VALID_COMP_LEVELS.includes(v as Profile["competitionLevel"])
    ? (v as Profile["competitionLevel"])
    : "okregowka";
}

const VALID_LEVELS: Profile["level"][] = ["beginner", "intermediate", "advanced", "elite"];

function normalizeLevel(v: unknown): Profile["level"] {
  return VALID_LEVELS.includes(v as Profile["level"]) ? (v as Profile["level"]) : "intermediate";
}

function buildProfile(prof: AnyRow | null, ath: AnyRow | null): Profile | null {
  if (!prof || !ath) return null;
  const onboardingRevision =
    (ath.updated_at as string | null) ??
    (ath.created_at as string | null) ??
    (prof.updated_at as string | null) ??
    (prof.created_at as string | null) ??
    null;
  const equipment = (ath.equipment as string[]) ?? [];
  return {
    name: (prof.full_name as string) ?? "",
    age: (ath.age as number) ?? 0,
    position: ath.position as Profile["position"],
    level: normalizeLevel(ath.level),
    goal: normalizeGoal(ath.main_goal),
    secondaryLimiter: normalizeLimiter(ath.secondary_limiter),
    clubTrainingDays: (ath.club_training_days as number[]) ?? [],
    individualTrainingDays: (ath.individual_training_days as number[]) ?? [],
    unavailableDays: (ath.unavailable_days as number[]) ?? [],
    usualMatchDay: parseUsualMatchDay(ath.usual_match_day),
    matchDate: (ath.match_date as string) ?? null,
    equipment,
    painInjury: Boolean(ath.pain_injury),
    doubleSessionsAllowed:
      (ath.double_sessions_allowed as Profile["doubleSessionsAllowed"]) ?? "no",
    guardianConsent: Boolean(ath.guardian_consent),
    onboardingComplete: Boolean(prof.onboarding_completed),
    onboardingRevision,
    onboardingSchemaVersion: ONBOARDING_SCHEMA_VERSION,
    createdAt: (ath.created_at as string) ?? new Date().toISOString(),
    seasonPhase: normalizeSeasonPhase(ath.season_phase),
    seasonStage: (ath.season_stage as Profile["seasonStage"]) ?? null,
    competitionLevel: normalizeCompLevel(ath.competition_level),
    weeklyMatches:
      ath.weekly_matches === null || ath.weekly_matches === undefined
        ? true
        : Boolean(ath.weekly_matches),
    hasGym:
      ath.has_gym === null || ath.has_gym === undefined
        ? equipment.includes("Dostęp do siłowni")
        : Boolean(ath.has_gym),
    hasPitch: ath.has_pitch === null || ath.has_pitch === undefined ? true : Boolean(ath.has_pitch),
    hasSprintSpace:
      ath.has_sprint_space === null || ath.has_sprint_space === undefined
        ? true
        : Boolean(ath.has_sprint_space),
  };
}

function stampDayRevision(
  day: SessionDay,
  revision: string | null,
  schemaVersion: number,
): SessionDay {
  const stamped: SessionDay = {
    ...day,
    canonicalRevision: revision,
    canonicalSchemaVersion: schemaVersion,
  };
  if (day.secondSession) {
    stamped.secondSession = stampDayRevision(day.secondSession, revision, schemaVersion);
  }
  return stamped;
}

function stampPlanRevision(
  plan: SessionDay[],
  revision: string | null,
  schemaVersion: number,
): SessionDay[] {
  return plan.map((day) => stampDayRevision(day, revision, schemaVersion));
}

function planRevisionInfo(plan: SessionDay[]): {
  revision: string | null;
  schemaVersion: number | null;
  mixedRevisions: boolean;
  mixedSchemas: boolean;
} {
  if (plan.length === 0) {
    return {
      revision: null,
      schemaVersion: null,
      mixedRevisions: false,
      mixedSchemas: false,
    };
  }
  const firstRevision = plan[0].canonicalRevision ?? null;
  const firstSchema = plan[0].canonicalSchemaVersion ?? null;
  let mixedRevisions = false;
  let mixedSchemas = false;
  for (const day of plan) {
    if ((day.canonicalRevision ?? null) !== firstRevision) mixedRevisions = true;
    if ((day.canonicalSchemaVersion ?? null) !== firstSchema) mixedSchemas = true;
  }
  return {
    revision: firstRevision,
    schemaVersion: firstSchema,
    mixedRevisions,
    mixedSchemas,
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

function rowToExerciseReplacement(row: AnyRow): ExerciseReplacement | null {
  if (!row.original_json || !row.replacement_json) return null;
  return {
    id: row.id as string,
    date: row.date as string,
    exerciseId: row.exercise_id as string,
    original: row.original_json as TrainingExercise,
    replacement: row.replacement_json as TrainingExercise,
    equipmentIds: Array.isArray(row.equipment_ids) ? (row.equipment_ids as string[]) : [],
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export function shouldReusePersistedPlan(plan: SessionDay[], profile: Profile): boolean {
  const hasMonthly = plan.length >= 14;
  const today = isoDate(localToday());
  const coversToday = plan.some((day) => day.date === today);
  const revision = planRevisionInfo(plan);
  const sameRevision = (profile.onboardingRevision ?? null) === (revision.revision ?? null);
  const schemaOk =
    (revision.schemaVersion ?? ONBOARDING_SCHEMA_VERSION) === ONBOARDING_SCHEMA_VERSION;
  const persistedPlanIsSafe = !persistedPlanNeedsRegeneration(plan, profile, PLAN_ENGINE_VERSION);
  return hasMonthly && coversToday && persistedPlanIsSafe && sameRevision && schemaOk;
}

interface LoadwiseContextValue {
  state: LoadwiseState;
  hydrated: boolean;
  completeOnboarding: (profile: Profile, consents?: Record<string, boolean>) => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  restartOnboarding: () => Promise<void>;
  refreshPlanIfNeeded: () => void;
  completeSession: (session: SessionDay, rpe: number | null, notes: string) => Promise<void>;
  applyModification: (
    date: string,
    type: ModificationType,
    session: SessionDay,
    originalSession: SessionDay | null,
    reason: string,
  ) => Promise<void>;
  undoModification: (date: string, id: string) => Promise<void>;
  markEquipmentUnavailable: (
    date: string,
    exercise: TrainingExercise,
    equipmentIds: string[],
  ) => void;
  undoExerciseReplacement: (date: string, replacementId: string) => void;
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
  const [todayIso, setTodayIso] = useState(() => isoDate(localToday()));

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const refreshToday = () => {
      const next = isoDate(localToday());
      setTodayIso((prev) => (prev === next ? prev : next));
    };
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 1, 0);
      timeout = setTimeout(
        () => {
          refreshToday();
          scheduleMidnight();
        },
        Math.max(1000, nextMidnight.getTime() - now.getTime()),
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshToday();
    };
    const onFocus = () => refreshToday();
    const onPageShow = () => refreshToday();
    scheduleMidnight();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

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
      const [profRes, athRes, planRes, logRes, modRes, transRes, replacementRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle(),
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
        supabase
          .from("exercise_replacements" as never)
          .select("*")
          .eq("user_id", user.id)
          .eq("active", true)
          .order("created_at", { ascending: true }),
      ]);

      const rowProfile = buildProfile(profRes.data as AnyRow | null, athRes.data as AnyRow | null);
      const local = loadLocal(user.id);
      const profile = rowProfile
        ? {
            ...rowProfile,
            unavailableEquipmentIds: Array.isArray((athRes.data as AnyRow | null)?.unavailable_equipment_ids)
              ? ((athRes.data as AnyRow).unavailable_equipment_ids as string[])
              : local.unavailableEquipmentIds,
          }
        : null;

      let plan: SessionDay[] = [];
      let migrationOriginalPlan: SessionDay[] | null = null;
      let planGeneratedFor: string | null = null;
      let clearFutureOverlays = false;
      const planRow = planRes.data as AnyRow | null;
      const planRowCreatedAt = (planRow?.created_at as string | undefined) ?? null;
      if (planRow && Array.isArray(planRow.plan_json)) {
        plan = planRow.plan_json as SessionDay[];
        planGeneratedFor = (planRow.created_at as string)?.slice(0, 10) ?? null;
        const normalized = normalizeLegacyPersistedPlan(plan);
        plan = normalized.plan;
      }
      if (profile && plan.length > 0) {
        const persistedCompletions: Record<string, SessionCompletion> = {};
        for (const row of (logRes.data as AnyRow[] | null) ?? []) {
          const sid = row.session_id as string | null;
          if (!sid) continue;
          persistedCompletions[sid] = {
            completed: Boolean(row.completed),
            rpe: (row.rpe as number) ?? null,
            notes: (row.notes as string) ?? "",
          };
        }
        const persistedModifications: Record<string, SessionModification[]> = {};
        for (const row of (modRes.data as AnyRow[] | null) ?? []) {
          const mod = rowToModification(row);
          if (mod) (persistedModifications[mod.date] ??= []).push(mod);
        }
        const migrated = migratePersistedSpeedSessions(
          plan,
          profile,
          todayIso,
          persistedCompletions,
          persistedModifications,
        );
        if (migrated.migratedDates.length > 0) {
          migrationOriginalPlan = plan;
          plan = migrated.plan;
        }
      }

      if (!profile?.onboardingComplete) {
        plan = [];
        planGeneratedFor = null;
      } else {
        const revisionInfo = planRevisionInfo(plan);
        const profileRevision = profile.onboardingRevision ?? null;
        const schemaMissingOrMismatched =
          revisionInfo.schemaVersion === null ||
          revisionInfo.schemaVersion !== ONBOARDING_SCHEMA_VERSION;
        const revisionMismatch =
          (profileRevision && revisionInfo.revision !== profileRevision) ||
          (!revisionInfo.revision && !!profileRevision);
        const mixedRevisionData = revisionInfo.mixedRevisions || revisionInfo.mixedSchemas;
        const planOlderThanProfile =
          !!profileRevision && !!planRowCreatedAt && planRowCreatedAt < profileRevision;
        const missingToday = !plan.some((day) => day.date === todayIso);
        const invalidCanonical =
          plan.length === 0 ||
          missingToday ||
          persistedPlanNeedsRegeneration(plan, profile, PLAN_ENGINE_VERSION);
        const shouldRebuildCanonical =
          invalidCanonical ||
          mixedRevisionData ||
          schemaMissingOrMismatched ||
          revisionMismatch ||
          planOlderThanProfile;

        if (shouldRebuildCanonical) {
          const canonical = stampPlanRevision(
            generatePlan(profile, localToday()),
            profileRevision,
            ONBOARDING_SCHEMA_VERSION,
          );
          plan = canonical;
          await persistMonthlyPlan(user.id, profile, canonical);
          planGeneratedFor = todayIso;
          clearFutureOverlays = true;
        } else if (revisionInfo.revision !== profileRevision || schemaMissingOrMismatched) {
          plan = stampPlanRevision(plan, profileRevision, ONBOARDING_SCHEMA_VERSION);
          await persistMonthlyPlan(user.id, profile, plan);
          planGeneratedFor = todayIso;
        } else if (migrationOriginalPlan) {
          const planId = planRow?.id as string | undefined;
          if (planId) {
            const migrationWrite = await supabase
              .from("training_plans")
              .update({ plan_json: plan as unknown as never })
              .eq("id", planId)
              .eq("user_id", user.id)
              .eq("active", true);
            if (migrationWrite.error) plan = migrationOriginalPlan;
          } else {
            plan = migrationOriginalPlan;
          }
        }
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
        if (clearFutureOverlays && mod.date >= todayIso) continue;
        (modifications[mod.date] ??= []).push(mod);
      }

      const transitions: Record<number, WeeklyTransition> = {};
      for (const row of clearFutureOverlays ? [] : ((transRes.data as AnyRow[] | null) ?? [])) {
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

      const persistedReplacements: Record<string, ExerciseReplacement[]> = {};
      for (const row of (replacementRes.data as AnyRow[] | null) ?? []) {
        const replacement = rowToExerciseReplacement(row);
        if (replacement) (persistedReplacements[replacement.date] ??= []).push(replacement);
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
        exerciseReplacements:
          Object.keys(persistedReplacements).length > 0
            ? persistedReplacements
            : local.exerciseReplacements,
        equipmentNotice: null,
      });
      setHydrated(true);
      if (clearFutureOverlays) {
        await supabase
          .from("session_modifications" as never)
          .update({ active: false } as never)
          .eq("user_id", user.id)
          .eq("active", true)
          .gte("date", todayIso);
        await supabase
          .from("weekly_transitions" as never)
          .delete()
          .eq("user_id", user.id);
      }
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
        unavailableEquipmentIds: next.profile?.unavailableEquipmentIds ?? [],
        exerciseReplacements: next.exerciseReplacements,
      });
    }

    useEffect(() => {
      if (user && hydrated) persistLocal(state);
    }, [user?.id, hydrated, state.profile?.unavailableEquipmentIds, state.exerciseReplacements]);
  }

  async function savePlanToDb(
    profile: Profile,
    revision: string | null,
    readinessForToday?: Readiness | null,
  ): Promise<SessionDay[]> {
    const canonical = stampPlanRevision(
      generatePlan(profile, localToday()),
      revision,
      ONBOARDING_SCHEMA_VERSION,
    );
    let plan = canonical;
    if (readinessForToday) {
      const adapted = applyCheckInToPlanDay(
        canonical,
        readinessForToday.date,
        readinessForToday,
        profile,
      );
      plan = adapted.plan;
    }
    if (user) {
      await persistMonthlyPlan(user.id, profile, plan);
    }
    return plan;
  }

  async function saveProfileRows(profile: Profile, completed: boolean): Promise<string | null> {
    if (!user) return null;
    await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        full_name: profile.name,
        onboarding_completed: completed,
        age_group: profile.age <= 17 ? "youth" : "adult",
      },
      { onConflict: "user_id" },
    );
    const athleteRes = await supabase
      .from("athlete_profiles")
      .upsert(
        {
          user_id: user.id,
          age: profile.age,
          position: profile.position,
          level: profile.level,
          main_goal: profile.goal,
          secondary_limiter: profile.secondaryLimiter,
          equipment: profile.equipment as unknown as never,
          club_training_days: profile.clubTrainingDays as unknown as never,
          individual_training_days: profile.individualTrainingDays as unknown as never,
          unavailable_days: profile.unavailableDays as unknown as never,
          usual_match_day: profile.usualMatchDay === null ? null : String(profile.usualMatchDay),
          match_date: profile.matchDate,
          pain_injury: profile.painInjury,
          double_sessions_allowed: profile.doubleSessionsAllowed,
          guardian_consent: profile.guardianConsent,
          season_phase: profile.seasonPhase,
          season_stage: profile.seasonStage,
          competition_level: profile.competitionLevel,
          weekly_matches: profile.weeklyMatches,
          has_gym: profile.hasGym,
          has_pitch: profile.hasPitch,
          has_sprint_space: profile.hasSprintSpace,
          unavailable_equipment_ids: profile.unavailableEquipmentIds ?? [],
        },
        { onConflict: "user_id" },
      )
      .select("updated_at,created_at")
      .maybeSingle();
    return (
      (athleteRes.data?.updated_at as string | undefined) ??
      (athleteRes.data?.created_at as string | undefined) ??
      new Date().toISOString()
    );
  }

  async function completeOnboarding(profile: Profile, consents?: Record<string, boolean>) {
    if (!user) return;
    const revision = await saveProfileRows(profile, true);
    const nextProfile: Profile = {
      ...profile,
      unavailableEquipmentIds:
        state.profile?.unavailableEquipmentIds ?? profile.unavailableEquipmentIds ?? [],
      onboardingComplete: true,
      onboardingRevision: revision,
      onboardingSchemaVersion: ONBOARDING_SCHEMA_VERSION,
    };
    await supabase.from("onboarding_answers").insert({
      user_id: user.id,
      answers_json: nextProfile as unknown as never,
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

    const plan = await savePlanToDb(nextProfile, revision, state.readiness[todayIso]);
    setState((s) => ({
      ...s,
      profile: nextProfile,
      plan,
      planGeneratedFor: todayIso,
      modifications: Object.fromEntries(
        Object.entries(s.modifications).filter(([date]) => date < todayIso),
      ),
      transitions: {},
    }));
  }

  async function updateProfile(profile: Profile) {
    if (!user) return;
    const revision = await saveProfileRows(profile, true);
    const nextProfile: Profile = {
      ...profile,
      unavailableEquipmentIds:
        state.profile?.unavailableEquipmentIds ?? profile.unavailableEquipmentIds ?? [],
      onboardingComplete: true,
      onboardingRevision: revision,
      onboardingSchemaVersion: ONBOARDING_SCHEMA_VERSION,
    };
    const plan = await savePlanToDb(nextProfile, revision, state.readiness[todayIso]);
    setState((s) => ({
      ...s,
      profile: nextProfile,
      plan,
      planGeneratedFor: todayIso,
      modifications: Object.fromEntries(
        Object.entries(s.modifications).filter(([date]) => date < todayIso),
      ),
      transitions: {},
    }));
  }

  // Resetuje onboarding (np. do testów). Użytkownik wypełni go ponownie.
  async function restartOnboarding() {
    if (!user) return;
    await supabase
      .from("profiles")
      .upsert({ user_id: user.id, onboarding_completed: false }, { onConflict: "user_id" });
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
    if (shouldReusePersistedPlan(state.plan, profile)) return;
    if (generatingRef.current) return;
    generatingRef.current = true;
    (async () => {
      try {
        const plan = await savePlanToDb(
          profile,
          profile.onboardingRevision ?? null,
          state.readiness[todayIso],
        );
        setState((s) => ({ ...s, plan, planGeneratedFor: todayIso }));
      } finally {
        generatingRef.current = false;
      }
    })();
  }

  async function completeSession(session: SessionDay, rpe: number | null, notes: string) {
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

  function markEquipmentUnavailable(
    date: string,
    exercise: TrainingExercise,
    equipmentIds: string[],
  ) {
    if (!user || exercise.completed) return;
    setState((s) => {
      if ((s.exerciseReplacements[date] ?? []).some((r) => r.exerciseId === exercise.id)) return s;
      if (!s.profile) return s;
      const athlete = buildAthleteTrainingProfile(s.profile, {
        unavailableEquipmentIds: Array.from(
          new Set([...(s.profile.unavailableEquipmentIds ?? []), ...equipmentIds]),
        ),
      });
      const result = selectEquipmentAwareReplacement(exercise.exerciseId ?? exercise.name, athlete);
      if (!result.exercise || result.blockRebuildRequired) {
        return {
          ...s,
          equipmentNotice:
            "Nie znaleziono bezpiecznego zamiennika. Plan i historia pozostały bez zmian.",
        };
      }
      const replacement: TrainingExercise = {
        ...exercise,
        exerciseId: result.exercise.id,
        name: result.exercise.displayNamePl,
        equipment: result.exercise.equipmentRequired.join(", "),
        replacementForBlockedExercise: exercise.name,
        wasAdjustedForAthleteProfile: true,
      };
      const item: ExerciseReplacement = {
        id: crypto.randomUUID(),
        date,
        exerciseId: exercise.id,
        original: exercise,
        replacement,
        equipmentIds,
        createdAt: new Date().toISOString(),
      };
      void supabase.from("exercise_replacements" as never).insert({
        id: item.id,
        user_id: user.id,
        date,
        exercise_id: item.exerciseId,
        original_json: item.original,
        replacement_json: item.replacement,
        equipment_ids: item.equipmentIds,
      } as never);
      const next = {
        ...s,
        equipmentNotice: null,
        profile: {
          ...s.profile,
          unavailableEquipmentIds: Array.from(
            new Set([...(s.profile.unavailableEquipmentIds ?? []), ...equipmentIds]),
          ),
        },
        exerciseReplacements: {
          ...s.exerciseReplacements,
          [date]: [...(s.exerciseReplacements[date] ?? []), item],
        },
      };
      void supabase
        .from("exercise_replacements" as never)
        .update({ active: false } as never)
        .eq("id", replacementId)
        .eq("user_id", user?.id);
      return next;
    });
  }

  function undoExerciseReplacement(date: string, replacementId: string) {
    setState((s) => {
      const current = s.exerciseReplacements[date] ?? [];
      const removed = current.find((r) => r.id === replacementId);
      if (!removed) return s;
      const stillUsed = Object.values(s.exerciseReplacements)
        .flat()
        .some(
          (r) =>
            r.id !== replacementId &&
            r.equipmentIds.some((id) => removed.equipmentIds.includes(id)),
        );
      const next = {
        ...s,
        profile:
          s.profile && !stillUsed
            ? {
                ...s.profile,
                unavailableEquipmentIds: (s.profile.unavailableEquipmentIds ?? []).filter(
                  (id) => !removed.equipmentIds.includes(id),
                ),
              }
            : s.profile,
        exerciseReplacements: {
          ...s.exerciseReplacements,
          [date]: current.filter((r) => r.id !== replacementId),
        },
      };
      return next;
    });
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
    const safetyStatus: SessionStatus = type === "swap" ? "swapped_by_user" : "added_by_user";
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
      const filtered = type === "swap" ? existing.filter((m) => m.type !== "swap") : existing;
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

    // weekNumber = indeks (0-based) ODBLOKOWYWANEGO tygodnia kalendarzowego.
    // Wyznaczamy jego przedział w planie wg granic poniedziałek–niedziela.
    const current = state.plan;
    let newPlan = current;
    const planStart = current[0] ? parseIso(current[0].date) : null;
    const ranges = planStart ? weekRanges(planStart, current.length) : [];
    const range = ranges[weekNumber];

    if (range && current[range.start]) {
      const startIdx = range.start;
      const weekStart = parseIso(current[startIdx].date);
      // Profil tymczasowy: tylko podana data meczu steruje taperem.
      const tempProfile: Profile = {
        ...profile,
        usualMatchDay: "no_fixed_day",
        matchDate: noMatchNextWeek ? null : nextMatchDate,
      };
      const regenDays = range.end - range.start;
      const fresh = generatePlan(tempProfile, weekStart, regenDays, weekNumber);
      newPlan = [...current.slice(0, startIdx), ...fresh, ...current.slice(startIdx + regenDays)];
      // Zapisujemy cały plan ponownie (regeneruje identyfikatory sesji).
      await persistMonthlyPlan(user.id, profile, newPlan);
    }

    const id = state.transitions[weekNumber]?.id ?? crypto.randomUUID();
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
    let planToPersist: SessionDay[] | null = null;
    let profileToPersist: Profile | null = null;

    setState((s) => {
      const nextReadiness = { ...s.readiness, [r.date]: r };
      let nextPlan = s.plan;

      if (s.profile) {
        const adapted = applyCheckInToPlanDay(s.plan, r.date, r, s.profile);
        nextPlan = adapted.plan;
        if (adapted.changed) {
          planToPersist = adapted.plan;
          profileToPersist = s.profile;
        }
      }

      const next = { ...s, readiness: nextReadiness, plan: nextPlan };
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

      if (profileToPersist && planToPersist) {
        void persistMonthlyPlan(user.id, profileToPersist, planToPersist);
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
    if (user)
      saveLocal(user.id, {
        readiness: {},
        tests: [],
        scouting: emptyScouting,
        unavailableEquipmentIds: [],
        exerciseReplacements: {},
      });
    setState(initialState);
  }

  const todaySession = state.plan.find((p) => p.date === todayIso) ?? null;

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
        markEquipmentUnavailable,
        undoExerciseReplacement,
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
