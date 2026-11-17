import { describe, expect, it, vi } from "vitest";
import type { Profile, SessionCompletion, SessionDay } from "../types";
import { activateTrainingPlan } from "./activation";
import { attemptAdvancedStrength, ADVANCED_TEMPLATES } from "./advancedSessions";
import { exerciseLimitation } from "./exercises";
import { roleLimitation } from "./limitations";
import { lockedExecutionDays } from "./locks";
import { ENGINE_VERSION } from "./model";
import { generateTrainingPlan, lighterRecipes } from "./planner";
import { getPlanStatus, hasOutdatedPendingEngineWork } from "./planStatus";
import { strengthCompleteness } from "./strengthCompleteness";
import { gymAthlete } from "./testFixtures";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

const player = {
  ...gymAthlete,
  goal: "strength",
  doubleSessionsAllowed: "no",
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
} as Profile;
const NOTES = Object.keys(ADVANCED_TEMPLATES);
const strengthSlots = (plan: readonly SessionDay[]) =>
  plan
    .flatMap((d) => [d, d.secondSession])
    .filter((s): s is SessionDay => !!s?.engineV2?.roles.some((r) => r.startsWith("strength")));

describe("new strength sessions use the current note generator", () => {
  it("all four notes are reachable from the weekly generator", () => {
    const r = generateTrainingPlan(player, { startDate: "2026-11-02", weeks: 2 });
    const used = new Set(strengthSlots(r.plan).map((s) => s.engineV2!.advancedTemplate));
    expect([...used].sort()).toEqual([...NOTES].sort());
    for (const s of strengthSlots(r.plan)) expect(s.engineV2!.organization).toBe("complex");
  });

  it("a layout the player chose is recorded as such, not as a failure", () => {
    const chosen = {
      ...player,
      trainingMethodPreferences: { gymTemplate: "balanced" },
    } as Profile;
    const r = generateTrainingPlan(chosen, { startDate: "2026-11-02", weeks: 1 });
    const slots = strengthSlots(r.plan);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.engineV2!.strengthPath).toMatchObject({ path: "standard", code: "LAYOUT_CHOSEN" });
      expect(s.engineV2!.strengthPath!.cause).toBeUndefined();
    }
    expect(r.issues.some((i) => i.code === "STRENGTH_PATH_FALLBACK")).toBe(false);
  });

  it("falls back to the usual A/B with a structural cause (missing equipment)", () => {
    const stripped = {
      ...player,
      unavailableEquipmentIds: [
        "barbell",
        "dumbbell",
        "rack",
        "bench",
        "machine",
        "band",
        "box",
        "med_ball",
        "kettlebell",
      ],
    } as Profile;
    const attempt = attemptAdvancedStrength(stripped, "A", "development", 0);
    expect(attempt.session).toBeNull();
    expect(attempt.path).toMatchObject({
      path: "standard",
      code: "NOTE_EQUIPMENT",
      cause: "equipment",
    });
    expect(attempt.path!.message).not.toMatch(/staż|zawyż/i);
  });

  it("uses the other note of the same day before leaving the note path, and says why", () => {
    // A beginner cannot do the first rotation's note but can do its sibling.
    const beginner = {
      ...player,
      goal: "power",
      level: "beginner",
      gymExperienceLevel: "beginner",
      strengthTrainingMonths: 1,
      movementCompetence: "low",
      supervisionLevel: "none",
    } as Profile;
    const attempt = attemptAdvancedStrength(beginner, "A", "development", 0);
    expect(attempt.session?.advancedTemplate).toBeDefined();
    expect(attempt.path).toMatchObject({ path: "note", code: "NOTE_SUBSTITUTED" });
    expect(attempt.path!.cause).toBeDefined();
    expect(attempt.path!.requestedTemplate).toBeDefined();
  });

  it("separates equipment from preparation in the library blockers", () => {
    // Drop jump: the box is declared, the verified preparation is not.
    const withBox = { ...player, equipment: [...player.equipment, "box", "platform"] } as Profile;
    const unverified = { ...withBox, supervisionLevel: "none" } as Profile;
    expect(exerciseLimitation("drop_jump", unverified)).toBe("preparation");
    expect(exerciseLimitation("drop_jump", player)).toBe("equipment");
    expect(exerciseLimitation("drop_jump", withBox)).toBeNull();
    const noTrapBar = { ...player, unavailableEquipmentIds: ["trap_bar"] } as Profile;
    const noTrapBarEquipment = {
      ...noTrapBar,
      equipment: player.equipment.filter((e) => e !== "trap_bar"),
    };
    expect(exerciseLimitation("trap_bar_jump", noTrapBarEquipment)).toBe("equipment");
    expect(exerciseLimitation("no_such_exercise", player)).toBe("recipe");
    expect(roleLimitation(player, "knee_strength").cause).toBe("recipe");
  });

  it("a lighter variant of a note session stays a note", () => {
    const r = generateTrainingPlan(player, { startDate: "2026-11-02", weeks: 1 });
    const session = strengthSlots(r.plan)[0];
    const alternatives = lighterRecipes(session, player, 75);
    for (const alt of alternatives.filter((a) => a.kind === "lighter")) {
      expect(alt.recipe.organization).toBe("complex");
      expect(alt.recipe.advancedTemplate).toBe(session.engineV2!.advancedTemplate);
    }
  });
});

