// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { EnduranceRunTracker } from "./EnduranceRunTracker";
import { sessionFixture } from "../loadwise/session/testFixtures";
import { loadRunCheckpoint } from "@/lib/running/runCheckpoint";

vi.mock("@/lib/running/nativeRecorder", async (original) => ({
  ...(await original<typeof import("@/lib/running/nativeRecorder")>()),
  nativeRunningAvailable: () => false,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let root: Root, host: HTMLDivElement;
let watch: PositionCallback;
const ownerId = "11111111-1111-4111-8111-111111111111",
  sessionId = "22222222-2222-4222-8222-222222222222";
const save = vi.fn();
const props = {
  ownerId,
  sessionId,
  date: "2026-10-18",
  session: sessionFixture({ sessionType: "Wytrzymałość" }),
  canRecord: true,
  activity: null,
  onSave: save,
  onDelete: vi.fn(),
};
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
  vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
  localStorage.clear();
  save.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (done: PositionCallback) => done(position(52)),
      watchPosition: (done: PositionCallback) => {
        watch = done;
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
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((value) => value.textContent?.includes(label))!;
async function render() {
  await act(async () => root.render(<EnduranceRunTracker {...props} />));
}
async function remount() {
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
}

it("restores finished browser GPS directly to the save review after remount", async () => {
  await render();
  await act(async () => button("Start GPS").click());
  await act(async () => {
    vi.advanceTimersByTime(20_000);
    watch(position(52.001));
  });
  await act(async () => button("Zakończ").click());
  expect(loadRunCheckpoint(ownerId, sessionId)?.phase).toBe("review");
  await remount();
  expect(button("Zapisz bieg")).toBeTruthy();
  await act(async () => button("Zapisz bieg").click());
  expect(save.mock.calls[0][0]).toMatchObject({ source: "gps", sessionId, durationSec: 20 });
  expect(loadRunCheckpoint(ownerId, sessionId)).toBeNull();
});

it("persists an imported GPX review without requiring a prior GPS start", async () => {
  await render();
  const xml =
    '<gpx><trk><trkseg><trkpt lat="52" lon="21"><time>2026-10-18T10:00:00Z</time></trkpt><trkpt lat="52.001" lon="21"><time>2026-10-18T10:00:20Z</time></trkpt></trkseg></trk></gpx>';
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => xml }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(loadRunCheckpoint(ownerId, sessionId)).toMatchObject({
    phase: "review",
    pending: { source: "gpx", durationSec: 20 },
  });
  await remount();
  expect(button("Zapisz bieg")).toBeTruthy();
  await act(async () => button("Zapisz bieg").click());
  expect(save.mock.calls[0][0].source).toBe("gpx");
});
