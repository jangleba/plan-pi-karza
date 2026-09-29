import { supabase } from "@/integrations/supabase/client";
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
import { loadLocal, localKey } from "./localState";
import {
  ONBOARDING_SCHEMA_VERSION,
  type LoadwiseContextValue,
  type StoreActionContext,
} from "./model";
import { clearFutureOverlaysForUser, shouldReusePersistedPlan } from "./repository";

export function createProfileActions(
  context: StoreActionContext & {
    generatingRef: RefObject<boolean>;
    setPlanGenerating: Dispatch<SetStateAction<boolean>>;
  },
): Pick<
  LoadwiseContextValue,
  "completeOnboarding" | "updateProfile" | "saveFuelPrecision" | "refreshPlanIfNeeded"
> {
  const {
    user,
    state,
    setState,
    todayIso,
    saveProfileRows,
    savePlanToDb,
    generatingRef,
    setPlanGenerating,
  } = context;

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

  function commitProfilePlan(nextProfile: Profile, plan: SessionDay[]) {
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

  async function completeOnboarding(profile: Profile, consents?: Record<string, boolean>) {
    if (!user) return;
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
      await recordConsentDecisions(decisions);
    }
    const revision = await saveProfileRows(profile, false);
    const nextProfile = completedProfile(profile, revision);
    const plan = await savePlanToDb(nextProfile, revision);
    const onboardingAnswersWrite = await supabase.from("onboarding_answers").insert({
      user_id: user.id,
      // Dane profilu mają własne kolumny w profiles/athlete_profiles. Ten wpis
      // jest tylko śladem ukończenia wersji formularza, bez kopii zdrowia,
      // masy, bólu, preferencji żywieniowych i całego planu.
      answers_json: {
        schema_version: ONBOARDING_SCHEMA_VERSION,
        completed: true,
        account_owner_type: nextProfile.accountOwnerType ?? "athlete",
      } as unknown as Json,
      completed_at: new Date().toISOString(),
    });
    assertNoSupabaseError("onboarding_answers.insert", onboardingAnswersWrite.error);
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
    commitProfilePlan(nextProfile, plan);
  }

  async function updateProfile(profile: Profile) {
    if (!user) return;
    const revision = await saveProfileRows(profile, true);
    const nextProfile = completedProfile(profile, revision);
    const plan = await savePlanToDb(nextProfile, revision);
    await clearFutureOverlaysForUser(user.id, todayIso);
    commitProfilePlan(nextProfile, plan);
  }

  async function saveFuelPrecision(enabled: boolean, weightKg: number | null) {
    if (!user || !state.profile) return;
    if (enabled && (weightKg == null || weightKg < 25 || weightKg > 250)) {
      throw new Error("Podaj masę od 25 do 250 kg.");
    }

    await recordConsentDecision({ type: "fuel_precision", accepted: enabled });

    const profileWrite = await supabase
      .from("athlete_profiles")
      .update({
        fuel_precision_enabled: enabled,
        weight_optional: enabled ? weightKg : null,
      })
      .eq("user_id", user.id);
    assertNoSupabaseError("athlete_profiles.fuel_precision", profileWrite.error);

    setState((current) => ({
      ...current,
      profile: current.profile
        ? {
            ...current.profile,
            fuelPrecisionEnabled: enabled,
            weightKg: enabled ? weightKg : null,
          }
        : null,
    }));
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
        setPlanGenerating(false);
      }
    })();
  }
  return { completeOnboarding, updateProfile, saveFuelPrecision, refreshPlanIfNeeded };
}
