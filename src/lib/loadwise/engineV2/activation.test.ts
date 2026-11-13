import { describe, expect, it, vi } from "vitest";
import { activateTrainingPlan, type ActivationSnapshot } from "./activation";
import { generateTrainingPlan } from "./planner";
import { applyExerciseReplacements } from "../store/model";
import { resolveModifiedDay } from "../effectivePlan";
import { persistMonthlyPlan } from "../persist";
import type { Profile, SessionCompletion, SessionModification } from "../types";
const database = vi.hoisted(() => ({
  rpc: vi.fn(async (_name: string, _args: unknown) => ({ data: null, error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: database.rpc } }));

const profile: Profile = {
  name: "Activation test",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "trap_bar",
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
};
function setup() {
  const result = generateTrainingPlan(profile, {
    startDate: "2026-11-02",
    weeks: 1,
    expectedPlanId: "observed-plan",
  });
  let current: ActivationSnapshot | null = {
    ownerId: "owner-a",
    profile: structuredClone(profile),
    observedPlanId: "observed-plan",
    plan: [],
    completions: {},
    readiness: {},
  };
  const persist = vi.fn(async (_owner: string, _profile: Profile, plan: typeof result.plan) =>
    plan.map((d, i) => ({ ...d, dbId: `saved-session-${i}`, planDbId: "new-saved-header" })),
  );
  const load = vi.fn(async () => ({ id: "observed-plan", plan: [] }));
  return {
    result,
    services: { current: () => current, load, persist },
    get: () => current!,
    set: (value: ActivationSnapshot | null) => {
      current = value;
    },
  };
}

describe("explicit training-plan activation", () => {
  it("rejects a server header newer than the preview without rebasing its lease", async () => {
    const f = setup();
    f.services.load.mockResolvedValueOnce({ id: "other-device-plan", plan: [] });
    await expect(activateTrainingPlan(f.result, f.services)).rejects.toThrow("innym urządzeniu");
    expect(f.services.persist).not.toHaveBeenCalled();
    expect(f.result.expectedPlanId).toBe("observed-plan");
  });
  it("rejects an already stale locally observed lease before contacting the server", async () => {
    const f = setup();
    f.set({ ...f.get(), observedPlanId: "newer-local-plan" });
    await expect(activateTrainingPlan(f.result, f.services)).rejects.toThrow("nieaktualny");
    expect(f.services.load).not.toHaveBeenCalled();
    expect(f.services.persist).not.toHaveBeenCalled();
  });
  it.each(["owner", "profile", "logout"] as const)(
    "does not write if %s changes while loading",
    async (change) => {
      const f = setup();
      f.services.load.mockImplementationOnce(async () => {
        if (change === "owner") f.set({ ...f.get(), ownerId: "owner-b" });
        if (change === "profile")
          f.set({ ...f.get(), profile: { ...f.get().profile, goal: "speed" } });
        if (change === "logout") f.set(null);
        return { id: "observed-plan", plan: [] };
      });
      await expect(activateTrainingPlan(f.result, f.services)).rejects.toThrow();
      expect(f.services.persist).not.toHaveBeenCalled();
    },
  );
  it("protects a session started after the preview was generated", async () => {
    const f = setup(),
      frozen = structuredClone(f.result.plan.find((d) => d.engineV2)!);
    frozen.dbId = "started-session";
    frozen.dayDbId = "started-day";
    frozen.structuredSections![0].blocks[0].exercises[0].duration = "999 s";
    f.services.load.mockImplementationOnce(async () => {
      f.set({
        ...f.get(),
        plan: [frozen],
        completions: {
          [frozen.dbId!]: { completed: false, status: "started" } as SessionCompletion,
        },
      });
      return { id: "observed-plan", plan: [] };
    });
    await expect(activateTrainingPlan(f.result, f.services)).rejects.toThrow("sesja zmieniła");
    expect(f.services.persist).not.toHaveBeenCalled();
  });
  it("writes with the original observed lease and returns the persistence result", async () => {
    const f = setup(),
      before = JSON.stringify(f.result);
    const saved = await activateTrainingPlan(f.result, f.services);
    expect(f.services.persist).toHaveBeenCalledOnce();
    const [owner, actualProfile, payload] = f.services.persist.mock.calls[0];
    expect(owner).toBe("owner-a");
    expect(actualProfile).toEqual(profile);
    expect(payload.every((d) => d.planDbId === "observed-plan")).toBe(true);
    expect(saved.every((d) => d.planDbId === "new-saved-header")).toBe(true);
    expect(saved[0].dbId).toBe("saved-session-0");
    expect(JSON.stringify(f.result)).toBe(before);
  });
  it("preserves the running clock of a started first-slot session even when its displayed dose is unchanged", async () => {
    const f = setup();
    const run = structuredClone(
      f.result.plan.find((d) => d.engineV2?.roles.includes("endurance"))!,
    );
    expect(run.runningRecipe).toBeDefined();
    run.dbId = "started-run";
    run.dayDbId = "started-run-day";
    run.executionProtected = true;
    f.get().plan = [run];
    f.get().completions = {
      "started-run": { completed: false, status: "started" } as SessionCompletion,
    };
    const changed = structuredClone(run);
    changed.runningRecipe!.warmup.seconds += 60;
    changed.runningRecipe!.cooldown.seconds -= 60;
    f.result.plan = f.result.plan.map((d) => (d.date === run.date ? changed : d));
    await expect(activateTrainingPlan(f.result, f.services)).rejects.toThrow("sesja zmieniła");
    expect(f.services.persist).not.toHaveBeenCalled();
  });
  it("propagates a failed atomic save instead of returning a locally fabricated success", async () => {
    const f = setup();
    f.services.persist.mockRejectedValueOnce(new Error("RPC failed"));
    await expect(activateTrainingPlan(f.result, f.services)).rejects.toThrow("RPC failed");
    expect(f.get().plan).toEqual([]);
  });
  it("sends the generated snapshot through the real atomic persistence adapter with its original lease", async () => {
    const f = setup();
    database.rpc.mockClear();
    const saved = await activateTrainingPlan(f.result, {
      ...f.services,
      persist: persistMonthlyPlan,
    });
    expect(database.rpc).toHaveBeenCalledOnce();
    const [operation, payload] = database.rpc.mock.calls[0];
    expect(operation).toBe("persist_training_plan_v2");
    expect((payload as { p_expected_plan_id: string }).p_expected_plan_id).toBe("observed-plan");
    expect(saved).toHaveLength(7);
    expect(saved.every((d) => d.dbId && d.dayDbId && d.planDbId)).toBe(true);
    expect((payload as { p_plan_json: unknown[] }).p_plan_json).toHaveLength(7);
  });
  it("does not apply stale modifications or replacements to a newly generated V2 day", () => {
    const f = setup(),
      source = structuredClone(f.result.plan.find((d) => d.engineV2)!);
    source.dayDbId = "current-day";
    const stale: SessionModification = {
      id: "stale",
      date: source.date,
      type: "swap",
      reason: "old plan",
      safetyStatus: "planned",
      session: { ...source, title: "Stary trening", dayDbId: "old-day" },
      originalSession: null,
      createdAt: "2026-11-01",
    };
    expect(resolveModifiedDay(source, [stale]).title).toBe(source.title);
    const matching = {
      ...stale,
      id: "matching",
      session: { ...stale.session, dayDbId: "current-day", title: "Bieżąca zmiana" },
    };
    expect(resolveModifiedDay(source, [matching]).title).toBe("Bieżąca zmiana");
    const original = source.structuredSections![0].blocks[0].exercises[0];
    const replaced = applyExerciseReplacements(source, [
      {
        id: "old-replacement",
        date: source.date,
        exerciseId: original.id,
        original: { ...original, duration: "999 s" },
        replacement: { ...original, name: "Nieaktualny zamiennik" },
        equipmentIds: [],
        createdAt: "2026-11-01",
      },
    ]);
    expect(replaced.structuredSections![0].blocks[0].exercises[0].name).toBe(original.name);
  });
});
