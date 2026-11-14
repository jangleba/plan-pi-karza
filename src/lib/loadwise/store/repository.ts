import { supabase } from "@/integrations/supabase/client";
import { encodeStrengthExperience } from "../strengthExperience";
import type { Json } from "@/integrations/supabase/types";
import { normalizeMatchDates } from "../matchSchedule";
import { normalizeCurrentPitchFeelings, normalizeDesiredPitchFeelings } from "../playerDirection";
import type { Profile, SessionHistoryRecord } from "../types";
import { historyCategoryOf, type AnyRow } from "./model";

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
      durationMin:
        typeof log.duration_minutes === "number"
          ? log.duration_minutes
          : typeof session.duration_min === "number"
            ? session.duration_min
            : 0,
      durationEstimated:
        typeof log.duration_minutes !== "number" || log.duration_source === "club_default",
      matchMinutesPlayed:
        typeof log.match_minutes_played === "number" ? log.match_minutes_played : null,
      rpe: typeof log.rpe === "number" ? log.rpe : null,
      notes: typeof log.notes === "string" ? log.notes : "",
    });
  }

  return history.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function profileWritePayloads(userId: string, profile: Profile, completed: boolean) {
  return {
    profileRow: {
      user_id: userId,
      full_name: profile.name,
      birth_date: profile.birthDate ?? null,
      role: profile.accountOwnerType === "guardian" ? "guardian" : "athlete",
      onboarding_completed: completed,
      age_group: profile.age <= 17 ? "youth" : "adult",
    },
    athleteRow: {
      user_id: userId,
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
      // Fuel keeps no allergy data; old values move to the local dislikes list.
      fuel_allergy_status: "unconfirmed",
      food_allergies: [],
      food_intolerances: [],
      food_exclusions: [],
      age: profile.age,
      position: profile.position,
      level: profile.level,
      ...(encodeStrengthExperience(profile) != null
        ? { training_experience: encodeStrengthExperience(profile) }
        : {}),
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
      pain_locations: profile.healthPersonalizationEnabled ? (profile.painLocations ?? []) : [],
      double_sessions_allowed: profile.doubleSessionsAllowed,
      guardian_consent: profile.guardianConsent,
      season_phase: profile.seasonPhase,
      season_phase_override: profile.seasonPhaseOverride === true,
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
      field_mas_source_session_id: profile.fieldMasSourceSessionId ?? null,
      running_progression_level: profile.runningProgressionLevel ?? 0,
      running_progression_updated_at: profile.runningProgressionUpdatedAt ?? null,
    },
  };
}
