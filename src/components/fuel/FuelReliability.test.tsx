// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { FuelWorkspace } from "./FuelWorkspace";
import {
  emptyFuelData,
  fuelStorageKey,
  localDate,
  manualFuelContext,
  readFuelData,
} from "@/lib/fuel/experience";
import { createRecipeEntry } from "@/lib/fuel/practical";
import { RECIPES } from "@/lib/fuel/catalog";
const exports = vi.hoisted(() => ({ deliver: vi.fn() }));
vi.mock("@/lib/loadwise/deliverExportFile", () => ({ deliverExportFile: exports.deliver }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));
let host: HTMLDivElement, root: Root;
const render = async (restrictions: string[] = []) =>
  act(async () =>
    root.render(<FuelWorkspace userId="u" contexts={[]} profileRestrictions={restrictions} />),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  vi.clearAllMocks();
  exports.deliver.mockResolvedValue("delivered");
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
describe("Fuel persistent user choices", () => {
  it("does not autosave over a corrupted or unsupported local history", async () => {
    localStorage.setItem(fuelStorageKey("u"), "{corrupted");
    await render();
    expect(localStorage.getItem(fuelStorageKey("u"))).toBe("{corrupted");
    expect(host.textContent).toContain("Zachowano oryginał");
    const reset = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("utwórz nowy zapis"),
    )!;
    expect(reset.disabled).toBe(true);
  });
  it("requires completed file handoff and an unchanged raw snapshot before resetting corrupt data", async () => {
    const key = fuelStorageKey("u");
    localStorage.setItem(key, "{corrupted");
    await render();
    const copy = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Pobierz oryginalny zapis",
    )!;
    const reset = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("utwórz nowy zapis"),
    )!;
    exports.deliver.mockResolvedValueOnce("cancelled");
    await act(async () => copy.click());
    expect(reset.disabled).toBe(true);
    expect(localStorage.getItem(key)).toBe("{corrupted");
    expect(exports.deliver).toHaveBeenCalledWith(
      "BallWise-Fuel-oryginalny-zapis.json",
      "{corrupted",
      "application/json",
      "u",
    );
    let resolve!: (value: string) => void;
    exports.deliver.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await act(async () => copy.click());
    expect(reset.disabled).toBe(true);
    await act(async () => resolve("delivered"));
    expect(reset.disabled).toBe(false);
    localStorage.setItem(key, "{changed-after-export");
    await act(async () => reset.click());
    expect(localStorage.getItem(key)).toBe("{changed-after-export");
    expect(reset.disabled).toBe(true);
  });
  it("pack shows and preserves exact adjusted portions, then rejects a new ingredient exclusion", async () => {
    const data = emptyFuelData();
    const context = manualFuelContext(localDate(Date.now()), "football", null, "moderate");
    const entry = createRecipeEntry(RECIPES[0], context.key, "selected", Date.now(), "edited");
    entry.lines = entry.lines.map((line) => ({ ...line, grams: line.grams * 2 }));
    data.entries = [entry];
    localStorage.setItem(fuelStorageKey("u"), JSON.stringify(data));
    await render();
    await act(async () => (host.querySelector(".fuel-v4-next") as HTMLButtonElement).click());
    const panel = document.querySelector('[role="dialog"]')!;
    expect(panel.textContent).toContain(`${entry.lines[0].grams} g`);
    const save = [...panel.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Zachowaj wybrany"),
    )!;
    await act(async () => save.click());
    expect(readFuelData(localStorage, "u").entries[0].lines).toEqual(entry.lines);
    data.preferences.excludedFoodIds = [entry.lines[0].foodId];
    localStorage.setItem(fuelStorageKey("u"), JSON.stringify(data));
    await act(async () =>
      window.dispatchEvent(
        new CustomEvent("ballwise:module-data-applied", {
          detail: { userId: "u", module: "fuel" },
        }),
      ),
    );
    await act(async () => (host.querySelector(".fuel-v4-next") as HTMLButtonElement).click());
    const blocked = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ].find((b) => b.textContent?.includes("Zachowaj wybrany"))!;
    expect(blocked.disabled).toBe(true);
  });
  it("does not report a successful meal save when storage quota rejects it", async () => {
    await render();
    vi.clearAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const eaten = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Zjadłem",
    )!;
    await act(async () => eaten.click());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("Nie zapisano posiłku"));
  });
});
