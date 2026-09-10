import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  LoadwiseState,
  Profile,
  Readiness,
  ExerciseItem,
  SessionDay,
  SessionCompletion,
  SessionHistoryCategory,
  SessionHistoryRecord,
  SessionModification,
  ModificationType,
  SessionStatus,
  WeeklyTransition,
  ExerciseReplacement,
  TrainingExercise,
} from "./types";
import { PLAN_ENGINE_VERSION } from "./planVersion";
import { localToday, isoDate, parseIso } from "./labels";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { CONSENTS, LEGAL_VERSION } from "./legal";
import { migratePersistedExerciseData, selectEquipmentAwareReplacement } from "./exerciseLibrary";
import { normalizeCurrentPitchFeelings, normalizeDesiredPitchFeelings } from "./playerDirection";
import type { RunningActivity, RunningActivityDraft } from "@/lib/running/types";
import { fieldMasFromActivity, nextRunningProgressionLevel } from "@/lib/running/engine";
import { expiredUnfinishedSessions } from "./sessionStatus";
import { normalizePersistedPainLocations } from "./profilePainPersistence";
import { ageOnDate } from "./agePolicy";

const initialState: LoadwiseState = {
  profile: null,
  plan: [],
  planGeneratedFor: null,
  readiness: {},
  completions: {},
  history: [],
  modifications: {},
  transitions: {},
  exerciseReplacements: {},
  runningActivities: {},
  equipmentNotice: null,
};

const ONBOARDING_SCHEMA_VERSION = 2;

/**
 * Sprawdza, czy zapisany plan jest zgodny z aktualnymi dniami treningu klubowego.
 * Trening klubowy może wystąpić WYŁĄCZNIE w dniach wybranych w onboardingu
 * (profile.clubTrainingDays, 1=pon ... 7=niedz). Jeśli plan zawiera klub w innym
 * dniu, jest nieaktualny i musi zostać wygenerowany ponownie.
 */

// ---- local-only state, namespaced per user ----
function localKey(userId: string) {
  return `loadwise:v3:${userId}`;
}

interface LocalState {
  readiness: Record<string, Readiness>;
  unavailableEquipmentIds: string[];
  exerciseReplacements: Record<string, ExerciseReplacement[]>;
}

