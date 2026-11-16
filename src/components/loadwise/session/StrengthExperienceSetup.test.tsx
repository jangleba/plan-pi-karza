// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrengthExperienceSetup } from "./StrengthExperienceSetup";
import { gymAthlete } from "@/lib/loadwise/engineV2/testFixtures";
import {
  decodeStrengthExperience,
  encodeStrengthExperience,
} from "@/lib/loadwise/strengthExperience";
import type { Profile } from "@/lib/loadwise/types";

const m = vi.hoisted(() => ({ profile: null as Profile | null, save: vi.fn() }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({ state: { profile: m.profile }, saveStrengthExperience: m.save }),
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  m.profile = { ...gymAthlete, age: 27, equipment: [], trainingMethodPreferences: {} };
  m.save.mockReset().mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("shows adaptive sports A/B directly and persists an explicit structure choice", async () => {
  await act(async () => root.render(<StrengthExperienceSetup />));
  await act(async () => host.querySelector("button")!.click());
  const structure = [...host.querySelectorAll("label")]
    .find((el) => el.textContent?.trim().startsWith("Układ jednostki"))!
    .querySelector("select")!;
  expect(structure.value).toBe("athletic_ab");
  expect(structure.closest("details")).toBeNull();
  expect(host.textContent).toContain("Dwa osobne dni");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
      structure,
      "balanced",
    );
    structure.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(m.save).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Zapisz odpowiedzi")!
      .click(),
  );
  const payload = decodeStrengthExperience(encodeStrengthExperience(m.save.mock.calls[0][0]));
  expect(payload.trainingMethodPreferences?.gymTemplate).toBe("balanced");
});

it("lets the athlete actually declare trap bar/Nordic stations and save usable exercise choices", async () => {
  await act(async () => root.render(<StrengthExperienceSetup />));
  await act(async () => host.querySelector("button")!.click());
  const checkbox = (label: string) =>
    [...host.querySelectorAll("label")]
      .find((el) => el.textContent?.trim() === label)!
      .querySelector<HTMLInputElement>("input")!;
  await act(async () => checkbox("Trap bar").click());
  await act(async () => checkbox("Stanowisko nordic").click());
  const hinge = [...host.querySelectorAll("label")]
    .find((el) => el.textContent?.trim().startsWith("Martwy ciąg / RDL"))!
    .querySelector("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
      hinge,
      "trap_bar_deadlift",
    );
    hinge.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(m.save).not.toHaveBeenCalled();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Zapisz odpowiedzi")!
      .click(),
  );
  expect(m.save).toHaveBeenCalledOnce();
  const payload = decodeStrengthExperience(encodeStrengthExperience(m.save.mock.calls[0][0]));
  expect(payload.trainingMethodPreferences?.declaredEquipment).toEqual([
    "barbell",
    "rack",
    "dumbbell",
    "bench",
    "cable",
    "band",
    "trap_bar",
    "nordic_setup",
  ]);
  expect(payload.trainingMethodPreferences?.gymEquipmentMode).toBe("selected");
  expect(payload.trainingMethodPreferences?.gymExercises?.hinge).toBe("trap_bar_deadlift");
  expect(m.profile!.equipment).toEqual([]);
});

it("makes a deliberate only-selected equipment choice survive save and reload", async () => {
  await act(async () => root.render(<StrengthExperienceSetup />));
  await act(async () => host.querySelector("button")!.click());
  const label = (text: string) =>
    [...host.querySelectorAll("label")].find((el) => el.textContent?.trim().startsWith(text))!;
  const mode = label("Wyposażenie siłowni").querySelector("select")!;
  expect(mode.value).toBe("full");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
      mode,
      "selected",
    );
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => label("Hantle").querySelector<HTMLInputElement>("input")!.click());
  expect(label("Sztanga").querySelector<HTMLInputElement>("input")!.checked).toBe(false);
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Zapisz odpowiedzi")!
      .click(),
  );
  const payload = decodeStrengthExperience(encodeStrengthExperience(m.save.mock.calls[0][0]));
  expect(payload.trainingMethodPreferences?.gymEquipmentMode).toBe("selected");
  expect(payload.trainingMethodPreferences?.declaredEquipment).toEqual(["dumbbell"]);
});

it("saves the optional press/chest-pass contrast as an explicit choice", async () => {
  await act(async () => root.render(<StrengthExperienceSetup />));
  await act(async () => host.querySelector("button")!.click());
  const contrast = [...host.querySelectorAll("label")]
    .find((el) => el.textContent?.trim().startsWith("Kontrast góry ciała"))!
    .querySelector<HTMLInputElement>("input")!;
  expect(contrast.checked).toBe(false);
  await act(async () => contrast.click());
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Zapisz odpowiedzi")!
      .click(),
  );
  const payload = decodeStrengthExperience(encodeStrengthExperience(m.save.mock.calls[0][0]));
  expect(payload.trainingMethodPreferences?.upperBodyContrast).toBe(true);
  expect(payload.trainingMethodPreferences?.gymExercises?.upperPower).toBe("med_ball_throw");
});
