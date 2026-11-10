// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { RunClock } from "./RunClock";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
const m = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "clock-owner" } }) }));
vi.mock("@/lib/loadwise/setLogs", () => ({ useExerciseSetLogs: () => ({ saveSet: m.save }) }));
let root: Root, host: HTMLDivElement;
const finish = vi.fn(),
  busy = vi.fn();
const session = sessionFixture({
  dbId: "clock-session",
  sections: {
    warmup: [],
    main: [{ name: "Bieg", prescription: "2 × 1 s / 1 s" }],
    accessory: [],
    footballTransfer: [],
    cooldown: [],
  },
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date", "performance"] });
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  m.save.mockReset().mockResolvedValue(true);
  finish.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
async function render() {
  await act(async () =>
    root.render(<RunClock session={session} enabled onBusy={busy} onFinish={finish} />),
  );
}
it("advances work and rest while earlier network saves are still pending", async () => {
  const resolvers: ((v: boolean) => void)[] = [];
  m.save.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
  await render();
  await act(async () => button("Start biegu").click());
  await act(async () => vi.advanceTimersByTime(1000));
  expect(host.textContent).toContain("Przerwa");
  expect(m.save).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(host.querySelector(".bw-focus-stage")?.textContent).toContain("Praca");
  expect(m.save).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(m.save).toHaveBeenCalledTimes(3);
  expect(finish).not.toHaveBeenCalled();
  await act(async () => resolvers.forEach((resolve) => resolve(true)));
  expect(finish).toHaveBeenCalledOnce();
  expect(finish.mock.calls[0][0]).toBeCloseTo(3, 4);
  expect(m.save.mock.calls.map((c) => c[0].metricKind)).toEqual([
    "run_clock",
    "run_rest",
    "run_clock",
  ]);
  expect(m.save.mock.calls.every((c) => c[0].weightKg === null)).toBe(true);
});
it("retains a failed final result for explicit retry", async () => {
  m.save.mockResolvedValue(false);
  await render();
  await act(async () => button("Start biegu").click());
  await act(async () => vi.advanceTimersByTime(600));
  await act(async () => button("Zakończ bieg").click());
  expect(finish).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  m.save.mockResolvedValue(true);
  await act(async () => button("Przejdź do podsumowania").click());
  expect(finish).toHaveBeenCalledOnce();
  expect(m.save.mock.calls[0][0].metricKind).toBe("run_clock_partial");
});

it("pauses and preserves the observed portion when leaving the route", async () => {
  await render();
  await act(async () => button("Start biegu").click());
  await act(async () => vi.advanceTimersByTime(600));
  await act(async () => root.render(null));
  await act(async () => vi.advanceTimersByTime(10000));
  await render();
  expect(button("Wznów bieg")).toBeTruthy();
  expect(m.save).not.toHaveBeenCalled();
  await act(async () => button("Wznów bieg").click());
  await act(async () => vi.advanceTimersByTime(400));
  expect(m.save).toHaveBeenCalledOnce();
  expect(m.save.mock.calls[0][0].metricValue).toBeCloseTo(1, 4);
});
