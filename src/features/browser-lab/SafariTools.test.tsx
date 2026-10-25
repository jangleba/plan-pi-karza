// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SafariTools } from "./SafariTools";
import { createHistoryBackup } from "./storage";
const exports = vi.hoisted(() => ({ deliver: vi.fn() }));
vi.mock("@/lib/loadwise/deliverExportFile", () => ({ deliverExportFile: exports.deliver }));
vi.mock("./diagnostic", () => ({ runSafariCheck: vi.fn() }));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  exports.deliver.mockReset().mockResolvedValue("delivered");
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
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;
describe("Lab recovery requires a real file handoff", () => {
  it("keeps corrupt history protected when native sharing is cancelled or unresolved", async () => {
    const key = "ballwise.browser-lab.v1:owner";
    localStorage.setItem(key, "{broken");
    await act(async () =>
      root.render(<SafariTools ownerId="owner" rows={[]} onRestore={vi.fn()} />),
    );
    const file = new File([JSON.stringify(createHistoryBackup([]))], "valid.json");
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(createHistoryBackup([])),
    });
    await act(async () => {
      const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const recover = button("Odzyskaj ze sprawdzonej kopii");
    expect(recover.disabled).toBe(true);
    exports.deliver.mockResolvedValueOnce("cancelled");
    await act(async () => button("Pobierz uszkodzoną historię przed odzyskaniem").click());
    expect(recover.disabled).toBe(true);
    expect(localStorage.getItem(key)).toBe("{broken");
    expect(exports.deliver).toHaveBeenCalledWith(
      "BallWise-Lab-surowa-historia.txt",
      "{broken",
      "text/plain",
      "owner",
    );
    let resolve!: (result: string) => void;
    exports.deliver.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await act(async () => button("Pobierz uszkodzoną historię przed odzyskaniem").click());
    expect(recover.disabled).toBe(true);
    await act(async () => resolve("delivered"));
    expect(recover.disabled).toBe(false);
    expect(localStorage.getItem(key)).toBe("{broken");
  });
});
