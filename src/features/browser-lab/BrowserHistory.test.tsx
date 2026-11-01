// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BrowserHistory } from "./BrowserHistory";
import { createBrowserResult } from "./results";
import { buildJumpTimeline } from "./measurement";
import { attemptPlan } from "./protocols";
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
const timeline = buildJumpTimeline(
  Array.from({ length: 1000 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
);
const source = {
  sessionId: "history-test-session",
  timeline,
  start: 60,
  end: 164,
  sourceName: "clip.mp4",
  sourceHash: "a".repeat(64),
  sourceBytes: 1000,
  codec: "avc1.640029",
  guidePositions: [0.5, 0.5] as [number, number],
  notes: "",
};
describe("Lab history presentation", () => {
  it("creates detailed trial views only after expanding a session", async () => {
    const row = createBrowserResult({ ...source, attempt: attemptPlan(["cmj"])[0] });
    await act(async () => root.render(<BrowserHistory rows={[row]} onDelete={() => true} />));
    expect(host.querySelector(".bl-trial-row")).toBeNull();
    expect(host.textContent).toContain("Sesja niepełna");
    const detail = host.querySelector("details")!;
    await act(async () => {
      detail.open = true;
      detail.dispatchEvent(new Event("toggle"));
    });
    expect(host.querySelector(".bl-trial-row")?.textContent).toContain("240.0");
    expect(host.querySelector(".bl-trial-row")?.textContent).toContain("Rozdzielczość czasowa");
    await act(async () => {
      detail.open = false;
      detail.dispatchEvent(new Event("toggle"));
    });
    expect(host.querySelector(".bl-trial-row")).toBeNull();
  });
  it("does not offer comparison across different measurement protocols", async () => {
    const row = createBrowserResult({ ...source, attempt: attemptPlan(["cmj"])[0] });
    const other = { ...row, id: "other-protocol-id", version: "ballwise-browser-lab-1.1" as const };
    await act(async () =>
      root.render(<BrowserHistory rows={[row, other]} onDelete={() => true} />),
    );
    const first = host.querySelector<HTMLSelectElement>(
      '[aria-label="Pierwsza próba do porównania"]',
    )!;
    await act(async () => {
      first.value = row.id;
      first.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const second = host.querySelector<HTMLSelectElement>(
      '[aria-label="Druga próba do porównania"]',
    )!;
    expect(second.options).toHaveLength(1);
    expect(host.querySelector(".bl-comparison")).toBeNull();
  });
});
