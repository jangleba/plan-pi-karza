// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnduranceRunTracker } from "./EnduranceRunTracker";
import { sessionFixture } from "../loadwise/session/testFixtures";
import { applyRunningRecipe } from "@/lib/running/recipeSession";
import { INTERVAL_RECIPE } from "@/lib/running/testRecipes";
import type { RunningRecipe } from "@/lib/running/recipe";
import type { RoutePoint } from "@/lib/running/types";

/**
 * Integration tests with mocked location and recorder. They prove the screen logic (map before
 * start, one Start, countdown, intervals, pause, permissions). They do not prove GPS accuracy
 * or background behaviour on a real phone; that is checked separately on a device.
 */
const native = vi.hoisted(() => ({
  enabled: false,
  start: vi.fn(),
  clear: vi.fn(),
  pause: vi.fn(),
  getState: vi.fn(),
}));
vi.mock("@/lib/running/nativeRecorder", async (original) => ({
  ...(await original<typeof import("@/lib/running/nativeRecorder")>()),
  nativeRunningAvailable: () => native.enabled,
  nativeRecorder: {
    getState: native.getState,
    start: native.start,
    clear: native.clear,
    pause: native.pause,
    addListener: () => Promise.resolve({ remove: vi.fn() }),
  },
}));
vi.mock("./RunRouteMap", () => ({
  RunRouteMap: ({ route, placeholder }: { route: RoutePoint[]; placeholder?: string }) => (
    <div aria-label="Mapa trasy biegu" data-route={JSON.stringify(route)}>
      {route.length ? null : placeholder}
    </div>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CONTINUOUS: RunningRecipe = {
  ...INTERVAL_RECIPE,
  id: "run-easy-test",
  method: "easy_continuous",
  title: "Spokojny bieg",
  warmup: { ...INTERVAL_RECIPE.warmup, seconds: 300 },
  blocks: [
    {
      ...INTERVAL_RECIPE.blocks[0],
      id: "easy",
      label: "Bieg",
      repsPerSet: 1,
      work: { seconds: 1200, label: "20 min" },
      recovery: { seconds: 0, mode: "walk" },
    },
  ],
  cooldown: { ...INTERVAL_RECIPE.cooldown, seconds: 300 },
};
const run = (recipe: RunningRecipe) =>
  applyRunningRecipe(sessionFixture({ sessionType: "Wytrzymałość" }), recipe);

let root: Root, host: HTMLDivElement, watch: PositionCallback;
const watchPosition = vi.fn(),
  clearWatch = vi.fn(),
  getCurrentPosition = vi.fn();
let permission: PermissionState | "none" = "granted";
const position = (latitude: number, accuracy = 4): GeolocationPosition => ({
  coords: {
    latitude,
    longitude: 21,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: Date.now(),
  toJSON: () => ({}),
});
const fix = (accuracy = 4) =>
  getCurrentPosition.mockImplementation((done: PositionCallback) => done(position(52, accuracy)));
const fail = (code: number) =>
  getCurrentPosition.mockImplementation((_: PositionCallback, error: PositionErrorCallback) =>
    error({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "" }),
  );

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
  localStorage.clear();
  vi.clearAllMocks();
  native.enabled = false;
  permission = "granted";
  fix();
  watchPosition.mockImplementation((done: PositionCallback) => {
    watch = done;
    return 1;
  });
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition, watchPosition, clearWatch },
    get permissions() {
      return permission === "none"
        ? undefined
        : { query: async () => ({ state: permission, onchange: null }) };
    },
  });
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

const button = (label: string) =>
  [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
const readout = () => host.querySelector('[role="timer"]')?.textContent ?? "";
const text = () => host.textContent ?? "";
const mapRoute = (): RoutePoint[] =>
  JSON.parse(host.querySelector("[data-route]")!.getAttribute("data-route")!);
async function render(
  recipe = CONTINUOUS,
  props: Partial<Parameters<typeof EnduranceRunTracker>[0]> = {},
) {
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        ownerId="runner"
        sessionId="run-1"
        date="2026-11-16"
        session={run(recipe)}
        canRecord
        activity={null}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />,
    ),
  );
  await act(async () => {
    await Promise.resolve();
  });
}
const tick = (seconds: number) =>
  act(async () => {
    for (let i = 0; i < seconds; i++) vi.advanceTimersByTime(1000);
  });

describe("map and counter before Start", () => {
  it("shows the position and the prepared counter at once, without starting or recording", async () => {
    const onBeforeStart = vi.fn(async () => true);
    await render(CONTINUOUS, { onBeforeStart });
    expect(mapRoute()).toHaveLength(1);
    expect(text()).toContain("Pozycja gotowa");
    expect(readout()).toBe("05:00");
    expect(text()).toContain("Rozgrzewka");
    expect(text()).toContain("Następnie");
    expect(text()).toContain("Bieg · 20 min");
    expect(button("Start")).toBeDefined();
    // Opening the map: no watcher, no session start, no saved draft.
    expect(watchPosition).not.toHaveBeenCalled();
    expect(onBeforeStart).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("asks for consent with “Włącz lokalizację” and does not read the position before the click", async () => {
    permission = "prompt";
    await render();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(text()).toContain("Włącz lokalizację, aby zobaczyć pozycję");
    expect(mapRoute()).toHaveLength(0);
    await act(async () => button("Włącz lokalizację")!.click());
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(mapRoute()).toHaveLength(1);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("shows the locating state while the position is pending", async () => {
    getCurrentPosition.mockImplementation(() => undefined);
    const busy = vi.fn();
    await render(CONTINUOUS, { onRecordingChange: busy });
    expect(text()).toContain("Ustalam pozycję GPS");
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(busy).toHaveBeenLastCalledWith(true);
  });

  it.each([
    [1, "wyłączona", "denied"],
    [3, "nie odpowiedział na czas", "timeout"],
    [2, "nie może teraz ustalić", "unavailable"],
  ])("explains a location failure (code %i)", async (code, message) => {
    permission = "prompt";
    fail(code);
    await render();
    await act(async () => button("Włącz lokalizację")!.click());
    expect(text()).toContain(message);
    expect(button("Start")).toBeDefined();
  });

  it("never reads the position when permission is already denied", async () => {
    permission = "denied";
    await render();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(text()).toContain("Lokalizacja jest wyłączona dla BallWise");
  });

  it("without the Permissions API the player still asks explicitly", async () => {
    permission = "none";
    await render();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(button("Włącz lokalizację")).toBeDefined();
  });

  it("another day: same map and planned countdown, Start unavailable, nothing recorded", async () => {
    const onBeforeStart = vi.fn(async () => true);
    await render(CONTINUOUS, {
      canRecord: false,
      previewNote: "Podgląd sesji. Start i zapis biegu są dostępne w dniu treningu.",
      onBeforeStart,
    });
    expect(readout()).toBe("05:00");
    expect(text()).toContain("dostępne w dniu treningu");
    const start = button("Start") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    await act(async () => start.click());
    expect(onBeforeStart).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("states what the browser can and cannot do about GPS in the background", async () => {
    await render();
    expect(text()).toContain("Ciągły pomiar w tle zapewnia aplikacja na iPhonie");
    native.enabled = true;
    native.getState.mockResolvedValue({ present: false });
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(text()).toContain("także po zablokowaniu ekranu");
  });
});

describe("one Start", () => {
  it("starts the session first, then the measurement and the guidance; a double click starts once", async () => {
    let release!: (value: boolean) => void;
    const onBeforeStart = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    await render(CONTINUOUS, { onBeforeStart });
    await act(async () => {
      button("Start")!.click();
      button("Start")!.click();
    });
    expect(onBeforeStart).toHaveBeenCalledOnce();
    expect(watchPosition).not.toHaveBeenCalled();
    expect((button("Rozpoczynanie…") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release(true));
    expect(watchPosition).toHaveBeenCalledOnce();
    expect(text()).toContain("Pauza");
    // No separate “Rozpocznij bieg” / “Start GPS” step.
    expect(button("Rozpocznij bieg")).toBeUndefined();
    expect(button("Start GPS")).toBeUndefined();
  });

  it("does not start measuring when the session could not be started", async () => {
    const onBeforeStart = vi.fn(async () => false);
    await render(CONTINUOUS, { onBeforeStart });
    await act(async () => button("Start")!.click());
    expect(watchPosition).not.toHaveBeenCalled();
    expect(button("Start")).toBeDefined();
  });

  it("leaving the screen while the native recorder starts leaves no orphan run", async () => {
    native.enabled = true;
    native.getState.mockResolvedValue({ present: false });
    let finishStart!: (state: unknown) => void;
    native.start.mockImplementation(() => new Promise((resolve) => (finishStart = resolve)));
    native.clear.mockResolvedValue({ present: false });
    await render();
    await act(async () => button("Start")!.click());
    expect(native.start).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => finishStart({ present: true, phase: "recording", durationSec: 0 }));
    expect(native.clear).toHaveBeenCalledWith({ ownerId: "runner", sessionId: "run-1" });
  });
});

describe("countdown from the saved recipe", () => {
  it("counts 05:00 → 20:00 → 05:00 and shows the current and next stage", async () => {
    await render();
    await act(async () => button("Start")!.click());
    expect(readout()).toBe("05:00");
    expect(text()).toContain("Rozgrzewka");
    await tick(1);
    expect(readout()).toBe("04:59");
    await tick(299);
    expect(text()).toContain("Bieg");
    expect(readout()).toBe("20:00");
    expect(text()).toContain("Schłodzenie · 5 min");
    await tick(1200);
    expect(readout()).toBe("05:00");
    expect(text()).toContain("Koniec biegu");
    await tick(300);
    expect(text()).toContain("Bieg ukończony");
  });

  it("switches work and rest by itself, with the repetition number", async () => {
    await render(INTERVAL_RECIPE);
    expect(readout()).toBe("10:00");
    await act(async () => button("Start")!.click());
    await tick(600);
    expect(text()).toContain("Odcinek 1 z 4");
    expect(readout()).toBe("03:00");
    await tick(180);
    expect(text()).toContain("po odcinku 1 z 4");
    await tick(180);
    expect(text()).toContain("Odcinek 2 z 4");
  });

  it("pause stops the countdown and resume continues it", async () => {
    await render();
    await act(async () => button("Start")!.click());
    await tick(10);
    expect(readout()).toBe("04:50");
    await act(async () => button("Pauza")!.click());
    await tick(30);
    expect(clearWatch).toHaveBeenCalled();
    expect(text()).toContain("Pauza");
    await act(async () => button("Wznów")!.click());
    await tick(5);
    expect(readout()).not.toBe("");
    expect(text()).toContain("Pauza");
    const after = readout();
    expect(after <= "04:50").toBe(true);
    expect(after >= "04:40").toBe(true);
  });
});

describe("live measurement quality", () => {
  it("shows no distance, pace or speed from a weak or missing fix", async () => {
    await render();
    await act(async () => button("Start")!.click());
    await tick(5);
    const metrics = () => host.querySelector(".bw-run-metrics")!.textContent!;
    expect(text()).toContain("Szukam sygnału GPS");
    expect(metrics()).not.toMatch(/km\/h|min\/km/);
    await act(async () => watch(position(52.0005, 80)));
    await tick(2);
    expect(text()).toContain("Słaby sygnał GPS");
    expect(metrics()).not.toMatch(/km\/h/);
  });

  it("reports a lost signal and resumes the metrics when it returns", async () => {
    await render();
    await act(async () => button("Start")!.click());
    await act(async () => watch(position(52)));
    await tick(20);
    await act(async () => watch(position(52.001)));
    await tick(2);
    await act(async () => watch(position(52.002)));
    await tick(15);
    expect(text()).toContain("Utrata sygnału GPS");
    expect(host.querySelector(".bw-run-metrics")!.textContent).not.toMatch(/km\/h/);
    await act(async () => watch(position(52.003)));
    expect(text()).not.toContain("Utrata sygnału GPS");
  });
});
