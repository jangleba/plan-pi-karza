// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SprintTimingPanel } from "./SprintTimingPanel";
import type { TrainingExercise } from "@/lib/loadwise/types";

const mocks = vi.hoisted(() => ({
  current: {} as Record<number, Record<string, unknown>>,
  previous: {} as Record<number, Record<string, unknown>>,
  saveSet: vi.fn(),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "sprint-user" } }) }));
vi.mock("@/lib/loadwise/setLogs", () => ({
  exerciseKey: () => "sprint_20",
  useExerciseSetLogs: () => ({
    current: mocks.current,
    previous: mocks.previous,
    loading: false,
    saveSet: mocks.saveSet,
  }),
}));
vi.mock("@/features/browser-lab/storage", () => ({ loadBrowserResults: () => [] }));

const exercise = {
  id: "d:speed:0",
  exerciseId: "sprint_20",
  name: "Sprint 20 m",
  sets: "3",
  engineDose: { sets: 3, distanceM: 20, restSeconds: 90, intent: "explosive" },
  displayPrescription: "3 × 20 m",
} as unknown as TrainingExercise;
let root: Root, host: HTMLDivElement;
const button = (t: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;
const type = (value: string) =>
  act(async () => {
    const input = host.querySelector<HTMLInputElement>('[aria-label="Czas sprintu w sekundach"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.current = {};
  mocks.previous = {};
  mocks.saveSet.mockReset().mockResolvedValue(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(<SprintTimingPanel exercise={exercise} sessionId="s1" onRepeat={() => {}} />),
  );

it("a time is attached to the chosen planned repetition and a skipped one is not renumbered", async () => {
  mocks.current = { 1: { setNumber: 1, metricKind: "sprint_manual", metricValue: 3.2 } };
  await render();
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Powtórzenie sprintu"]')!;
  expect(select.options.length).toBe(3);
  expect(select.value).toBe("2"); // first free repetition by default
  await act(async () => {
    select.value = "3"; // repetition 2 is skipped
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await type("3.4");
  await act(async () => button("Zapisz czas").click());
  expect(mocks.saveSet).toHaveBeenCalledTimes(1);
  expect(mocks.saveSet.mock.calls[0][0]).toMatchObject({
    setNumber: 3,
    metricKind: "sprint_manual",
    metricValue: 3.4,
  });
});

it("saving the same repetition again corrects it with the same set number, not a new row", async () => {
  mocks.current = {
    1: { setNumber: 1, metricKind: "sprint_manual", metricValue: 3.2 },
    2: { setNumber: 2, metricKind: "sprint_manual", metricValue: 3.3 },
    3: { setNumber: 3, metricKind: "sprint_manual", metricValue: 3.5 },
  };
  await render();
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Powtórzenie sprintu"]')!;
  expect(select.selectedOptions[0].textContent).toContain("zapisane");
  await act(async () => {
    select.value = "2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await type("3.25");
  await act(async () => button("Zapisz czas").click());
  expect(mocks.saveSet.mock.calls[0][0]).toMatchObject({ setNumber: 2, metricValue: 3.25 });
});

it("lists saved times by repetition with their source", async () => {
  mocks.current = { 2: { setNumber: 2, metricKind: "sprint_manual", metricValue: 3.3 } };
  await render();
  expect(host.textContent).toContain("Powtórzenie 2: 3.300 s");
});

it("records the distance, kind of start and measurement method with the trial", async () => {
  await render();
  await type("3.4");
  await act(async () => button("Zapisz czas").click());
  expect(mocks.saveSet.mock.calls[0][0]).toMatchObject({
    setNumber: 1,
    distanceM: 20,
    startType: "standing",
    measurementMethod: "manual_stopwatch",
  });
});

it("a flying start is recorded as such", async () => {
  const flying = {
    ...exercise,
    engineDose: { sets: 2, distanceM: 10, runInM: 20, restSeconds: 120, intent: "explosive" },
  } as never;
  await act(async () =>
    root.render(<SprintTimingPanel exercise={flying} sessionId="s1" onRepeat={() => {}} />),
  );
  await type("1.2");
  await act(async () => button("Zapisz czas").click());
  expect(mocks.saveSet.mock.calls[0][0]).toMatchObject({ distanceM: 10, startType: "flying" });
});

it("compares with the earlier session only under the same conditions and otherwise says why not", async () => {
  mocks.current = {
    1: {
      setNumber: 1,
      metricKind: "sprint_manual",
      metricValue: 3.2,
      distanceM: 20,
      startType: "standing",
      measurementMethod: "manual_stopwatch",
    },
  };
  mocks.previous = {
    1: {
      setNumber: 1,
      metricKind: "sprint_manual",
      metricValue: 3.3,
      distanceM: 20,
      startType: "standing",
      measurementMethod: "manual_stopwatch",
    },
  };
  await render();
  expect(host.textContent).toContain("Najlepszy wynik wcześniej (te same warunki): 3.300 s");
  mocks.previous = { 1: { setNumber: 1, metricKind: "sprint_manual", metricValue: 3.0 } };
  await render();
  expect(host.textContent).toContain("nie porównujemy");
  expect(host.textContent).not.toContain("Najlepszy wynik wcześniej");
});
