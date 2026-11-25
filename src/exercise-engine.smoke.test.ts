// @vitest-environment jsdom
import { act, createElement } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Root } from "react-dom/client";

let createRoot: typeof import("react-dom/client").createRoot;
let SessionSheet: typeof import("./SessionSheet").SessionSheet;
let loadExerciseState: typeof import("./engine").loadExerciseState;
let root: Root, host: HTMLElement;
const day = { date: "2026-11-24", phase: "free" as const, isMatch: false, isClub: false, session: { kind: "strength" as const, variant: "full" as const, reason: "" } };
const checkIn = { recovery: 3 as const, feeling: 3 as const, less: false };

beforeAll(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  ({ createRoot } = await import("react-dom/client"));
  ({ SessionSheet } = await import("./SessionSheet"));
  ({ loadExerciseState } = await import("./engine"));
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { window.localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const buttons = () => [...document.body.querySelectorAll("button")];
const click = async (text: string) => { const b = buttons().find((x) => x.textContent?.includes(text)); expect(b, text).toBeTruthy(); await act(async () => b!.click()); };
const render = () => act(async () => root.render(createElement(SessionSheet, { day, checkIn, checkedIn: true, weekInCycle: 3, level: "beginner", position: "pomocnik", hasGym: true, equipment: ["gym", "bodyweight"], age: 16, onClose: () => {} })));

it("sesja siłowa przechodzi przez silnik: pominięcia z powodem, odblokowanie i zmiana zapisują stan", async () => {
  await render();
  const text = () => document.body.textContent ?? "";
  expect(text()).not.toContain("Hang power clean"); // wymaga nadzoru – nie trafia do planu 16-latka
  expect(text()).toContain("Przysiad z masą ciała"); // najbliższy dopuszczony wariant funkcji „siła nóg”
  await click("Pominięte:");
  expect(text()).toContain("wymaga bieżącego nadzoru");
  await click("Potwierdzam, że to umiem");
  const st = loadExerciseState();
  expect(Object.keys(st.competences).length).toBeGreaterThan(0);
  expect(Object.values(st.competences).every((c) => c.source === "self_assessed")).toBe(true);
});

it("zamiana i usunięcie działają z listy „Zmień” i przetrwają ponowne otwarcie sesji", async () => {
  await render();
  const change = [...document.body.querySelectorAll('[aria-label^="Zmień:"]')] as HTMLButtonElement[];
  expect(change.length).toBeGreaterThan(0);
  const n = change.length;
  await act(async () => change[0]!.click());
  await click("Usuń z dzisiejszej sesji");
  expect(document.body.querySelectorAll('[aria-label^="Zmień:"]').length).toBe(n - 1);
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  expect(document.body.querySelectorAll('[aria-label^="Zmień:"]').length).toBe(n - 1);
});
