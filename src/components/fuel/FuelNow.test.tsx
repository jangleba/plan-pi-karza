// @vitest-environment jsdom
// "Co zjeść teraz?": reason, quick fits, proven sets and a moved start time.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FuelWorkspace } from "./FuelWorkspace";
import {
  emptyFuelData,
  fuelStorageKey,
  localDate,
  manualFuelContext,
  readFuelData,
} from "@/lib/fuel/experience";
import { createRecipeEntry, practicalRecipes, relativeFuelTiming } from "@/lib/fuel/practical";
import { RECIPES } from "@/lib/fuel/catalog";
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));

let host: HTMLDivElement, root: Root;
const now = new Date("2026-11-12T12:00:00").getTime();
const match = { ...manualFuelContext(localDate(now), "match", 90, "high"), fromPlan: true };
const button = (label: string) => {
  const b = [...document.body.querySelectorAll("button")].find(
    (x) => x.textContent?.trim() === label,
  );
  if (!b) throw new Error("Missing: " + label);
  return b;
};
const click = async (label: string) => act(async () => button(label).click());
const saved = () => readFuelData(localStorage, "u", now);
const render = async () =>
  act(async () => root.render(<FuelWorkspace userId="u" contexts={[match]} />));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(now);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Fuel: co zjeść teraz", () => {
  it("asks only for the missing start time of a planned match, then answers with a reason", async () => {
    await render();
    expect(host.textContent).toContain("Za ile zaczynasz mecz?");
    expect(host.textContent).not.toContain("Dziś bez treningu");
    await click("2 h");
    expect(host.querySelector(".fuel-now-question")?.textContent).toBe("Co zjeść teraz?");
    expect(host.querySelector(".fuel-now-reason")?.textContent).toMatch(/^Do meczu 2 h: /);
    expect(host.querySelector(".fuel-now-meta")?.textContent).toContain("Porcja orientacyjna");
  });

  it("remembers a quick fit after reopening and shows only 5-minute sets", async () => {
    const data = emptyFuelData();
    data.timings[match.key] = relativeFuelTiming(120, now)!;
    localStorage.setItem(fuelStorageKey("u"), JSON.stringify(data));
    await render();
    await click("Mam 5 minut");
    expect(saved().selection?.fit).toBe("quick");
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(button("Mam 5 minut").getAttribute("aria-pressed")).toBe("true");
    const title = host.querySelector(".fuel-now-card h3")?.textContent;
    const quick = RECIPES.filter((r) => r.prepMin <= 5).map((r) => r.title);
    expect(quick).toContain(title);
    await click("Mam 5 minut");
    expect(saved().selection?.fit).toBeNull();
  });

  it("shows the shop check only in the shop fit", async () => {
    const data = emptyFuelData();
    data.timings[match.key] = relativeFuelTiming(120, now)!;
    localStorage.setItem(fuelStorageKey("u"), JSON.stringify(data));
    await render();
    expect(host.textContent).not.toContain("Sprawdź produkt z półki");
    await click("W sklepie");
    expect(host.textContent).toContain("Sprawdź produkt z półki");
  });

  it("keeps history and updates the proposal when the start time changes", async () => {
    const data = emptyFuelData();
    const timing = relativeFuelTiming(240, now)!;
    data.timings[match.key] = timing;
    const recipe = practicalRecipes({ context: match, timing, now, data })[0];
    data.entries = [
      {
        ...createRecipeEntry(recipe, match.key, "eaten", now - 30 * 60_000, "meal"),
        phase: "before",
        sessionKind: "match",
        minutesBefore: 270,
      },
    ];
    localStorage.setItem(fuelStorageKey("u"), JSON.stringify(data));
    await render();
    expect(host.querySelector(".fuel-now-reason")?.textContent).toMatch(/^Do meczu 4 h: /);
    await click("Zmień");
    await click("30 min");
    expect(host.querySelector(".fuel-now-reason")?.textContent).toMatch(/^Do meczu 30 min: /);
    const stored = saved();
    expect(stored.entries).toHaveLength(1);
    expect(stored.entries[0]).toMatchObject({ id: "meal", minutesBefore: 60 });
    expect(stored.timings[match.key].presetMin).toBe(30);
  });

  it("offers a proven set for repeating with its exact portions", async () => {
    const data = emptyFuelData();
    data.timings[match.key] = relativeFuelTiming(120, now)!;
    const recipe = RECIPES[0];
    const entry = createRecipeEntry(recipe, match.key, "eaten", now - 86_400_000, "old");
    entry.lines = entry.lines.map((l) => ({ ...l, grams: l.grams + 10 }));
    data.entries = [entry];
    localStorage.setItem(fuelStorageKey("u"), JSON.stringify(data));
    await render();
    const row = host.querySelector<HTMLButtonElement>(
      `.fuel-now-proven [aria-label="Powtórz ${recipe.title}"]`,
    );
    expect(row).toBeTruthy();
    await act(async () => row!.click());
    const inputs = [...document.querySelectorAll<HTMLInputElement>(".fuel-grams input")];
    expect(inputs.map((i) => Number(i.value))).toEqual(entry.lines.map((l) => l.grams));
  });
});
