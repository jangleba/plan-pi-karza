import { describe, expect, it } from "vitest";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { DRILL_SETS, MAIN_VARIANTS, variantById } from "./sprintCatalog";
import { sprintChronology, sprintDistance } from "./sprintRecipe";
import type { Profile, SessionDay } from "../types";

const base = {
  name: "Rotation athlete",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [2, 4, 6],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "machine",
    "band",
    "bench",
    "med_ball",
    "nordic_setup",
  ],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
  trainingMethodPreferences: { spaceLengthM: 60 },
} as unknown as Profile;
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const sprints = (p: Profile, weeks = 4, extra = {}) =>
  generateTrainingPlan(p, { startDate: "2026-11-02", weeks, ...extra })
    .plan.flatMap(slots)
    .filter((s) => s.engineV2?.roles.includes("speed"));
const withPrefs = (prefs: Record<string, unknown>, patch: Partial<Profile> = {}) =>
  ({ ...base, ...patch, trainingMethodPreferences: { spaceLengthM: 60, ...prefs } }) as Profile;

describe("sprint rotation across sessions", () => {
  it("each sprint session keeps one stored triple of drills in rounds, and records its variant and reasons", () => {
    for (const s of sprints(base)) {
      const v = s.engineV2!.sprintVariant!;
      expect(v.mainVariantId).toBeTruthy();
      expect(v.drillSetId).toBeTruthy();
      expect(v.why.length).toBeGreaterThan(0);
      const set = DRILL_SETS.find((d) => d.id === v.drillSetId)!;
      const drills = s.engineV2!.exercises.filter((e) => e.dose.circuit);
      expect(drills.map((e) => e.exerciseId)).toEqual(set.drills);
      const chrono = sprintChronology(s.engineV2!.exercises).filter((e) => e.dose.circuit);
      const rounds = drills[0].dose.sets;
      expect(chrono).toHaveLength(3 * rounds);
      // A/B/C, A/B/C, A/B/C with the same exercises in every round
      expect(chrono.map((e) => e.exerciseId)).toEqual(
        Array.from({ length: rounds }, () => set.drills).flat(),
      );
    }
  });

  it("neighbouring sessions of the same goal get a different drill set and a different main variant", () => {
    const list = sprints(base, 4);
    expect(list.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1].engineV2!.sprintVariant!;
      const b = list[i].engineV2!.sprintVariant!;
      expect(b.drillSetId).not.toBe(a.drillSetId);
      expect(b.mainVariantId).not.toBe(a.mainVariantId);
    }
    // meaningful change: another exercise or another distance / start, not a renamed copy
    const ids = new Set(list.map((s) => s.engineV2!.sprintVariant!.mainVariantId));
    expect(ids.size).toBeGreaterThan(1);
  });

  it("is deterministic: the same inputs give the same sessions, and a stored plan is unchanged by a round trip", () => {
    const a = sprints(base);
    const b = sprints(base);
    expect(JSON.stringify(a.map((s) => s.engineV2!.sprintVariant))).toBe(
      JSON.stringify(b.map((s) => s.engineV2!.sprintVariant)),
    );
    const stored = JSON.parse(JSON.stringify(a)) as SessionDay[];
    expect(JSON.stringify(stored)).toBe(JSON.stringify(a));
  });

  it("history decides: a second plan continues the rotation instead of repeating the last session", () => {
    const first = generateTrainingPlan(base, { startDate: "2026-11-02", weeks: 2 }).plan;
    const last = first
      .flatMap(slots)
      .filter((s) => s.engineV2?.sprintVariant)
      .at(-1)!.engineV2!.sprintVariant!;
    const next = generateTrainingPlan(base, {
      startDate: "2026-11-16",
      weeks: 1,
      previousPlan: first,
      precedingDays: first,
    })
      .plan.flatMap(slots)
      .find((s) => s.engineV2?.sprintVariant)!.engineV2!.sprintVariant!;
    expect(next.mainVariantId).not.toBe(last.mainVariantId);
    expect(next.drillSetId).not.toBe(last.drillSetId);
  });

  it("a started session is not changed by a rebuild (locked execution keeps its stored variant)", () => {
    const plan = generateTrainingPlan(base, { startDate: "2026-11-02", weeks: 2 }).plan;
    const target = plan.flatMap(slots).find((s) => s.engineV2?.sprintVariant)!;
    const before = JSON.stringify(target.engineV2);
    // the stored object is what the runner reads; regenerating a plan never mutates it
    generateTrainingPlan({ ...base, goal: "agility" } as Profile, {
      startDate: "2026-11-02",
      weeks: 2,
      previousPlan: plan,
    });
    expect(JSON.stringify(target.engineV2)).toBe(before);
  });
});

