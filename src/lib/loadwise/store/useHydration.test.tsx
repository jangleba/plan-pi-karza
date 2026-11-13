// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadwiseState, SessionHistoryRecord } from "../types";
import { buildProfile, initialState, type StoreUser } from "./model";
import { resetPlanWriteGuard } from "./planWriteGuard";
import { useHydration } from "./useHydration";

type RemoteRows = Record<string, unknown>;
const mocks = vi.hoisted(() => ({
  cached: new Map<string, LoadwiseState>(),
  requests: new Map<string, Promise<RemoteRows>>(),
  queries: vi.fn(),
  history: vi.fn(),
  clearBootState: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      let userId = "";
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        range: () => chain,
        gte: () => chain,
        abortSignal: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => chain,
        eq(column: string, value: unknown) {
          filters[column] = value;
          if (column === "user_id") userId = String(value);
          return chain;
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          mocks.queries(table, userId, filters);
          const request = mocks.requests.get(`${userId}:${table}`) ?? mocks.requests.get(userId);
          if (!request) throw new Error(`Missing request for ${userId}`);
          return request
            .then((rows) => ({ data: rows[table] ?? null, error: null }))
            .then(resolve, reject);
        },
      };
      return chain;
    },
  },
}));
vi.mock("../legalStatus", () => ({ primeConsentRows: vi.fn() }));
vi.mock("../bootCache", () => ({
  loadBootState: (userId: string) => mocks.cached.get(userId) ?? null,
  clearBootState: mocks.clearBootState,
}));
vi.mock("./repository", () => ({
  loadSessionHistory: mocks.history,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function remoteRows(name: string): RemoteRows {
  return {
    profiles: { full_name: name, onboarding_completed: false },
    athlete_profiles: { age: 20, position: "midfielder" },
  };
}

function cachedState(name: string): LoadwiseState {
  return {
    ...initialState,
    profile: buildProfile({ full_name: name }, { age: 20, position: "midfielder" }, null),
  };
}

let root: Root;
let host: HTMLDivElement;
let snapshot: { state: LoadwiseState; hydrated: boolean };
let mounted: boolean;
let changeState: (update: (current: LoadwiseState) => LoadwiseState) => void;
const onRender = vi.fn();
function Harness({
  user,
  recoveryMode = false,
  profileWritePending = false,
}: {
  user: StoreUser;
  recoveryMode?: boolean;
  profileWritePending?: boolean;
}) {
  const [state, setState] = useState(initialState);
  changeState = setState;
  const hydrated = useHydration({
    user,
    authLoading: false,
    recoveryMode,
    profileWritePending,
    setState,
    state,
  });
  snapshot = { state, hydrated };
  onRender(snapshot);
  return <span>{state.profile?.name ?? "signed out"}</span>;
}

async function render(user: StoreUser, recoveryMode = false) {
  await act(async () => root.render(<Harness user={user} recoveryMode={recoveryMode} />));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.cached.clear();
  mocks.requests.clear();
  mocks.queries.mockClear();
  mocks.history.mockReset().mockResolvedValue([]);
  mocks.clearBootState.mockClear();
  onRender.mockClear();
  resetPlanWriteGuard();
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("store hydration", () => {
  it("opens the app while running history is still loading and merges it without undoing a new local result", async () => {
    const runs = deferred<RemoteRows>();
    const rows = remoteRows("Athlete");
    rows.profiles = { full_name: "Athlete", onboarding_completed: true };
    mocks.requests.set("a", Promise.resolve(rows));
    mocks.requests.set("a:running_activities", runs.promise);
    await render({ id: "a" });
    await act(async () => {
      await vi.waitFor(() => expect(snapshot.state.profile?.onboardingComplete).toBe(true));
    });
    expect(snapshot.hydrated).toBe(true);
    expect(snapshot.state.plan).toEqual([]);
    const localRun = {
      id: "local",
      sessionId: "new-run",
      distanceM: 4000,
    } as LoadwiseState["runningActivities"][string];
    await act(async () =>
      changeState((current) => ({
        ...current,
        runningActivities: { ...current.runningActivities, "new-run": localRun },
      })),
    );
    await act(async () =>
      runs.resolve({
        running_activities: [
          {
            id: "old",
            session_id: "old-run",
            date: "2026-09-28",
            duration_sec: 600,
            distance_m: 2000,
          },
        ],
      }),
    );
    expect(snapshot.state.runningActivities["old-run"].distanceM).toBe(2000);
    expect(snapshot.state.runningActivities["new-run"]).toBe(localRun);
  });

  it("does not restore a previous account's delayed running history", async () => {
    const runs = deferred<RemoteRows>();
    mocks.requests.set("a", Promise.resolve(remoteRows("Athlete A")));
    mocks.requests.set("a:running_activities", runs.promise);
    mocks.requests.set("b", Promise.resolve(remoteRows("Athlete B")));
    await render({ id: "a" });
    await render({ id: "b" });
    await act(async () =>
      runs.resolve({
        running_activities: [
          {
            id: "old",
            session_id: "private-run-a",
            date: "2026-09-28",
            duration_sec: 600,
            distance_m: 2000,
          },
        ],
      }),
    );
    expect(snapshot.state.profile?.name).toBe("Athlete B");
    expect(snapshot.state.runningActivities).toEqual({});
  });

  it("retains cached runs when their background refresh fails", async () => {
    const runs = deferred<RemoteRows>();
    const cached = cachedState("Athlete");
    cached.runningActivities = {
      saved: { id: "saved" } as LoadwiseState["runningActivities"][string],
    };
    mocks.cached.set("a", cached);
    mocks.requests.set("a", Promise.resolve(remoteRows("Athlete")));
    mocks.requests.set("a:running_activities", runs.promise);
    await render({ id: "a" });
    await act(async () => runs.reject(new Error("Run history unavailable")));
    expect(snapshot.hydrated).toBe(true);
    expect(snapshot.state.runningActivities.saved.id).toBe("saved");
  });
  it("shows cached state before refreshing it, then merges background history", async () => {
    const remote = deferred<RemoteRows>();
    const history = deferred<SessionHistoryRecord[]>();
    mocks.requests.set("a", remote.promise);
    mocks.cached.set("a", cachedState("Cached athlete"));
    mocks.history.mockReturnValue(history.promise);

    await render({ id: "a" });
    expect(snapshot.hydrated).toBe(true);
    expect(snapshot.state.profile?.name).toBe("Cached athlete");

    await act(async () => remote.resolve(remoteRows("Updated athlete")));
    expect(mocks.queries).toHaveBeenCalledWith("profiles", "a", { user_id: "a" });
    expect(snapshot.state.profile?.name).toBe("Updated athlete");
    expect(snapshot.state.history).toEqual([]);
    const completed = {
      key: "session-a",
      date: "2026-09-28",
      title: "Match",
      category: "match",
      durationMin: 90,
      rpe: 7,
      notes: "",
    } satisfies SessionHistoryRecord;
    await act(async () => history.resolve([completed]));
    expect(snapshot.state.profile?.name).toBe("Updated athlete");
    expect(snapshot.state.history).toEqual([completed]);
  });

  it("ignores a previous user's slow hydration response", async () => {
    const first = deferred<RemoteRows>();
    const second = deferred<RemoteRows>();
    mocks.requests.set("a", first.promise);
    mocks.requests.set("b", second.promise);
    await render({ id: "a" });
    await render({ id: "b" });
    await act(async () => second.resolve(remoteRows("Athlete B")));
    await act(async () => first.resolve(remoteRows("Athlete A")));
    expect(snapshot.state.profile?.name).toBe("Athlete B");
    expect(snapshot.hydrated).toBe(true);
  });

  it("does not show the previous account while the next account has no cache", async () => {
    const first = deferred<RemoteRows>();
    const second = deferred<RemoteRows>();
    mocks.requests.set("a", first.promise);
    mocks.requests.set("b", second.promise);
    mocks.cached.set("a", cachedState("Athlete A"));
    await render({ id: "a" });
    expect(snapshot.state.profile?.name).toBe("Athlete A");
    await render({ id: "b" });
    expect(snapshot.state.profile).toBeNull();
    expect(snapshot.hydrated).toBe(false);
  });

  it("preserves a new completion while removing health notes when the server confirms no consent", async () => {
    const remote = deferred<RemoteRows>();
    mocks.requests.set("a", remote.promise);
    mocks.cached.set("a", cachedState("Athlete A"));
    await render({ id: "a" });
    await act(async () =>
      changeState((current) => ({
        ...current,
        completions: { ...current.completions, new: { completed: true, rpe: 7, notes: "new" } },
      })),
    );
    await act(async () => remote.resolve(remoteRows("Updated athlete")));
    expect(snapshot.state.completions.new).toEqual({ completed: true, rpe: 7, notes: "" });
    expect(snapshot.state.profile?.name).toBe("Updated athlete");
  });

  it("preserves a profile and plan edit if background refresh fails", async () => {
    const remote = deferred<RemoteRows>();
    mocks.requests.set("a", remote.promise);
    mocks.cached.set("a", cachedState("Athlete A"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await render({ id: "a" });
    await act(async () =>
      changeState((current) => ({
        ...current,
        profile: { ...current.profile!, name: "New name" },
        modifications: { today: [] },
      })),
    );
    await act(async () => remote.reject(new Error("Offline")));
    expect(snapshot.state.profile?.name).toBe("New name");
    expect(snapshot.state.modifications).toEqual({ today: [] });
  });

  it("cannot restore old history after logout", async () => {
    const history = deferred<SessionHistoryRecord[]>();
    mocks.requests.set("a", Promise.resolve(remoteRows("Athlete A")));
    mocks.history.mockReturnValue(history.promise);
    await render({ id: "a" });
    await render(null);
    await act(async () =>
      history.resolve([
        {
          key: "old",
          date: "2026-09-28",
          title: "Old",
          category: "gym",
          durationMin: 30,
          rpe: 6,
          notes: "",
        },
      ]),
    );
    expect(snapshot.state).toEqual(initialState);
    expect(mocks.clearBootState).toHaveBeenCalledWith("a");
  });

  it("does not update state after unmount and skips loading during recovery", async () => {
    const remote = deferred<RemoteRows>();
    mocks.requests.set("a", remote.promise);
    await render({ id: "a" }, true);
    expect(snapshot.hydrated).toBe(false);
    expect(mocks.queries).not.toHaveBeenCalled();
    await render({ id: "a" });
    await act(async () => root.unmount());
    mounted = false;
    const renders = onRender.mock.calls.length;
    await act(async () => remote.resolve(remoteRows("Too late")));
    expect(onRender).toHaveBeenCalledTimes(renders);
  });

  it("keeps safe cached data and finishes loading after a network failure", async () => {
    const remote = deferred<RemoteRows>();
    mocks.requests.set("a", remote.promise);
    mocks.cached.set("a", cachedState("Cached athlete"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await render({ id: "a" });
    await act(async () => remote.reject(new Error("Network unavailable")));
    expect(snapshot.hydrated).toBe(true);
    expect(snapshot.state.profile?.name).toBe("Cached athlete");
    expect(snapshot.state.readiness).toEqual({});
    expect(snapshot.state.equipmentNotice).toContain("ostatnie dostępne dane");
  });
  it("restores an explicitly saved V2 plan without generating a replacement",async()=>{
    const rows=remoteRows("Athlete");
    rows.profiles={full_name:"Athlete",onboarding_completed:true};
    const profile=buildProfile(rows.profiles as Record<string,unknown>,rows.athlete_profiles as Record<string,unknown>,null)!;
    const {generateTrainingPlan}=await import("../engineV2/planner");
    const generated=generateTrainingPlan(profile,{startDate:"2026-11-02"}).plan;
    rows.training_plans={id:"saved-v2",plan_json:generated};
    mocks.requests.set("a",Promise.resolve(rows));
    await render({id:"a"});
    await act(async()=>{await vi.waitFor(()=>expect(snapshot.state.plan).toHaveLength(28));});
    expect(snapshot.state.plan[0].generatorVersion).toBe("ballwise-v2.3");
    expect(snapshot.state.planGeneratedFor).toBe("2026-11-02");
  });
  it("reads the active header but never revives an unversioned legacy plan", async () => {
    const rows = remoteRows("Athlete");
    rows.profiles = { full_name: "Athlete", onboarding_completed: true };
    rows.training_plans = {
      id: "stored-plan",
      plan_json: [{ date: "2026-09-29", dayType: "training", title: "Stary trening" }],
      created_at: "2026-09-28T12:00:00Z",
    };
    mocks.requests.set("a", Promise.resolve(rows));
    await render({ id: "a" });
    await act(async () => {
      await vi.waitFor(() => expect(snapshot.state.profile?.onboardingComplete).toBe(true));
    });
    expect(snapshot.state.plan).toEqual([]);
    expect(snapshot.state.planGeneratedFor).toBeNull();
    expect(snapshot.state.transitions).toEqual({});
    const tables = mocks.queries.mock.calls.map(([table]) => table);
    expect(tables).toContain("training_plans");
    expect(tables).not.toContain("weekly_transitions");
  });
});

it("does not start hydration queries while an atomic profile write is active, then refreshes once", async () => {
  mocks.requests.set("a", Promise.resolve(remoteRows("Saved athlete")));
  await act(async () => root.render(<Harness user={{ id: "a" }} profileWritePending />));
  expect(mocks.queries).not.toHaveBeenCalled();
  await act(async () => {
    window.dispatchEvent(new Event("ballwise:consent-changed"));
    window.dispatchEvent(new Event("ballwise:server-state-changed"));
  });
  expect(mocks.queries).not.toHaveBeenCalled();
  await render({ id: "a" });
  expect(mocks.queries.mock.calls.filter(([table]) => table === "profiles")).toHaveLength(1);
});
