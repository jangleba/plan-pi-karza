// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import ProgressMeasurements from "./ProgressMeasurements";
import { storeBrowserResults } from "@/features/browser-lab/storage";
import { createBrowserResult } from "@/features/browser-lab/results";
import { buildJumpTimeline } from "@/features/browser-lab/measurement";
import { attemptPlan } from "@/features/browser-lab/protocols";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
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
  Array.from({ length: 500 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
);
function result(end: number) {
  return {
    ...createBrowserResult({
      attempt: attemptPlan(["cmj"])[0],
      sessionId: "local-progress-series",
      timeline,
      start: 40,
      end,
      sourceName: "original.mp4",
      sourceHash: "e".repeat(64),
      sourceBytes: 1000,
      codec: "avc1.640029",
      guidePositions: [0.5, 0.5],
      notes: "",
    }),
    recordedAt: "2026-11-02T12:00:00.000Z",
  };
}
const render = async (ownerId: string) =>
  act(async () =>
    root.render(<ProgressMeasurements ownerId={ownerId} todayIso="2026-11-02" periodDays={7} />),
  );
it("reads only the current account and refreshes after local Lab events without navigation", async () => {
  storeBrowserResults("athlete-a", [result(140)]);
  await render("athlete-a");
  expect(host.textContent).toContain("21,3");
  await render("athlete-b");
  expect(host.textContent).not.toContain("21,3");
  expect(host.textContent).toContain("Brak pomiarów");
  await act(async () => {
    storeBrowserResults("athlete-b", [result(180)]);
  });
  expect(host.textContent).toContain("41,7");
  await act(async () => {
    storeBrowserResults("athlete-a", [result(160)]);
  });
  expect(host.textContent).toContain("41,7");
  expect(host.textContent).not.toContain("30,6");
});
it("shows an unreadable Lab history as an error without clearing it or breaking IQ", async () => {
  const key = "ballwise.browser-lab.v1:athlete-a";
  localStorage.setItem(key, "broken-data");
  await render("athlete-a");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Nie udało się odczytać historii Lab",
  );
  expect(host.textContent).toContain("Przećwiczone akcje: 0");
  expect(localStorage.getItem(key)).toBe("broken-data");
});
