import { expect, it } from "vitest";
import { buildRunning } from "./exercises";
import { generateTrainingPlan, placeRecipeOnDate } from "./planner";
import { sprintChronology, sprintDistance } from "./sprintRecipe";
import { sessionExercises } from "../sessionExecution";
import { resolveHowTo } from "../sessionRunner/howTo";
import { MAIN_VARIANTS } from "./sprintCatalog";
import type { Profile } from "../types";
const p: Profile = {
  name: "Sprint",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
  movementCompetence: "high",
  supervisionLevel: "full",
  gymExperienceLevel: "none",
  strengthTrainingMonths: 0,
  trainingMethodPreferences: { spaceLengthM: 50 },
};

function rendered(id: string, drillSetId = "ds_start_basic") {
  const variant = MAIN_VARIANTS.find((v) => v.id === id)!;
  const profile = {
    ...p,
    trainingMethodPreferences: {
      spaceLengthM: 60,
      sprintFocus: variant.goal,
      declaredEquipment: ["partner", "wall"],
    },
  } as Profile;
  const recipe = buildRunning(profile, "speed", "development", {
    force: { goal: variant.goal, mainVariantId: id, drillSetId, addition: null, why: [] },
  })!;
  const options = { startDate: "2026-11-02", weeks: 1 };
  const empty = generateTrainingPlan({ ...profile, painInjury: true }, options).plan;
  const out = placeRecipeOnDate(empty, options.startDate, recipe, profile, options);
  if ("blocked" in out) throw new Error(out.blocked.message);
  return { recipe, session: out.session, rows: sessionExercises(out.session) };
}
it("gives the athlete the actual 5+5 m prescription, rather than the library's 8-10+8-10 m", () => {
  const { rows } = rendered("brake_accel_decel");
  const main = rows.find((r) => r.engineDose?.speedStage === "main")!;
  const steps = resolveHowTo(main).steps.join(" ");
  expect(main.displayPrescription).toBe("6 × 10 m");
  expect(steps).toContain("5 m");
  expect(steps).not.toContain("8–10");
});
it("executes six separate progressive braking trials with real distances and recovery", () => {
  const { recipe, rows } = rendered("brake_progressive_5_10_15");
  const attempts = rows.filter((r) => r.engineDose?.speedStage === "main");
  expect(attempts.map((r) => r.engineDose?.distanceM)).toEqual([5, 10, 15, 5, 10, 15]);
  expect(attempts.every((r) => r.engineDose?.sets === 1 && r.engineDose.restSeconds === 120)).toBe(
    true,
  );
  expect(new Set(attempts.map((r) => r.id)).size).toBe(6);
  expect(sprintDistance(recipe.exercises.filter((e) => e.dose.speedStage === "main"))).toBe(60);
});
it("counts the three 10 m accelerations inside the technical rounds", () => {
  const { recipe } = rendered("accel_free", "ds_start_transition");
  const technical = sprintChronology(recipe.exercises).filter((e) => e.dose.circuit);
  expect(technical.filter((e) => e.exerciseId === "dribble_to_sprint_transition")).toHaveLength(3);
  expect(sprintDistance(technical)).toBe(30);
});
it.each(MAIN_VARIANTS.map((v) => v.id))("keeps actual instructions pinned for %s", (id) => {
  const { session, rows } = rendered(id);
  const main = rows.filter((e) => e.engineDose?.speedStage === "main");
  expect(main.length).toBeGreaterThan(0);
  for (const e of main)
    expect(resolveHowTo(e).steps.join(" ")).toContain(e.purpose!.replace(/\s+/g, " ").trim());
  expect(JSON.parse(JSON.stringify(session)).structuredSections).toEqual(
    session.structuredSections,
  );
});
