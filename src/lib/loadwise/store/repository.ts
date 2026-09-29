import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import { buildMinimumEffectiveWeek } from "../adaptiveWeek";
import { clearDailyPlanCheckin } from "../dailyPlanCheckin";
import { isoDate, localToday } from "../labels";
import { normalizeMatchDates } from "../matchSchedule";
import { PLAN_ENGINE_VERSION } from "../planVersion";
import { normalizeCurrentPitchFeelings, normalizeDesiredPitchFeelings } from "../playerDirection";
import type { Profile, SessionDay, SessionHistoryRecord } from "../types";
import {
  ONBOARDING_SCHEMA_VERSION,
  historyCategoryOf,
  planRevisionInfo,
  stampPlanRevision,
  type AnyRow,
  type StoreUser,
} from "./model";

export async function clearFutureOverlaysForUser(userId: string, fromDate: string): Promise<void> {
  const [modifications, transitions] = await Promise.all([
    supabase
      .from("session_modifications")
      .update({ active: false })
      .eq("user_id", userId)
      .eq("active", true)
      .gte("date", fromDate),
    supabase.from("weekly_transitions").delete().eq("user_id", userId),
  ]);
  assertNoSupabaseError("session_modifications.clear_future", modifications.error);
  assertNoSupabaseError("weekly_transitions.clear", transitions.error);
  clearDailyPlanCheckin(userId, fromDate);
}

export async function loadSessionHistory(
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

export async function shouldReusePersistedPlan(
  plan: SessionDay[],
  profile: Profile,
): Promise<boolean> {
  const { persistedPlanNeedsRegeneration } = await import("../persistedPlanValidation");
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

export function createPlanPersistence(user: StoreUser, todayIso: string) {
  async function savePlanToDb(
    profile: Profile,
    revision: string | null,
    missedSessions: SessionDay[] = [],
  ): Promise<SessionDay[]> {
    const [{ generatePlan }, { persistMonthlyPlan }] = await Promise.all([
      import("../planEngine"),
      import("../persist"),
    ]);
    const canonical = stampPlanRevision(
      generatePlan(profile, localToday()),
      revision,
      ONBOARDING_SCHEMA_VERSION,
    );
    let plan = canonical;
    if (missedSessions.length > 0) {
      plan = buildMinimumEffectiveWeek(plan, missedSessions, todayIso, profile).plan;
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
          fuel_precision_enabled: Boolean(profile.fuelPrecisionEnabled),
          weight_optional: profile.fuelPrecisionEnabled ? (profile.weightKg ?? null) : null,
          fuel_allergy_status: profile.fuelAllergyStatus ?? "unconfirmed",
          food_allergies: profile.foodAllergies ?? [],
          food_intolerances: profile.foodIntolerances ?? [],
          food_exclusions: profile.foodExclusions ?? [],
          age: profile.age,
          position: profile.position,
          level: profile.level,
          main_goal: profile.goal,
          secondary_limiter: profile.secondaryLimiter,
          equipment: profile.equipment as unknown as Json,
          club_training_days: profile.clubTrainingDays as unknown as Json,
          individual_training_days: profile.individualTrainingDays,
          unavailable_days: profile.unavailableDays as unknown as Json,
          usual_match_day: profile.usualMatchDay === null ? null : String(profile.usualMatchDay),
          match_date: profile.matchDate,
          match_dates: normalizeMatchDates([profile.matchDate, ...(profile.matchDates ?? [])]),
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
  return { savePlanToDb, saveProfileRows };
}