function loadLocal(userId: string): LocalState {
  if (typeof window === "undefined")
    return {
      readiness: {},
      unavailableEquipmentIds: [],
      exerciseReplacements: {},
    };
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw)
      return {
        readiness: {},
        unavailableEquipmentIds: [],
        exerciseReplacements: {},
      };
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return {
      readiness: parsed.readiness ?? {},
      unavailableEquipmentIds: Array.isArray(parsed.unavailableEquipmentIds)
        ? parsed.unavailableEquipmentIds
        : [],
      exerciseReplacements: parsed.exerciseReplacements ?? {},
    };
  } catch {
    return {
      readiness: {},
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

function supabaseErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const row = error as Record<string, unknown>;
    const parts = [
      typeof row.message === "string" ? row.message : null,
      typeof row.details === "string" ? row.details : null,
      typeof row.hint === "string" ? row.hint : null,
      typeof row.code === "string" ? `code: ${row.code}` : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  if (error instanceof Error) return error.message;
  return "Unknown Supabase error";
}

function assertNoSupabaseError(context: string, error: unknown): void {
  if (!error) return;
  throw new Error(`[${context}] ${supabaseErrorMessage(error)}`);
}

async function clearFutureOverlaysForUser(userId: string, fromDate: string): Promise<void> {
  const [modifications, transitions] = await Promise.all([
    supabase
      .from("session_modifications" as never)
      .update({ active: false } as never)
      .eq("user_id", userId)
      .eq("active", true)
      .gte("date", fromDate),
    supabase
      .from("weekly_transitions" as never)
      .delete()
      .eq("user_id", userId),
  ]);
  assertNoSupabaseError("session_modifications.clear_future", modifications.error);
  assertNoSupabaseError("weekly_transitions.clear", transitions.error);
}

function historyCategoryOf(
  sessionType: string | null | undefined,
  dayType: string | null | undefined,
): SessionHistoryCategory | null {
  const normalized = (sessionType ?? "").toLowerCase();
  if (normalized === "testing" || /\btest/.test(normalized)) return null;
  if (dayType === "match" || normalized === "match" || /mecz/.test(normalized)) {
    return "match";
  }
  if (dayType === "club" || normalized === "club_training" || /klub/.test(normalized)) {
    return "club";
  }
  if (normalized === "strength_power" || /sił|moc|power/.test(normalized)) return "gym";
  if (
    normalized === "sprint_acceleration" ||
    normalized === "cod_agility" ||
    /sprint|szybko|agility|cod|motory/.test(normalized)
  ) {
    return "speed";
  }
  if (normalized === "endurance_running" || /wydol|wytrzyma|tlen|rsa/.test(normalized)) {
    return "endurance";
  }
  if (normalized === "football_technical" || /piłk|technik/.test(normalized)) return "ball";
  if (
    dayType === "recovery" ||
    normalized === "recovery" ||
    normalized === "prehab_mobility" ||
    normalized === "activation" ||
    /regener|prehab|mobil|aktywac/.test(normalized)
  ) {
    return "recovery";
  }
  return "gym";
}

async function loadSessionHistory(
  userId: string,
  logRows: AnyRow[],
): Promise<SessionHistoryRecord[]> {
  const completedRows = logRows.filter(
    (row) => Boolean(row.completed) && typeof row.session_id === "string",
  );
  const sessionIds = Array.from(new Set(completedRows.map((row) => row.session_id as string)));
  if (sessionIds.length === 0) return [];

  const sessionRows: AnyRow[] = [];
  for (let i = 0; i < sessionIds.length; i += 200) {
    const result = await supabase
      .from("training_sessions")
      .select("id,training_day_id,session_type,title,duration_min")
      .eq("user_id", userId)
      .in("id", sessionIds.slice(i, i + 200));
    if (result.error) {
      console.warn("[loadwise] session history metadata unavailable", result.error);
      return [];
    }
    sessionRows.push(...((result.data as AnyRow[] | null) ?? []));
  }

  const dayIds = Array.from(
    new Set(
      sessionRows
        .map((row) => row.training_day_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const dayRows: AnyRow[] = [];
  for (let i = 0; i < dayIds.length; i += 200) {
    const result = await supabase
      .from("training_days")
      .select("id,date,day_type")
      .eq("user_id", userId)
      .in("id", dayIds.slice(i, i + 200));
    if (result.error) {
      console.warn("[loadwise] session history dates unavailable", result.error);
      return [];
    }
    dayRows.push(...((result.data as AnyRow[] | null) ?? []));
  }

  const sessionsById = new Map(sessionRows.map((row) => [row.id as string, row]));
  const daysById = new Map(dayRows.map((row) => [row.id as string, row]));
  const history: SessionHistoryRecord[] = [];

  for (const log of completedRows) {
    const key = log.session_id as string;
    const session = sessionsById.get(key);
    if (!session) continue;
    const day = daysById.get(session.training_day_id as string);
    const date = day?.date;
    if (typeof date !== "string") continue;
    const category = historyCategoryOf(
      session.session_type as string | null,
      day?.day_type as string | null,
    );
    if (!category) continue;
    history.push({
      key,
      date,
      title: typeof session.title === "string" && session.title.trim() ? session.title : "Trening",
      category,
      durationMin: typeof session.duration_min === "number" ? session.duration_min : 0,
      rpe: typeof log.rpe === "number" ? log.rpe : null,
      notes: typeof log.notes === "string" ? log.notes : "",
    });
  }

  return history.sort((a, b) => (a.date < b.date ? 1 : -1));
}

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

function buildProfile(
  prof: AnyRow | null,
  ath: AnyRow | null,
  onboardingAnswers: AnyRow | null,
): Profile | null {
  if (!prof || !ath) return null;
  const onboardingRevision =
    (ath.updated_at as string | null) ??
    (ath.created_at as string | null) ??
    (prof.updated_at as string | null) ??
    (prof.created_at as string | null) ??
    null;
  const equipment = (ath.equipment as string[]) ?? [];
  const birthDate = (prof.birth_date as string | null) ?? null;
  const calculatedAge = birthDate ? ageOnDate(birthDate) : null;
  const age = calculatedAge ?? (ath.age as number) ?? 0;
  const requiresGuardianOwner = age >= 13 && age < 16;
  const guardianOwnershipReady =
    ath.account_owner_type === "guardian" &&
    typeof ath.guardian_name === "string" &&
    typeof ath.guardian_email === "string" &&
    typeof ath.guardian_verified_at === "string" &&
    typeof ath.guardian_consent_at === "string";
  return {
    name: (prof.full_name as string) ?? "",
    age,
    birthDate,
    accountOwnerType: ath.account_owner_type === "guardian" ? "guardian" : "athlete",
    subscriptionPayerType: ath.subscription_payer_type === "guardian" ? "guardian" : "self",
    guardianName: (ath.guardian_name as string | null) ?? null,
    guardianEmail: (ath.guardian_email as string | null) ?? null,
    guardianVerifiedAt: (ath.guardian_verified_at as string | null) ?? null,
    guardianConsentAt: (ath.guardian_consent_at as string | null) ?? null,
    ownershipTransferStatus:
      ath.ownership_transfer_status === "pending" ||
      ath.ownership_transfer_status === "completed" ||
      ath.ownership_transfer_status === "not_requested"
        ? ath.ownership_transfer_status
        : "not_applicable",
    ownershipTransferEmail: (ath.ownership_transfer_email as string | null) ?? null,
    ownershipTransferRequestedAt:
      (ath.ownership_transfer_requested_at as string | null) ?? null,
    ownershipTransferredAt: (ath.ownership_transferred_at as string | null) ?? null,
    healthPersonalizationEnabled: Boolean(ath.health_personalization_enabled),
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
    painLocations: normalizePersistedPainLocations(onboardingAnswers?.painLocations),
    doubleSessionsAllowed:
      (ath.double_sessions_allowed as Profile["doubleSessionsAllowed"]) ?? "no",
    guardianConsent: Boolean(ath.guardian_consent),
    onboardingComplete:
      Boolean(prof.onboarding_completed) && (!requiresGuardianOwner || guardianOwnershipReady),
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
    currentPitchFeelings: normalizeCurrentPitchFeelings(ath.current_pitch_feelings),
    desiredPitchFeelings: normalizeDesiredPitchFeelings(ath.desired_pitch_feelings),
    fieldMasKmh:
      ath.field_mas_kmh === null || ath.field_mas_kmh === undefined
        ? null
        : Number(ath.field_mas_kmh),
    fieldMasTestedAt: (ath.field_mas_tested_at as string | null) ?? null,
    runningProgressionLevel: Number(ath.running_progression_level ?? 0),
    runningProgressionUpdatedAt:
      (ath.running_progression_updated_at as string | null) ?? null,
  };
}

function findSessionByDbId(plan: SessionDay[], sessionId: string): SessionDay | null {
  for (const day of plan) {
    if (day.dbId === sessionId) return day;
    if (day.secondSession?.dbId === sessionId) return day.secondSession;
  }
  return null;
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
  const rawSession = row.new_session_json as SessionDay | null;
  const session = rawSession
    ? {
        ...rawSession,
        dbId:
          rawSession.dbId ??
          (typeof row.new_session_id === "string" ? row.new_session_id : undefined),
      }
    : null;
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

function rowToRunningActivity(row: AnyRow): RunningActivity | null {
  const durationSec = Number(row.duration_sec);
  const distanceM = Number(row.distance_m);
  const paceValue = row.avg_pace_sec_per_km;
  const avgPaceSecPerKm = paceValue == null ? null : Number(paceValue);
  if (
    typeof row.id !== "string" ||
    typeof row.session_id !== "string" ||
    typeof row.date !== "string" ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    !Number.isFinite(distanceM) ||
    distanceM < 0 ||
    (avgPaceSecPerKm != null && !Number.isFinite(avgPaceSecPerKm))
  ) {
    return null;
  }
  const timestamp =
    typeof row.created_at === "string" ? row.created_at : `${row.date as string}T12:00:00.000Z`;
  return {
    id: row.id,
    sessionId: row.session_id,
    date: row.date,
    startedAt: timestamp,
    endedAt: timestamp,
    durationSec,
    distanceM,
    avgPaceSecPerKm,
    route: [],
    splits: [],
    intervalResults: [],
    source: "gps",
    createdAt: timestamp,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : timestamp,
  };
}

export async function shouldReusePersistedPlan(
  plan: SessionDay[],
  profile: Profile,
): Promise<boolean> {
  const { persistedPlanNeedsRegeneration } = await import("./persistedPlanValidation");
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
  refreshPlanIfNeeded: () => void;
  completeSession: (
    session: SessionDay,
    rpe: number | null,
    notes: string,
    details?: Pick<SessionCompletion, "durationMin" | "activityType">,
  ) => Promise<void>;
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
  ) => Promise<void>;
  undoExerciseReplacement: (date: string, replacementId: string) => Promise<void>;
  saveRunningActivity: (draft: RunningActivityDraft) => Promise<void>;
  deleteRunningActivity: (activityId: string) => Promise<void>;
  confirmWeeklyTransition: (
    weekNumber: number,
    nextMatchDate: string | null,
    noMatchNextWeek: boolean,
  ) => Promise<void>;
  saveReadiness: (r: Readiness) => Promise<void>;
  todayIso: string;
  todaySession: SessionDay | null;
}

const LoadwiseContext = createContext<LoadwiseContextValue | null>(null);

export function LoadwiseProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, recoveryMode } = useAuth();
  const [state, setState] = useState<LoadwiseState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const generatingRef = useRef(false);
  const replacementInFlightRef = useRef(new Set<string>());
  const missedSyncRef = useRef<string | null>(null);
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
    if (recoveryMode) {
      setHydrated(false);
      return;
    }
    if (!user) {
      setState(initialState);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    (async () => {
      let safeProfile: Profile | null = null;
      const safeLocal: LocalState = loadLocal(user.id);
      try {
        const [profRes, athRes, onboardingRes, planRes, logRes, modRes, transRes, replacementRes, runningRes, readinessRes] =
          await Promise.all([
            supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
            supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle(),
            supabase
              .from("onboarding_answers")
              .select("answers_json")
              .eq("user_id", user.id)
              .order("completed_at", { ascending: false })
              .limit(1)
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
              .select("session_id, completed, completion_status, rpe, notes, duration_minutes, activity_type")
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
            supabase
              .from("running_activities")
              .select("*")
              .eq("user_id", user.id)
              .order("date", { ascending: false }),
            supabase
              .from("readiness_logs")
              .select("date, sleep, energy, fatigue, pain_level, pain_location, overall")
              .eq("user_id", user.id)
              .order("date", { ascending: false })
              .limit(45),
          ]);

        assertNoSupabaseError("profiles.load", profRes.error);
        assertNoSupabaseError("athlete_profiles.load", athRes.error);

        assertNoSupabaseError("onboarding_answers.load", onboardingRes.error);
        const rawOnboardingAnswers = (onboardingRes.data as AnyRow | null)?.answers_json;
        const onboardingAnswers =
          rawOnboardingAnswers &&
          typeof rawOnboardingAnswers === "object" &&
          !Array.isArray(rawOnboardingAnswers)
            ? (rawOnboardingAnswers as AnyRow)
            : null;

        const rowProfile = buildProfile(
          profRes.data as AnyRow | null,
          athRes.data as AnyRow | null,
          onboardingAnswers,
        );
        const local = safeLocal;
        const persistedUnavailableEquipment = (athRes.data as AnyRow | null)
          ?.unavailable_equipment_ids;
        const profile = rowProfile
          ? {
              ...rowProfile,
              unavailableEquipmentIds: Array.isArray(persistedUnavailableEquipment)
                ? (persistedUnavailableEquipment as string[])
                : local.unavailableEquipmentIds,
            }
          : null;
        const runningActivities: Record<string, RunningActivity> = {};
        if (!runningRes.error) {
          for (const row of (runningRes.data as AnyRow[] | null) ?? []) {
            const activity = rowToRunningActivity(row);
            if (activity) runningActivities[activity.sessionId] = activity;
          }
        }
        safeProfile = profile;
        assertNoSupabaseError("training_plans.load", planRes.error);
        assertNoSupabaseError("session_logs.load", logRes.error);
        assertNoSupabaseError("session_modifications.load", modRes.error);
        assertNoSupabaseError("weekly_transitions.load", transRes.error);
        assertNoSupabaseError("readiness_logs.load", readinessRes.error);

        let plan: SessionDay[] = [];
        let migrationOriginalPlan: SessionDay[] | null = null;
        let migrationChanged = false;
        let planGeneratedFor: string | null = null;
        let clearFutureOverlays = false;
        const planRow = planRes.data as AnyRow | null;
        const planRowCreatedAt = (planRow?.created_at as string | undefined) ?? null;
        if (planRow && Array.isArray(planRow.plan_json)) {
          const { normalizeLegacyPersistedPlan } = await import("./dailyCheckin");
          plan = planRow.plan_json as SessionDay[];
          planGeneratedFor = (planRow.created_at as string)?.slice(0, 10) ?? null;
          const normalized = normalizeLegacyPersistedPlan(plan);
          plan = normalized.plan;
          const exerciseMigration = migratePersistedExerciseData(plan);
          if (exerciseMigration.changed) {
            migrationOriginalPlan = plan;
            migrationChanged = true;
            plan = exerciseMigration.plan;
          }
        }
        if (profile && plan.length > 0) {
          const { migratePersistedSpeedSessions } = await import("./speedSessionMigration");
          const persistedCompletions: Record<string, SessionCompletion> = {};
          for (const row of (logRes.data as AnyRow[] | null) ?? []) {
            const sid = row.session_id as string | null;
            if (!sid) continue;
            persistedCompletions[sid] = {
              completed: Boolean(row.completed),
              status: row.completion_status === "missed" ? "missed" : "completed",
              rpe: (row.rpe as number) ?? null,
              notes: (row.notes as string) ?? "",
              durationMin: (row.duration_minutes as number) ?? null,
              activityType: (row.activity_type as SessionCompletion["activityType"]) ?? null,
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
            migrationChanged = true;
          }
        }

        if (!profile?.onboardingComplete) {
          plan = [];
          planGeneratedFor = null;
        } else {
          const { persistedPlanNeedsRegeneration } = await import("./persistedPlanValidation");
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
            const [{ generatePlan }, { persistMonthlyPlan }] = await Promise.all([
              import("./planEngine"),
              import("./persist"),
            ]);
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
            const { persistMonthlyPlan } = await import("./persist");
            plan = stampPlanRevision(plan, profileRevision, ONBOARDING_SCHEMA_VERSION);
            await persistMonthlyPlan(user.id, profile, plan);
            planGeneratedFor = todayIso;
          } else if (migrationOriginalPlan && migrationChanged) {
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
            status: row.completion_status === "missed" ? "missed" : "completed",
            rpe: (row.rpe as number) ?? null,
            notes: (row.notes as string) ?? "",
            durationMin: (row.duration_minutes as number) ?? null,
            activityType: (row.activity_type as SessionCompletion["activityType"]) ?? null,
          };
        }
        const persistedReadiness: Record<string, Readiness> = profile?.healthPersonalizationEnabled
          ? { ...local.readiness }
          : {};
        if (profile?.healthPersonalizationEnabled) {
          for (const row of (readinessRes.data as AnyRow[] | null) ?? []) {
            const date = row.date as string | null;
            if (!date) continue;
            persistedReadiness[date] = {
              date,
              sleep: Number(row.sleep ?? 7),
              energy: Number(row.energy ?? 7),
              fatigue: Number(row.fatigue ?? 4),
              soreness: Number(row.fatigue ?? 4),
              jointPain: Number(row.pain_level ?? 0),
              painLocation: (row.pain_location as Readiness["painLocation"]) ?? null,
              stress: 3,
              motivation: Number(row.energy ?? 7),
              overall: Number(row.overall ?? 7),
            };
          }
        }
        const history = await loadSessionHistory(user.id, (logRes.data as AnyRow[] | null) ?? []);

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
        const persistedEquipment = Object.values(persistedReplacements)
          .flat()
          .flatMap((replacement) => replacement.equipmentIds);

        if (clearFutureOverlays) {
          await clearFutureOverlaysForUser(user.id, todayIso);
        }
        if (cancelled) return;
        setState({
          profile: profile
            ? {
                ...profile,
                unavailableEquipmentIds: Array.from(
                  new Set([...(profile.unavailableEquipmentIds ?? []), ...persistedEquipment]),
                ),
              }
            : profile,
          plan,
          planGeneratedFor,
          readiness: persistedReadiness,
          completions,
          history,
          modifications,
          transitions,
          exerciseReplacements: !replacementRes.error
            ? persistedReplacements
            : local.exerciseReplacements,
          runningActivities,
          equipmentNotice: replacementRes.error
            ? "Nie udało się wczytać zapisanych zamienników sprzętu."
            : null,
        });
        setHydrated(true);
      } catch (error) {
        console.error("[loadwise] hydration failed; using safe persisted state", error);
        if (!cancelled) {
          setState({
            ...initialState,
            profile: safeProfile,
            readiness: safeLocal.readiness,
            exerciseReplacements: safeLocal.exerciseReplacements,
            equipmentNotice:
              "Nie udało się wczytać zapisanej części planu. Twoje dane profilu pozostały bez zmian.",
          });
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, recoveryMode]);

  function persistLocal(next: LoadwiseState) {
    if (user) {
      saveLocal(user.id, {
        readiness: next.readiness,
        unavailableEquipmentIds: next.profile?.unavailableEquipmentIds ?? [],
        exerciseReplacements: next.exerciseReplacements,
      });
    }
  }

  useEffect(() => {
    if (!user || !hydrated) return;
    saveLocal(user.id, {
      readiness: state.readiness,
      unavailableEquipmentIds: state.profile?.unavailableEquipmentIds ?? [],
      exerciseReplacements: state.exerciseReplacements,
    });
  }, [
    user,
    hydrated,
    state.readiness,
    state.profile?.unavailableEquipmentIds,
    state.exerciseReplacements,
  ]);

  // Sesja z poprzedniego dnia nie przenosi się automatycznie. Zapisujemy ją
  // jako pominiętą i przebudowujemy wyłącznie przyszłą część planu.
  useEffect(() => {
    if (!user || !hydrated || !state.profile?.onboardingComplete) return;
    const syncKey = `${user.id}:${todayIso}`;
    if (missedSyncRef.current === syncKey) return;
    const expired = expiredUnfinishedSessions(state.plan, todayIso, state.completions);
    missedSyncRef.current = syncKey;
    if (expired.length === 0) return;

    void (async () => {
      try {
        const now = new Date().toISOString();
        await Promise.all(
          expired.map(async (session) => {
            const result = await supabase.from("session_logs").upsert(
              {
                user_id: user.id,
                session_id: session.dbId!,
                completed: false,
                completion_status: "missed",
                rpe: null,
                notes: "",
                duration_minutes: 0,
                activity_type: null,
                updated_at: now,
              },
              { onConflict: "user_id,session_id" },
            );
            assertNoSupabaseError("session_logs.mark_missed", result.error);
          }),
        );
        const plan = await savePlanToDb(
          state.profile!,
          state.profile!.onboardingRevision ?? null,
          state.readiness[todayIso],
        );
        await clearFutureOverlaysForUser(user.id, todayIso);
        setState((current) => ({
          ...current,
          plan,
          planGeneratedFor: todayIso,
          completions: {
            ...current.completions,
            ...Object.fromEntries(
              expired.map((session) => [
                session.dbId!,
                { completed: false, status: "missed", rpe: null, notes: "", durationMin: 0 },
              ]),
            ),
          },
          modifications: Object.fromEntries(
            Object.entries(current.modifications).filter(([date]) => date < todayIso),
          ),
          transitions: {},
        }));
      } catch (error) {
        missedSyncRef.current = null;
        console.error("[loadwise] missed-session sync failed", error);
      }
    })();
    // savePlanToDb is provider-local; state inputs above are the intended triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, state.plan, state.completions, state.profile, state.readiness, todayIso, user]);

  async function savePlanToDb(
    profile: Profile,
    revision: string | null,
    readinessForToday?: Readiness | null,
  ): Promise<SessionDay[]> {
    const [{ generatePlan }, { applyCheckInToPlanDay }, { persistMonthlyPlan }] = await Promise.all(
      [import("./planEngine"), import("./dailyCheckin"), import("./persist")],
    );
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
    const profileWrite = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        full_name: profile.name,
        birth_date: profile.birthDate ?? null,
        role: profile.accountOwnerType === "guardian" ? "guardian" : "athlete",
        onboarding_completed: completed,
        age_group: profile.age <= 17 ? "youth" : "adult",
      },
      { onConflict: "user_id" },
    );
    assertNoSupabaseError("profiles.upsert", profileWrite.error);
    const athleteRes = await supabase
      .from("athlete_profiles")
      .upsert(
        {
          user_id: user.id,
          account_owner_type: profile.accountOwnerType ?? "athlete",
          subscription_payer_type:
            profile.subscriptionPayerType ?? (profile.age < 18 ? "guardian" : "self"),
          guardian_name: profile.guardianName ?? null,
          guardian_email: profile.guardianEmail ?? null,
          guardian_verified_at: profile.guardianVerifiedAt ?? null,
          guardian_consent_at: profile.guardianConsentAt ?? null,
          ownership_transfer_status: profile.ownershipTransferStatus ?? "not_applicable",
          ownership_transfer_email: profile.ownershipTransferEmail ?? null,
          ownership_transfer_requested_at: profile.ownershipTransferRequestedAt ?? null,
          ownership_transferred_at: profile.ownershipTransferredAt ?? null,
          health_personalization_enabled: Boolean(profile.healthPersonalizationEnabled),
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
          current_pitch_feelings: normalizeCurrentPitchFeelings(profile.currentPitchFeelings),
          desired_pitch_feelings: normalizeDesiredPitchFeelings(profile.desiredPitchFeelings),
          field_mas_kmh: profile.fieldMasKmh ?? null,
          field_mas_tested_at: profile.fieldMasTestedAt ?? null,
          running_progression_level: profile.runningProgressionLevel ?? 0,
          running_progression_updated_at: profile.runningProgressionUpdatedAt ?? null,
        },
        { onConflict: "user_id" },
      )
      .select("updated_at,created_at")
      .maybeSingle();
    assertNoSupabaseError("athlete_profiles.upsert", athleteRes.error);
    return (
      (athleteRes.data?.updated_at as string | undefined) ??
      (athleteRes.data?.created_at as string | undefined) ??
      new Date().toISOString()
    );
  }

  async function completeOnboarding(profile: Profile, consents?: Record<string, boolean>) {
    if (!user) return;
    const revision = await saveProfileRows(profile, false);
    const nextProfile: Profile = {
      ...profile,
      unavailableEquipmentIds:
        state.profile?.unavailableEquipmentIds ?? profile.unavailableEquipmentIds ?? [],
      onboardingComplete: true,
      onboardingRevision: revision,
      onboardingSchemaVersion: ONBOARDING_SCHEMA_VERSION,
    };
    const plan = await savePlanToDb(nextProfile, revision, state.readiness[todayIso]);
    const onboardingAnswersWrite = await supabase.from("onboarding_answers").insert({
      user_id: user.id,
      answers_json: nextProfile as unknown as never,
      completed_at: new Date().toISOString(),
    });
    assertNoSupabaseError("onboarding_answers.insert", onboardingAnswersWrite.error);

    if (consents) {
      const actorType = nextProfile.accountOwnerType === "guardian" ? "guardian" : "athlete";
      const rows = CONSENTS.map((c) => ({
        user_id: user.id,
        consent_type: c.type,
        accepted: Boolean(consents[c.type]),
        version: LEGAL_VERSION,
        text_snapshot: c.text,
        actor_type: actorType,
        actor_email: user.email ?? null,
        scope: c.type === "health_data" ? "readiness_personalization" : c.type,
      }));
      if (nextProfile.accountOwnerType === "guardian") {
        rows.push({
          user_id: user.id,
          consent_type: "guardian_authorization",
          accepted: Boolean(nextProfile.guardianConsent),
          version: LEGAL_VERSION,
          text_snapshot:
            "Oświadczenie, że właściciel konta jest rodzicem lub opiekunem zawodnika i może prowadzić jego profil.",
          actor_type: "guardian",
          actor_email: user.email ?? null,
          scope: "child_profile",
        });
      }
      const consentWrite = await supabase.from("consent_logs").insert(rows);
      assertNoSupabaseError("consent_logs.insert", consentWrite.error);
    }
    if (!nextProfile.healthPersonalizationEnabled) {
      const [readinessDelete, painDelete] = await Promise.all([
        supabase.from("readiness_logs").delete().eq("user_id", user.id),
        supabase.from("pain_logs").delete().eq("user_id", user.id),
      ]);
      assertNoSupabaseError("readiness_logs.consent_cleanup", readinessDelete.error);
      assertNoSupabaseError("pain_logs.consent_cleanup", painDelete.error);
      try {
        const local = loadLocal(user.id);
        window.localStorage.setItem(localKey(user.id), JSON.stringify({ ...local, readiness: {} }));
      } catch {
        window.localStorage.removeItem(localKey(user.id));
      }
    }
    await clearFutureOverlaysForUser(user.id, todayIso);
    const profileCompleteWrite = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, onboarding_completed: true }, { onConflict: "user_id" });
    assertNoSupabaseError("profiles.mark_onboarding_complete", profileCompleteWrite.error);
    setState((s) => ({
      ...s,
      profile: nextProfile,
      plan,
      planGeneratedFor: todayIso,
      readiness: nextProfile.healthPersonalizationEnabled ? s.readiness : {},
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
    await clearFutureOverlaysForUser(user.id, todayIso);
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

  // Nie regenerujemy planu przy każdym otwarciu ekranu.
  function refreshPlanIfNeeded() {
    const profile = state.profile;
    if (!user || !profile?.onboardingComplete) return;
    // Regeneruj tylko, gdy brak planu lub plan pochodzi ze starej wersji
    // generatora (stare fallbacki/statyczne tygodnie nie mogą zostać aktywne).
    if (generatingRef.current) return;
    generatingRef.current = true;
    (async () => {
      try {
        if (await shouldReusePersistedPlan(state.plan, profile)) return;
        const plan = await savePlanToDb(
          profile,
          profile.onboardingRevision ?? null,
          state.readiness[todayIso],
        );
        await clearFutureOverlaysForUser(user.id, todayIso);
        setState((s) => ({
          ...s,
          plan,
          planGeneratedFor: todayIso,
          modifications: Object.fromEntries(
            Object.entries(s.modifications).filter(([date]) => date < todayIso),
          ),
          transitions: {},
        }));
      } catch (error) {
        console.error("[loadwise] plan refresh failed", error);
      } finally {
        generatingRef.current = false;
      }
    })();
  }

  async function completeSession(
    session: SessionDay,
    rpe: number | null,
    notes: string,
    details: Pick<SessionCompletion, "durationMin" | "activityType"> = {},
  ) {
    const sid = session.dbId;
    if (!user || !sid) return;
    const completion: SessionCompletion = {
      completed: true,
      status: "completed",
      rpe,
      notes,
      durationMin: details.durationMin ?? session.durationMin ?? null,
      activityType: details.activityType ?? null,
    };
    const category = historyCategoryOf(session.sessionType, session.dayType);
    const record: SessionHistoryRecord | null = category
      ? {
          key: sid,
          date: session.date,
          title: session.title,
          category,
          durationMin: completion.durationMin ?? session.durationMin ?? 0,
          rpe,
          notes,
        }
      : null;
    const result = await supabase.from("session_logs").upsert(
      {
        user_id: user.id,
        session_id: sid,
        completed: true,
        completion_status: "completed",
        rpe,
        notes,
        duration_minutes: completion.durationMin,
        activity_type: completion.activityType,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,session_id" },
    );
    assertNoSupabaseError("session_logs.upsert", result.error);
    let updatedProfile = state.profile;
    const runningActivity = state.runningActivities[sid];
    if (
      updatedProfile &&
      runningActivity &&
      session.classification?.isEndurance &&
      session.classification.subcategory !== "field_mas_test"
    ) {
      const nextLevel = nextRunningProgressionLevel({
        currentLevel: updatedProfile.runningProgressionLevel ?? 0,
        rpe,
        results: runningActivity.intervalResults,
      });
      if (nextLevel !== (updatedProfile.runningProgressionLevel ?? 0)) {
        const updatedAt = new Date().toISOString();
        updatedProfile = {
          ...updatedProfile,
          runningProgressionLevel: nextLevel,
          runningProgressionUpdatedAt: updatedAt,
        };
      }
    }
    if (updatedProfile && updatedProfile !== state.profile) {
      const revision = await saveProfileRows(updatedProfile, true);
      updatedProfile = { ...updatedProfile, onboardingRevision: revision };
    }
    const refreshedPlan = updatedProfile && updatedProfile !== state.profile
      ? await savePlanToDb(updatedProfile, updatedProfile.onboardingRevision ?? null)
      : state.plan;
    setState((s) => ({
      ...s,
      profile: updatedProfile,
      plan: refreshedPlan,
      planGeneratedFor: updatedProfile !== state.profile ? todayIso : s.planGeneratedFor,
      completions: { ...s.completions, [sid]: completion },
      history: record
        ? [record, ...s.history.filter((item) => item.key !== sid)].sort((a, b) =>
            a.date < b.date ? 1 : -1,
          )
        : s.history,
    }));
  }

  async function saveRunningActivity(draft: RunningActivityDraft) {
    if (!user) throw new Error("Musisz być zalogowany, aby zapisać bieg.");
    const linkedSessionBeforeSave = findSessionByDbId(state.plan, draft.sessionId);
    const pendingFieldMas =
      linkedSessionBeforeSave?.classification?.subcategory === "field_mas_test"
        ? fieldMasFromActivity(draft as RunningActivity)
        : null;
    if (linkedSessionBeforeSave?.classification?.subcategory === "field_mas_test" && !pendingFieldMas) {
      throw new Error("Test 5-minutowy nie ma pełnego, wiarygodnego odcinka GPS. Powtórz test na otwartej przestrzeni.");
    }
    const write = await supabase
      .from("running_activities")
      .upsert(
        {
          user_id: user.id,
          session_id: draft.sessionId,
          date: draft.date,
          duration_sec: draft.durationSec,
          distance_m: draft.distanceM,
          avg_pace_sec_per_km: draft.avgPaceSecPerKm,
          is_field_mas_test:
            linkedSessionBeforeSave?.classification?.subcategory === "field_mas_test",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,session_id" },
      )
      .select("*")
      .single();
    assertNoSupabaseError("running_activities.upsert", write.error);
    const storedActivity = rowToRunningActivity(write.data as AnyRow);
    if (!storedActivity) throw new Error("Baza zwróciła nieprawidłowy zapis biegu.");
    // Trasa i odcinki żyją tylko w pamięci bieżącej sesji. Do bazy trafiają
    // wyłącznie trzy wyniki widoczne dla użytkownika.
    const activity: RunningActivity = {
      ...storedActivity,
      startedAt: draft.startedAt,
      endedAt: draft.endedAt,
      route: draft.route,
      splits: draft.splits,
      intervalResults: draft.intervalResults,
      source: draft.source,
    };
    const linkedSession = findSessionByDbId(state.plan, activity.sessionId);
    let updatedProfile = state.profile;
    if (linkedSession?.classification?.subcategory === "field_mas_test" && updatedProfile) {
      const fieldMasKmh = pendingFieldMas;
      if (!fieldMasKmh) throw new Error("Nie udało się wyliczyć terenowego MAS.");
      const testedAt = activity.date;
      updatedProfile = {
        ...updatedProfile,
        fieldMasKmh,
        fieldMasTestedAt: testedAt,
        runningProgressionLevel: 0,
        runningProgressionUpdatedAt: testedAt,
      };
    }
    if (updatedProfile && updatedProfile !== state.profile) {
      const revision = await saveProfileRows(updatedProfile, true);
      updatedProfile = { ...updatedProfile, onboardingRevision: revision };
    }
    const refreshedPlan = updatedProfile && updatedProfile !== state.profile
      ? await savePlanToDb(updatedProfile, updatedProfile.onboardingRevision ?? null)
      : state.plan;
    setState((current) => ({
      ...current,
      profile: updatedProfile,
      plan: refreshedPlan,
      planGeneratedFor: updatedProfile !== state.profile ? todayIso : current.planGeneratedFor,
      runningActivities: {
        ...current.runningActivities,
        [activity.sessionId]: activity,
      },
    }));
  }

  async function deleteRunningActivity(activityId: string) {
    if (!user) throw new Error("Musisz być zalogowany, aby usunąć bieg.");
    const activity = Object.values(state.runningActivities).find((item) => item.id === activityId);
    const linkedSession = activity ? findSessionByDbId(state.plan, activity.sessionId) : null;
    const remove = await supabase
      .from("running_activities")
      .delete()
      .eq("id", activityId)
      .eq("user_id", user.id);
    assertNoSupabaseError("running_activities.delete", remove.error);
    if (!activity) return;
    let updatedProfile = state.profile;
    let refreshedPlan = state.plan;
    if (linkedSession?.classification?.subcategory === "field_mas_test" && updatedProfile) {
      updatedProfile = {
        ...updatedProfile,
        fieldMasKmh: null,
        fieldMasTestedAt: null,
        runningProgressionLevel: 0,
        runningProgressionUpdatedAt: null,
      };
      const revision = await saveProfileRows(updatedProfile, true);
      updatedProfile = { ...updatedProfile, onboardingRevision: revision };
      refreshedPlan = await savePlanToDb(updatedProfile, revision);
    }
    setState((current) => {
      const runningActivities = { ...current.runningActivities };
      delete runningActivities[activity.sessionId];
      return {
        ...current,
        profile: updatedProfile,
        plan: refreshedPlan,
        planGeneratedFor: refreshedPlan !== current.plan ? todayIso : current.planGeneratedFor,
        runningActivities,
      };
    });
  }

  async function markEquipmentUnavailable(
    date: string,
    exercise: TrainingExercise,
    equipmentIds: string[],
  ) {
    if (!user || exercise.completed) return;
    if ((state.exerciseReplacements[date] ?? []).some((r) => r.exerciseId === exercise.id)) return;
    if (!state.profile) return;
    const replacementKey = `${date}:${exercise.id}`;
    if (replacementInFlightRef.current.has(replacementKey)) return;
    replacementInFlightRef.current.add(replacementKey);
    try {
      const { buildAthleteTrainingProfile } = await import("./athleteProfile");
      const unavailableEquipmentIds = Array.from(
        new Set([...(state.profile.unavailableEquipmentIds ?? []), ...equipmentIds]),
      );
      const athlete = buildAthleteTrainingProfile(state.profile, {
        unavailableEquipmentIds,
      });
      const result = selectEquipmentAwareReplacement(exercise.exerciseId ?? exercise.name, athlete);
      if (!result.exercise || result.blockRebuildRequired) {
        setState((s) => ({
          ...s,
          equipmentNotice:
            "Nie znaleziono bezpiecznego zamiennika. Plan i historia pozostały bez zmian.",
        }));
        return;
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
      const insert = await supabase.from("exercise_replacements" as never).insert({
        id: item.id,
        user_id: user.id,
        date,
        exercise_id: item.exerciseId,
        original_json: item.original,
        replacement_json: item.replacement,
        equipment_ids: item.equipmentIds,
        active: true,
      } as never);
      assertNoSupabaseError("exercise_replacements.insert", insert.error);
      const profileUpdate = await supabase
        .from("athlete_profiles")
        .update({ unavailable_equipment_ids: unavailableEquipmentIds })
        .eq("user_id", user.id);
      if (profileUpdate.error) {
        await supabase
          .from("exercise_replacements" as never)
          .delete()
          .eq("id", item.id)
          .eq("user_id", user.id);
        assertNoSupabaseError("athlete_profiles.equipment", profileUpdate.error);
      }
      setState((s) => ({
        ...s,
        equipmentNotice: null,
        profile: s.profile ? { ...s.profile, unavailableEquipmentIds } : s.profile,
        exerciseReplacements: {
          ...s.exerciseReplacements,
          [date]: [...(s.exerciseReplacements[date] ?? []), item],
        },
      }));
    } catch {
      setState((s) => ({
        ...s,
        equipmentNotice: "Nie udało się zapisać zamiennika. Plan i historia pozostały bez zmian.",
      }));
    } finally {
      replacementInFlightRef.current.delete(replacementKey);
    }
  }

  async function undoExerciseReplacement(date: string, replacementId: string) {
    if (!user) return;
    const current = state.exerciseReplacements[date] ?? [];
    const removed = current.find((replacement) => replacement.id === replacementId);
    if (!removed) return;
    const stillUsed = Object.values(state.exerciseReplacements)
      .flat()
      .some(
        (replacement) =>
          replacement.id !== replacementId &&
          replacement.equipmentIds.some((id) => removed.equipmentIds.includes(id)),
      );
    const unavailableEquipmentIds = stillUsed
      ? (state.profile?.unavailableEquipmentIds ?? [])
      : (state.profile?.unavailableEquipmentIds ?? []).filter(
          (id) => !removed.equipmentIds.includes(id),
        );
    const deactivate = await supabase
      .from("exercise_replacements" as never)
      .update({ active: false } as never)
      .eq("id", replacementId)
      .eq("user_id", user.id);
    assertNoSupabaseError("exercise_replacements.undo", deactivate.error);
    const profileUpdate = await supabase
      .from("athlete_profiles")
      .update({ unavailable_equipment_ids: unavailableEquipmentIds })
      .eq("user_id", user.id);
    if (profileUpdate.error) {
      await supabase
        .from("exercise_replacements" as never)
        .update({ active: true } as never)
        .eq("id", replacementId)
        .eq("user_id", user.id);
      assertNoSupabaseError("athlete_profiles.equipment_undo", profileUpdate.error);
    }
    setState((s) => ({
      ...s,
      equipmentNotice: null,
      profile: s.profile ? { ...s.profile, unavailableEquipmentIds } : s.profile,
      exerciseReplacements: {
        ...s.exerciseReplacements,
        [date]: (s.exerciseReplacements[date] ?? []).filter(
          (replacement) => replacement.id !== replacementId,
        ),
      },
    }));
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
    const trainingDayId =
      originalSession?.dayDbId ?? state.plan.find((day) => day.date === date)?.dayDbId;
    if (!trainingDayId) {
      throw new Error("Brak zapisanego dnia treningowego dla tej sesji.");
    }
    const { persistModifiedSession } = await import("./persist");
    const persistedSession = await persistModifiedSession(user.id, trainingDayId, session);
    const mod: SessionModification = {
      id,
      date,
      type,
      reason,
      safetyStatus,
      session: persistedSession,
      originalSession,
      createdAt: new Date().toISOString(),
    };
    const modificationWrite = await supabase.from("session_modifications" as never).insert({
      id,
      user_id: user.id,
      date,
      type,
      reason,
      safety_status: safetyStatus,
      original_session_id: originalSession?.dbId ?? null,
      new_session_id: persistedSession.dbId ?? null,
      original_session_json: originalSession,
      new_session_json: persistedSession,
      active: true,
    } as never);
    if (modificationWrite.error) {
      await supabase
        .from("training_sessions")
        .delete()
        .eq("id", persistedSession.dbId!)
        .eq("user_id", user.id);
      assertNoSupabaseError("session_modifications.insert", modificationWrite.error);
    }
    if (type === "swap") {
      const deactivate = await supabase
        .from("session_modifications" as never)
        .update({ active: false } as never)
        .eq("user_id", user.id)
        .eq("date", date)
        .eq("type", "swap")
        .neq("id", id);
      if (deactivate.error) {
        await supabase
          .from("session_modifications" as never)
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        await supabase
          .from("training_sessions")
          .delete()
          .eq("id", persistedSession.dbId!)
          .eq("user_id", user.id);
        assertNoSupabaseError("session_modifications.deactivate_previous", deactivate.error);
      }
    }
    setState((current) => {
      const existing = current.modifications[date] ?? [];
      const filtered = type === "swap" ? existing.filter((item) => item.type !== "swap") : existing;
      return {
        ...current,
        modifications: {
          ...current.modifications,
          [date]: [...filtered, mod],
        },
      };
    });
  }

  async function undoModification(date: string, id: string) {
    if (!user) return;
    const modification = (state.modifications[date] ?? []).find((item) => item.id === id);
    const deactivate = await supabase
      .from("session_modifications" as never)
      .update({ active: false } as never)
      .eq("user_id", user.id)
      .eq("id", id);
    assertNoSupabaseError("session_modifications.undo", deactivate.error);
    const modifiedSessionId = modification?.session.dbId;
    if (modifiedSessionId) {
      const logDelete = await supabase
        .from("session_logs")
        .delete()
        .eq("user_id", user.id)
        .eq("session_id", modifiedSessionId);
      assertNoSupabaseError("session_logs.delete_modified", logDelete.error);
      const sessionDelete = await supabase
        .from("training_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("id", modifiedSessionId);
      assertNoSupabaseError("training_sessions.delete_modified", sessionDelete.error);
    }
    setState((current) => {
      const existing = current.modifications[date] ?? [];
      const next = existing.filter((item) => item.id !== id);
      const modifications = { ...current.modifications };
      if (next.length) modifications[date] = next;
      else delete modifications[date];
      const completions = { ...current.completions };
      if (modifiedSessionId) delete completions[modifiedSessionId];
      const runningActivities = { ...current.runningActivities };
      if (modifiedSessionId) delete runningActivities[modifiedSessionId];
      return {
        ...current,
        modifications,
        completions,
        runningActivities,
        history: modifiedSessionId
          ? current.history.filter((item) => item.key !== modifiedSessionId)
          : current.history,
      };
    });
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
    const [{ generatePlan, weekRanges }, { persistMonthlyPlan }] = await Promise.all([
      import("./planEngine"),
      import("./persist"),
    ]);

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

    const transitionWrite = await supabase.from("weekly_transitions" as never).upsert(
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
    assertNoSupabaseError("weekly_transitions.upsert", transitionWrite.error);
    setState((s) => ({
      ...s,
      plan: newPlan,
      transitions: { ...s.transitions, [weekNumber]: transition },
    }));
  }

  async function saveReadiness(r: Readiness) {
    if (!state.profile?.healthPersonalizationEnabled) {
      throw new Error("Check-in jest wyłączony. Włącz opcjonalną personalizację w profilu.");
    }
    const { applyCheckInToPlanDay } = await import("./dailyCheckin");
    if (user) {
      const write = await supabase.from("readiness_logs").upsert({
        user_id: user.id,
        date: r.date,
        sleep: r.sleep,
        energy: r.energy,
        fatigue: r.fatigue,
        pain_level: r.jointPain,
        pain_location: r.painLocation ?? null,
        overall: r.overall,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,date" });
      assertNoSupabaseError("readiness_logs.upsert", write.error);

      const painWrite = r.jointPain > 0
        ? await supabase.from("pain_logs").upsert(
            {
              user_id: user.id,
              date: r.date,
              pain_level: r.jointPain,
              pain_location: r.painLocation ?? null,
              notes: null,
            },
            { onConflict: "user_id,date" },
          )
        : await supabase
            .from("pain_logs")
            .delete()
            .eq("user_id", user.id)
            .eq("date", r.date);
      assertNoSupabaseError("pain_logs.sync", painWrite.error);
    }

    setState((s) => {
      const nextReadiness = { ...s.readiness, [r.date]: r };
      const nextPlan = s.profile
        ? applyCheckInToPlanDay(s.plan, r.date, r, s.profile).plan
        : s.plan;
      const next = { ...s, readiness: nextReadiness, plan: nextPlan };
      persistLocal(next);
      return next;
    });
  }

  const todaySession = state.plan.find((p) => p.date === todayIso) ?? null;

  return (
    <LoadwiseContext.Provider
      value={{
        state,
        hydrated,
        completeOnboarding,
        updateProfile,
        refreshPlanIfNeeded,
        completeSession,
        applyModification,
        undoModification,
        markEquipmentUnavailable,
        undoExerciseReplacement,
        saveRunningActivity,
        deleteRunningActivity,
        confirmWeeklyTransition,
        saveReadiness,
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
