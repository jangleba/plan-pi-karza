// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CycleReviewCard } from "./CycleReviewCard";
import type { CycleReview } from "@/lib/loadwise/cycleReview";

const review: CycleReview = {
  startDate: "2026-10-12",
  endDate: "2026-11-08",
  planned: 16,
  done: 9,
  adherencePct: 56,
  avgRpe: 6.5,
  rpeRise: 0.5,
  feeling: "good",
  healthFlag: false,
  progress: "unknown",
  progressImproved: 0,
  progressMeasured: 0,
  youth: true,
  phaseNext: "inseason",
  recommendation: "maintain",
};

describe("CycleReviewCard", () => {
  it("shows the result, one recommendation and one button; sources only under Więcej", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onDismiss = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<CycleReviewCard review={review} onDismiss={onDismiss} />));
    expect(host.querySelector("h2")?.textContent).toBe("Koniec cyklu");
    const text = host.textContent ?? "";
    expect(text).toContain("Treningi: 9 z 16 (56%)");
    expect(text).toContain("Wysiłek: średnio 6,5/10");
    expect(text).toContain("Utrzymanie formy w sezonie");
    const buttons = host.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(host.querySelector("details")?.open).toBe(false);
    act(() => buttons[0].click());
    expect(onDismiss).toHaveBeenCalledOnce();
    act(() => root.unmount());
    host.remove();
  });
});
