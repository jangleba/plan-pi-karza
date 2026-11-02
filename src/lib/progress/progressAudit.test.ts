import { describe, expect, it } from "vitest";
import type { SessionCompletion, SessionDay, SessionHistoryRecord } from "@/lib/loadwise/types";
import {
  buildTrainingHistory,
  mergeTrainingHistory,
  categoryOf,
  uniqueTrainingHistory,
} from "./progress";
import { buildMicrocycle, buildDirection } from "./center";
import { buildLoadReport, buildTimeline, groupByWeek } from "./dashboard";
import { progressSessionTargets } from "./navigation";
import type { SessionModification } from "@/lib/loadwise/types";

const today = "2026-11-02";
function day(id: string, date = today): SessionDay {
  return {
    dbId: id,
    date,
    dayType: "training",
    type: "strength_power",
    sessionType: "strength_power",
    title: id,
    durationMin: 60,
    dayName: "Poniedziałek",
    goalLabel: "Siła",
    intensity: "umiarkowana",
    reason: "",
    safetyNote: null,
    whyToday: "",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
  };
}
function row(
  key: string,
  date = today,
  rpe: number | null = 6,
  durationMin = 30,
): SessionHistoryRecord {
  return { key, date, title: key, category: "gym", rpe, durationMin, notes: "" };
}
const done = (extra: Partial<SessionCompletion> = {}): SessionCompletion => ({
  completed: true,
  status: "completed",
  rpe: 6,
  durationMin: 30,
  notes: "",
  ...extra,
});

describe("progress audit: identity and corrected execution", () => {
  it.each([
    ["Technika i reakcja", "ball"],
    ["Siła", "gym"],
    ["Szybkość", "speed"],
    ["Wydolność tlenowa", "endurance"],
  ] as const)("keeps older Polish session types: %s", (sessionType, category) => {
    expect(categoryOf({ ...day("legacy"), type: undefined, sessionType })).toBe(category);
  });
  it("shows a fresh corrected duration/RPE instead of an older persisted copy", () => {
    const current = buildTrainingHistory([day("one")], { one: done({ durationMin: 18, rpe: 3 }) });
    const merged = mergeTrainingHistory([row("one", today, 9, 90)], current);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ durationMin: 18, rpe: 3 });
    expect(buildLoadReport(merged, today).total).toBe(54);
  });
  it("keeps completed snapshots after regeneration and uses their original prescription", () => {
    const snapshot = {
      ...day("old", "2026-10-30"),
      title: "Zapisany sprint",
      type: "sprint_acceleration" as const,
    };
    const current = buildTrainingHistory([day("old")], {
      old: done({ executionSnapshot: snapshot }),
    });
    expect(current[0]).toMatchObject({
      date: "2026-10-30",
      category: "speed",
      title: "Zapisany sprint",
    });
    expect(buildTrainingHistory([], { old: done({ executionSnapshot: snapshot }) })).toEqual(
      current,
    );
  });
  it("does not misclassify ball technique in the second slot as a match", () => {
    const technical = {
      ...day("tech"),
      dayType: "match" as const,
      type: "football_technical" as const,
    };
    expect(categoryOf(technical)).toBe("ball");
    const rows = buildTrainingHistory(
      [{ ...day("match"), type: "match", dayType: "match", secondSession: technical }],
      { match: done(), tech: done() },
    );
    expect(rows.map((r) => r.category).sort()).toEqual(["ball", "match"]);
  });
  it("removes stale completed history when the authoritative log is no longer complete", () => {
    expect(
      mergeTrainingHistory([row("one")], [], { one: done({ completed: false, status: "missed" }) }),
    ).toEqual([]);
  });
  it("deduplicates work totals, means, category counts, timeline and planned denominator", () => {
    const history = [row("one"), row("one")];
    const micro = buildMicrocycle([day("one"), day("one")], history, today);
    expect(micro).toMatchObject({
      totalMinutes: 30,
      loggedCount: 1,
      completedCount: 1,
      plannedCount: 1,
      executionPct: 100,
      byCategory: { gym: 1 },
    });
    expect(buildLoadReport(history, today).total).toBe(180);
    expect(buildTimeline(history)).toHaveLength(1);
  });
  it("preserves actual archived work without claiming it completes a new prescription", () => {
    const micro = buildMicrocycle([day("new")], [row("old")], today);
    expect(micro.executionPct).toBe(0);
    expect(buildDirection(null, micro, null).loadSignal).toContain("30 min");
  });
  it("marks a planned-duration fallback and excludes it from measured session load", () => {
    const history = buildTrainingHistory([day("one")], { one: done({ durationMin: null }) });
    expect(history[0]).toMatchObject({ durationMin: 60, durationEstimated: true });
    expect(buildLoadReport(history, today)).toMatchObject({
      total: 0,
      hasData: false,
      missingDurationCount: 1,
    });
    expect(buildTimeline(history)[0].detail).toContain("ok. 60 min");
  });
});