describe("strength completeness", () => {
  const row = (role: string) => ({
    exerciseId: role,
    role: role as never,
    dose: { sets: 3, reps: 5, rir: 2, restSeconds: 120, intent: "controlled" as const },
    reason: "t",
  });
  const recipe = (roles: string[], extra: object = {}) => ({
    roles: ["strengthA" as const],
    exercises: roles.map(row),
    postMatch: undefined,
    organization: "straight" as const,
    ...extra,
  });

  it("a leg curl alone does not complete squat-led strength A", () => {
    expect(strengthCompleteness(recipe(["knee_flexion", "push"]))).toMatchObject({
      complete: false,
      coverage: "partial",
    });
    expect(strengthCompleteness(recipe(["knee_strength"])).complete).toBe(true);
    expect(strengthCompleteness(recipe(["unilateral_strength"])).complete).toBe(true);
  });

  it("a coaching-note session needs a main lift and the upper task", () => {
    const note = { organization: "complex" as const };
    expect(strengthCompleteness(recipe(["hip_strength"], note)).complete).toBe(false);
    expect(strengthCompleteness(recipe(["hip_strength", "pull"], note)).complete).toBe(true);
  });

  it("keeps the post-match upper-body exception", () => {
    const upper = { postMatch: "upper" as const };
    expect(strengthCompleteness(recipe(["pull"], upper)).coverage).toBe("post_match_upper");
    expect(strengthCompleteness(recipe(["trunk"], upper)).coverage).toBe("partial");
  });

  it("generated strength sessions of a normal plan are complete", () => {
    const r = generateTrainingPlan(player, { startDate: "2026-11-02", weeks: 2 });
    for (const s of strengthSlots(r.plan))
      expect(strengthCompleteness(s.engineV2!).complete).toBe(true);
  });
});

describe("limitation causes in the plan", () => {
  it("reports 'no date found' only for a real calendar problem", () => {
    const oneDay = { ...player, individualTrainingDays: [1] } as Profile;
    const r = generateTrainingPlan(oneDay, { startDate: "2026-11-02", weeks: 1 });
    const unmet = r.issues.filter((i) => i.code === "UNMET_WEEKLY_TARGET");
    expect(unmet.length).toBeGreaterThan(0);
    for (const i of unmet) {
      expect(i.cause).toBe("calendar");
      expect(i.message).toContain("nie znaleziono terminu");
    }
  });

  it("a session that does not fit the time budget is a time problem, not a calendar one", () => {
    const r = generateTrainingPlan(player, {
      startDate: "2026-11-02",
      weeks: 1,
      minutesPerSession: 25,
    });
    const unmet = r.issues.filter((i) => i.code === "UNMET_WEEKLY_TARGET" && i.cause === "time");
    expect(unmet.length).toBeGreaterThan(0);
    for (const i of unmet) expect(i.message).not.toContain("nie znaleziono terminu");
  });

  it("never advises declaring more experience to unlock exercises", () => {
    const r = generateTrainingPlan(
      {
        ...player,
        level: "beginner",
        gymExperienceLevel: "beginner",
        strengthTrainingMonths: 0,
      } as Profile,
      { startDate: "2026-11-02", weeks: 2 },
    );
    for (const i of r.issues) expect(i.message).not.toMatch(/uzupełnij staż|zawyż/i);
  });
});

