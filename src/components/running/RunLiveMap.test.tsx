// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnduranceRunTracker } from "./EnduranceRunTracker";
import { sessionFixture } from "../loadwise/session/testFixtures";
import type { RoutePoint } from "@/lib/running/types";
import { formatDistance, formatPace, haversineDistanceM } from "@/lib/running/metrics";

const native = vi.hoisted(() => ({
  enabled: false,
  get: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@/lib/running/nativeRecorder", async (original) => ({
  ...(await original<typeof import("@/lib/running/nativeRecorder")>()),
  nativeRunningAvailable: () => native.enabled,
  nativeRecorder: {
    getState: native.get,
    start: native.start,
    finish: native.finish,
    clear: native.clear,
    addListener: () => Promise.resolve({ remove: vi.fn() }),
  },
}));
vi.mock("./RunRouteMap", () => ({
  RunRouteMap: ({ route }: { route: RoutePoint[] }) => (
    <div aria-label="Mapa trasy biegu" data-route={JSON.stringify(route)} />
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let root: Root, host: HTMLDivElement, watch: PositionCallback;
const save = vi.fn(),
  watchPosition = vi.fn(),
  clearWatch = vi.fn();
const position = (latitude: number): GeolocationPosition => ({
  coords: {
    latitude,
    longitude: 21,
    accuracy: 3,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: Date.now(),
  toJSON: () => ({}),
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
  localStorage.clear();
  vi.clearAllMocks();
  native.enabled = false;
  watchPosition.mockImplementation((done: PositionCallback) => {
    watch = done;
    return watchPosition.mock.calls.length;
  });
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (done: PositionCallback) => done(position(52)),
      watchPosition,
      clearWatch,
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
  [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === label)!;
const liveRoute = (): RoutePoint[] =>
  JSON.parse(
    host
      .querySelector('[aria-label="Mapa biegu na żywo"] [data-route]')!
      .getAttribute("data-route")!,
  );

it("shows an ordinary run's accepted GPS track alongside live time, distance and pace using one watcher", async () => {
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        ownerId="runner"
        sessionId="ordinary-run"
        date="2026-11-16"
        session={sessionFixture({ sessionType: "Wytrzymałość" })}
        canRecord
        activity={null}
        onSave={save}
        onDelete={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector('[aria-label="Mapa biegu na żywo"]')).toBeNull();
  expect(watchPosition).not.toHaveBeenCalled();
  await act(async () => button("Start").click());
  expect(liveRoute()).toHaveLength(1);
  expect(watchPosition).toHaveBeenCalledOnce();

  await act(async () => {
    vi.advanceTimersByTime(20_000);
    watch(position(52.001));
  });
  const route = liveRoute();
  expect(route).toHaveLength(2);
  expect(route.at(-1)).toMatchObject({ lat: 52.001, lng: 21, elapsedSec: 20 });
  const distanceM = haversineDistanceM(route[0], route[1]);
  expect(host.querySelector(".bw-run-live")!.textContent).toContain("0:20");
  const metrics = host.querySelector(".bw-run-metrics")!.textContent!;
  expect(metrics).toContain(formatDistance(distanceM));
  expect(metrics).toContain(formatPace(20 / (distanceM / 1000)));
  // Average pace and speed come from the same accepted track.
  expect(metrics).toContain("Tempo średnie");
  expect(metrics).toContain(`${((distanceM / 20) * 3.6).toFixed(1).replace(".", ",")} km/h`);
  expect(save).not.toHaveBeenCalled();

  await act(async () => button("Pauza").click());
  expect(clearWatch).toHaveBeenCalledExactlyOnceWith(1);
  await act(async () => {
    vi.advanceTimersByTime(20_000);
    watch(position(52.002));
  });
  expect(liveRoute()).toEqual(route);
  await act(async () => button("Wznów").click());
  expect(watchPosition).toHaveBeenCalledTimes(2);
  await act(async () => {
    vi.advanceTimersByTime(20_000);
    watch(position(52.002));
  });
  const resumedRoute = liveRoute();
  expect(resumedRoute).toHaveLength(3);
  expect(resumedRoute.at(-1)?.segment).not.toBe(route.at(-1)?.segment);
  expect(save).not.toHaveBeenCalled();
});

it("starts a fresh native map when recording the same session again", async () => {
  native.enabled = true;
  const oldPoint = [52, 21, Date.now() / 1000, 0, 3, 0];
  const priorRun = {
    present: true,
    ownerId: "runner",
    sessionId: "ordinary-run",
    date: "2026-11-16",
    phase: "paused",
    startedAt: new Date().toISOString(),
    durationSec: 20,
    distanceM: 100,
    pointCount: 2,
    livePoint: oldPoint,
  };
  native.get.mockResolvedValue(priorRun);
  native.finish.mockResolvedValue({ ...priorRun, phase: "review", route: [oldPoint] });
  native.clear.mockResolvedValue({ present: false });
  native.start.mockResolvedValue({
    ...priorRun,
    phase: "recording",
    durationSec: 0,
    distanceM: 0,
    pointCount: 0,
    livePoint: undefined,
  });
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        ownerId="runner"
        sessionId="ordinary-run"
        date="2026-11-16"
        session={sessionFixture({ sessionType: "Wytrzymałość" })}
        canRecord
        activity={null}
        onSave={save}
        onDelete={vi.fn()}
      />,
    ),
  );
  expect(liveRoute()).toHaveLength(1);
  await act(async () => button("Zakończ bieg").click());
  await act(async () => button("Zapisz bieg").click());
  await act(async () => button("Start").click());
  expect(liveRoute()).toEqual([]);
  expect(native.start).toHaveBeenCalledOnce();
  expect(watchPosition).not.toHaveBeenCalled();
});
