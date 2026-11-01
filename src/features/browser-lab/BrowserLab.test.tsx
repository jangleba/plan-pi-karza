// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserLab from "./BrowserLab";
import { storeBrowserResults, loadBrowserResults } from "./storage";
import type { VideoAnalyzer } from "./VideoAnalyzer";
import { createBrowserResult } from "./results";
import { attemptPlan } from "./protocols";
import { buildJumpTimeline } from "./measurement";
vi.mock("./SafariTools", () => ({ SafariTools: () => <p>Kopie dostępne</p> }));
const bridge = vi.hoisted(() => ({ props: null as ComponentProps<typeof VideoAnalyzer> | null }));
vi.mock("./VideoAnalyzer", () => ({
  VideoAnalyzer: (props: ComponentProps<typeof VideoAnalyzer>) => {
    bridge.props = props;
    return <p>Pomiar rozpoczęty</p>;
  },
}));
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
  it("switches accessible Testy/Historia panels with arrow and Home keys", async () => {
    vi.stubGlobal("isSecureContext", true);
    await render();
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[0].focus();
    await act(async () =>
      tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(
      tabs[1].id,
    );
    await act(async () =>
      tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })),
    );
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].tabIndex).toBe(-1);
  });
  it("completes all 17 profile slots once, preserving sides, trial numbers and saved history", async () => {
    vi.stubGlobal("isSecureContext", true);
    await render();
    await act(async () => starts()[0].click());
    const timeline = buildJumpTimeline(
      Array.from({ length: 1000 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
    );
    const p = (x: number, y: number): [number, number] => [0.1 + 0.004 * x, 0.1 + 0.0025 * y];
    const reference = [p(0, -24), p(20, -24), p(20, 0), p(0, 0)] as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
    const range = [p(0, 288), p(20, 288), p(20, 312), p(0, 312)] as typeof reference;
    for (let i = 0; i < 17; i++) {
      const props = bridge.props!;
      expect(host.textContent).toContain(`${i + 1} / 17`);
      const isRun = ["sprint_10m", "cod_505"].includes(props.attempt.testId);
      const spatial =
        props.attempt.testId === "standing_long_jump"
          ? {
              method: "ballwise-marker-pose-v3" as const,
              referenceCorners: reference,
              rangeCorners: range,
              landingReferenceCorners: reference,
              landingRangeCorners: range,
              referenceWidthCm: 20 as const,
              referenceDepthCm: 24 as const,
              baselineCm: 300 as const,
              imageWidth: 1920,
              imageHeight: 1080,
              calibrationFrameIndex: 30,
              lineFrameIndex: 30,
              heelFrameIndex: 130,
              takeoffLine: [reference[2], reference[3]] as [[number, number], [number, number]],
              heel: p(7, 214),
              poseConfidence: 0.95,
              markerQuality: 0.95,
              heelSource: "manual" as const,
            }
          : undefined;
      const result = createBrowserResult({
        attempt: props.attempt,
        sessionId: props.sessionId,
        timeline,
        start: 30,
        end: isRun ? 630 : 130,
        sourceName: `trial-${i}.mp4`,
        sourceHash: (i + 1).toString(16).padStart(64, "0"),
        sourceBytes: 1000,
        codec: "avc1.640029",
        guidePositions: [0.5, 0.5],
        notes: "",
        spatial,
        ...(props.attempt.testId === "cod_505" ? { turnFrameIndex: 330 } : {}),
      });
      await act(async () => props.onSave(result));
      expect(loadBrowserResults("qa-athlete")).toHaveLength(i + 1);
      const next = [...host.querySelectorAll("button")].find((b) =>
        b.textContent?.includes(i === 16 ? "Zakończ i pokaż wyniki" : "Kolejna próba"),
      )!;
      await act(async () => next.click());
    }
    expect(host.textContent).toContain("Zapisano 17 poprawnych prób");
    expect(host.textContent).toContain("17 zapisanych prób");
    const rows = loadBrowserResults("qa-athlete");
    const counts = Object.fromEntries(
      ["cmj", "single_leg_cmj", "sprint_10m", "standing_long_jump", "cod_505"].map((id) => [
        id,
        rows.filter((r) => r.testId === id).length,
      ]),
    );
    expect(counts).toEqual({
      cmj: 3,
      single_leg_cmj: 6,
      sprint_10m: 2,
      standing_long_jump: 2,
      cod_505: 4,
    });
    expect(rows.filter((r) => r.side === "left")).toHaveLength(5);
    expect(rows.filter((r) => r.side === "right")).toHaveLength(5);
  });
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
