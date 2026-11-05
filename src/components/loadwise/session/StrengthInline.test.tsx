// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { StrengthStructuredSections } from "./StrengthRunner";
import { sectionFixture } from "./testFixtures";
import { executionFor } from "@/lib/loadwise/methods/builders";
import { legacyStrengthSession } from "@/components/design/__qa__/LegacyStrengthSession";

const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  writes: [] as Record<string, unknown>[],
  reads: 0,
  fail: false,
}));
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "user-test" } }) }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({
    state: { plan: [], modifications: {}, profile: { age: 22, level: "intermediate" } },
    markEquipmentUnavailable: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (
      name: string,
      args: {
        p_payload: Record<string, unknown>;
        p_expected_version: number;
        p_operation_id: string;
      },
    ) => {
      if (name !== "save_exercise_set") throw new Error(`Unexpected RPC ${name}`);
      if (m.fail) return { data: null, error: { message: "denied", code: "42501" } };
      const payload = args.p_payload;
      const old = m.rows.find(
        (row) =>
          row.exercise_key === payload.exercise_key &&
          row.set_number === payload.set_number &&
          row.session_id === payload.session_id,
      );
      if (Number(old?.write_version ?? 0) !== args.p_expected_version)
        return { data: null, error: { message: "stale version", code: "40001" } };
      const saved = { ...payload, write_version: Number(old?.write_version ?? 0) + 1 };
      m.writes.push(payload);
      m.rows = [...m.rows.filter((row) => row !== old), saved];
      return { data: saved, error: null };
    },
    from: () => {
      const filters: Record<string, unknown> = {};
      let mode = "select",
        payload: Record<string, unknown> = {};
      const chain = {
        select() {
          m.reads++;
          return chain;
        },
        eq(k: string, v: unknown) {
          filters[k] = v;
          return chain;
        },
        is() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        upsert(p: Record<string, unknown>) {
          mode = "write";
          payload = p;
          return chain;
        },
        update(p: Record<string, unknown>) {
          mode = "write";
          payload = { ...filters, ...p };
          return chain;
        },
        then(
          resolve: (r: {
            data: Record<string, unknown>[];
            error: { message: string; code: string } | null;
          }) => unknown,
        ) {
          if (mode === "write" && !m.fail) {
            m.writes.push(payload);
            m.rows = m.rows.filter(
              (r) =>
                !(r.exercise_key === payload.exercise_key && r.set_number === payload.set_number),
            );
            m.rows.push(payload);
          }
          return Promise.resolve({
            data:
              mode === "select"
                ? m.rows.filter((row) => Object.entries(filters).every(([k, v]) => row[k] === v))
                : [],
            error: m.fail && mode === "write" ? { message: "denied", code: "PGRST301" } : null,
          }).then(resolve);
        },
      };
      return chain;
    },
  },
}));

