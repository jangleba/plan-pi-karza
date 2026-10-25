import { trainingProfileRevision } from "../planIdentity";
import { supabase } from "@/integrations/supabase/client";
import {
  encodeStrengthExperience,
  normalizeStrengthExperience,
  type StrengthExperience,
} from "../strengthExperience";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  recordConsentDecision,
  recordConsentDecisions,
  type CanonicalConsentType,
  type ConsentDecision,
} from "../consent";
import { CONSENTS } from "../legal";
import type { Profile, SessionDay } from "../types";
import { prepareMonthlyPlan } from "../persist";
import {
  ONBOARDING_SCHEMA_VERSION,
  type LoadwiseContextValue,
  type StoreActionContext,
} from "./model";
import {
  clearFutureOverlaysForUser,
  profileWritePayloads,
  shouldReusePersistedPlan,
} from "./repository";

export function createProfileActions(
  context: StoreActionContext & {
    generatingRef: RefObject<boolean>;
    setPlanGenerating: Dispatch<SetStateAction<boolean>>;
  },
): Pick<
  LoadwiseContextValue,
  | "completeOnboarding"
  | "updateProfile"
  | "saveStrengthExperience"
  | "saveFuelPrecision"
  | "refreshPlanIfNeeded"
> {
  const { user, state, setState, todayIso, savePlanToDb, generatingRef, setPlanGenerating } =
    context;

  function completedProfile(profile: Profile, revision: string | null): Profile {
    return {
      ...profile,
      unavailableEquipmentIds:
        state.profile?.unavailableEquipmentIds ?? profile.unavailableEquipmentIds ?? [],
      onboardingComplete: true,
      onboardingRevision: revision,
      onboardingSchemaVersion: ONBOARDING_SCHEMA_VERSION,
    };
  }

  function commitProfilePlan(nextProfile: Profile, plan: SessionDay[], clearTransitions = true) {
    setState((s) => ({
      ...s,
      profile: nextProfile,
      plan,
      planGeneratedFor: todayIso,
      readiness: nextProfile.healthPersonalizationEnabled ? s.readiness : {},
      modifications: Object.fromEntries(
        Object.entries(s.modifications).filter(([date]) => date < todayIso),
      ),
      transitions: clearTransitions ? {} : s.transitions,
    }));
  }

  async function completeOnboarding(profile: Profile, consents?: Record<string, boolean>) {
    if (!user) return;
    let expectedRevision = (context.getState?.() ?? state).profile?.serverProfileUpdatedAt ?? null;
    // Consent is persisted before enabling optional health processing. The DB
    // trigger then refuses health mode unless the latest audit row is accepted.
    if (consents) {
      const decisions: ConsentDecision[] = [];
      if (profile.accountOwnerType === "guardian") {
        decisions.push({
          type: "guardian_authorization",
          accepted: Boolean(profile.guardianConsent),
        });
      }
      decisions.push(
        ...CONSENTS.map((consent) => ({
          type: consent.type as CanonicalConsentType,
          accepted: Boolean(consents[consent.type]),
        })),
      );
      expectedRevision =
        (await recordConsentDecisions(decisions, expectedRevision)) ?? expectedRevision;
    }
    await updateProfile(
      { ...state.profile, ...profile, createdAt: state.profile?.createdAt ?? profile.createdAt },
      expectedRevision,
    );
  }

  async function updateProfile(profile: Profile, expectedRevision?: string | null) {
    if (!user) return;
    const before = context.getState?.() ?? state;
    let nextProfile = completedProfile(profile, null);
    const revision = trainingProfileRevision(nextProfile);
    nextProfile = { ...nextProfile, onboardingRevision: revision };
    const trainingChanged =
      !before.profile ||
      !before.profile.onboardingComplete ||
      trainingProfileRevision(before.profile) !== revision;
    const calendar = (p: Profile) =>
      JSON.stringify([
        p.clubTrainingDays,
        p.individualTrainingDays,
        p.unavailableDays,
        p.usualMatchDay,
        p.matchDate,
        p.matchDates,
      ]);
    const clearTransitions = !before.profile || calendar(before.profile) !== calendar(nextProfile);
    const plan = trainingChanged
      ? await savePlanToDb(nextProfile, revision, [], {}, !clearTransitions, false)
      : before.plan;
    const prepared = trainingChanged ? prepareMonthlyPlan(user.id, nextProfile, plan) : null;
    const { profileRow, athleteRow } = profileWritePayloads(user.id, nextProfile, true);
    const saved = await supabase.rpc("save_profile_and_plan", {
      p_profile: profileRow as unknown as Json,
      p_athlete: athleteRow as unknown as Json,
      p_plan: prepared ? (prepared.args as unknown as Json) : null,
      p_expected_profile_updated_at:
        (expectedRevision !== undefined
          ? expectedRevision
          : before.profile?.serverProfileUpdatedAt) ?? undefined,
      p_clear_transitions: trainingChanged && clearTransitions,
      p_from_date: todayIso,
    });
    assertNoSupabaseError("save_profile_and_plan", saved.error);
    const response = saved.data as Record<string, unknown> | null;
    const athlete = response?.athlete as Record<string, unknown> | undefined;
    nextProfile = {
      ...nextProfile,
      serverProfileUpdatedAt:
        (athlete?.updated_at as string | undefined) ?? nextProfile.serverProfileUpdatedAt,
    };
    if (trainingChanged) commitProfilePlan(nextProfile, prepared!.plan, clearTransitions);
    else setState((current) => ({ ...current, profile: nextProfile }));
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("ballwise:server-state-changed"));
  }

  async function saveFuelPrecision(enabled: boolean, weightKg: number | null) {
    if (!user || !state.profile) return;
    if (enabled && (weightKg == null || weightKg < 25 || weightKg > 250)) {
      throw new Error("Podaj masę od 25 do 250 kg.");
    }

    const expectedRevision =
      (context.getState?.() ?? state).profile?.serverProfileUpdatedAt ?? null;
    const consentRevision = await recordConsentDecision(
      { type: "fuel_precision", accepted: enabled },
      expectedRevision,
    );
    if (!enabled) {
      setState((current) => ({
        ...current,
        profile: current.profile
          ? {
              ...current.profile,
              fuelPrecisionEnabled: false,
              weightKg: null,
              serverProfileUpdatedAt: consentRevision ?? current.profile.serverProfileUpdatedAt,
            }
          : null,
      }));
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("ballwise:server-state-changed"));
      return;
    }

    const profileWrite = await supabase
      .from("athlete_profiles")
      .update({
        fuel_precision_enabled: enabled,
        weight_optional: enabled ? weightKg : null,
      })
      .eq("user_id", user.id)
      .select("user_id,updated_at")
      .maybeSingle();
    assertNoSupabaseError("athlete_profiles.fuel_precision", profileWrite.error);
    if (!profileWrite.data) throw new Error("Nie zapisano ustawienia Fuel. Odśwież konto.");
    const profileUpdatedAt = profileWrite.data.updated_at;

    setState((current) => ({
      ...current,
      profile: current.profile
        ? {
            ...current.profile,
            fuelPrecisionEnabled: enabled,
            weightKg: enabled ? weightKg : null,
            serverProfileUpdatedAt: profileUpdatedAt,
          }
        : null,
    }));
  }

  async function saveStrengthExperience(value: StrengthExperience) {
    if (!user || !state.profile) throw new Error("Zaloguj się ponownie.");
    const clean = normalizeStrengthExperience(value);
    const result = await supabase
      .from("athlete_profiles")
      .update({ training_experience: encodeStrengthExperience(clean) })
      .eq("user_id", user.id)
      .select("user_id,updated_at")
      .maybeSingle();
    assertNoSupabaseError("athlete_profiles.strength_experience", result.error);
    if (!result.data) throw new Error("Nie zapisano doświadczenia. Spróbuj ponownie.");
    const profileUpdatedAt = result.data.updated_at;
    // No history, set log, calendar or current workout progress is reset here.
    setState((current) => ({
      ...current,
      profile: current.profile
        ? {
            ...current.profile,
            gymExperienceLevel: clean.gymExperienceLevel,
            strengthTrainingMonths: clean.strengthTrainingMonths,
            movementCompetence: clean.movementCompetence,
            supervisionLevel: clean.supervisionLevel,
            serverProfileUpdatedAt: profileUpdatedAt,
            onboardingRevision: trainingProfileRevision({ ...current.profile, ...clean }),
          }
        : null,
    }));
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("ballwise:server-state-changed"));
  }

  function refreshPlanIfNeeded() {
    const profile = state.profile;
    if (!user || !profile?.onboardingComplete) return;
    // Regeneruj tylko, gdy brak planu lub plan pochodzi ze starej wersji
    // generatora (stare fallbacki/statyczne tygodnie nie mogą zostać aktywne).
    if (generatingRef.current) return;
    generatingRef.current = true;
    setPlanGenerating(true);
    (async () => {
      try {
        if (await shouldReusePersistedPlan(state.plan, profile)) return;
        const plan = await savePlanToDb(profile, profile.onboardingRevision ?? null);
        await clearFutureOverlaysForUser(user.id, todayIso, false);
        setState((s) => ({
          ...s,
          plan,
          planGeneratedFor: todayIso,
          modifications: Object.fromEntries(
            Object.entries(s.modifications).filter(([date]) => date < todayIso),
          ),
          transitions: s.transitions,
        }));
      } catch (error) {
        console.error("[loadwise] plan refresh failed", error);
      } finally {
        generatingRef.current = false;
        setPlanGenerating(false);
      }
    })();
  }
  return {
    completeOnboarding,
    updateProfile,
    saveStrengthExperience,
    saveFuelPrecision,
    refreshPlanIfNeeded,
  };
}
