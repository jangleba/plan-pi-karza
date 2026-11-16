import { describe, expect, it } from "vitest";
import { planUnavailableForAge, PLAN_MINIMUM_AGE } from "./agePolicy";
import { generateTrainingPlan } from "./engineV2/planner";
import { sessionStartIssue } from "./engineV2/planStatus";
import { gymAthlete } from "./engineV2/testFixtures";
import { ENGINE_VERSION } from "./engineV2/model";
import type { Profile } from "./types";

describe("plan age gate: existing accounts under 16 keep the account, not the plan", () => {
  it.each([13, 14, 15])("age %i: no plan, a clear message", (age) => {
    const p = { ...gymAthlete, age } as Profile;
    expect(planUnavailableForAge(p)).toContain(`od ${PLAN_MINIMUM_AGE} lat`);
    expect(() => generateTrainingPlan(p, { startDate: "2026-11-16", weeks: 1 })).toThrow(
      /od 16 lat/,
    );
  });

  it.each([16, 17, 21])("age %i: plan available", (age) => {
    expect(planUnavailableForAge({ age })).toBeNull();
  });

  it("a saved session cannot be started by an account under 16", () => {
    const adult = { ...gymAthlete, age: 20 } as Profile;
    const plan = generateTrainingPlan(adult, { startDate: "2026-11-16", weeks: 1 }).plan;
    const session = plan.find((d) => d.engineV2)!;
    expect(session.generatorVersion).toBe(ENGINE_VERSION);
    const issue = sessionStartIssue({
      session,
      profile: { ...adult, age: 15 } as Profile,
      todayIso: session.date,
    });
    expect(issue).toContain("od 16 lat");
  });
});
