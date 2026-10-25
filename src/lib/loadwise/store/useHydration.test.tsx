// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadwiseState, SessionHistoryRecord } from "../types";
import { buildProfile, initialState, type StoreUser } from "./model";
import { useHydration } from "./useHydration";

type RemoteRows = Record<string, unknown>;
const mocks = vi.hoisted(() => ({
  cached: new Map<string, LoadwiseState>(),
  requests: new Map<string, Promise<RemoteRows>>(),
  queries: vi.fn(),
  history: vi.fn(),
  clearBootState: vi.fn(),
  persist: vi.fn(),
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
          const request = mocks.requests.get(userId);
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
vi.mock("../persist", () => ({ persistMonthlyPlan: mocks.persist }));
vi.mock("../legalStatus", () => ({ primeConsentRows: vi.fn() }));
vi.mock("../bootCache", () => ({
  loadBootState: (userId: string) => mocks.cached.get(userId) ?? null,
  clearBootState: mocks.clearBootState,
}));
vi.mock("./repository", () => ({
  loadSessionHistory: mocks.history,
  clearFutureOverlaysForUser: vi.fn(),
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
function Harness({ user, recoveryMode = false }: { user: StoreUser; recoveryMode?: boolean }) {
  const [state, setState] = useState(initialState);
  changeState = setState;
  const hydrated = useHydration({
    user,
    authLoading: false,
    recoveryMode,
    todayIso: "2026-09-29",
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
  mocks.persist.mockReset().mockImplementation(async (_user, _profile, plan) => plan);
  onRender.mockClear();
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
    expect(mocks.queries).toHaveBeenCalledWith("training_plans", "a", {
      user_id: "a", status: "active", active: true,
    });
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
  it("keeps the expected active header when recovering an empty corrupted plan snapshot", async () => {
    const rows = remoteRows("Athlete");
    rows.profiles = { full_name: "Athlete", onboarding_completed: true };
    rows.training_plans = {
      id: "existing-active-header",
      plan_json: [],
      created_at: "2026-09-28T12:00:00Z",
    };
    mocks.requests.set("a", Promise.resolve(rows));
    await render({ id: "a" });
    await act(async () => {
      await vi.waitFor(() => expect(mocks.persist).toHaveBeenCalled(), { timeout: 5000 });
    });
    const plan = mocks.persist.mock.calls[0][2] as { planDbId?: string }[];
    expect(plan[0].planDbId).toBe("existing-active-header");
  });
});
