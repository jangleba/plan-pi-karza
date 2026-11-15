import { describe, expect, it } from "vitest";
import { buildAthleteTrainingProfile, getInjuryConstraints } from "./athleteProfile";
import type { Profile } from "./types";

/** A past injury is context, not a limitation; current pain is the active limitation. */
describe("past injury vs active limitation", () => {
  it("a past knee injury without current pain restricts nothing", () => {
    const c = getInjuryConstraints({ healthPersonalizationEnabled: true, injuryHistory: ["knee"] });
    expect(c.avoidPatterns).toEqual([]);
    expect(c.hasAnyPain).toBe(false);
    expect(c.contraindications.join(" ")).toContain("Dawny uraz (kolano)");
    expect(c.contraindications.join(" ")).not.toMatch(/Ból kolana/);
  });

  it("current knee pain is an active limitation", () => {
    const c = getInjuryConstraints({ painLocations: ["knee"], injuryHistory: ["knee"] });
    expect(c.avoidPatterns).toContain("heavy_squat");
    expect(c.contraindications.join(" ")).toContain("Ból kolana");
    expect(c.contraindications.join(" ")).not.toContain("Dawny uraz");
  });

  it("the exercise filter follows only the active limitation", () => {
    const base = { age: 22, level: "advanced", healthPersonalizationEnabled: true } as Profile;
    const past = buildAthleteTrainingProfile({ ...base, injuryHistory: ["hamstring"] });
    expect(past.currentPain).toEqual([]);
    expect(past.injuryHistory).toEqual(["hamstring"]);
    const active = buildAthleteTrainingProfile({ ...base, painLocations: ["hamstring"] });
    expect(active.currentPain).toEqual(["hamstring"]);
  });

  it("without health consent neither is used", () => {
    const p = buildAthleteTrainingProfile({
      age: 22,
      healthPersonalizationEnabled: false,
      painLocations: ["knee"],
      injuryHistory: ["knee"],
    } as Profile);
    expect(p.currentPain).toEqual([]);
    expect(p.injuryHistory).toEqual([]);
  });
});
