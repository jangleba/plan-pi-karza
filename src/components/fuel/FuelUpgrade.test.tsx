// @vitest-environment jsdom
// Regression coverage for the installed Fuel flows.
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
  resolveFuelTiming,
} from "@/lib/fuel/experience";
import { createRecipeEntry, practicalRecipes, relativeFuelTiming } from "@/lib/fuel/practical";
import { evaluateStoreProduct } from "@/lib/fuel/storeCheck";
import { foodAllowed, FOOD_BY_ID } from "@/lib/fuel/catalog";
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));
let host: HTMLDivElement, root: Root;
const now = new Date("2026-11-01T12:00:00").getTime();
const context = manualFuelContext(localDate(now), "football", 60, "moderate");
function button(label: string, scope: ParentNode = document.body) {
  const b = [...scope.querySelectorAll("button")].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error("Missing: " + label);
  return b;
}
const click = async (label: string, scope?: ParentNode) =>
  act(async () => button(label, scope).click());
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
describe("Fuel25 corrected application flows", () => {
  it("immediately shows a newly eaten meal and drink when the clock advanced since rendering", async () => {
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[]} />));
    const title = host.querySelector(".fuel-v4-hero h3")!.textContent!;
    vi.mocked(Date.now).mockReturnValue(now + 10_000);
    await click("Zjadłem", host);
    expect(host.querySelector(".fuel-recent-meal p")?.textContent).toContain(title);
    vi.mocked(Date.now).mockReturnValue(now + 15_000);
    await click("Zapisz napój", host);
    expect(host.querySelector(".fuel-next-steps")?.textContent).toContain(
      "250 ml zapisane do tej sesji dziś",
    );
  });
  it("describes the selected pre-match meal as before exercise", async () => {
    const match = { ...manualFuelContext(localDate(now), "match", 90, "high"), fromPlan: true };
    const data = emptyFuelData();
    data.timings[match.key] = relativeFuelTiming(120, now)!;
    localStorage.setItem(fuelStorageKey("u"), JSON.stringify(data));
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[match]} />));
    await click("Porcje i przygotowanie", host);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Zestaw przed wysiłkiem");
  });
  it("preserves exact selected portions on the main card and when eaten", async () => {
    const data = emptyFuelData();
    data.timings[context.key] = relativeFuelTiming(120, now)!;
    const recipe = practicalRecipes({ context, timing: data.timings[context.key], now, data })[0];
    const selected = createRecipeEntry(recipe, context.key, "selected", now, "adjusted");
    selected.lines = selected.lines.map((l) => ({ ...l, grams: l.grams * 2 }));
    data.entries = [selected];
    localStorage.setItem(fuelStorageKey("u"), JSON.stringify(data));
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[]} />));
    expect(host.querySelector(".fuel-v4-hero h3")?.textContent).toBe(recipe.title);
    await click("Zjadłem", host);
    const saved = readFuelData(localStorage, "u", now).entries[0];
    expect(saved.id).toBe("adjusted");
    expect(saved.lines).toEqual(selected.lines);
    expect(saved.lines).not.toEqual(recipe.lines);
  });
  it("CONTROL: choosing 1h ten seconds after render correctly refreshes the displayed clock", async () => {
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[]} />));
    vi.mocked(Date.now).mockReturnValue(now + 10_000);
    await click("1 h", host);
    expect(host.querySelector(".fuel-v4-time-value strong")?.textContent).toBe("1 h");
  });
  it("respects ordinary meal mode after a completed session", async () => {
    const c = {
      ...context,
      key: context.date + ":planned:1",
      fromPlan: true,
      completed: true,
      endedAt: now - 60_000,
    };
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[c]} />));
    await click("Zmień", host);
    await click("Zwykły posiłek");
    const data = readFuelData(localStorage, "u", now);
    expect(data.timings[c.key].phase).toBe("ordinary");
    expect(host.querySelector(".fuel-v4-time-value strong")?.textContent).toBe("Zwykły posiłek");
    expect(resolveFuelTiming(c, data.timings[c.key]).phase).toBe("ordinary");
  });
  it("opens the requested ingredient replacement directly", async () => {
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[]} />));
    await act(async () =>
      (host.querySelector(".fuel-v4-ingredient-change") as HTMLButtonElement).click(),
    );
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector(".fuel-swap-list")).not.toBeNull();
  });
  it("saves tomorrow match packing against a separate future session", async () => {
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[]} tomorrowMatch />));

    const b = [...host.querySelectorAll("button")].find((x) =>
      x.textContent?.includes("Jutro mecz"),
    )!;
    await act(async () => b.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("2026-11-02");
    await click("Zapisz zestaw na później");
    expect(readFuelData(localStorage, "u", now).entries[0].contextKey).toBe(
      "2026-11-02:manual:match",
    );
  });
  it("uses repeated contextual tolerance reports and actual session kind/duration", () => {
    const timing = relativeFuelTiming(120, now)!;
    const a = emptyFuelData();
    const first = practicalRecipes({ context, timing, now, data: a })[0];
    const entry = createRecipeEntry(first, context.key, "eaten", now - 86_400_000, "feedback");
    a.entries = [
      {
        ...entry,
        feedback: "comfortable",
        phase: "before",
        minutesBefore: 120,
        sessionKind: "football",
      },
      {
        ...entry,
        eatenAt: now - 2 * 86_400_000,
        id: "feedback-2",
        feedback: "comfortable",
        phase: "before",
        minutesBefore: 120,
        sessionKind: "football",
      },
    ];
    const x = practicalRecipes({ context, timing, now, data: a }).map((r) => r.id);
    a.entries.forEach((e) => (e.feedback = "heavy"));
    expect(practicalRecipes({ context, timing, now, data: a }).map((r) => r.id)).not.toEqual(x);
    const ids = (c: typeof context) =>
      practicalRecipes({ context: c, timing, now, data: emptyFuelData() }).map((r) => r.id);
    expect(ids({ ...context, kind: "match", durationMin: 90, load: "high" })).not.toEqual(
      ids({ ...context, kind: "strength", durationMin: 20, load: "high" }),
    );
  });
  it("blocks a declared crustacean conflict independently of recipe ingredients", () => {
    const result = evaluateStoreProduct({
      product: {
        name: "Mix",
        source: "openfoodfacts",
        allergens: ["en:crustaceans"],
        nutriments: { carbohydrates100g: 30, protein100g: 12, fat100g: 2 },
      },
      restrictions: ["krewetki"],
      moment: "after",
      load: "moderate",
      portion: 100,
    });
    expect(result.label).toBe("Sprawdź ograniczenia");
    expect(result.label).not.toBe("Dobry wybór");
    expect(foodAllowed(FOOD_BY_ID.milk, ["mleko"], "all")).toBe(false);
  });
  it("persists a drink and a tolerance rating through reopening without changing portions", async () => {
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[]} />));
    await click("Zapisz napój", host);
    expect(readFuelData(localStorage, "u", now).drinks?.[0].ml).toBe(250);
    await click("Zjadłem", host);
    const original = readFuelData(localStorage, "u", now).entries[0];
    await click("Historia · zapisano dziś", host);
    await click("Było ciężko");
    const row = readFuelData(localStorage, "u", now).entries[0];
    expect(row.feedback).toBe("heavy");
    expect(row.lines).toEqual(original.lines);
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<FuelWorkspace userId="u" contexts={[]} />));
    expect(readFuelData(localStorage, "u", now).drinks?.[0].ml).toBe(250);
    expect(readFuelData(localStorage, "u", now).entries[0].feedback).toBe("heavy");
  });
});
