// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CycleStartRecord } from "./types";

const load = vi.hoisted(() => vi.fn());
vi.mock("./cycleReviewData", () => ({
  CYCLE_REVIEW_MAX_AGE_DAYS: 14,
  loadPastCycleReviews: load,
}));
import { clearPastCycleReviewsCache, useCycleReviewHistory } from "./useCycleReview";

const record = (endDate: string) =>
  ({
    reviewedCycleId: `cycle-${endDate}`,
    review: { startDate: "2026-10-01", endDate },
  }) as unknown as CycleStartRecord;

let root: Root;
let host: HTMLDivElement;
let seen: { records: CycleStartRecord[]; loading: boolean }[] = [];
function Probe({ userId }: { userId: string }) {
  seen.push(useCycleReviewHistory(userId, []));
  return null;
}
const mount = async (userId = "owner") => {
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(<Probe userId={userId} />));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clearPastCycleReviewsCache();
  load.mockReset();
  seen = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shows remembered summaries at once when Postęp opens again, without another read", async () => {
  load.mockResolvedValue([record("2026-10-28")]);
  await mount();
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  seen = [];
  await mount();
  expect(load).toHaveBeenCalledTimes(1);
  expect(seen[0]).toEqual({ records: [record("2026-10-28")], loading: false });
});

it("refreshes a stale copy in the background while still showing it", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  load.mockResolvedValueOnce([record("2026-10-28")]);
  await mount();
  await act(async () => root.unmount());
  vi.setSystemTime(Date.now() + 6 * 60_000);
  load.mockResolvedValueOnce([record("2026-11-04"), record("2026-10-28")]);
  seen = [];
  await mount();
  expect(seen[0]!.loading).toBe(false);
  expect(seen[0]!.records).toHaveLength(1);
  expect(load).toHaveBeenCalledTimes(2);
  expect(seen.at(-1)!.records.map((r) => r.review.endDate)).toEqual(["2026-11-04", "2026-10-28"]);
});

it("keeps what it shows when a refresh fails, and does not remember the failure", async () => {
  load.mockRejectedValueOnce(new Error("offline"));
  await mount();
  expect(seen.at(-1)).toEqual({ records: [], loading: false });
  await act(async () => root.unmount());
  load.mockResolvedValueOnce([record("2026-10-28")]);
  await mount();
  expect(load).toHaveBeenCalledTimes(2);
  expect(seen.at(-1)!.records).toHaveLength(1);
});

it("never shows one athlete's summaries to another account", async () => {
  load.mockResolvedValueOnce([record("2026-10-28")]);
  await mount("owner");
  await act(async () => root.unmount());
  load.mockResolvedValueOnce([]);
  seen = [];
  await mount("other");
  expect(seen[0]).toEqual({ records: [], loading: true });
  expect(seen.at(-1)).toEqual({ records: [], loading: false });
});