describe("variants are qualified by level, age, space, equipment and partner", () => {
  it("a 13-year-old beginner only receives simple start variants, two rounds and no resisted work", () => {
    const young = withPrefs({}, {
      age: 13,
      level: "beginner",
      gymExperienceLevel: "beginner",
      strengthTrainingMonths: 0,
      movementCompetence: "medium",
    } as Partial<Profile>);
    for (const s of sprints(young)) {
      const v = s.engineV2!.sprintVariant!;
      expect(variantById(v.mainVariantId)!.simple).toBe(true);
      expect(s.engineV2!.exercises.find((e) => e.dose.circuit)!.dose.sets).toBe(2);
      expect(s.engineV2!.exercises.some((e) => e.dose.speedStage === "resisted")).toBe(false);
    }
  });

  it("reactive work needs a declared partner; without one it never appears", () => {
    const wants = { sprintFocus: "reactive" };
    const without = sprints(withPrefs(wants));
    expect(without.some((s) => s.engineV2!.sprintGoal === "reactive")).toBe(false);
    const withPartner = sprints(withPrefs({ ...wants, declaredEquipment: ["partner"] }));
    expect(withPartner.length).toBeGreaterThan(0);
    for (const s of withPartner) {
      expect(s.engineV2!.sprintGoal).toBe("reactive");
      expect(s.title).toContain("z partnerem");
    }
  });

  it("a long flying run needs 60 m; planned change of direction is separate from braking, curve and reactive", () => {
    const short = sprints(withPrefs({ sprintFocus: "max_velocity", spaceLengthM: 50 }));
    expect(short.every((s) => s.engineV2!.sprintVariant!.mainVariantId === "mv_flying_20_10")).toBe(
      true,
    );
    const long = sprints(withPrefs({ sprintFocus: "max_velocity", spaceLengthM: 70 }));
    expect(new Set(long.map((s) => s.engineV2!.sprintVariant!.mainVariantId))).toEqual(
      new Set(["mv_flying_20_10", "mv_flying_30_10"]),
    );
    const goals = ["acceleration", "curve", "braking", "planned_cod"].map(
      (f) => sprints(withPrefs({ sprintFocus: f }), 1)[0].engineV2!.sprintGoal,
    );
    expect(goals).toEqual(["acceleration", "curve", "braking", "planned_cod"]);
  });

  it("the wall set appears only when a wall is declared", () => {
    const noWall = sprints(base).map((s) => s.engineV2!.sprintVariant!.drillSetId);
    expect(noWall).not.toContain("ds_start_wall");
  });

  it("a lighter week returns to the simplest, shortest variants", () => {
    const light = sprints({ ...base, secondaryLimiter: "fatigue" } as Profile);
    for (const s of light)
      expect(variantById(s.engineV2!.sprintVariant!.mainVariantId)!.simple).toBe(true);
  });
});

describe("every catalogue variant has a complete dose, instruction and counted distance", () => {
  it("passes the independent validator, counts all fast metres within 240 m and states rest and stop rule", () => {
    for (const variant of MAIN_VARIANTS) {
      const focus = {
        acceleration: "acceleration",
        max_velocity: "max_velocity",
        curve: "curve",
        braking: "braking",
        planned_cod: "planned_cod",
        reactive: "reactive",
      }[variant.goal];
      const prefs = { sprintFocus: focus, spaceLengthM: 70, declaredEquipment: ["partner"] };
      const seen = new Set<string>();
      let earlier: SessionDay[] = [];
      // consecutive four-week plans, each seeing the history of the previous ones
      for (let block = 0; block < 4 && !seen.has(variant.id); block++) {
        const start = new Date(Date.UTC(2026, 10, 2 + block * 28)).toISOString().slice(0, 10);
        const p = withPrefs(prefs);
        const result = generateTrainingPlan(p, {
          startDate: start,
          weeks: 4,
          previousPlan: earlier,
          precedingDays: earlier,
        });
        for (const s of result.plan.flatMap(slots).filter((x) => x.engineV2?.sprintVariant)) {
          seen.add(s.engineV2!.sprintVariant!.mainVariantId);
          expect(sprintDistance(s.engineV2!.exercises)).toBeLessThanOrEqual(240);
        }
        expect(
          validateTrainingPlan(result.plan, p, {
            startDate: start,
            minutesPerSession: 75,
            precedingDays: earlier,
          }),
        ).toEqual([]);
        earlier = [...earlier, ...result.plan];
      }
      expect(seen.has(variant.id)).toBe(true);
      // each variant states rest, set-up and when to stop in its own words
      const env = {
        age: 24,
        level: "advanced",
        prepared: true,
        coached: true,
        reduced: false,
        hasPitch: true,
        space: 70,
        distance: 20,
        partner: true,
        phase: "development",
      };
      const dose = variant.dose(env);
      expect(dose.restSeconds).toBeGreaterThanOrEqual(60);
      expect(dose.sets).toBeGreaterThan(0);
      expect(variant.instruction(env).length).toBeGreaterThan(40);
    }
  });
});

describe("validator guards the stored variant", () => {
  it("rejects a recipe whose stored variant or drills no longer match", () => {
    const p = base;
    const result = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 });
    expect(
      validateTrainingPlan(result.plan, p, { startDate: "2026-11-02", minutesPerSession: 75 }),
    ).toEqual([]);
    const tampered = structuredClone(result.plan);
    const s = tampered.flatMap(slots).find((x) => x.engineV2?.sprintVariant)!;
    s.engineV2!.sprintVariant!.drillSetId = "ds_mv_dribble";
    const issues = validateTrainingPlan(tampered, p, {
      startDate: "2026-11-02",
      minutesPerSession: 75,
    });
    expect(issues.some((i) => i.code === "SPRINT_VARIANT_MISMATCH")).toBe(true);
  });
});
