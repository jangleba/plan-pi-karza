// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadwiseState, Profile, SessionDay, TrainingExercise } from "../types";
import { generateTrainingPlan } from "../engineV2/planner";
import { getPlanStatus } from "../engineV2/planStatus";
import { getExerciseDefinition } from "../exerciseLibrary";
import { applyExerciseReplacements, initialState, type StoreActionContext } from "./model";
import { createPlanActions } from "./planActions";
import { createSessionActions } from "./sessionActions";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: () => ({}) },
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const profile: Profile = {
  name: "Equipment workflow",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["barbell", "rack", "dumbbell", "band"],
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
let state: LoadwiseState;
let today: string;
const ref = { current: new Set<string>() };
const context = (): StoreActionContext & { replacementInFlightRef: typeof ref } => ({
  user: { id: "athlete" },
  state,
  getState: () => state,
  todayIso: today,
  setState: (update) => {
    state = typeof update === "function" ? update(state) : update;
  },
  replacementInFlightRef: ref,
});
const allExercises = (s: SessionDay): TrainingExercise[] =>
  s.structuredSections?.flatMap((section) => section.blocks.flatMap((block) => block.exercises)) ??
  [];

beforeEach(() => {
  window.localStorage.clear();
  ref.current.clear();
  today = "2026-11-02";
  const plan = generateTrainingPlan(profile, { startDate: today, weeks: 1 }).plan.map((day, i) => ({
    ...day,
    dbId: `session-${i}`,
  }));
  state = {
    ...structuredClone(initialState),
    profile: structuredClone(profile),
    activePlanId: "plan-1",
    plan,
  };
  mocks.rpc.mockReset().mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "set_equipment_replacement")
      return {
        error: null,
        data: {
          unavailable_equipment_ids: ["barbell"],
          profile_updated_at: "2026-11-02T09:00:00Z",
        },
      };
    return {
      error: null,
      data: { ...(args.p_payload as object), session_id: args.p_session_id, write_version: 1 },
    };
  });
});

describe("explicit V2 equipment replanning", () => {
  it("records unavailable equipment, keeps the saved dose intact and starts only the regenerated plan", async () => {
    const originalSession = state.plan.find((s) => s.engineV2?.roles.includes("strengthA"))!;
    today = originalSession.date;
    const original = allExercises(originalSession).find(
      (e) => e.exerciseId === "heavy_back_squat",
    )!;
    const saved = structuredClone(originalSession);
    await createPlanActions(context()).markEquipmentUnavailable(today, original, ["barbell"]);
    expect(mocks.rpc).toHaveBeenCalledWith("set_equipment_replacement", expect.any(Object));
    expect(state.profile?.unavailableEquipmentIds).toEqual(["barbell"]);
    expect(state.equipmentNotice).toBe(
      "Sprzęt zapisany. Zaktualizuj plan, aby dobrać ćwiczenia i dawki.",
    );
    const requests = state.exerciseReplacements[today];
    expect(requests).toHaveLength(1);
    expect(requests[0].replacement).toEqual(original);
    expect(applyExerciseReplacements(originalSession, requests)).toBe(originalSession);
    expect(originalSession).toEqual(saved);
    expect(getPlanStatus({ plan: state.plan, profile: state.profile, todayIso: today }).kind).toBe(
      "stale",
    );
    await expect(createSessionActions(context()).startSession(originalSession)).rejects.toThrow(
      "Profil zmienił się",
    );
    expect(mocks.rpc.mock.calls.some(([name]) => name === "save_training_log")).toBe(false);

    const next = generateTrainingPlan(state.profile!, { startDate: today, weeks: 1 }).plan.map(
      (day, i) => ({ ...day, dbId: `new-session-${i}` }),
    );
    const decisions = next
      .flatMap((day) => [day, day.secondSession])
      .filter((s): s is SessionDay => !!s?.engineV2)
      .flatMap((s) => s.engineV2!.exercises);
    expect(decisions.length).toBeGreaterThan(0);
    expect(
      decisions.every(
        (e) => !getExerciseDefinition(e.exerciseId)!.equipmentRequired.includes("barbell"),
      ),
    ).toBe(true);
    state = { ...state, plan: next, activePlanId: "plan-2" };
    const current = next.find((day) => day.date === today && day.engineV2)!;
    expect(getPlanStatus({ plan: next, profile: state.profile, todayIso: today }).kind).toBe(
      "active",
    );
    expect(applyExerciseReplacements(current, requests)).toBe(current);
    await createSessionActions(context()).startSession(current);
    expect(state.completions[current.dbId!].executionSnapshot?.engineV2).toEqual(current.engineV2);
    expect(state.completions[current.dbId!].status).toBe("started");
  });
  it("keeps legacy inline replacement behavior", () => {
    const source = state.plan.find((s) => s.engineV2?.roles.includes("strengthA"))!;
    const legacy = { ...source, generatorVersion: undefined, engineV2: undefined };
    const original = allExercises(legacy).find((e) => e.exerciseId === "heavy_back_squat")!;
    const replacement = {
      ...original,
      exerciseId: "goblet_squat",
      name: "Przysiad goblet",
      sets: "2",
      engineDose: undefined,
    };
    const request = {
      id: "legacy",
      date: today,
      exerciseId: original.id,
      original,
      replacement,
      equipmentIds: ["barbell"],
      createdAt: "2026-11-02",
    };
    const changed = applyExerciseReplacements(legacy, [request]);
    expect(allExercises(changed).find((e) => e.id === original.id)).toEqual(replacement);
    expect(allExercises(legacy).find((e) => e.id === original.id)).toEqual(original);
  });
});
