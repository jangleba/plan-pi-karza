// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnduranceRunTracker } from "./EnduranceRunTracker";
import { sessionFixture } from "../loadwise/session/testFixtures";
import { buildMasTestSession } from "@/lib/loadwise/engineV2/masTestRecipe";
import type { Profile } from "@/lib/loadwise/types";
vi.mock("@/lib/running/nativeRecorder", async (load) => ({
  ...(await load<typeof import("@/lib/running/nativeRecorder")>()),
  nativeRunningAvailable: () => false,
}));
vi.mock("./RunRouteMap", () => ({
  RunRouteMap: ({ route }: { route: unknown[] }) => (
    <div aria-label="Mapa trasy biegu">Punkty: {route.length}</div>
  ),
}));
vi.mock("@/lib/running/runSignals", () => ({
  signalStep: vi.fn(),
  unlockSignals: vi.fn(),
  loadSignalOptions: () => ({}),
}));
vi.mock("@/lib/running/lockScreenCues", () => ({
  cancelLockScreenCues: vi.fn(),
  ensureLockScreenPermission: vi.fn(),
  planLockScreenCues: vi.fn(),
  scheduleLockScreenCues: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let root: Root, host: HTMLDivElement, watch: PositionCallback;
const save = vi.fn();
const T0 = Date.parse("2026-11-14T10:00:00Z");
const position = (meters = 0): GeolocationPosition => ({
  coords: {
    latitude: 0,
    longitude: meters / 111194.92664455874,
    accuracy: 4,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: Date.now(),
  toJSON: () => ({}),
});
const recipe = buildMasTestSession(
  { age: 24, level: "advanced" } as Profile,
  "2026-11-14",
).runningRecipe!;
const session = sessionFixture({
  date: "2026-11-14",
  runningRecipe: recipe,
  classification: { subcategory: "field_mas_test" } as never,
});
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  save.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (cb: PositionCallback) => cb(position(((Date.now() - T0) / 1000) * 4)),
      watchPosition: (cb: PositionCallback) => {
        watch = cb;
        return 1;
      },
      clearWatch: vi.fn(),
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
async function render() {
  await act(async () =>
    root.render(
      <EnduranceRunTracker
        ownerId="athlete"
        sessionId="mas"
        date="2026-11-14"
        session={session}
        canRecord
        activity={null}
        onSave={save}
        onDelete={vi.fn()}
      />,
    ),
  );
}
async function begin() {
  await render();
  expect(button("Rozpocznij rozgrzewkę").disabled).toBe(true);
  await act(async () => button("Włącz lokalizację").click());
  await act(async () => {
    const box = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    box.click();
  });
  await act(async () => button("Rozpocznij rozgrzewkę").click());
}
async function travel(seconds: number) {
  for (let i = 0; i < seconds; i += 2)
    await act(async () => {
      vi.advanceTimersByTime(2000);
      watch(position(((Date.now() - T0) / 1000) * 4));
    });
}
it("prepares GPS before starting; runs warm-up, explicit ready/countdown and a non-pausable 300-second trial", async () => {
  await begin();
  await travel(600);
  expect(host.textContent).toContain("Gotowy do próby 5 min");
  expect(host.textContent).not.toContain("Zakończ ten krok");
  await act(async () => button("Start próby 5 min").click());
  expect(host.textContent).toContain("3");
  await act(async () => {
    vi.advanceTimersByTime(3000);
    watch(position(2412));
  });
  expect(host.textContent).toContain("05:00");
  expect(host.querySelector('[aria-label="Dystans próby MAS"]')?.textContent).toBe("0 m");
  expect([...host.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Pauza")).toBe(
    false,
  );
  await travel(302);
  await travel(300);
  await act(async () => button("Zakończ bieg").click());
  expect(host.textContent).toContain("Próba spełnia warunki zapisu");
  await act(async () => button("Zapisz bieg").click());
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][0].masTestEvidence).toMatchObject({
    durationSec: 300,
    wallDurationSec: 300,
    interrupted: false,
  });
  expect(save.mock.calls[0][0].masTestEvidence.distanceM).toBeCloseTo(1200, 0);
});
it("invalidates a web trial hidden during the test and retains the activity for review", async () => {
  await begin();
  await travel(600);
  await act(async () => button("Start próby 5 min").click());
  await act(async () => {
    vi.advanceTimersByTime(3000);
    watch(position(2412));
  });
  await travel(100);
  await act(async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(host.textContent).toContain("Próba MAS przerwana");
  await act(async () => button("Przerwij i podsumuj bieg").click());
  expect(host.textContent).toContain("Bieg zapiszesz w historii");
});
