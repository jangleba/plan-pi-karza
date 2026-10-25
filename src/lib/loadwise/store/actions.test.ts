// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RunningActivity,
  RunningActivityDraft,
  RunningIntervalResult,
} from "@/lib/running/types";
import { readPendingTrainingWrites } from "../offlineTrainingQueue";
import type { LoadwiseState, SessionDay } from "../types";
import { buildProfile, initialState, type StoreActionContext } from "./model";
import { createProfileActions } from "./profileActions";
import { createSessionActions } from "./sessionActions";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  writes: [] as Array<{ table: string; payload: unknown }>,
  error: null as { message: string; status?: number } | null,
  rpcData: null as Record<string, unknown> | null,
  consent: vi.fn(),
  clearOverlays: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    async rpc(name: string, args: Record<string, unknown>) {
      mocks.events.push(name);
      mocks.writes.push({ table: name, payload: args });
      return {
        error: mocks.error,
        data:
          mocks.rpcData ??
          (name === "save_training_log"
            ? { ...(args.p_payload as object), session_id: args.p_session_id, write_version: 1 }
            : name === "save_profile_and_plan"
              ? { athlete: { updated_at: "2026-09-29T12:00:00Z" } }
              : null),
      };
    },
    from(table: string) {
      const write = (method: string, payload?: unknown) => {
        mocks.events.push(`${table}.${method}`);
        mocks.writes.push({ table, payload });
        return chain;
      };
      const chain = {
        insert: (payload: unknown) => write("insert", payload),
        upsert: (payload: unknown) => write("upsert", payload),
        update: (payload: unknown) => write("update", payload),
        delete: () => write("delete"),
        eq: () => chain,
        select: () => chain,
        single: () => chain,
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve({ error: mocks.error, data: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  },
}));
vi.mock("../consent", () => ({
  recordConsentDecisions: mocks.consent,
  recordConsentDecision: mocks.consent,
}));
vi.mock("./repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./repository")>()),
  clearFutureOverlaysForUser: mocks.clearOverlays,
  shouldReusePersistedPlan: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

let state: LoadwiseState;
const saveProfileRows = vi.fn<StoreActionContext["saveProfileRows"]>();
const savePlanToDb = vi.fn<StoreActionContext["savePlanToDb"]>();
function context(): StoreActionContext {
  return {
    user: { id: "athlete" },
    state,
    getState: () => state,
    todayIso: "2026-09-29",
    saveProfileRows,
    savePlanToDb,
    setState(update) {
      mocks.events.push("state");
      state = typeof update === "function" ? update(state) : update;
    },
  };
}
function profileActions() {
  return createProfileActions({
    ...context(),
    generatingRef: { current: false },
    setPlanGenerating: vi.fn(),
  });
}
function session(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    date: "2026-09-29",
    dbId: "session",
    dayName: "Wtorek",
    dayType: "own",
    title: "Trening",
    goalLabel: "",
    intensity: "umiarkowana",
    durationMin: 30,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Wytrzymałość",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
    ...overrides,
  } as SessionDay;
}
const work: RunningIntervalResult = {
  stepId: "work",
  kind: "work",
  label: "Run",
  repeatIndex: 1,
  repeatTotal: 1,
  targetMode: "time",
  targetValue: 180,
  targetLabel: "3 min",
  durationSec: 180,
  distanceM: 600,
  paceSecPerKm: 300,
  completed: true,
};
function runDraft(): RunningActivityDraft {
  return {
    sessionId: "session",
    date: "2026-09-29",
    startedAt: "2026-09-29T10:00:00Z",
    endedAt: "2026-09-29T10:05:00Z",
    durationSec: 300,
    distanceM: 1000,
    avgPaceSecPerKm: 300,
    source: "gps",
    splits: [],
    intervalResults: [work],
    route: [{ lat: 52, lng: 21, recordedAt: "2026-09-29T10:00:00Z", elapsedSec: 0 }],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.events.length = 0;
  mocks.writes.length = 0;
  mocks.error = null;
  mocks.rpcData = null;
  mocks.consent.mockReset().mockImplementation(async () => {
    mocks.events.push("consent");
  });
  mocks.clearOverlays.mockReset().mockImplementation(async () => {
    mocks.events.push("clearOverlays");
  });
  state = {
    ...initialState,
    profile: {
      ...buildProfile({ full_name: "Player" }, { age: 20, position: "midfielder" }, null)!,
      healthPersonalizationEnabled: true,
    },
  };
  saveProfileRows.mockReset().mockImplementation(async (_profile, completed) => {
    mocks.events.push(`profile:${completed}`);
    return "revision";
  });
  savePlanToDb.mockReset().mockImplementation(async () => {
    mocks.events.push("plan");
    return [session()];
  });
});

