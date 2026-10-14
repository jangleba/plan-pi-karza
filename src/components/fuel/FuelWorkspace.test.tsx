// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FuelWorkspace } from "./FuelWorkspace";
import { fuelStorageKey, readFuelData } from "@/lib/fuel/experience";
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));
let host: HTMLDivElement;
let root: Root;
function button(text: string, scope: ParentNode = document.body) {
  const result = [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}
async function click(text: string, scope?: ParentNode) {
  await act(async () => button(text, scope).click());
}
function saved() {
  return readFuelData(localStorage, "qa-user");
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<FuelWorkspace userId="qa-user" contexts={[]} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("practical Fuel user flow", () => {
  it("saves a manual countdown and a disliked ingredient across reopening", async () => {
    await click("1 h");
    expect(Object.values(saved().timings)[0].presetMin).toBe(60);
    await click("Zamień");
    await click("Nie chcę produktu");
    await click("Banan");
    await click("Gotowe");
    expect(saved().preferences.excludedFoodIds).toContain("banana");
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<FuelWorkspace userId="qa-user" contexts={[]} />));
    expect(host.querySelector('.fuel-v4-presets button[aria-pressed="true"]')?.textContent).toBe(
      "1 h",
    );
    const stored = JSON.parse(localStorage.getItem(fuelStorageKey("qa-user"))!);
    expect(stored.preferences.excludedFoodIds).toContain("banana");
    expect(host.querySelector(".fuel-v4-ingredients")?.textContent).not.toContain("Banan");
  });
  it("turns a selected meal into eaten without leaving an extra preparation entry", async () => {
    await click("Zamień");
    await click("Wybierz zestaw na później");
    expect(saved().entries).toHaveLength(1);
    expect(saved().entries[0].status).toBe("selected");
    // The debounce prevents a double tap, so advance only the wall clock.
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    await click("Zjadłem");
    clock.mockRestore();
    expect(saved().entries).toHaveLength(1);
    expect(saved().entries[0].status).toBe("eaten");
    expect(saved().entries[0].eatenAt).not.toBeNull();
  });
  it("uses the browser calendar alternative without asking for medical details", async () => {
    const reminders = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Kalendarz"),
    )!;
    await act(async () => reminders.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("kalendarza");
    expect(document.querySelector('[role="dialog"]')?.querySelector('[role="switch"]')).toBeNull();
    expect(host.textContent).not.toMatch(/alergie|choroby|diagnoz/i);
  });
});
