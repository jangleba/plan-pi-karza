import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { FuelWorkspace } from "@/components/fuel/FuelWorkspace";
import { planFuelContexts } from "@/lib/fuel/experience";
import type { FuelDaySource } from "@/components/fuel/FuelWorkspace";
import { useAuth } from "@/lib/loadwise/auth";
import { selectEffectivePlan } from "@/lib/loadwise/effectivePlanSelector";
import { useLoadwise } from "@/lib/loadwise/store";
import "@/styles/fuel-v3.css";
import "@/styles/fuel-v4.css";

export const Route = createFileRoute("/_tabs/fuel")({
  component: FuelScreen,
  head: () => ({
    meta: [
      { title: "Fuel — co zjeść teraz | BallWise" },
      {
        name: "description",
        content:
          "Wybierz czas do treningu, prosty zestaw lub zamiennik. Zapisz produkty, których nie lubisz.",
      },
    ],
  }),
});
function FuelScreen() {
  const { user } = useAuth();
  const { state, todayIso, saveFoodSafety, saveFuelPrecision } = useLoadwise();
  const effectivePlan = useMemo(
    () =>
      selectEffectivePlan(state.plan, state.modifications, {
        profile: state.profile,
        readiness: state.readiness,
        completions: state.completions,
      }),
    [state.plan, state.modifications, state.profile, state.readiness, state.completions],
  );
  const contexts = useMemo(
    () => planFuelContexts(effectivePlan, todayIso, state.completions),
    [effectivePlan, todayIso, state.completions],
  );
  const tomorrow = new Date(`${todayIso}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const tomorrowContext =
    planFuelContexts(effectivePlan, tomorrowIso, state.completions).find(
      (c) => c.kind === "match",
    ) ?? null;
  const profile = state.profile;
  // Allergies and intolerances come from the profile (health-data consent); exclusions are
  // preferences. They stay separate lists and are no longer copied into local dislikes.
  const day = useMemo<FuelDaySource | null>(
    () =>
      profile
        ? {
            plan: effectivePlan,
            completions: state.completions,
            age: profile.age,
            weightKg:
              profile.fuelPrecisionEnabled && profile.age >= 16 ? (profile.weightKg ?? null) : null,
            healthConsent: profile.healthPersonalizationEnabled === true,
            foodSafety: {
              status:
                profile.healthPersonalizationEnabled === true
                  ? (profile.fuelAllergyStatus ?? "unconfirmed")
                  : "unconfirmed",
              allergies:
                profile.healthPersonalizationEnabled === true ? (profile.foodAllergies ?? []) : [],
              intolerances:
                profile.healthPersonalizationEnabled === true
                  ? (profile.foodIntolerances ?? [])
                  : [],
              exclusions: profile.foodExclusions ?? [],
            },
            onSaveFoodSafety: saveFoodSafety,
            onSaveWeight: profile.age >= 16 ? (kg) => saveFuelPrecision(true, kg) : undefined,
          }
        : null,
    [profile, effectivePlan, state.completions, saveFoodSafety, saveFuelPrecision],
  );
  return (
    <FuelWorkspace
      key={user?.id ?? "guest"}
      userId={user?.id ?? "guest"}
      contexts={contexts}
      tomorrowContext={tomorrowContext}
      day={day}
    />
  );
}
