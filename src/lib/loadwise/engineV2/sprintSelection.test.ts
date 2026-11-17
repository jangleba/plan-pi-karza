import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import { buildRunning } from "./exercises";
import type { SprintGoal, SprintVariantRef } from "./model";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";

const base = {
  ...gymAthlete,
  age: 24,
  level: "advanced",
  goal: "speed",
  hasPitch: true,
  hasSprintSpace: true,
  movementCompetence: "high",
  supervisionLevel: "full",
  doubleSessionsAllowed: "no",
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  equipment: ["band", "dumbbell", "barbell", "rack", "bench"],
} as unknown as Profile;
const withPrefs = (patch: object, profile: Partial<Profile> = {}) =>
  ({
    ...base,
    ...profile,
    trainingMethodPreferences: { ...(base.trainingMethodPreferences ?? {}), ...patch },
  }) as Profile;
const sprint = (
  p: Profile,
  context: Parameters<typeof buildRunning>[3] = {},
  phase: "development" | "deload" = "development",
) => buildRunning(p, "speed", phase, context)!;
const ref = (goal: SprintGoal, id = "x"): SprintVariantRef => ({
  goal,
  mainVariantId: id,
  drillSetId: "ds_start_basic",
  addition: null,
  why: [],
});

describe("sprint goal selection never swaps a goal without a recorded cause", () => {
  it("lets a coached speed athlete with a declared long straight run flying sprints", () => {
    const s = sprint(withPrefs({ spaceLengthM: 70 }));
    expect(s.sprintGoal).toBe("max_velocity");
    expect(s.sprintVariant?.goalChange).toBeUndefined();
  });

  it("explains an acceleration session chosen instead of flying when the straight is undeclared", () => {
    const s = sprint(withPrefs({}));
    expect(s.sprintGoal).toBe("acceleration");
    expect(s.sprintVariant?.requestedGoal).toBe("max_velocity");
    expect(s.sprintVariant?.goalChange?.code).toBe("SPACE_UNDECLARED");
    expect(s.sprintVariant?.goalChange?.reason).toMatch(/nie zadeklarowano długości prostej/);
    expect(s.sprintVariant?.why.join(" ")).toMatch(/zamiast „lotny sprint/);
  });

  it("names the short straight, a missing coach, the phase and a lighter week", () => {
    const code = (p: Profile, phase: "development" | "deload" = "development") =>
      sprint(p, {}, phase).sprintVariant?.goalChange?.code;
    expect(code(withPrefs({ spaceLengthM: 40 }))).toBe("SPACE_SHORT");
    expect(code(withPrefs({ spaceLengthM: 70 }, { supervisionLevel: "none" }))).toBe("NOT_COACHED");
    expect(code(withPrefs({ spaceLengthM: 70 }), "deload")).toBe("REDUCED_WEEK");
    expect(code(withPrefs({ spaceLengthM: 70 }, { secondaryLimiter: "fatigue" }))).toBe(
      "REDUCED_WEEK",
    );
  });

  it("applies the same rule to an explicit flying request", () => {
    const s = sprint(withPrefs({ sprintFocus: "max_velocity" }));
    expect(s.sprintGoal).toBe("acceleration");
    expect(s.sprintVariant?.goalChange?.code).toBe("SPACE_UNDECLARED");
  });

  it.each(["curve", "braking", "planned_cod", "reactive"] as const)(
    "selects %s with the declared pitch, space, competence and partner",
    (goal) => {
      const s = sprint(
        withPrefs({ sprintFocus: goal, spaceLengthM: 60, declaredEquipment: ["partner"] }),
      );
      expect(s.sprintGoal).toBe(goal);
      expect(s.sprintVariant?.goalChange).toBeUndefined();
    },
  );

  it("says why a directional task falls back: pitch, space, competence, partner", () => {
    const why = (patch: object, profile: Partial<Profile> = {}) =>
      sprint(withPrefs(patch, profile)).sprintVariant?.goalChange?.code;
    const curve = { sprintFocus: "curve", spaceLengthM: 60 };
    expect(why(curve, { hasPitch: false })).toBe("NO_PITCH");
    expect(why({ sprintFocus: "curve" })).toBe("SPACE_UNDECLARED");
    expect(why({ ...curve, spaceLengthM: 30 })).toBe("SPACE_SHORT");
    expect(why(curve, { movementCompetence: "medium" })).toBe("COMPETENCE");
    expect(why({ sprintFocus: "reactive", spaceLengthM: 60 })).toBe("NO_PARTNER");
  });

  it("an explicit acceleration choice stays acceleration without any change record", () => {
    const s = sprint(withPrefs({ sprintFocus: "acceleration", spaceLengthM: 70 }));
    expect(s.sprintGoal).toBe("acceleration");
    expect(s.sprintVariant?.goalChange).toBeUndefined();
  });
});

