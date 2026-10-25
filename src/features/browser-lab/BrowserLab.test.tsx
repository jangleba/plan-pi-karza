// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserLab from "./BrowserLab";
import { storeBrowserResults } from "./storage";
import { createBrowserResult } from "./results";
import { attemptPlan } from "./protocols";
import { buildJumpTimeline } from "./measurement";
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
  it("announces persisted Lab data and reloads only a matching applied cloud snapshot", async () => {
    vi.stubGlobal("isSecureContext", true);
    await render();
    await act(async () => host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
    const changed = vi.fn();
    window.addEventListener("ballwise:module-data-changed", changed);
    try {
      const timeline = buildJumpTimeline(
        Array.from({ length: 240 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
      );
      const row = createBrowserResult({
        attempt: attemptPlan(["cmj"])[0],
        sessionId: "lab-sync-session",
        timeline,
        start: 30,
        end: 130,
        sourceName: "jump.mp4",
        sourceHash: "a".repeat(64),
        sourceBytes: 1000,
        codec: "avc1.640029",
        guidePositions: [0.5, 0.5],
        notes: "",
      });
      storeBrowserResults("qa-athlete", [row]);
      expect(changed).toHaveBeenCalledOnce();
      const detail = (changed.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.userId).toBe("qa-athlete");
      expect(detail.module).toBe("lab");
      expect(JSON.parse(detail.value)).toHaveLength(1);
      expect(host.textContent).toContain("0 zapisanych prób");
      await act(async () =>
        window.dispatchEvent(
          new CustomEvent("ballwise:module-data-applied", {
            detail: { userId: "other-athlete", module: "lab" },
          }),
        ),
      );
      expect(host.textContent).toContain("0 zapisanych prób");
      await act(async () =>
        window.dispatchEvent(
          new CustomEvent("ballwise:module-data-applied", {
            detail: { userId: "qa-athlete", module: "lab" },
          }),
        ),
      );
      expect(host.textContent).toContain("1 zapisanych prób");
      const corrupt = "{broken";
      localStorage.setItem("ballwise.browser-lab.v1:qa-athlete", corrupt);
      await act(async () =>
        window.dispatchEvent(
          new CustomEvent("ballwise:module-data-applied", {
            detail: { userId: "qa-athlete", module: "lab" },
          }),
        ),
      );
      expect(host.textContent).toContain("Nie można odczytać lokalnej historii");
      expect(localStorage.getItem("ballwise.browser-lab.v1:qa-athlete")).toBe(corrupt);
    } finally {
      window.removeEventListener("ballwise:module-data-changed", changed);
    }
  });
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
