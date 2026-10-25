import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareMonthlyPlan } from "./persist";
import { sessionFixture, sectionFixture } from "@/components/loadwise/session/testFixtures";
import { resolveEffectivePlan } from "./effectivePlan";
import { applyReadiness, generatePlan } from "./planEngine";
import { adaptMdPlusOneFromMatchMinutes, buildMinimumEffectiveWeek } from "./adaptiveWeek";
import { reconcilePlanIdentity } from "./planIdentity";
import { validatePersistedPlan } from "./persistedPlanValidation";
import { applyConfirmedCalendar, transitionMatchesBlock } from "./confirmedCalendar";
import { PLAN_ENGINE_VERSION } from "./planVersion";
import { createPlanActions } from "./store/planActions";
import {
  buildProfile,
  historyCategoryOf,
  initialState,
  type StoreActionContext,
} from "./store/model";
import { createSessionActions } from "./store/sessionActions";
import { createProfileActions } from "./store/profileActions";
import type { LoadwiseState, Profile, Readiness } from "./types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sessions: [] as Record<string, unknown>[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => {
    const chain = { select: () => chain, eq: () => chain, in: () => chain,
      abortSignal: async () => ({ data: mocks.sessions, error: null }) };
    return chain;
  },
} }));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));
vi.mock("./offlineTrainingQueue", () => ({
  isRetryableWriteError: () => false,
  withDurableTrainingWrite: (_user: string, entry: unknown, request: (entry: unknown) => unknown) =>
    request(entry),
}));
const profile: Profile = {
  name: "Test",
  age: 23,
  position: "midfielder",
  level: "intermediate",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: 7,
  matchDate: null,
  matchDates: [],
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: false,
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  healthPersonalizationEnabled: true,
  onboardingComplete: true,
  createdAt: "2026-10-01",
};
const readiness = (overall: number): Readiness => ({
  date: "2026-10-19",
  sleep: 7,
  energy: overall,
  fatigue: 4,
  soreness: 2,
  jointPain: 0,
  stress: 3,
  motivation: 7,
  overall,
});
const strength = () =>
  sessionFixture({
    date: "2026-10-19",
    dayDbId: "day",
    planDbId: "plan",
    cycleId: "cycle",
    title: "Siła",
    sessionType: "Siła",
    intensity: "wysoka",
    durationMin: 60,
    sections: {
      warmup: [],
      main: [{ name: "Przysiad", prescription: "4 × 8" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    structuredSections: [
      sectionFixture("main", [{ id: "squat", name: "Przysiad", sets: "4", reps: "8" }]),
    ],
  });
beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

describe("training contracts after reliability repair", () => {
  it("keeps a second strength session classified as strength on a club day after reload", () => {
    expect(historyCategoryOf("strength_power", "club")).toBe("gym");
    expect(historyCategoryOf("club_training", "club")).toBe("club");
  });
  it("applies safety after a swap without mutating the canonical prescription", () => {
    const base = strength(),
      swap = { ...base, dbId: "swap", title: "Ciężki zamiennik" };
    const result = resolveEffectivePlan(
      [base],
      {
        [base.date]: [
          {
            id: "m",
            date: base.date,
            type: "swap",
            reason: "manual",
            safetyStatus: "swapped_by_user",
            session: swap,
            originalSession: base,
            createdAt: "2026-10-19T10:00:00Z",
          },
        ],
      },
      { profile, readiness: { [base.date]: readiness(2) } },
    )[0];
    expect(result.intensity).toBe("niska");
    expect(result.title).toMatch(/Regeneracja/);
    expect(base.durationMin).toBe(60);
    expect(swap.sections.main[0].prescription).toBe("4 × 8");
  });
  it("reduces actual strength repetitions in both presentation formats", () => {
    const result = applyReadiness(strength(), readiness(6), profile).session;
    expect(result.durationMin).toBe(51);
    expect(result.sections.main[0].prescription).toBe("4 × 7");
    expect(result.structuredSections?.[0].blocks[0].exercises[0]).toMatchObject({
      sets: "4",
      reps: "7",
    });
  });
  it("pins execution while keeping its base recipe reusable by the immutable ID transaction", () => {
    const base = strength();
    const snapshot = applyReadiness(base, readiness(6), profile).session;
    const logs = {
      "session-1": {
        completed: false,
        status: "started" as const,
        rpe: null,
        notes: "",
        executionSnapshot: snapshot,
      },
    };
    expect(
      resolveEffectivePlan(
        [base],
        {},
        { profile, readiness: { [base.date]: readiness(9) }, completions: logs },
      )[0].durationMin,
    ).toBe(51);
    const reconciled = reconcilePlanIdentity(
      [{ ...base, title: "New future plan" }],
      [base],
      logs,
      base.date,
    );
    expect(reconciled[0].durationMin).toBe(60);
    expect(reconciled[0].dbId).toBe(base.dbId);
  });
  it("keeps executed work visible while blocking new work for red flags", () => {
    const base = strength();
    const logs = {
      "session-1": {
        completed: false,
        status: "started" as const,
        rpe: null,
        notes: "",
        executionSnapshot: base,
      },
    };
    const day = resolveEffectivePlan(
      [base],
      {},
      {
        profile,
        completions: logs,
        readiness: { [base.date]: { ...readiness(9), redFlags: ["new_swelling"] } },
      },
    )[0];
    expect(day.loadLabelOverride).toBe("Wstrzymaj trening");
    expect(day.dbId).toBe(base.dbId);
  });
  it("builds real compensation content after a short match", () => {
    const match = sessionFixture({ date: "2026-10-18", dayType: "match", title: "Mecz" });
    const recovery = sessionFixture({
      dbId: "md1",
      date: "2026-10-19",
      dayType: "recovery",
      mdLabel: "MD+1",
    });
    const next = adaptMdPlusOneFromMatchMinutes(
      [match, recovery],
      { "session-1": { completed: true, rpe: 6, notes: "", durationMin: 10 } },
      {},
    ).plan[1];
    expect(next.title).toBe("Kompensacja po krótkim występie");
    expect(next.sections.main.map((x) => x.name).join(" ")).toMatch(/Lekki bieg/);
    expect(next.durationMin).toBe(35);
    expect(next.classification?.isEndurance).toBe(true);
  });
  it("does not regenerate protected history after a club calendar edit", () => {
    const old = sessionFixture({
      date: "2026-10-13",
      dayType: "club",
      generatorVersion: PLAN_ENGINE_VERSION,
    });
    const future = sessionFixture({ date: "2026-10-19", generatorVersion: PLAN_ENGINE_VERSION });
    const rebuilt = reconcilePlanIdentity(
      [{ ...old, dayType: "rest" }, future],
      [old, future],
      {},
      future.date,
    );
    expect(
      validatePersistedPlan(rebuilt, profile, PLAN_ENGINE_VERSION, future.date).issues,
    ).not.toContainEqual(expect.objectContaining({ code: "club-day-mismatch" }));
  });
  it("does not repeatedly repair old spacing rules inside immutable history", () => {
    const days = [
      { ...strength(), date: "2026-10-13" },
      { ...strength(), dbId: "old-2", date: "2026-10-14" },
      sessionFixture({ date: "2026-10-19", generatorVersion: PLAN_ENGINE_VERSION }),
    ];
    const plan = reconcilePlanIdentity(days, days, {}, "2026-10-19");
    expect(
      validatePersistedPlan(plan, profile, PLAN_ENGINE_VERSION, "2026-10-19").issues,
    ).not.toContainEqual(expect.objectContaining({ code: "adjacent-gym-days" }));
  });
  it("rescues only the current week instead of treating next week's stimulus as coverage", () => {
    const source = { ...strength(), date: "2026-10-18" };
    const free = sessionFixture({ date: "2026-10-20", dayType: "rest", intensity: "niska" });
    const following = { ...strength(), date: "2026-10-26" };
    const result = buildMinimumEffectiveWeek([free, following], [source], "2026-10-19", profile);
    expect(result.proposals[0].action).toBe("move");
    expect(result.proposals[0].targetDate).toBe("2026-10-20");
  });
  it("ignores confirmations belonging to another cycle, including explicit no-match weeks", async () => {
    const nextProfile = { ...profile, matchDate: "2026-11-15" };
    const block = generatePlan(nextProfile, new Date(2026, 10, 2), 28).map((day) => ({
      ...day,
      cycleId: "new",
    }));
    const old = {
      id: "old",
      cycleId: "old",
      weekNumber: 1,
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
      nextMatchDate: null,
      noMatchNextWeek: true,
      confirmedAt: "2026-10-18T10:00:00Z",
    };
    expect(transitionMatchesBlock(block, old, 1)).toBe(false);
    const result = await applyConfirmedCalendar(block, nextProfile, { 1: old });
    expect(result.find((day) => day.date === "2026-11-15")?.dayType).toBe("match");
  });
  it("keeps the previous revision for rollover CAS without reusing its cycle or session IDs", () => {
    const old = strength();
    const fresh = sessionFixture({ date: "2026-11-16" });
    const next = reconcilePlanIdentity([fresh], [old], {}, fresh.date)[0];
    expect(next.planDbId).toBe("plan");
    expect(next.cycleId).toBeUndefined();
    expect(next.dbId).toBeUndefined();
  });
  it("protects a completed second slot before any modification RPC", async () => {
    const primary = {
      ...strength(),
      secondSession: sessionFixture({ dbId: "second-done", date: "2026-10-19" }),
    };
    const state: LoadwiseState = {
      ...initialState,
      profile,
      plan: [primary],
      completions: { "second-done": { completed: true, status: "completed", rpe: 6, notes: "" } },
    };
    const actions = createPlanActions({
      user: { id: "u" },
      state,
      todayIso: "2026-10-19",
      setState: vi.fn(),
      replacementInFlightRef: { current: new Set() },
    } as unknown as Parameters<typeof createPlanActions>[0]);
    await expect(
      actions.applyModification(
        primary.date,
        "swap",
        { ...primary, secondSession: null },
        primary,
        "remove second",
      ),
    ).rejects.toThrow(/rozpoczętej lub ukończonej/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("replaces the second slot with one atomic command while retaining the primary ID", async () => {
    const primary = {
      ...strength(),
      secondSession: sessionFixture({
        dbId: "old-second",
        date: "2026-10-19",
        dayType: "recovery",
        sessionType: "Regeneracja",
        intensity: "niska",
      }),
    };
    let state: LoadwiseState = { ...initialState, profile, plan: [primary] };
    const actions = createPlanActions({
      user: { id: "u" },
      state,
      todayIso: primary.date,
      setState: (update: Parameters<StoreActionContext["setState"]>[0]) => {
        state = typeof update === "function" ? update(state) : update;
      },
      replacementInFlightRef: { current: new Set() },
    } as unknown as Parameters<typeof createPlanActions>[0]);
    await actions.applyModification(
      primary.date,
      "swap",
      {
        ...primary,
        secondSession: sessionFixture({
          date: primary.date,
          title: "Technika z piłką",
          sessionType: "Technika z piłką",
          intensity: "niska",
        }),
      },
      primary,
      "replace second",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("apply_plan_modification");
    const args = mocks.rpc.mock.calls[0][1];
    expect(args.p_modification.replace_second).toBe(true);
    expect(args.p_modification.new_session_json.dbId).toBe(primary.dbId);
    expect(args.p_second_session.id).not.toBe("old-second");
    expect(resolveEffectivePlan(state.plan, state.modifications)[0].secondSession?.title).toBe(
      "Technika z piłką",
    );
  });
  it("confirms an in-season week without inventing a match and scopes its confirmation", async () => {
    const plan = generatePlan(profile, new Date(2026, 9, 19), 14).map((day, index) => ({
      ...day,
      cycleId: "cycle",
      planDbId: "plan",
      dayDbId: `day-${index}`,
      dbId: `session-${index}`,
    }));
    let state: LoadwiseState = { ...initialState, profile, plan };
    const actions = createPlanActions({
      user: { id: "u" },
      state,
      todayIso: "2026-10-19",
      setState: (update: Parameters<StoreActionContext["setState"]>[0]) => {
        state = typeof update === "function" ? update(state) : update;
      },
      replacementInFlightRef: { current: new Set() },
    } as unknown as Parameters<typeof createPlanActions>[0]);
    mocks.sessions = prepareMonthlyPlan("u", profile, plan).args.p_sessions as Record<string, unknown>[];
    await actions.confirmWeeklyTransition(1, [], true);
    expect(state.transitions[1]).toMatchObject({
      cycleId: "cycle",
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
      noMatchNextWeek: true,
    });
    expect(transitionMatchesBlock(state.plan, state.transitions[1], 1)).toBe(true);
    expect(
      state.plan.filter((day) => day.date >= "2026-10-26").some((day) => day.dayType === "match"),
    ).toBe(false);
  });
  it("keeps a non-training profile edit in one RPC without rebuilding the plan", async () => {
    const originalPlan = [strength()];
    let state: LoadwiseState = { ...initialState, profile, plan: originalPlan };
    const savePlan = vi.fn();
    const actions = createProfileActions({
      user: { id: "u" },
      state,
      todayIso: "2026-10-19",
      savePlanToDb: savePlan,
      setState: (update: Parameters<StoreActionContext["setState"]>[0]) => {
        state = typeof update === "function" ? update(state) : update;
      },
      generatingRef: { current: false },
      setPlanGenerating: vi.fn(),
    } as unknown as Parameters<typeof createProfileActions>[0]);
    await actions.updateProfile({ ...profile, name: "New name" });
    expect(savePlan).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_profile_and_plan",
      expect.objectContaining({ p_plan: null }),
    );
    expect(state.plan).toBe(originalPlan);
  });
  it("loads pain location from its own consent-guarded profile column", () => {
    const restored = buildProfile(
      { full_name: "Test", onboarding_completed: true },
      {
        age: 23,
        main_goal: "strength",
        pain_injury: true,
        pain_locations: ["knee"],
        health_personalization_enabled: true,
      },
      { schema_version: 2, completed: true },
    );
    expect(restored?.painLocations).toEqual(["knee"]);
  });
  it("does not restore an older profile when completion resolves after a profile edit", async () => {
    const beforeProfile = { ...profile };
    let state: LoadwiseState = { ...initialState, profile: beforeProfile, plan: [strength()] };
    let finish!: (result: unknown) => void;
    mocks.rpc.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const actions = createSessionActions({
      user: { id: "u" },
      state,
      getState: () => state,
      todayIso: "2026-10-19",
      setState: (update: Parameters<StoreActionContext["setState"]>[0]) => {
        state = typeof update === "function" ? update(state) : update;
      },
      savePlanToDb: vi.fn(),
    } as unknown as StoreActionContext);
    const completion = actions.completeSession(strength(), 6, "");
    state = { ...state, profile: { ...beforeProfile, goal: "speed", name: "Edited while saving" } };
    finish({
      error: null,
      data: {
        session_id: "session-1",
        completed: true,
        completion_status: "completed",
        rpe: 6,
        duration_minutes: 60,
        write_version: 1,
        profile: { running_progression_level: 1 },
      },
    });
    await completion;
    expect(state.profile?.goal).toBe("speed");
    expect(state.profile?.name).toBe("Edited while saving");
    expect(state.completions["session-1"].completed).toBe(true);
  });
});
