// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SprintTimingPanel } from "./SprintTimingPanel";
import type { TrainingExercise } from "@/lib/loadwise/types";

const mocks = vi.hoisted(() => ({
  ownerId: "sprint-user",
  current: {} as Record<number, Record<string, unknown>>,
  previous: {} as Record<number, Record<string, unknown>>,
  saveSet: vi.fn(),
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: mocks.ownerId } }) }));
vi.mock("@/lib/loadwise/setLogs", () => ({
  exerciseKey: () => "sprint_20",
  plannedSets: (exercise: TrainingExercise) => Number(exercise.sets?.match(/\d+/)?.[0] ?? 0),
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
  mocks.ownerId = "sprint-user";
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
  vi.useRealTimers();
  vi.restoreAllMocks();
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

it("a manual stopwatch only fills the time field; the athlete saves the trial explicitly", async () => {
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await render();
  await act(async () => {
    host.querySelector<HTMLDetailsElement>(".bw-sprint-stopwatch")!.open = true;
  });
  await act(async () => button("Start stopera").click());
  now = 4460;
  await act(async () => button("Zatrzymaj stoper").click());
  expect(host.querySelector('[role="timer"]')?.textContent).toContain("3,46");
  await act(async () => button("Użyj czasu").click());
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Czas sprintu w sekundach"]')?.value,
  ).toBe("3.46");
  expect(mocks.saveSet).not.toHaveBeenCalled();
  await act(async () => button("Zapisz czas").click());
  expect(mocks.saveSet).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ metricValue: 3.46, measurementMethod: "manual_stopwatch" }),
  );
});

it("an interrupted stopwatch stops and never offers that elapsed time as a reliable trial", async () => {
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await render();
  await act(async () => {
    host.querySelector<HTMLDetailsElement>(".bw-sprint-stopwatch")!.open = true;
  });
  await act(async () => button("Start stopera").click());
  now = 2500;
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(button("Start stopera")).toBeDefined();
  expect(button("Użyj czasu").disabled).toBe(true);
  expect(host.textContent).toContain("Pomiar zatrzymano po ukryciu stopera");
  expect(mocks.saveSet).not.toHaveBeenCalled();
});

it("collapsing the outer timing tool stops its otherwise-open stopwatch and preserves the input draft", async () => {
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await act(async () =>
    root.render(
      <details open className="outer-timing-tool">
        <summary>Czas odcinka</summary>
        <SprintTimingPanel exercise={exercise} sessionId="s1" onRepeat={() => {}} />
      </details>,
    ),
  );
  await type("3.12");
  await act(async () => {
    host.querySelector<HTMLDetailsElement>(".bw-sprint-stopwatch")!.open = true;
  });
  await act(async () => button("Start stopera").click());
  now = 2200;
  await act(async () => {
    const outer = host.querySelector<HTMLDetailsElement>(".outer-timing-tool")!;
    outer.open = false;
    outer.dispatchEvent(new Event("toggle"));
  });
  expect(button("Start stopera")).toBeDefined();
  expect(button("Użyj czasu").disabled).toBe(true);
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Czas sprintu w sekundach"]')?.value,
  ).toBe("3.12");
  expect(mocks.saveSet).not.toHaveBeenCalled();
});

it("leaving the exercise removes the running stopwatch timer", async () => {
  vi.useFakeTimers();
  await render();
  const before = vi.getTimerCount();
  await act(async () => button("Start stopera").click());
  expect(vi.getTimerCount()).toBeGreaterThan(before);
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(before);
  expect(mocks.saveSet).not.toHaveBeenCalled();
});

it("two save taps before rerender cannot submit the same sprint trial twice", async () => {
  let complete!: (value: boolean) => void;
  mocks.saveSet.mockReturnValue(
    new Promise<boolean>((resolve) => {
      complete = resolve;
    }),
  );
  await render();
  await type("3.4");
  await act(async () => {
    button("Zapisz czas").click();
    button("Zapisz czas").click();
  });
  expect(mocks.saveSet).toHaveBeenCalledTimes(1);
  await act(async () => complete(true));
});

it("a ranged prescription allows the planned optional repetitions instead of showing a single trial", async () => {
  await act(async () =>
    root.render(
      <SprintTimingPanel
        exercise={{ ...exercise, sets: "3–4", engineDose: undefined }}
        sessionId="s1"
        onRepeat={() => {}}
      />,
    ),
  );
  expect(
    host.querySelector<HTMLSelectElement>('[aria-label="Powtórzenie sprintu"]')!.options.length,
  ).toBe(4);
});

it("does not attach a standing-start Lab trial to a flying sprint", async () => {
  const flying = {
    ...exercise,
    displayPrescription: "2 × 10 m",
    engineDose: { sets: 2, distanceM: 10, runInM: 20, restSeconds: 120, intent: "explosive" },
  } as TrainingExercise;
  await act(async () =>
    root.render(<SprintTimingPanel exercise={flying} sessionId="s1" onRepeat={() => {}} />),
  );
  expect(host.textContent).not.toContain("Wybierz pomiar 10 m z Lab");
});

it("a saved legacy flying prescription keeps its flying start and cannot import a standing 10 m Lab trial", async () => {
  const flying = {
    ...exercise,
    exerciseId: "flying_sprint",
    sets: "4",
    displayPrescription: "4 × 10 m z najazdu 15 m",
    engineDose: undefined,
  };
  await act(async () =>
    root.render(<SprintTimingPanel exercise={flying} sessionId="s1" onRepeat={() => {}} />),
  );
  expect(host.textContent).not.toContain("Wybierz pomiar 10 m z Lab");
  await type("1.3");
  await act(async () => button("Zapisz czas").click());
  expect(mocks.saveSet).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      distanceM: 10,
      startType: "flying",
      measurementMethod: "manual_stopwatch",
    }),
  );
});

it("keeps a pending save attached to its original session without confirming the newly opened one", async () => {
  let finish!: (value: boolean) => void;
  mocks.saveSet.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      finish = resolve;
    }),
  );
  const firstRepeat = vi.fn(),
    nextRepeat = vi.fn();
  await act(async () =>
    root.render(<SprintTimingPanel exercise={exercise} sessionId="s1" onRepeat={firstRepeat} />),
  );
  await type("3.4");
  await act(async () => button("Zapisz czas").click());
  await act(async () =>
    root.render(<SprintTimingPanel exercise={exercise} sessionId="s2" onRepeat={nextRepeat} />),
  );
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Czas sprintu w sekundach"]')?.value,
  ).toBe("");
  expect(button("Zapisz czas").disabled).toBe(false);
  await act(async () => finish(true));
  expect(firstRepeat).not.toHaveBeenCalled();
  expect(nextRepeat).not.toHaveBeenCalled();

  await type("3.7");
  await act(async () => button("Zapisz czas").click());
  expect(nextRepeat).toHaveBeenCalledTimes(1);
  expect(firstRepeat).not.toHaveBeenCalled();
});

it("removes the previous account's time draft and running stopwatch on an account change", async () => {
  vi.useFakeTimers();
  await render();
  await type("3.4");
  await act(async () => button("Start stopera").click());
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  mocks.ownerId = "another-sprint-user";
  await render();
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Czas sprintu w sekundach"]')?.value,
  ).toBe("");
  expect(host.querySelector('[role="timer"]')?.textContent).toContain("0,00");
  expect(vi.getTimerCount()).toBe(0);
  expect(mocks.saveSet).not.toHaveBeenCalled();
});
