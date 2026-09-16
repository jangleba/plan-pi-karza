import { describe, expect, it } from "vitest";
import { fuelTargetRange, recommendMeals } from "./recommendations";
import type { FuelSessionInput } from "./types";
import type { Profile } from "@/lib/loadwise/types";

const session: FuelSessionInput = {
  kind: "speed",
  intensity: "wysoka",
  durationMin: 60,
  minutesToStart: null,
  title: "Sprint",
  subtitle: null,
  date: "2026-09-16",
  startClock: null,
  dayLabel: "Dzisiaj",
};

describe("Fuel recommendations", () => {
  it("prefers genuinely quick meals close to the session", () => {
    const meals = recommendMeals({ session, minutes: 35, profile: null, limit: 2 });
    expect(meals[0].minLeadMinutes).toBeLessThanOrEqual(45);
  });

  it("filters declared restrictions", () => {
    const profile = { foodAllergies: ["banan"] } as Profile;
    const meals = recommendMeals({ session, minutes: 45, profile, limit: 8 });
    expect(meals.every((meal) => !meal.text.includes("banan"))).toBe(true);
  });

  it("uses body mass only when Fuel Precision is enabled", () => {
    const basic = fuelTargetRange({
      session,
      minutes: 90,
      profile: { fuelPrecisionEnabled: false, weightKg: 80 } as Profile,
    });
    const precise = fuelTargetRange({
      session,
      minutes: 90,
      profile: { fuelPrecisionEnabled: true, weightKg: 80 } as Profile,
    });
    expect(basic.precise).toBe(false);
    expect(precise.precise).toBe(true);
    expect(precise.carbMaxG).toBe(80);
  });
});