describe("progress audit: completeness and equal calendar periods", () => {
  it("does not interpret absent RPE as low load or publish a misleading percentage comparison", () => {
    const report = buildLoadReport(
      [row("now"), row("missing", today, null), row("before", "2026-10-25", 3, 30)],
      today,
    );
    expect(report).toMatchObject({
      total: 180,
      previousTotal: 90,
      recordedCount: 1,
      missingRpeCount: 1,
      comparable: false,
    });
    expect(report.insight).toContain("Nie porównujemy");
  });
  it("also blocks comparisons when the previous period is incomplete", () => {
    const report = buildLoadReport([row("now"), row("before", "2026-10-25", null)], today);
    expect(report.comparable).toBe(false);
  });
  it("distinguishes a valid zero RPE from missing RPE", () => {
    const zero = buildLoadReport([row("zero", today, 0)], today);
    expect(zero).toMatchObject({ hasData: true, total: 0, recordedCount: 1, missingRpeCount: 0 });
    expect(buildMicrocycle([], [row("zero", today, 0)], today).avgRpe).toBe(0);
  });
  it.each([NaN, Infinity, -1, 11])("refuses invalid RPE %s as a usable observation", (rpe) => {
    expect(buildLoadReport([row("bad", today, rpe)], today)).toMatchObject({
      recordedCount: 0,
      missingRpeCount: 1,
    });
  });
  it("sanitizes invalid duration, date and category without poisoning the chart", () => {
    const bad = [
      row("negative", today, 4, -10),
      row("nan", today, 4, NaN),
      row("date", "2026-02-30"),
      { ...row("category"), category: "toString" as never },
    ];
    const report = buildLoadReport(bad, today);
    expect(report.total).toBe(0);
    expect(report.missingDurationCount).toBe(2);
    expect(uniqueTrainingHistory(bad)).toHaveLength(2);
  });
  it("uses inclusive 7-day and separate previous 7-day boundaries across DST", () => {
    const history = [
      row("start", "2026-10-27"),
      row("today"),
      row("previousEnd", "2026-10-26"),
      row("previousStart", "2026-10-20"),
      row("tooOld", "2026-10-19"),
      row("future", "2026-11-03"),
    ];
    const report = buildLoadReport(history, today);
    expect(report).toMatchObject({
      total: 360,
      previousTotal: 360,
      comparable: true,
      previousCount: 2,
      recordedCount: 2,
    });
    expect(report.days.map((d) => d.date)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
  it("compares 28 days with the preceding 28, not just the previous week", () => {
    const history = [
      row("start", "2026-10-06"),
      row("today"),
      row("previousEnd", "2026-10-05"),
      row("previousStart", "2026-09-08"),
      row("tooOld", "2026-09-07"),
    ];
    expect(buildLoadReport(history, today, 28)).toMatchObject({
      total: 360,
      previousTotal: 360,
      previousCount: 2,
      periodDays: 28,
    });
    expect(buildMicrocycle([], history, today, 28)).toMatchObject({
      totalMinutes: 60,
      loggedCount: 2,
      fromIso: "2026-10-06",
    });
  });
  it("groups an ISO-year boundary on its actual Monday", () => {
    const weeks = groupByWeek(buildTimeline([row("a", "2026-01-01"), row("b", "2025-12-31")]));
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toBe("2025-12-29");
  });
});

describe("progress links resolve exact sessions", () => {
  it("keeps the second slot on its parent date and does not guess a link for archived records", () => {
    const targets = progressSessionTargets([
      { ...day("one"), secondSession: day("two", "2026-10-01") },
    ]);
    expect(targets.two).toEqual({ date: today, slot: 2, sessionId: "two" });
    expect(targets.archived).toBeUndefined();
  });
  it("preserves the add modification id needed by the session route", () => {
    const extra = day("extra");
    const mod = {
      id: "addition-123",
      date: today,
      type: "add",
      session: extra,
      createdAt: "2026-11-02T10:00:00Z",
    } as SessionModification;
    expect(
      progressSessionTargets([{ ...day("one"), secondSession: extra }], { [today]: [mod] }).extra,
    ).toEqual({ date: today, slot: 2, mod: "addition-123", sessionId: "extra" });
  });
  it("does not link unavailable, rest or testing sessions to an editable training", () => {
    const targets = progressSessionTargets([
      { ...day("rest"), dayType: "rest" },
      { ...day("blocked"), isUnavailable: true },
      { ...day("test"), type: "testing" } as unknown as SessionDay,
    ]);
    expect(targets).toEqual({});
  });
});