describe("store action contracts", () => {
  it("records consent before onboarding writes and marks completion only after the plan is saved", async () => {
    state.profile!.unavailableEquipmentIds = ["sled"];
    const profile = { ...state.profile!, unavailableEquipmentIds: [] };
    await profileActions().completeOnboarding(profile, {
      terms: true,
      privacy: true,
      health_data: true,
    });
    expect(mocks.events).toEqual(["consent", "plan", "save_profile_and_plan", "state"]);
    expect(state.profile).toMatchObject({
      onboardingComplete: true,
      unavailableEquipmentIds: ["sled"],
    });
    expect(state.profile?.onboardingRevision).toMatch(/^training-inputs:v1:/);
    expect(state.planGeneratedFor).toBe("2026-09-29");
    expect(
      mocks.writes.find((write) => write.table === "save_profile_and_plan")?.payload,
    ).toMatchObject({
      p_profile: { onboarding_completed: true },
      p_athlete: { unavailable_equipment_ids: ["sled"] },
    });
  });

  it("does not clear overlays or publish a profile when plan persistence fails", async () => {
    const previous = state;
    savePlanToDb.mockRejectedValueOnce(new Error("Plan write failed"));
    await expect(
      profileActions().updateProfile({ ...state.profile!, name: "Changed" }),
    ).rejects.toThrow("Plan write failed");
    expect(state).toBe(previous);
    expect(mocks.clearOverlays).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
  });

  it("queues failed start/completion writes under the same key and retains the final completion", async () => {
    const match = session({ dayType: "match", sessionType: "Mecz" });
    mocks.error = { message: "Failed to fetch" };
    await createSessionActions(context()).startSession(match);
    const startedAt = state.completions.session.startedAt;
    await createSessionActions(context()).completeSession(match, 7, "Done", { durationMin: 60 });
    const queue = readPendingTrainingWrites("athlete");
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      kind: "session_log",
      dedupeKey: "session:session",
      payload: { completion_status: "completed", duration_minutes: 60, started_at: startedAt },
    });
    expect(state.completions.session).toMatchObject({
      completed: true,
      status: "completed",
      startedAt,
    });
    expect(state.history).toHaveLength(1);
    expect(saveProfileRows).not.toHaveBeenCalled();
    expect(savePlanToDb).not.toHaveBeenCalled();
  });

  it("preserves a rejected draft without falsely publishing completion", async () => {
    const previous = state;
    mocks.error = { message: "Permission denied", status: 403 };
    await expect(createSessionActions(context()).completeSession(session(), 6, "")).rejects.toThrow(
      "[save_training_log.complete] Permission denied",
    );
    expect(state).toBe(previous);
    expect(readPendingTrainingWrites("athlete")).toHaveLength(1);
  });

  it("persists completed running progression before regenerating and publishing its plan", async () => {
    const endurance = session({
      classification: {
        isEndurance: true,
        subcategory: "extensive_intervals",
      } as SessionDay["classification"],
    });
    state.runningActivities = {
      session: {
        ...runDraft(),
        durationSec: 720,
        distanceM: 2400,
        intervalResults: [1, 2, 3, 4].map((i) => ({
          ...work,
          stepId: `work-${i}`,
          repeatIndex: i,
          repeatTotal: 4,
        })),
        id: "run",
        createdAt: "now",
        updatedAt: "now",
      } as RunningActivity,
    };
    mocks.rpcData = {
      session_id: "session",
      completed: true,
      completion_status: "completed",
      rpe: 6,
      duration_minutes: 720,
      write_version: 1,
      profile: { running_progression_level: 1, updated_at: "2026-09-29T12:00:00Z" },
    };
    await createSessionActions(context()).completeSession(endurance, 6, "");
    expect(mocks.events).toEqual(["save_training_log", "state", "state", "plan", "state"]);
    expect(state.profile).toMatchObject({
      runningProgressionLevel: 1,
      onboardingRevision: expect.stringMatching(/^training-inputs:v1:/),
    });
  });

  it("queues only aggregate running data and preserves the live route in memory", async () => {
    mocks.error = { message: "Network error" };
    const draft = runDraft();
    await createSessionActions(context()).saveRunningActivity(draft);
    const queue = readPendingTrainingWrites("athlete");
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      kind: "running_activity",
      payload: { duration_sec: 300, distance_m: 1000, avg_pace_sec_per_km: 300 },
    });
    expect(queue[0].payload).not.toHaveProperty("route");
    expect(queue[0].payload).not.toHaveProperty("splits");
    expect(queue[0].payload).not.toHaveProperty("intervalResults");
    expect(state.runningActivities.session.route).toEqual(draft.route);
    expect(savePlanToDb).not.toHaveBeenCalled();
  });

  it("rejects an incomplete MAS test before attempting any write", async () => {
    state.plan = [
      session({
        classification: { subcategory: "field_mas_test" } as SessionDay["classification"],
      }),
    ];
    await expect(createSessionActions(context()).saveRunningActivity(runDraft())).rejects.toThrow(
      "Test 5-minutowy nie ma pełnego",
    );
    expect(mocks.writes).toEqual([]);
    expect(readPendingTrainingWrites("athlete")).toEqual([]);
    expect(saveProfileRows).not.toHaveBeenCalled();
  });
});
