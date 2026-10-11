// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserLab from "./BrowserLab";
vi.mock("./SafariTools", () => ({ SafariTools: () => <p>Kopie dostępne</p> }));
vi.mock("./VideoAnalyzer", () => ({ VideoAnalyzer: () => <p>Pomiar rozpoczęty</p> }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("VideoDecoder", class {});
  vi.stubGlobal("EncodedVideoChunk", class {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
async function render() {
  await act(async () => root.render(<BrowserLab ownerId="qa-athlete" />));
}
const starts = () =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) =>
      b.textContent?.includes("Rozpocznij pełny profil") ||
      b.getAttribute("aria-label")?.startsWith("Rozpocznij"),
  );
describe("Lab capability gate", () => {
  it.each(["http", "no-decoder"])(
    "blocks every measurement for %s while keeping history and copies",
    async (mode) => {
      vi.stubGlobal("isSecureContext", mode !== "http");
      if (mode === "no-decoder") vi.stubGlobal("VideoDecoder", undefined);
      await render();
      expect(starts()).toHaveLength(6);
      expect(starts().every((b) => b.disabled)).toBe(true);
      expect(host.textContent).toContain(mode === "http" ? "HTTPS" : "nie udostępnia");
      await act(async () => host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
      expect(host.textContent).toContain("Kopie dostępne");
      expect(host.textContent).not.toContain("Pomiar rozpoczęty");
    },
  );
  it("starts a trial only when secure exact-frame APIs are available", async () => {
    vi.stubGlobal("isSecureContext", true);
    await render();
    expect(starts().every((b) => !b.disabled)).toBe(true);
    await act(async () => starts()[1].click());
    expect(host.textContent).toContain("Pomiar rozpoczęty");
  });
});
