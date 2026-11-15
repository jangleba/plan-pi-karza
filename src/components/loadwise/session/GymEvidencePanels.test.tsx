// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { GymObservationPanel } from "./GymObservationPanel";
import { GymEquipmentEditor } from "./GymEquipmentEditor";
import { GymBandSetupPanel } from "./GymBandSetupPanel";
import type { TrainingExercise } from "@/lib/loadwise/types";
const m = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/loadwise/useGymEvidence", () => ({
  useGymEvidence: () => ({ records: [], available: true, save: m.save }),
}));
const e: TrainingExercise = {
  id: "jump",
  exerciseId: "gym_lateral_bound",
  name: "Skok boczny",
  engineDose: { sets: 2, reps: 3, perSide: true, intent: "explosive", restSeconds: 90 },
};
const sid = "10000000-0000-4000-8000-000000000001";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  m.save.mockReset().mockResolvedValue({ pending: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(text: string) {
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === text)!.click(),
  );
}
async function set(el: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype =
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });
}
it("records all sides only after an explicit whole-dose confirmation, with no fabricated metric", async () => {
  await act(async () => root.render(<GymObservationPanel exercise={e} sessionId={sid} />));
  expect(m.save).not.toHaveBeenCalled();
  expect(host.querySelector("input")).toBeNull();
  await click("Cała zaplanowana dawka, pod kontrolą");
  const data = m.save.mock.calls[0][0];
  expect(data.observation.sets).toEqual([
    { setNumber: 1, side: "left", completed: 3, control: "stable" },
    { setNumber: 1, side: "right", completed: 3, control: "stable" },
    { setNumber: 2, side: "left", completed: 3, control: "stable" },
    { setNumber: 2, side: "right", completed: 3, control: "stable" },
  ]);
  expect(data.observation).not.toHaveProperty("minimumMetric");
});
it("records interrupted control as a fact, without inventing completed repetitions", async () => {
  await act(async () => root.render(<GymObservationPanel exercise={e} sessionId={sid} />));
  await click("Utrata kontroli / przerwano z tego powodu");
  expect(m.save).toHaveBeenCalledWith(
    expect.objectContaining({
      observation: expect.objectContaining({ sets: [], controlLossReported: true }),
    }),
  );
});
it("requires a real measurement method when the athlete enters a quantitative result", async () => {
  await act(async () =>
    root.render(<GymObservationPanel exercise={{ ...e, exerciseId: "gym_cmj" }} sessionId={sid} />),
  );
  await set(host.querySelector("input")!, "30");
  await click("Cała zaplanowana dawka, pod kontrolą");
  expect(m.save).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await set(host.querySelector("select")!, "device");
  await click("Cała zaplanowana dawka, pod kontrolą");
  expect(m.save.mock.calls[0][0].observation.minimumMetric).toEqual({
    kind: "jump_height_cm",
    method: "device",
    value: 30,
  });
});
it("requires a chosen kg convention and saves a real half-kilogram step", async () => {
  await act(async () => root.render(<GymEquipmentEditor exerciseId="goblet_squat" />));
  await click("Ustaw dostępne ciężary");
  await click("Zapisz sprzęt");
  expect(m.save).not.toHaveBeenCalled();
  const inputs = host.querySelectorAll("input");
  await set(inputs[0], "Hantle — klub");
  await set(inputs[1], "0,5");
  await set(host.querySelector("select")!, "per_hand");
  await click("Zapisz sprzęt");
  expect(m.save).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "equipment",
      convention: "per_hand",
      incrementKg: 0.5,
      label: "Hantle — klub",
    }),
  );
});
it("does not create a band calibration from missing values or an unconfirmed estimate", async () => {
  await act(async () => root.render(<GymBandSetupPanel date="2026-11-15" />));
  await click("Zapisz kalibrację");
  expect(m.save).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("rzeczywiście");
});
