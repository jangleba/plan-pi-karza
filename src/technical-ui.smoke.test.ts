// @vitest-environment jsdom
import { act, createElement } from "react";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import type { Root } from "react-dom/client";
let UI: typeof import("./TechniqueSession").TechniqueSession;
let createRoot: typeof import("react-dom/client").createRoot;
let root: Root, host: HTMLElement;
let loadResults: typeof import("./lib/technical").loadTechnicalResults;
const day = { date: "2026-11-22", phase: "free" as const, isMatch: false, isClub: false, session: { kind: "technique" as const, variant: "full" as const, reason: "" } };
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  ({ createRoot } = await import("react-dom/client"));
  ({ TechniqueSession: UI } = await import("./TechniqueSession"));
  ({ loadTechnicalResults: loadResults } = await import("./lib/technical"));
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
beforeEach(async () => {
  window.localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const { saveTechnicalSettings } = await import("./lib/technical");
  saveTechnicalSettings({ role: "winger", level: "advanced", foot: "left", side: "right", focus: "finishing", minutes: 40, space: { width: 68, height: 52.5 }, resources: { balls: 3, cones: 8, goal: true, wall: false, rebounder: true, partners: 0 } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const click = async (text: string) => { const b = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text)); expect(b, text).toBeTruthy(); await act(async () => b!.click()); };
const field = async (node: HTMLInputElement | HTMLSelectElement, value: string) => { await act(async () => { const proto = node.tagName === "INPUT" ? window.HTMLInputElement.prototype : window.HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value); node.dispatchEvent(new window.Event(node.tagName === "INPUT" ? "input" : "change", { bubbles: true })); }); };
it("renders the real drill, changes steps and records only an explicitly entered result", async () => {
  await act(async () => root.render(createElement(UI, { day, checkIn: { recovery: 3, feeling: 3, less: false }, position: "skrzydlowy", age: 22, onInvite: () => {} })));
  await click("Wall Combination & Inside Finish");
  expect(host.querySelector("svg")).not.toBeNull();
  expect(loadResults()).toHaveLength(0);
  const open = host.querySelector('[aria-label^="Otwórz ćwiczenie"]') as HTMLButtonElement;
  await act(async () => open.click());
  const step = host.querySelector('[aria-label="Krok 2"]') as HTMLButtonElement;
  expect(step).toBeTruthy();
  await act(async () => step.click());
  expect(step.getAttribute("aria-pressed")).toBe("true");
  expect(loadResults()).toHaveLength(0);
  await click("Zamknij");
  await click("Wpisz wynik po wykonaniu");
  const inputs = host.querySelectorAll('input[type="number"]');
  await field(inputs[0] as HTMLInputElement, "12"); await field(inputs[1] as HTMLInputElement, "11");
  await click("Zapisz wynik");
  expect(loadResults()).toHaveLength(1); expect(loadResults()[0]!.successes).toBe(11);
  expect(host.textContent).toContain("Zapisano Twój wynik");
});
it("takes the position from onboarding and persists an allowed precise role", async () => {
  await act(async () => root.render(createElement(UI, { day, checkIn: { recovery: 3, feeling: 3, less: false }, position: "pomocnik", age: 17, onInvite: () => {} })));
  await click("Dopasuj");
  const role = host.querySelector("select")!;
  expect([...role.options].map((o) => o.value)).toEqual(["", "six", "eight", "ten"]);
  await field(role, "six"); await click("Dobierz sesję");
  expect(host.querySelector("h3")!.textContent).toBe("Pomocnik 6");
  expect(loadResults()).toHaveLength(0);
});
