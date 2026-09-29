import type { RunningActivity, RunningActivityDraft } from "@/lib/running/types";
import type { Dispatch, SetStateAction } from "react";
import { ageOnDate } from "../agePolicy";
import { normalizeMatchDates } from "../matchSchedule";
import { normalizeCurrentPitchFeelings, normalizeDesiredPitchFeelings } from "../playerDirection";
import { normalizePersistedPainLocations } from "../profilePainPersistence";
import type {
  ExerciseItem,
  ExerciseReplacement,
  LoadwiseState,
  ModificationType,
  Profile,
  Readiness,
  SessionCompletion,
  SessionDay,
  SessionHistoryCategory,
  SessionModification,
  SessionStatus,
  TrainingExercise,
} from "../types";

export const initialState: LoadwiseState = {
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
  planChangeEvents: [],
};

export const ONBOARDING_SCHEMA_VERSION = 2;

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

export type AnyRow = Record<string, unknown>;

export function historyCategoryOf(
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

export function buildProfile(
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
    ownershipTransferRequestedAt: (ath.ownership_transfer_requested_at as string | null) ?? null,
    ownershipTransferredAt: (ath.ownership_transferred_at as string | null) ?? null,
    healthPersonalizationEnabled: Boolean(ath.health_personalization_enabled),
    fuelPrecisionEnabled: Boolean(ath.fuel_precision_enabled),
    weightKg:
      ath.fuel_precision_enabled === true && typeof ath.weight_optional === "number"
        ? ath.weight_optional
        : null,
    fuelAllergyStatus:
      ath.fuel_allergy_status === "confirmed_none" || ath.fuel_allergy_status === "has_allergies"
        ? ath.fuel_allergy_status
        : "unconfirmed",
    foodAllergies: (ath.food_allergies as string[]) ?? [],
    foodIntolerances: (ath.food_intolerances as string[]) ?? [],
    foodExclusions: (ath.food_exclusions as string[]) ?? [],
    position: ath.position as Profile["position"],
    level: normalizeLevel(ath.level),
    goal: normalizeGoal(ath.main_goal),
    secondaryLimiter: normalizeLimiter(ath.secondary_limiter),
    clubTrainingDays: (ath.club_training_days as number[]) ?? [],
    individualTrainingDays: (ath.individual_training_days as number[]) ?? [],
    unavailableDays: (ath.unavailable_days as number[]) ?? [],
    usualMatchDay: parseUsualMatchDay(ath.usual_match_day),
    matchDate: (ath.match_date as string) ?? null,
    matchDates: normalizeMatchDates([
      ath.match_date as string | null,
      ...(Array.isArray(ath.match_dates) ? (ath.match_dates as string[]) : []),
    ]),
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
    runningProgressionUpdatedAt: (ath.running_progression_updated_at as string | null) ?? null,
  };
}

export function findSessionByDbId(plan: SessionDay[], sessionId: string): SessionDay | null {
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

export function stampPlanRevision(
  plan: SessionDay[],
  revision: string | null,
  schemaVersion: number,
): SessionDay[] {
  return plan.map((day) => stampDayRevision(day, revision, schemaVersion));
}

export function planRevisionInfo(plan: SessionDay[]): {
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

export function rowToModification(row: AnyRow): SessionModification | null {
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

export function rowToExerciseReplacement(row: AnyRow): ExerciseReplacement | null {
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

export function rowToRunningActivity(row: AnyRow): RunningActivity | null {
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

export interface LoadwiseContextValue {
  state: LoadwiseState;
  hydrated: boolean;
  completeOnboarding: (profile: Profile, consents?: Record<string, boolean>) => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  saveFuelPrecision: (enabled: boolean, weightKg: number | null) => Promise<void>;
  refreshPlanIfNeeded: () => void;
  /** Trwa generowanie/zapisywanie planu — ekrany pokazują wtedy stan ładowania. */
  planGenerating: boolean;
  startSession: (session: SessionDay) => Promise<void>;
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
    nextMatchDates: string[],
    noMatchNextWeek: boolean,
  ) => Promise<void>;
  saveReadiness: (r: Readiness) => Promise<void>;
  todayIso: string;
  todaySession: SessionDay | null;
}

export function mapCompletionRows(rows: AnyRow[]): Record<string, SessionCompletion> {
  const completions: Record<string, SessionCompletion> = {};
  for (const row of rows) {
    const sid = row.session_id as string | null;
    if (!sid) continue;
    completions[sid] = {
      completed: Boolean(row.completed),
      status:
        row.completion_status === "missed"
          ? "missed"
          : row.completion_status === "started"
            ? "started"
            : "completed",
      rpe: (row.rpe as number) ?? null,
      notes: (row.notes as string) ?? "",
      durationMin: (row.duration_minutes as number) ?? null,
      activityType: (row.activity_type as SessionCompletion["activityType"]) ?? null,
      startedAt: (row.started_at as string | null) ?? null,
      endedAt: (row.ended_at as string | null) ?? null,
    };
  }
  return completions;
}

export type StoreUser = { id: string } | null;
export type StateSetter = Dispatch<SetStateAction<LoadwiseState>>;
export interface StoreActionContext {
  user: StoreUser;
  state: LoadwiseState;
  setState: StateSetter;
  todayIso: string;
  saveProfileRows: (profile: Profile, completed: boolean) => Promise<string | null>;
  savePlanToDb: (
    profile: Profile,
    revision: string | null,
    missedSessions?: SessionDay[],
  ) => Promise<SessionDay[]>;
}
