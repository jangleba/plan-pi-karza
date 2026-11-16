// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProgressTests } from "./ProgressTests";

const store = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/lib/loadwise/store", () => ({ useLoadwise: () => store.value }));
vi.mock("@/components/loadwise/MasTestAction", () => ({
  MasTestAction: () => <button type="button">Zaplanuj test</button>,
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const profile = {
  age: 20,
  level: "intermediate",
  hasPitch: true,
  goal: "speed",
  painInjury: false,
};

it("Postęp → Testy offers the 5-minute run when the player can take it", async () => {
  store.value = { state: { profile, plan: [{ date: "2026-11-16" }] }, todayIso: "2026-11-16" };
  await act(async () => root.render(<ProgressTests />));
  expect(host.querySelector("h2")?.textContent).toBe("Test biegowy 5 minut");
  expect(host.textContent).toContain("To nie jest pomiar VO₂max.");
  expect(host.textContent).toContain("Zaplanuj test");
});

it("names the reason instead of an empty tab", async () => {
  store.value = {
    state: { profile: { ...profile, hasPitch: false }, plan: [{ date: "2026-11-16" }] },
    todayIso: "2026-11-16",
  };
  await act(async () => root.render(<ProgressTests />));
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Test wymaga boiska lub miejsca do równego biegu.",
  );
  expect(host.textContent).not.toContain("Zaplanuj test");
});
