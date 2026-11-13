// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnduranceRunTracker } from "./EnduranceRunTracker";
import { sessionFixture } from "../loadwise/session/testFixtures";
import type { NativeRunState } from "@/lib/running/nativeRecorder";
import { applyRunningRecipe } from "@/lib/running/recipeSession";
import { EMPTY_DAY_LOAD, selectRunningRecipe } from "@/lib/running/prescription";
import { loadRunHistory } from "@/lib/running/routeHistory";

const mock = vi.hoisted(() => ({
  listeners: new Map<string, (value: unknown) => void>(),
  get: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
  clear: vi.fn(),
  intervals: vi.fn(),
  save: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  signal: vi.fn(),
}));
vi.mock("@/lib/running/nativeRecorder", async (load) => ({
  ...(await load<typeof import("@/lib/running/nativeRecorder")>()),
  nativeRunningAvailable: () => true,
  nativeRecorder: {
    getState: mock.get,
    start: mock.start,
    finish: mock.finish,
    clear: mock.clear,
    updateIntervals: mock.intervals,
    addListener: (event: string, fn: (value: unknown) => void) => {
      mock.listeners.set(event, fn);
      return Promise.resolve({ remove: async () => undefined });
    },
  },
}));
vi.mock("@/lib/running/lockScreenCues", async (load) => ({
  ...(await load<typeof import("@/lib/running/lockScreenCues")>()),
  scheduleLockScreenCues: mock.schedule,
  cancelLockScreenCues: mock.cancel,
  ensureLockScreenPermission: async () => true,
}));
vi.mock("@/lib/running/runSignals", async (load) => ({
  ...(await load<typeof import("@/lib/running/runSignals")>()),
  signalStep: mock.signal,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const ownerId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const T0 = Date.UTC(2026, 10, 12, 10, 0, 0);
const SPEED = 3; // m/s
let root: Root, host: HTMLDivElement;

const recipe = selectRunningRecipe({
  date: "2026-11-12",
  age: 20,
  level: "intermediate",
  goal: "endurance",
  limiter: null,
  progressionLevel: 0,
  phase: "preseason",
  availableMin: 60,
  mdLabel: null,
  sameDay: EMPTY_DAY_LOAD,
  previousDay: EMPTY_DAY_LOAD,
  nextDay: EMPTY_DAY_LOAD,
  week: { hardRuns: 0, methods: [], lastMethod: null, matches: 0, clubSessions: 0 },
  doubleHeavyAllowed: false,
}).recipe;
const session = applyRunningRecipe(sessionFixture({ dbId: sessionId }), recipe);
const warmup = recipe.warmup.seconds;

const state = (patch: Partial<NativeRunState>): NativeRunState => ({
  present: true,
  ownerId,
  sessionId,
  date: "2026-11-12",
  startedAt: new Date(T0).toISOString(),
  phase: "recording",
  durationSec: 0,
  distanceM: 0,
  pointCount: 1,
  ...patch,
});
const emit = (value: NativeRunState) => mock.listeners.get("runState")?.(value);
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) ??
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;
function setVisibility(value: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  Object.defineProperty(document, "hidden", { configurable: true, value: value === "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(T0);
  localStorage.clear();
  Object.values(mock).forEach((fn) => typeof fn === "function" && fn.mockReset());
  mock.listeners.clear();
  mock.get.mockResolvedValue({ present: false });
  mock.start.mockImplementation(async () => state({}));
  mock.intervals.mockResolvedValue({});
  mock.clear.mockResolvedValue({ present: false });
  mock.save.mockResolvedValue(undefined);
  mock.schedule.mockResolvedValue(undefined);
  mock.cancel.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("prowadzi recepturę przy zablokowanym ekranie i liczy odcinki z trasy telefonu", async () => {
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        ownerId={ownerId}
        sessionId={sessionId}
        session={session}
        date="2026-11-12"
        canRecord
        activity={null}
        onSave={mock.save}
        onDelete={vi.fn()}
      />,
    ),
  );
  await act(async () => button("Start GPS").click());
  // Prowadzenie startuje razem z GPS — bez osobnego przycisku.
  expect(host.textContent).toContain("Rozgrzewka");
  expect(mock.signal).toHaveBeenCalledTimes(1);

  await act(async () => setVisibility("hidden"));
  expect(mock.schedule).toHaveBeenCalledOnce();
  const cues = mock.schedule.mock.calls[0][0] as { at: number; title: string }[];
  expect(cues[0].at).toBe(T0 + warmup * 1000);

  // Telefon zablokowany: JS stoi, natywny GPS mierzy dalej.
  const later = warmup + 40;
  vi.setSystemTime(T0 + later * 1000);
  mock.signal.mockClear();
  await act(async () => emit(state({ durationSec: later, distanceM: later * SPEED })));
  await act(async () => setVisibility("visible"));
  expect(mock.cancel).toHaveBeenCalled();
  expect(host.textContent).toContain(cues[0].title);
  expect(host.textContent).toMatch(/Odcinek 1\//);
  // Zaległa zmiana kroku nie odtwarza starego sygnału.
  expect(mock.signal).not.toHaveBeenCalled();

  const route = Array.from({ length: later + 1 }, (_, i) => [
    52 + (i * SPEED) / 111_195,
    21,
    T0 / 1000 + i,
    i,
    5,
    0,
  ]);
  mock.finish.mockResolvedValue(
    state({ phase: "review", durationSec: later, distanceM: later * SPEED, route }),
  );
  await act(async () => button("Zakończ").click());
  await act(async () => button("Zapisz bieg").click());
  const draft = mock.save.mock.calls[0][0];
  expect(draft.route.length).toBeGreaterThan(100);
  expect(draft.intervalResults[0]).toMatchObject({ completed: true, durationSec: warmup });
  // Dystans rozgrzewki z trasy, choć granica minęła przy zablokowanym ekranie.
  expect(draft.intervalResults[0].distanceM).toBeGreaterThan(warmup * SPEED * 0.95);
  expect(draft.intervalResults[0].distanceM).toBeLessThan(warmup * SPEED * 1.05);
  expect(draft.intervalResults[1]).toMatchObject({ completed: false, durationSec: 40 });
  // Trasa zostaje w historii telefonu.
  expect(loadRunHistory(ownerId)[0]?.sessionId).toBe(sessionId);
});
