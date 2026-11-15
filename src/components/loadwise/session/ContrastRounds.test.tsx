// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContrastRounds } from "./runner/ContrastRounds";
import { buildRunnerSteps } from "@/lib/loadwise/sessionRunner/steps";
import type { SetLog } from "@/lib/loadwise/setLogs";
import type { TrainingSection } from "@/lib/loadwise/types";
import { trainingStorageKey, trainingFingerprint } from "@/lib/loadwise/trainingDetails";

const m = vi.hoisted(() => ({
  sets: {} as Record<string, Record<number, SetLog>>,
  writes: [] as string[],
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "athlete" } }) }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => ({ state: { completions: {} } }) }));
vi.mock("@/lib/loadwise/setLogs", async (load) => ({
  ...(await load<typeof import("@/lib/loadwise/setLogs")>()),
  useExerciseSetLogs: (_: string, key: string) => ({
    current: m.sets[key] ?? {},
    previous: {},
    recentSessions: [],
    loading: false,
    saveSet: async (set: SetLog) => {
      m.writes.push(`${key}:${set.setNumber}`);
      m.sets[key] = { ...m.sets[key], [set.setNumber]: set };
      return true;
    },
  }),
}));
const section: TrainingSection = {
  id: "main",
  title: "Siła i moc",
  type: "main",
  blocks: [
    {
      id: "pair",
      title: "Kontrast",
      blockType: "contrast",
      intent: "power",
      executionProtocol: "contrast-rounds-v1",
      exercises: [
        {
          id: "squat",
          exerciseId: "goblet_squat",
          name: "Przysiad goblet",
          label: "A1",
          sets: "3",
          reps: "5",
          rir: "2",
          restAfterExercise: "180 s",
        },
        {
          id: "jump",
          exerciseId: "snap_down",
          name: "Lądowanie snap-down",
          label: "A2",
          sets: "3",
          reps: "3",
          restAfterPair: "180 s",
        },
      ],
    },
  ],
};
let host: HTMLDivElement, root: Root;
const mark = vi.fn(async () => true),
  next = vi.fn(),
  rest = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  m.sets = {};
  m.writes = [];
  mark.mockClear();
  next.mockClear();
  rest.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(source = section) {
  await act(async () =>
    root.render(
      <ContrastRounds
        step={buildRunnerSteps([source])[0]}
        scope="session"
        sessionId="session"
        date="2026-11-14"
        sessionKind="strength"
        mark={mark}
        onNext={next}
        onRest={rest}
      />,
    ),
  );
}
async function input(label: string, value: string) {
  await act(async () => {
    const el = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    expect(el, host.textContent ?? "").toBeTruthy();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string) {
  await act(async () => {
    const button = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(label),
    )!;
    expect(button).toBeTruthy();
    button.click();
  });
}
it("runs A1/A2 for all three rounds, keeps real set numbers and resumes after reopening", async () => {
  await render();
  for (let round = 1; round <= 3; round++) {
    expect(host.textContent).toContain(`Runda ${round} z 3 · A1`);
    expect(host.querySelector(`input[aria-label="Seria ${round}: ciężar w kg"]`)).toBeTruthy();
    await input(`Seria ${round}: ciężar w kg`, "30");
    await input(`Seria ${round}: powtórzenia`, "5");
    await click("Zapisz serię");
    expect(host.textContent).toContain(`Runda ${round} z 3 · A2`);
    if (round === 1) {
      await act(async () => root.unmount());
      root = createRoot(host);
      await render();
      expect(host.textContent).toContain("Runda 1 z 3 · A2");
    }
    await click("Seria skoków wykonana");
  }
  expect(m.writes).toEqual([
    "goblet_squat:1",
    "snap_down:1",
    "goblet_squat:2",
    "snap_down:2",
    "goblet_squat:3",
    "snap_down:3",
  ]);
  expect(mark.mock.calls).toHaveLength(2);
  expect(next).toHaveBeenCalledOnce();
  expect(rest.mock.calls.every((call) => call[0] === 180)).toBe(true);
});

it("runs an accessory superset B1/B2 round by round with distinct transition and round rests", async () => {
  const pair = structuredClone(section);
  const block = pair.blocks[0];
  block.blockType = "superset";
  block.executionProtocol = "superset-rounds-v1";
  block.exercises[0] = {
    id: "press",
    exerciseId: "dumbbell_bench_press",
    name: "Wyciskanie hantli",
    label: "B1",
    sets: "2",
    reps: "8",
    rir: "3",
    restAfterExercise: "30 s",
  };
  block.exercises[1] = {
    id: "row",
    exerciseId: "one_arm_dumbbell_row",
    name: "Wiosłowanie hantlem",
    label: "B2",
    sets: "2",
    reps: "8",
    rir: "3",
    restAfterExercise: "90 s",
    restAfterPair: "90 s",
  };
  await render(pair);
  expect(host.querySelector('[aria-label="Superseria prowadzona rundami"]')).toBeTruthy();
  for (let round = 1; round <= 2; round++) {
    for (const label of ["B1", "B2"]) {
      expect(host.textContent).toContain(`Runda ${round} z 2 · ${label}`);
      await input(`Seria ${round}: ciężar w kg`, "20");
      await input(`Seria ${round}: powtórzenia`, "8");
      await click("Zapisz serię");
    }
  }
  expect(m.writes).toEqual([
    "dumbbell_bench_press:1",
    "one_arm_dumbbell_row:1",
    "dumbbell_bench_press:2",
    "one_arm_dumbbell_row:2",
  ]);
  expect(rest.mock.calls.map((call) => call[0])).toEqual([30, 90, 30, 90]);
  expect(next).toHaveBeenCalledOnce();
});

it("recovers a saved third set whose final completion failed, without saving the load twice", async () => {
  const step = buildRunnerSteps([section])[0];
  localStorage.setItem(
    trainingStorageKey(
      "contrast-round",
      "athlete",
      "session",
      `${step.key}:${trainingFingerprint(step.rows.map((r) => r.exercise))}`,
    ),
    "4",
  );
  m.sets.goblet_squat = { 3: { setNumber: 3, weightKg: 30, reps: 5, rir: 2 } };
  await render();
  expect(host.textContent).toContain("Runda 3 z 3 · A1");
  await click("Seria zapisana — kontynuuj rundę");
  expect(host.textContent).toContain("Runda 3 z 3 · A2");
  await click("Seria skoków wykonana");
  expect(m.writes).toEqual(["snap_down:3"]);
  expect(next).toHaveBeenCalledOnce();
});
