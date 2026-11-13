import { describe, expect, it } from "vitest";
import { healthFieldsForOnboarding } from "./onboardingHealth";
import type { Profile } from "./types";

describe("health state while saving general onboarding answers", () => {
  const existing: Pick<Profile, "healthPersonalizationEnabled" | "painInjury" | "painLocations"> = {
    healthPersonalizationEnabled: true,
    painInjury: true,
    painLocations: ["knee", "hamstring"],
  };

  it.each([false, true])("starts without inferred pain when new consent is %s", (consent) => {
    expect(healthFieldsForOnboarding(null, consent)).toEqual({
      painInjury: false,
      painLocations: [],
    });
  });

  it("preserves the injury block and locations when editing with consent still active", () => {
    const fields = healthFieldsForOnboarding(existing, true);
    expect(fields).toEqual({ painInjury: true, painLocations: ["knee", "hamstring"] });
    expect(fields.painLocations).not.toBe(existing.painLocations);
    fields.painLocations!.push("ankle");
    expect(existing.painLocations).toEqual(["knee", "hamstring"]);
  });

  it("keeps an existing pain-free profile pain-free", () => {
    expect(
      healthFieldsForOnboarding({ ...existing, painInjury: false, painLocations: [] }, true),
    ).toEqual({ painInjury: false, painLocations: [] });
  });

  it("clears sensitive pain fields when consent is withdrawn", () => {
    expect(healthFieldsForOnboarding(existing, false)).toEqual({
      painInjury: false,
      painLocations: [],
    });
    expect(existing.painInjury).toBe(true);
  });

  it("does not restore stale pain fields when health consent is newly enabled", () => {
    expect(
      healthFieldsForOnboarding({ ...existing, healthPersonalizationEnabled: false }, true),
    ).toEqual({ painInjury: false, painLocations: [] });
  });
});
