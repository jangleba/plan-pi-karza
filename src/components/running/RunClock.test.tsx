// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { RunClock } from "./RunClock";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { applyRunningRecipe } from "@/lib/running/recipeSession";
import { INTERVAL_RECIPE } from "@/lib/running/testRecipes";

const m = vi.hoisted(() => ({
  save: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  signal: vi.fn(),
  tick: vi.fn(),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "clock-owner" } }) }));
vi.mock("@/lib/loadwise/setLogs", () => ({ useExerciseSetLogs: () => ({ saveSet: m.save }) }));
vi.mock("@/lib/running/lockScreenCues", async (load) => ({
  ...(await load<typeof import("@/lib/running/lockScreenCues")>()),
  scheduleLockScreenCues: m.schedule,
  cancelLockScreenCues: m.cancel,
  ensureLockScreenPermission: async () => false,
}));
vi.mock("@/lib/running/runSignals", async (load) => ({
  ...(await load<typeof import("@/lib/running/runSignals")>()),
  signalStep: m.signal,
  signalTick: m.tick,
}));

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
  Object.values(m).forEach((fn) => fn.mockReset());
  m.save.mockResolvedValue(true);
  m.schedule.mockResolvedValue(undefined);
  m.cancel.mockResolvedValue(undefined);
  finish.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const button = (name: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name,
  )!;
const stage = () => host.querySelector(".bw-run-clock-stage")?.textContent;
async function render(day = session) {
  await act(async () =>
    root.render(<RunClock session={day} enabled onBusy={busy} onFinish={finish} />),
  );
}
function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

it("prowadzi bieg i przerwę automatycznie, nie czekając na zapis w sieci", async () => {
  const resolvers: ((v: boolean) => void)[] = [];
  m.save.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
  await render();
  expect(stage()).toBe("Gotowy");
  await act(async () => button("Start").click());
  expect(stage()).toBe("Bieg");
  await act(async () => vi.advanceTimersByTime(1000));
  expect(stage()).toBe("Przerwa");
  expect(m.save).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(stage()).toBe("Bieg");
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
  expect(m.signal).toHaveBeenCalled();
  expect(m.signal.mock.calls.at(-1)?.[0]).toBeNull();
});

it("zachowuje nieudany zapis do ponowienia i zapisuje odcinek jako częściowy", async () => {
  m.save.mockResolvedValue(false);
  await render();
  await act(async () => button("Start").click());
  await act(async () => vi.advanceTimersByTime(600));
  await act(async () => button("Zakończ bieg").click());
  expect(finish).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  m.save.mockResolvedValue(true);
  await act(async () => button("Przejdź do podsumowania").click());
  expect(finish).toHaveBeenCalledOnce();
  expect(m.save.mock.calls[0][0].metricKind).toBe("run_clock_partial");
});

it("wyjście z ekranu sesji zatrzymuje licznik i zachowuje przebiegnięty czas", async () => {
  await render();
  await act(async () => button("Start").click());
  await act(async () => vi.advanceTimersByTime(600));
  await act(async () => root.render(null));
  await act(async () => vi.advanceTimersByTime(10000));
  await render();
  expect(button("Wznów")).toBeTruthy();
  expect(m.save).not.toHaveBeenCalled();
  await act(async () => button("Wznów").click());
  await act(async () => vi.advanceTimersByTime(400));
  expect(m.save).toHaveBeenCalledOnce();
  expect(m.save.mock.calls[0][0].metricValue).toBeCloseTo(1, 4);
});

it("pauza zatrzymuje czas, a wznowienie liczy dalej od tego samego miejsca", async () => {
  await render();
  await act(async () => button("Start").click());
  await act(async () => vi.advanceTimersByTime(500));
  await act(async () => button("Pauza").click());
  await act(async () => vi.advanceTimersByTime(5000));
  expect(stage()).toBe("Bieg");
  expect(m.save).not.toHaveBeenCalled();
  await act(async () => button("Wznów").click());
  await act(async () => vi.advanceTimersByTime(600));
  expect(stage()).toBe("Przerwa");
});

it("po zablokowaniu ekranu planuje sygnały i nadrabia kroki po powrocie", async () => {
  const day = applyRunningRecipe(session, INTERVAL_RECIPE);
  expect(day.runningRecipe?.method).not.toBe("easy_continuous");
  await render(day);
  await act(async () => button("Start").click());
  expect(stage()).toBe("Rozgrzewka");
  await act(async () => setVisibility("hidden"));
  expect(m.schedule).toHaveBeenCalledOnce();
  const cues = m.schedule.mock.calls[0][0] as { at: number; title: string }[];
  expect(cues.length).toBeGreaterThan(2);
  expect(cues[0].at).toBe(Date.now() + day.runningRecipe!.warmup.seconds * 1000);
  // JS w tle nie działa: czas mija bez ticków.
  vi.setSystemTime(Date.now() + (day.runningRecipe!.warmup.seconds + 5) * 1000);
  m.signal.mockClear();
  await act(async () => setVisibility("visible"));
  expect(m.cancel).toHaveBeenCalled();
  expect(stage()).toBe(cues[0].title);
  expect(m.signal).not.toHaveBeenCalled();
  expect(m.save).toHaveBeenCalledOnce();
  expect(m.save.mock.calls[0][0]).toMatchObject({ setNumber: 1, metricKind: "run_rest" });
});
