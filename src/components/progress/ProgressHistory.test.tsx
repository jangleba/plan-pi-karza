// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ProgressHistory } from "./ProgressHistory";
import { buildTimeline } from "@/lib/progress/dashboard";
import type { SessionHistoryRecord } from "@/lib/loadwise/types";
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
const entries = Array.from({ length: 45 }, (_, i) => ({
  key: `session-${String(i).padStart(2, "0")}`,
  date: i < 25 ? "2026-11-02" : "2026-10-18",
  title: `Trening ${i}`,
  category: i % 3 === 0 ? "match" : "gym",
  durationMin: 30,
  rpe: 6,
  notes: "",
})) as SessionHistoryRecord[];
it("renders history in bounded pages, then resets pagination when filtering matches", async () => {
  await act(async () =>
    root.render(<ProgressHistory events={buildTimeline(entries)} runningActivities={{}} />),
  );
  expect(host.querySelectorAll("article")).toHaveLength(20);
  const button = (text: string) =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === text)!;
  await act(async () => button("Pokaż kolejne 20").click());
  expect(host.querySelectorAll("article")).toHaveLength(40);
  await act(async () => button("Mecz").click());
  expect(host.querySelectorAll("article")).toHaveLength(15);
  await act(async () => button("Listopad 2026").click());
  expect(host.querySelectorAll("article")).toHaveLength(9);
  expect(host.textContent).toContain("Wpisy: 9");
});
it("recovers an obsolete month selection when restored history changes", async () => {
  await act(async () =>
    root.render(<ProgressHistory events={buildTimeline(entries)} runningActivities={{}} />),
  );
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Październik 2026")!.click(),
  );
  await act(async () =>
    root.render(
      <ProgressHistory events={buildTimeline(entries.slice(0, 10))} runningActivities={{}} />,
    ),
  );
  expect(host.querySelectorAll("article")).toHaveLength(10);
});

it("opens the missing-RPE view without confusing a genuine zero with absent data", async () => {
  const mixed = entries.map((row, i) => ({ ...row, rpe: i === 0 ? null : i === 1 ? 0 : 6 }));
  await act(async () =>
    root.render(
      <ProgressHistory events={buildTimeline(mixed)} runningActivities={{}} initialMissingRpe />,
    ),
  );
  expect(host.querySelectorAll("article")).toHaveLength(1);
  expect(host.querySelector("article")?.textContent).toContain("Trening 0");
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Brak RPE")!.click(),
  );
  expect(host.querySelectorAll("article")).toHaveLength(20);
});
