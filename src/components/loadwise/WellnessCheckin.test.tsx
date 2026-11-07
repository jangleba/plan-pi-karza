// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WellnessCheckin } from "./WellnessCheckin";

let host: HTMLDivElement;
let root: Root;
const save = vi.fn();
const changeOpen = vi.fn();
const options = {
  open: true,
  enabled: true,
  date: "2026-11-02",
  onOpenChange: changeOpen,
  onSave: save,
};
function button(text: string) {
  const match = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!match) throw new Error(text);
  return match;
}
async function choose(field: string, label: string) {
  const group = [...document.querySelectorAll("fieldset")].find(
    (item) => item.querySelector("legend")?.textContent === field,
  )!;
  const option = [...group.querySelectorAll("button")].find((item) => item.textContent === label)!;
  await act(async () => option.click());
}
async function answer(sleep = "Dobrze") {
  await choose("Jak spałeś?", sleep);
  await choose("Zmęczenie", "Małe");
  await choose("Obolałość mięśni", "Mała");
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  save.mockReset().mockResolvedValue(undefined);
  changeOpen.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("optional wellness entry", () => {
  it("collects nothing without explicit health-personalization consent", async () => {
    await act(async () => root.render(<WellnessCheckin {...options} enabled={false} />));
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps unknown answers empty and skips without saving a favourable default", async () => {
    await act(async () => root.render(<WellnessCheckin {...options} />));
    expect(button("Zapisz samopoczucie").disabled).toBe(true);
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    await act(async () => button("Pomiń").click());
    expect(save).not.toHaveBeenCalled();
    expect(changeOpen).toHaveBeenCalledWith(false);
  });
  it("saves today's explicit answers through the provided store action", async () => {
    await act(async () => root.render(<WellnessCheckin {...options} />));
    await answer();
    await act(async () => button("Zapisz samopoczucie").click());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      date: options.date,
      sleep: 8,
      fatigue: 2,
      soreness: 2,
      jointPain: 0,
    });
    expect(changeOpen).toHaveBeenCalledWith(false);
  });
  it("keeps one very poor sleep response visible in the resulting scheduling score", async () => {
    await act(async () => root.render(<WellnessCheckin {...options} />));
    await answer("Bardzo słabo");
    await act(async () => button("Zapisz samopoczucie").click());
    expect(save.mock.calls[0][0].overall).toBeLessThanOrEqual(3);
  });
  it("asks no pain, injury or medical-symptom questions", async () => {
    await act(async () => root.render(<WellnessCheckin {...options} />));
    const text = document.querySelector("[role=dialog]")!.textContent ?? "";
    expect(text).not.toMatch(/ból|bólu|objaw|klatce|omdleni|duszno|uraz/i);
    expect(document.querySelectorAll("fieldset")).toHaveLength(3);
    expect(document.querySelector("select")).toBeNull();
    await answer();
    await act(async () => button("Zapisz samopoczucie").click());
    expect(save.mock.calls[0][0]).toMatchObject({
      jointPain: 0,
      painLocation: null,
      altersMovement: false,
      redFlags: [],
    });
  });
  it("retains answers and reports a failed save without claiming success", async () => {
    save.mockRejectedValueOnce(new Error("Brak połączenia"));
    await act(async () => root.render(<WellnessCheckin {...options} />));
    await answer();
    await act(async () => button("Zapisz samopoczucie").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Brak połączenia");
    expect(changeOpen).not.toHaveBeenCalled();
    expect(button("Zapisz samopoczucie").disabled).toBe(false);
    await act(async () => button("Zapisz samopoczucie").click());
    expect(save).toHaveBeenCalledTimes(2);
  });
});
