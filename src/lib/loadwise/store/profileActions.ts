import {
  cancellableRequest,
  profileCommandKey,
  ProfileSaveTimeout,
  withProfileDeadline,
  type ProfileSaveRefs,
  type ProfileSaveStage,
} from "../profileSave";
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
    profileSaveRefs?: RefObject<ProfileSaveRefs>;
    onProfileSaveStage?: (stage: ProfileSaveStage | null) => void;
    isProfileOwnerCurrent?: () => boolean;
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

  const writeRefs =
    context.profileSaveRefs?.current ??
    ({ attempt: null, flight: null, key: null } as ProfileSaveRefs);
  const stage = (value: ProfileSaveStage | null) => context.onProfileSaveStage?.(value);
  async function confirmSavedPlan(
    attempt: NonNullable<ProfileSaveRefs["attempt"]>,
  ): Promise<string | null> {
    if (!attempt.prepared || !user) return null;
    try {
      return await withProfileDeadline("verification", 5000, async (signal) => {
        const result = await cancellableRequest(
          supabase
            .from("training_plans")
            .select("id")
            .eq("user_id", user.id)
            .eq("id", attempt.prepared!.args.p_plan_id)
            .eq("active", true)
            .maybeSingle(),
          signal,
        );
        if (result.error || result.data?.id !== attempt.prepared!.args.p_plan_id) return null;
        const profile = await cancellableRequest(
          supabase
            .from("athlete_profiles")
            .select("updated_at")
            .eq("user_id", user.id)
            .maybeSingle(),
          signal,
        );
        return !profile.error && typeof profile.data?.updated_at === "string"
          ? profile.data.updated_at
          : null;
      });
    } catch {
      return null;
    }
  }
  function completeOnboarding(profile: Profile, consents?: Record<string, boolean>) {
    return writeProfile(
      { ...state.profile, ...profile, createdAt: state.profile?.createdAt ?? profile.createdAt },
      consents,
    );
  }
  function updateProfile(profile: Profile, expectedRevision?: string | null) {
    return writeProfile(profile, undefined, expectedRevision);
  }
  function writeProfile(
    profile: Profile,
    consents?: Record<string, boolean>,
    expectedRevision?: string | null,
  ): Promise<void> {
    if (!user) return Promise.reject(new Error("Zaloguj się ponownie przed zapisaniem planu."));
    const key = profileCommandKey(user.id, profile, consents);
    if (writeRefs.flight) {
      return writeRefs.key === key
        ? writeRefs.flight
        : Promise.reject(new Error("Trwa zapisywanie poprzedniej zmiany. Poczekaj na wynik."));
    }
    const before = context.getState?.() ?? state;
    if (writeRefs.attempt?.key !== key) {
      const next = completedProfile(profile, null),
        revision = trainingProfileRevision(next);
      writeRefs.attempt = {
        key,
        profile: { ...next, onboardingRevision: revision },
        revision,
        expectedRevision:
          (expectedRevision !== undefined
            ? expectedRevision
            : before.profile?.serverProfileUpdatedAt) ?? null,
      };
    }
    const attempt = writeRefs.attempt!,
      deadline = Date.now() + 25000;
    const remaining = (limit: number) => Math.max(1, Math.min(limit, deadline - Date.now()));
    const assertOwner = () => {
      if (context.isProfileOwnerCurrent?.() === false)
        throw new Error("Konto zmieniło się podczas zapisu. Otwórz formularz ponownie.");
    };
    const work = async () => {
      assertOwner();
      let nextProfile = attempt.profile;
      const trainingChanged =
        !before.profile ||
        !before.profile.onboardingComplete ||
        trainingProfileRevision(before.profile) !== attempt.revision;
      const calendar = (p: Profile) =>
        JSON.stringify([
          p.clubTrainingDays,
          p.individualTrainingDays,
          p.unavailableDays,
          p.usualMatchDay,
          p.matchDate,
          p.matchDates,
        ]);
      const clearTransitions =
        !before.profile || calendar(before.profile) !== calendar(nextProfile);
      const publish = (updatedAt: string) => {
        assertOwner();
        nextProfile = { ...nextProfile, serverProfileUpdatedAt: updatedAt };
        if (trainingChanged)
          commitProfilePlan(nextProfile, attempt.prepared!.plan, clearTransitions);
        else setState((current) => ({ ...current, profile: nextProfile }));
        writeRefs.attempt = null;
        if (typeof window !== "undefined")
          window.dispatchEvent(new Event("ballwise:server-state-changed"));
      };
      if (attempt.uncertain) {
        stage("verification");
        const receipt = await confirmSavedPlan(attempt);
        if (receipt) {
          publish(receipt);
          return;
        }
      }
      if (consents && !attempt.consentsDone) {
        stage("consents");
        const decisions: ConsentDecision[] = [];
        if (nextProfile.accountOwnerType === "guardian")
          decisions.push({
            type: "guardian_authorization",
            accepted: Boolean(nextProfile.guardianConsent),
          });
        decisions.push(
          ...CONSENTS.map((consent) => ({
            type: consent.type as CanonicalConsentType,
            accepted: Boolean(consents[consent.type]),
          })),
        );
        attempt.expectedRevision =
          (await withProfileDeadline("consents", remaining(10000), (signal) =>
            recordConsentDecisions(decisions, attempt.expectedRevision, {
              notify: false,
              signal,
              fromIndex: attempt.consentIndex ?? 0,
              onAcknowledged: (count, revision) => {
                attempt.consentIndex = count;
                attempt.expectedRevision = revision ?? attempt.expectedRevision;
              },
            }),
          )) ?? attempt.expectedRevision;
        attempt.consentsDone = true;
      }
      assertOwner();
      if (trainingChanged && !attempt.prepared) {
        stage("generation");
        const plan = await withProfileDeadline("generation", remaining(12000), (signal) =>
          savePlanToDb(nextProfile, attempt.revision, [], {}, !clearTransitions, false, signal),
        );
        attempt.prepared = prepareMonthlyPlan(user.id, nextProfile, plan);
      }
      assertOwner();
      const { profileRow, athleteRow } = profileWritePayloads(user.id, nextProfile, true);
      stage("saving");
      attempt.uncertain = true;
      try {
        const saved = await withProfileDeadline("saving", remaining(12000), (signal) =>
          cancellableRequest(
            supabase.rpc("save_profile_and_plan", {
              p_profile: profileRow as unknown as Json,
              p_athlete: athleteRow as unknown as Json,
              p_plan: attempt.prepared ? (attempt.prepared.args as unknown as Json) : null,
              p_expected_profile_updated_at: attempt.expectedRevision ?? undefined,
              p_clear_transitions: trainingChanged && clearTransitions,
              p_from_date: todayIso,
            }),
            signal,
          ),
        );
        assertNoSupabaseError("save_profile_and_plan", saved.error);
        const response = saved.data as Record<string, unknown> | null,
          athlete = response?.athlete as Record<string, unknown> | undefined;
        if (typeof athlete?.updated_at !== "string")
          throw new Error("Serwer nie zwrócił potwierdzenia zapisu.");
        publish(athlete.updated_at);
      } catch (error) {
        stage("verification");
        const receipt = await confirmSavedPlan(attempt);
        if (receipt) {
          publish(receipt);
          return;
        }
        if (
          error instanceof ProfileSaveTimeout ||
          /timeout|timed out|upstream|failed to fetch|network/i.test(
            error instanceof Error ? error.message : String(error),
          )
        )
          throw new Error(
            "Nie udało się jeszcze potwierdzić zapisu planu. Odpowiedzi pozostają w formularzu. Spróbuj ponownie — najpierw sprawdzimy zapis, bez ponownego układania planu.",
          );
        throw error;
      }
    };
    writeRefs.key = key;
    writeRefs.flight = Promise.resolve()
      .then(work)
      .finally(() => {
        writeRefs.flight = null;
        writeRefs.key = null;
        stage(null);
      });
    return writeRefs.flight;
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
    const clean = normalizeStrengthExperience({
      ...value,
      trainingMethodPreferences:
        value.trainingMethodPreferences ?? state.profile.trainingMethodPreferences,
    });
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
            trainingMethodPreferences:
              clean.trainingMethodPreferences ?? current.profile.trainingMethodPreferences,
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