describe("automatic rotation follows the cycle goal and the history", () => {
  const p = withPrefs({ spaceLengthM: 70 });
  it("leads with the cycle goal, then makes room for the other qualified task", () => {
    expect(sprint(p, { history: [] }).sprintGoal).toBe("max_velocity");
    const twice = [ref("max_velocity"), ref("max_velocity")];
    expect(sprint(p, { history: twice }).sprintGoal).toBe("acceleration");
    // After an acceleration session the cycle goal returns.
    expect(sprint(p, { history: [...twice, ref("acceleration")] }).sprintGoal).toBe("max_velocity");
  });

  it("rotates the agility tasks that qualify and records the reason", () => {
    const agile = withPrefs(
      { spaceLengthM: 60, declaredEquipment: ["partner"] },
      { goal: "agility" },
    );
    const seen: SprintGoal[] = [];
    let history: SprintVariantRef[] = [];
    for (let i = 0; i < 7; i++) {
      const s = sprint(agile, { history });
      seen.push(s.sprintGoal!);
      history = [...history, s.sprintVariant!];
    }
    expect(new Set(seen).size).toBeGreaterThan(2);
    expect(seen.filter((g) => g === "planned_cod").length).toBeGreaterThanOrEqual(2);
    expect(seen).toContain("braking");
    for (const g of seen) expect(["planned_cod", "braking", "curve", "reactive"]).toContain(g);
  });

  it("never rotates away from the player's explicit choice", () => {
    const explicit = withPrefs({ sprintFocus: "max_velocity", spaceLengthM: 70 });
    const history = [ref("max_velocity"), ref("max_velocity"), ref("max_velocity")];
    expect(sprint(explicit, { history }).sprintGoal).toBe("max_velocity");
  });

  it("does not make a non-speed goal run flying sprints", () => {
    const power = withPrefs({ spaceLengthM: 70 }, { goal: "strength" });
    expect(sprint(power).sprintGoal).toBe("acceleration");
    expect(sprint(power).sprintVariant?.goalChange).toBeUndefined();
  });
});

describe("approved library drills are reachable by goal, level, place and equipment", () => {
  const ids = (s: ReturnType<typeof sprint>) => s.exercises.map((e) => e.exerciseId);

  it("uses B skip in a drill set for a prepared adult, never for a beginner", () => {
    let history: SprintVariantRef[] = [];
    const used = new Set<string>();
    const p = withPrefs({ spaceLengthM: 70 });
    for (let i = 0; i < 12; i++) {
      const s = sprint(p, { history });
      for (const id of ids(s)) used.add(id);
      history = [...history, s.sprintVariant!];
    }
    expect(used.has("b_skip")).toBe(true);
    const beginner = withPrefs({ spaceLengthM: 70 }, { level: "beginner", age: 17 });
    let beginnerHistory: SprintVariantRef[] = [];
    for (let i = 0; i < 12; i++) {
      const s = sprint(beginner, { history: beginnerHistory });
      expect(ids(s)).not.toContain("b_skip");
      beginnerHistory = [...beginnerHistory, s.sprintVariant!];
    }
  });

  it("uses the wicket run only with declared markers, a coach and a long enough lane", () => {
    const withMarkers = withPrefs({ spaceLengthM: 70, declaredEquipment: ["flat_markers"] });
    let history: SprintVariantRef[] = [];
    const mains: string[] = [];
    for (let i = 0; i < 8; i++) {
      const s = sprint(withMarkers, { history });
      mains.push(s.exercises.find((e) => e.dose.speedStage === "main")!.exerciseId);
      history = [...history, s.sprintVariant!];
    }
    expect(mains).toContain("wicket_run");
    for (const p of [
      withPrefs({ spaceLengthM: 70 }), // no markers
      withPrefs(
        { spaceLengthM: 70, declaredEquipment: ["flat_markers"] },
        { supervisionLevel: "none" },
      ),
      withPrefs({ spaceLengthM: 45, declaredEquipment: ["flat_markers"] }),
    ]) {
      let h: SprintVariantRef[] = [];
      for (let i = 0; i < 8; i++) {
        const s = sprint(p, { history: h });
        expect(ids(s)).not.toContain("wicket_run");
        h = [...h, s.sprintVariant!];
      }
    }
  });

  it("adds the resisted A march only with a partner and a band, in acceleration, not in a light week", () => {
    const acceleration = { sprintFocus: "acceleration", declaredEquipment: ["partner"] };
    const s = sprint(withPrefs(acceleration, { equipment: [...base.equipment, "band"] }));
    const row = s.exercises.find((e) => e.exerciseId === "resisted_a_march")!;
    expect(row.dose.speedStage).toBe("resisted");
    expect(s.exercises.indexOf(row)).toBeLessThan(
      s.exercises.findIndex((e) => e.dose.speedStage === "main"),
    );
    expect(ids(sprint(withPrefs({ sprintFocus: "acceleration" })))).not.toContain(
      "resisted_a_march",
    );
    expect(ids(sprint(withPrefs(acceleration), {}, "deload"))).not.toContain("resisted_a_march");
    // A sled replaces it: one resisted task per session.
    const sled = sprint(
      withPrefs(acceleration, { equipment: [...base.equipment, "band", "sled"] }),
    );
    expect(ids(sled)).toContain("resisted_sled_acceleration");
    expect(ids(sled)).not.toContain("resisted_a_march");
  });
});

