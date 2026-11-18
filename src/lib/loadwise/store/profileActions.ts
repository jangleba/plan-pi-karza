import {
  cancellableRequest,
  profileCommandKey,
  ProfileSaveTimeout,
  withProfileDeadline,
  type ProfileSaveRefs,
  type ProfileSaveStage,
} from "../profileSave";
import { trainingProfileRevision } from "../planIdentity";
import { withCoachNotesOnly } from "../gymNotesOnly";
import { supabase } from "@/integrations/supabase/client";
import {
  encodeStrengthExperience,
  normalizeStrengthExperience,
  type StrengthExperience,
} from "../strengthExperience";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import type { RefObject } from "react";
import {
  recordConsentDecision,
  recordConsentDecisions,
  type CanonicalConsentType,
  type ConsentDecision,
} from "../consent";
import { CONSENTS } from "../legal";
import type { Profile } from "../types";
import {
  ONBOARDING_SCHEMA_VERSION,
  type LoadwiseContextValue,
  type StoreActionContext,
} from "./model";
import { profileWritePayloads } from "./repository";
import { foodSafetyRow } from "../foodSafety";

export interface FoodSafetyInput {
  status: "unconfirmed" | "confirmed_none" | "has_allergies";
  allergies: string[];
  intolerances: string[];
  exclusions: string[];
}

export function createProfileActions(
  context: StoreActionContext & {
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
  | "saveFoodSafety"
> {
  const { user, state, setState, todayIso } = context;

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

  const writeRefs =
    context.profileSaveRefs?.current ??
    ({ attempt: null, flight: null, key: null } as ProfileSaveRefs);
  const stage = (value: ProfileSaveStage | null) => context.onProfileSaveStage?.(value);
  /** Receipt of a write whose response was lost: the profile row changed since the attempt began. */
  async function confirmSavedProfile(expectedRevision: string | null): Promise<string | null> {
    if (!user) return null;
    try {
      return await withProfileDeadline("saving", 5000, async (signal) => {
        const result = await cancellableRequest(
          supabase
            .from("athlete_profiles")
            .select("updated_at")
            .eq("user_id", user.id)
            .maybeSingle(),
          signal,
        );
        const updatedAt = result.data?.updated_at;
        return !result.error && typeof updatedAt === "string" && updatedAt !== expectedRevision
          ? updatedAt
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
    // Silnik układania tygodnia został usunięty: zapis dotyczy tylko profilu
    // i zgód. Zapisany wcześniej plan w bazie zostaje bez zmian.
    const work = async () => {
      assertOwner();
      const nextProfile = attempt.profile;
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
      const { profileRow, athleteRow } = profileWritePayloads(user.id, nextProfile, true);
      const publish = (updatedAt: string) => {
        assertOwner();
        setState((current) => ({
          ...current,
          profile: { ...nextProfile, serverProfileUpdatedAt: updatedAt },
        }));
        writeRefs.attempt = null;
        if (typeof window !== "undefined")
          window.dispatchEvent(new Event("ballwise:server-state-changed"));
      };
      // A previous try may have committed although its response was lost.
      if (attempt.uncertain) {
        const receipt = await confirmSavedProfile(attempt.expectedRevision);
        if (receipt) {
          publish(receipt);
          return;
        }
      }
      stage("saving");
      attempt.uncertain = true;
      try {
        const saved = await withProfileDeadline("saving", remaining(12000), (signal) =>
          cancellableRequest(
            supabase.rpc("save_profile_and_plan", {
              p_profile: profileRow as unknown as Json,
              p_athlete: athleteRow as unknown as Json,
              p_plan: null,
              p_expected_profile_updated_at: attempt.expectedRevision ?? undefined,
              p_clear_transitions: false,
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
        const receipt = await confirmSavedProfile(attempt.expectedRevision);
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
            "Nie udało się jeszcze potwierdzić zapisu. Odpowiedzi pozostają w formularzu. Spróbuj ponownie.",
            { cause: error },
          );
        throw error;
      }
    };
    const flight = Promise.resolve()
      .then(work)
      .finally(() => {
        writeRefs.flight = null;
        writeRefs.key = null;
        stage(null);
      });
    writeRefs.key = key;
    writeRefs.flight = flight;
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

  /**
   * Allergies and intolerances (health data, need the health-data consent) and ordinary
   * exclusions (a preference, no consent) are saved as three separate lists. The server row is
   * read back: a value the server dropped is never shown as saved.
   */
  async function saveFoodSafety(value: FoodSafetyInput) {
    if (!user || !state.profile) throw new Error("Zaloguj się ponownie.");
    const health = state.profile.healthPersonalizationEnabled === true;
    const wantsHealth =
      value.status !== "unconfirmed" || value.allergies.length > 0 || value.intolerances.length > 0;
    if (wantsHealth && !health)
      throw new Error(
        "Alergie i nietolerancje zapiszesz po włączeniu zgody na dane o zdrowiu w Profilu.",
      );
    if (value.status === "confirmed_none" && value.allergies.length > 0)
      throw new Error("Wybierz: brak alergii albo lista alergii.");
    const row = foodSafetyRow({
      ...state.profile,
      fuelAllergyStatus: value.status,
      foodAllergies: value.status === "has_allergies" ? value.allergies : [],
      foodIntolerances: value.intolerances,
      foodExclusions: value.exclusions,
    });
    if (value.status === "has_allergies" && row.food_allergies.length === 0)
      throw new Error("Dodaj co najmniej jedną alergię albo wybierz inną odpowiedź.");
    const result = await supabase
      .from("athlete_profiles")
      .update(row)
      .eq("user_id", user.id)
      .select("updated_at,fuel_allergy_status,food_allergies,food_intolerances,food_exclusions")
      .maybeSingle();
    assertNoSupabaseError("athlete_profiles.food_safety", result.error);
    if (!result.data) throw new Error("Nie zapisano. Spróbuj ponownie.");
    const saved = result.data as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
    const status =
      saved.fuel_allergy_status === "confirmed_none" ||
      saved.fuel_allergy_status === "has_allergies"
        ? saved.fuel_allergy_status
        : "unconfirmed";
    setState((current) => ({
      ...current,
      profile: current.profile
        ? {
            ...current.profile,
            fuelAllergyStatus: status,
            foodAllergies: list(saved.food_allergies),
            foodIntolerances: list(saved.food_intolerances),
            foodExclusions: list(saved.food_exclusions),
            serverProfileUpdatedAt:
              (saved.updated_at as string) ?? current.profile.serverProfileUpdatedAt,
          }
        : null,
    }));
    if (status !== row.fuel_allergy_status)
      throw new Error("Serwer nie przyjął danych o alergiach: sprawdź zgodę na dane o zdrowiu.");
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
            clubStrengthDays: clean.clubStrengthDays,
            trainingMethodPreferences: withCoachNotesOnly({
              hasGym: current.profile.hasGym,
              trainingMethodPreferences:
                clean.trainingMethodPreferences ?? current.profile.trainingMethodPreferences,
            }).trainingMethodPreferences,
            serverProfileUpdatedAt: profileUpdatedAt,
            onboardingRevision: trainingProfileRevision({ ...current.profile, ...clean }),
          }
        : null,
    }));
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("ballwise:server-state-changed"));
  }

  return {
    completeOnboarding,
    updateProfile,
    saveStrengthExperience,
    saveFuelPrecision,
    saveFoodSafety,
  };
}