describe("updating an older saved plan through preview and activation", () => {
  const oldVersion = "ballwise-v2.17";
  const oldProfile = {
    ...player,
    trainingMethodPreferences: { gymTemplate: "balanced" },
  } as Profile;
  function oldPlan() {
    const generated = generateTrainingPlan(oldProfile, {
      startDate: "2026-11-09",
      weeks: 2,
      expectedPlanId: null,
    }).plan;
    return generated.map((d, i) => ({
      ...d,
      dbId: `s${i}`,
      dayDbId: `d${i}`,
      planDbId: "plan-1",
      generatorVersion: oldVersion,
      secondSession: d.secondSession
        ? { ...d.secondSession, dbId: `s${i}b`, generatorVersion: oldVersion }
        : null,
    })) as SessionDay[];
  }

  it("recalculates pending sessions with the notes and keeps started and completed work untouched", async () => {
    const plan = oldPlan();
    const strength = plan.filter((d) => d.engineV2?.roles.some((r) => r.startsWith("strength")));
    // The saved plan is the old straight A/B generation.
    expect(strength.every((d) => d.engineV2!.advancedTemplate === undefined)).toBe(true);
    const [done, started] = strength;
    const completions: Record<string, SessionCompletion> = {
      [done.dbId!]: {
        completed: true,
        status: "completed",
        rpe: 6,
        notes: "",
        executionSnapshot: structuredClone(done),
      } as SessionCompletion,
      [started.dbId!]: {
        completed: false,
        status: "started",
        notes: "",
        executionSnapshot: structuredClone(started),
      } as SessionCompletion,
    };
    const today = "2026-11-10";
    expect(getPlanStatus({ plan, profile: player, todayIso: today, completions }).kind).toBe(
      "stale",
    );
    expect(hasOutdatedPendingEngineWork(plan, completions, today)).toBe(true);

    const startedBefore = JSON.stringify(started);
    const doneBefore = JSON.stringify(done);
    const completionsBefore = JSON.stringify(completions);
    const preview = generateTrainingPlan(player, {
      startDate: today,
      previousPlan: plan,
      completions,
      expectedPlanId: "plan-1",
      lockedDays: lockedExecutionDays(plan, completions),
      precedingDays: plan.filter((d) => d.date < today),
    });

    // The started session is kept exactly, with its old generator and prescription.
    const keptStarted = preview.plan.find((d) => d.date === started.date)!;
    expect(keptStarted.executionProtected).toBe(true);
    expect(keptStarted.generatorVersion).toBe(oldVersion);
    expect(keptStarted.engineV2).toEqual(started.engineV2);
    expect(keptStarted.dbId).toBe(started.dbId);
    // Every other own session is new work: current engine, notes for strength.
    const fresh = preview.plan.filter((d) => !d.executionProtected);
    expect(fresh.length).toBeGreaterThan(0);
    for (const d of fresh)
      for (const s of [d, d.secondSession])
        if (s?.engineV2) expect(s.generatorVersion).toBe(ENGINE_VERSION);
    const freshStrength = strengthSlots(fresh);
    expect(freshStrength.length).toBeGreaterThan(0);
    for (const s of freshStrength) {
      expect(s.engineV2!.organization).toBe("complex");
      expect(NOTES).toContain(s.engineV2!.advancedTemplate);
    }
    // Nothing recorded was rewritten by the preview.
    expect(JSON.stringify(started)).toBe(startedBefore);
    expect(JSON.stringify(done)).toBe(doneBefore);
    expect(JSON.stringify(completions)).toBe(completionsBefore);

    const persist = vi.fn(async (_owner: string, _profile: Profile, saved: SessionDay[]) => saved);
    await activateTrainingPlan(preview, {
      current: () => ({
        ownerId: "owner",
        profile: player,
        observedPlanId: "plan-1",
        plan,
        completions,
        readiness: {},
      }),
      load: async () => ({ id: "plan-1", plan }),
      persist,
    });
    expect(persist).toHaveBeenCalledOnce();
    const saved = persist.mock.calls[0][2];
    expect(saved.find((d) => d.date === started.date)?.engineV2).toEqual(started.engineV2);
  });

  it("opening the status never regenerates or restamps the saved plan", () => {
    const plan = oldPlan();
    const before = JSON.stringify(plan);
    getPlanStatus({ plan, profile: player, todayIso: "2026-11-10", completions: {} });
    hasOutdatedPendingEngineWork(plan, {}, "2026-11-10");
    expect(JSON.stringify(plan)).toBe(before);
    expect(plan.every((d) => d.generatorVersion === oldVersion)).toBe(true);
  });
});