const sections = [
  sectionFixture("main", [
    {
      id: "a1",
      exerciseId: "goblet_squat",
      label: "A1",
      name: "Przysiad",
      sets: "2",
      reps: "8",
      restAfterPair: "60 s",
    },
    {
      id: "a2",
      exerciseId: "heel_bridge",
      label: "A2",
      name: "Most izometryczny",
      sets: "2",
      duration: "12 s",
      restAfterPair: "60 s",
    },
  ]),
  sectionFixture("cooldown", [{ id: "last", name: "Spokojny oddech", duration: "2 min" }]),
];
let host: HTMLDivElement;
let root: Root;
async function render(testSections = sections, canRecord = true) {
  await act(async () => {
    root.render(
      <StrengthStructuredSections
        sections={testSections}
        date="2026-10-15"
        sessionId="session-test"
        canRecord={canRecord}
        onFinish={() => {}}
      />,
    );
  });
}
async function click(selector: string) {
  await act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
}
async function input(label: string, value: string) {
  await act(async () => {
    const el = host.querySelector<HTMLInputElement>(
      `.bw-exercise-panel:not([hidden]) input[aria-label="${label}"]`,
    )!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  await click(".bw-exercise-panel:not([hidden]) .bw-training-inline .bw-save-set");
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  m.rows = [];
  m.writes = [];
  m.reads = 0;
  m.fail = false;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("inline strength execution", () => {
  it("opens legacy blocked technique and every original duplicate dose while leaving history untouched", async () => {
    const sections = legacyStrengthSession().structuredSections!;
    const original = JSON.stringify(sections);
    await render(sections, false);
    expect(host.querySelectorAll(".bw-exercise-open")).toHaveLength(13);
    const curl = [...host.querySelectorAll<HTMLButtonElement>(".bw-exercise-open")].find((b) =>
      b.textContent?.includes("Uginanie nóg"),
    );
    expect(curl).toBeTruthy();
    await act(async () => curl!.click());
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Jak wykonać");
    expect(document.querySelectorAll(".bw-exercise-original-entries li")).toHaveLength(5);
    expect(document.querySelector(".bw-detail-record")).toBeNull();
    expect(m.reads).toBe(0);
    expect(m.writes).toHaveLength(0);
    expect(JSON.stringify(sections)).toBe(original);
  });
  it("opens real instructions in preview without reading history or accepting a completed exercise", async () => {
    await render(sections, false);
    await click(".bw-exercise-check");
    expect(host.querySelectorAll(".is-done")).toHaveLength(0);
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    await click(".bw-exercise-open");
    expect(document.body.textContent).toContain("Jak wykonać");
    expect(document.querySelector(".bw-detail-record")).toBeNull();
    expect(host.querySelector(".bw-finish-workout")).toBeNull();
    expect(m.reads).toBe(0);
    expect(m.writes).toHaveLength(0);
    expect(localStorage.length).toBe(0);
  });
  it("opens instructions first without reading or writing set history, then loads history only for logging", async () => {
    await render();
    expect(host.querySelectorAll(".bw-training-exercise")).toHaveLength(3);
    expect(m.reads).toBe(0);
    await click(".bw-exercise-open");
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Jak wykonać");
    expect(m.reads).toBe(0);
    expect(m.writes).toHaveLength(0);
    await act(async () => document.querySelector<HTMLButtonElement>(".bw-detail-record")!.click());
    expect(host.querySelector(".bw-training-inline")).not.toBeNull();
    expect(host.querySelector(".fixed")).toBeNull();
    expect(m.reads).toBe(1);
    expect(host.textContent).not.toContain("Rozpocznij blok");
    expect(host.textContent).not.toContain("Etap 1");
  });
  it("saves real values and alternates paired exercises, starting rest after the pair", async () => {
    await render();
    await click(".bw-exercise-open");
    await act(async () => document.querySelector<HTMLButtonElement>(".bw-detail-record")!.click());
    await input("Ciężar", "20");
    await input("Powt.", "8");
    await save();
    expect(m.writes).toHaveLength(1);
    expect(m.writes[0]).toMatchObject({
      exercise_key: "goblet_squat",
      set_number: 1,
      weight_kg: 20,
      reps: 8,
    });
    expect(host.querySelector(".is-active strong")?.textContent).toContain("Most");
    expect(host.querySelector('[role="timer"]')).toBeNull();
    await input("Utrzymanie", "12");
    await save();
    expect(m.writes).toHaveLength(2);
    expect(host.querySelector('[role="timer"]')).not.toBeNull();
    expect(host.querySelector(".is-active strong")?.textContent).toContain("Przysiad");
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Ciężar"]')?.value).toBe("20");
    await save();
    await save();
    expect(m.writes.map((r) => r.exercise_key)).toEqual([
      "goblet_squat",
      "heel_bridge",
      "goblet_squat",
      "heel_bridge",
    ]);
    expect(m.writes.map((r) => r.set_number)).toEqual([1, 1, 2, 2]);
    expect(host.querySelectorAll(".is-done")).toHaveLength(2);
  });
  it("starts the prescribed rest between the heavy set and the next power exercise", async () => {
    const paired = structuredClone(sections);
    paired[0].blocks[0].exercises[0].restAfterExercise = "3 min";
    await act(async () =>
      root.render(
        <StrengthStructuredSections
          sections={paired}
          date="2026-10-15"
          sessionId="session-test"
          onFinish={() => {}}
        />,
      ),
    );
    await click(".bw-exercise-open");
    await act(async () => document.querySelector<HTMLButtonElement>(".bw-detail-record")!.click());
    await input("Ciężar", "20");
    await input("Powt.", "8");
    await save();
    expect(host.querySelector('[role="timer"]')?.textContent).toContain("03:00");
    expect(host.querySelector(".is-active strong")?.textContent).toContain("Most");
  });
  it("keeps the form and does not advance after a rejected save", async () => {
    await render();
    await click(".bw-exercise-open");
    await act(async () => document.querySelector<HTMLButtonElement>(".bw-detail-record")!.click());
    m.fail = true;
    await input("Ciężar", "20");
    await input("Powt.", "8");
    await save();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nie udało się zapisać");
    expect(host.querySelector(".is-active strong")?.textContent).toContain("Przysiad");
    expect(m.writes).toHaveLength(0);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Ciężar"]')?.value).toBe("20");
  });
  it("refuses an empty result without creating logs", async () => {
    await render();
    await click(".bw-exercise-open");
    await act(async () => document.querySelector<HTMLButtonElement>(".bw-detail-record")!.click());
    await save();
    expect(m.writes).toHaveLength(0);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
});

it("opens a cluster clock in the inline logger and does not save a set when confirming a group", async () => {
  await render([
    sectionFixture("main", [
      {
        id: "cluster",
        exerciseId: "goblet_squat",
        name: "Przysiad",
        sets: "3",
        reps: "6",
        methodExecution: executionFor("M08", {
          mode: "cluster",
          rounds: 3,
          repetitions: 3,
          repGroups: [2, 2, 2],
          restSeconds: 20,
          roundRestSeconds: 180,
        }),
      },
    ]),
  ]);
  await click(".bw-exercise-open");
  await act(async () => document.querySelector<HTMLButtonElement>(".bw-detail-record")!.click());
  const clock = host.querySelector('.bw-training-inline [data-testid="method-clock"]')!;
  expect(clock).toBeTruthy();
  const run = [...clock.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Uruchom zegar"),
  )!;
  await act(async () => run.click());
  expect(clock.textContent).toContain("Blok 1/1");
  const group = [...clock.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Grupa wykonana"),
  )!;
  await act(async () => group.click());
  expect(clock.textContent).toContain("Odpoczynek");
  expect(m.writes).toHaveLength(0);
  await input("Ciężar", "20");
  await input("Powt.", "6");
  await input("RIR", "3");
  await save();
  expect(m.writes).toHaveLength(1);
  expect(m.writes[0].reps).toBe(6);
});
it("records actual flywheel repetitions with a null weight, without inventing inertia in kg", async () => {
  await render([
    sectionFixture("main", [
      {
        id: "flywheel",
        exerciseId: "flywheel_squat",
        name: "Przysiad flywheel",
        sets: "2",
        reps: "6",
      },
    ]),
  ]);
  await click(".bw-exercise-open");
  expect(
    document.querySelector<HTMLIFrameElement>(".bw-exercise-detail-media iframe")?.src,
  ).toContain("id=flywheel_squat");
  expect(document.querySelector(".bw-exercise-detail-media img")).toBeNull();
  await act(async () => document.querySelector<HTMLButtonElement>(".bw-detail-record")!.click());
  expect(
    host.querySelector('.bw-exercise-panel:not([hidden]) input[aria-label="Ciężar"]'),
  ).toBeNull();
  await input("Powt.", "6");
  await save();
  expect(m.writes).toHaveLength(1);
  expect(m.writes[0].weight_kg).toBeNull();
  expect(m.writes[0].reps).toBe(6);
});