describe("plyometric block follows the session task and the week's landings", () => {
  const accel = { sprintFocus: "acceleration", spaceLengthM: 60 };
  const jumps = (s: ReturnType<typeof sprint>) =>
    s.exercises.some((e) => e.exerciseId === "broad_jump");

  it("is added to an acceleration session of an explosive goal while the week has room", () => {
    expect(jumps(sprint(withPrefs(accel, { goal: "power" })))).toBe(true);
    expect(jumps(sprint(withPrefs(accel, { goal: "speed" })))).toBe(true);
  });

  it("is skipped, with the reason, when the week's landings are used up", () => {
    const s = sprint(withPrefs(accel, { goal: "power" }), { weekLandings: 58 });
    expect(jumps(s)).toBe(false);
    expect(s.sprintVariant?.plyometric).toBeNull();
    expect(s.sprintVariant?.why.join(" ")).toContain("w tym tygodniu jest już 58 znanych lądowań");
    expect(jumps(sprint(withPrefs(accel, { goal: "power" }), { weekLandings: 54 }))).toBe(true);
  });

  it("is not added to the other session tasks or to other goals", () => {
    expect(jumps(sprint(withPrefs({ sprintFocus: "max_velocity", spaceLengthM: 70 })))).toBe(false);
    expect(
      jumps(sprint(withPrefs({ ...accel, sprintFocus: "planned_cod" }, { goal: "power" }))),
    ).toBe(false);
    expect(jumps(sprint(withPrefs(accel, { goal: "strength" })))).toBe(false);
    expect(jumps(sprint(withPrefs(accel, { goal: "power" }), {}, "deload"))).toBe(false);
  });

  it("does not repeat in consecutive sessions unless power is the goal", () => {
    const last = { ...ref("acceleration"), plyometric: "broad_jump" };
    expect(jumps(sprint(withPrefs(accel, { goal: "speed" }), { history: [last] }))).toBe(false);
    expect(jumps(sprint(withPrefs(accel, { goal: "power" }), { history: [last] }))).toBe(true);
  });

  it("counts the gym's landings in a generated week", () => {
    const week = generateTrainingPlan(
      withPrefs(
        { sprintFocus: "acceleration", spaceLengthM: 60 },
        { goal: "power", hasGym: false },
      ),
      { startDate: "2026-11-02", weeks: 2 },
    );
    expect(
      validateTrainingPlan(week.plan, withPrefs({}, { goal: "power", hasGym: false }), {
        startDate: "2026-11-02",
      }),
    ).toEqual([]);
  });
});

describe("a changed sprint goal reaches the plan diagnostics", () => {
  it("reports the cause once per week and keeps flying for a declared straight", () => {
    const undeclared = generateTrainingPlan(withPrefs({}, { hasGym: false }), {
      startDate: "2026-11-02",
      weeks: 2,
    });
    const changes = undeclared.issues.filter((i) => i.code === "SPRINT_GOAL_CHANGED");
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.length).toBeLessThanOrEqual(2);
    for (const i of changes) {
      expect(i.cause).toBe("equipment");
      expect(i.message).toMatch(/nie zadeklarowano długości prostej/);
    }
    const declared = generateTrainingPlan(withPrefs({ spaceLengthM: 70 }, { hasGym: false }), {
      startDate: "2026-11-02",
      weeks: 2,
    });
    expect(declared.issues.some((i) => i.code === "SPRINT_GOAL_CHANGED")).toBe(false);
    const goals = declared.plan
      .flatMap((d) => [d, d.secondSession])
      .map((s) => s?.engineV2?.sprintGoal)
      .filter(Boolean);
    expect(goals).toContain("max_velocity");
  });
});
