import { describe, expect, it } from "vitest";
import type { Readiness } from "../loadwise/types";
import { wellbeingTrends } from "./wellbeing";

const row = (date: string, o: Partial<Readiness> = {}): Readiness => ({
  date,
  sleep: 7,
  energy: 7,
  fatigue: 4,
  soreness: 3,
  jointPain: 0,
  stress: 3,
  motivation: 7,
  overall: 7,
  ...o,
});
const days = (from: number, to: number, o: Partial<Readiness>) =>
  Object.fromEntries(
    Array.from({ length: to - from + 1 }, (_, i) => {
      const d = `2026-11-${String(from + i).padStart(2, "0")}`;
      return [d, row(d, o)];
    }),
  );

describe("own wellbeing trends", () => {
  it("compares the last week with the week before, per own values", () => {
    const report = wellbeingTrends(
      { ...days(1, 7, { sleep: 8, fatigue: 3 }), ...days(8, 14, { sleep: 5, fatigue: 7 }) },
      "2026-11-14",
    );
    const by = Object.fromEntries(report.trends.map((t) => [t.key, t]));
    expect(by.sleep).toMatchObject({ current: 5, previous: 8, direction: "worse" });
    expect(by.fatigue).toMatchObject({ current: 7, previous: 3, direction: "worse" });
    expect(by.energy.direction).toBe("stable");
  });

  it("too few check-ins: values shown, no trend claimed", () => {
    const report = wellbeingTrends(days(13, 14, { sleep: 6 }), "2026-11-14");
    expect(report.enough).toBe(false);
    expect(report.trends.every((t) => t.direction === null)).toBe(true);
  });

  it("counts days with reported pain", () => {
    const report = wellbeingTrends(
      {
        ...days(8, 14, {}),
        "2026-11-13": row("2026-11-13", { jointPain: 4, painLocation: "knee" }),
      },
      "2026-11-14",
    );
    expect(report.painDays).toBe(1);
  });

  it("without consent the caller passes nothing and nothing is shown", () => {
    const report = wellbeingTrends(undefined, "2026-11-14");
    expect(report.entries).toBe(0);
    expect(report.enough).toBe(false);
  });
});
