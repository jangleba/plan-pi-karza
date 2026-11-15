import { describe, expect, it } from "vitest";
import type { SessionCompletion, SessionDay, SessionHistoryRecord } from "@/lib/loadwise/types";
import { estimatedSessionLoad, historyLoad } from "@/lib/loadwise/sessionFeedback";
import { buildMicrocycle } from "./center";
import { buildLoadReport, buildTimeline } from "./dashboard";
import { buildTrainingHistory, mergeTrainingHistory } from "./progress";

/** One load rule for the session, Progress, plan summary and adaptation: minutes played × RPE. */
const today = "2026-11-02";
const day = (id: string, dayType: "match" | "club", extra: Partial<SessionDay> = {}): SessionDay =>
  ({
    dbId: id,
    date: today,
    dayType,
    type: dayType === "match" ? "match" : "club_training",
    sessionType: dayType === "match" ? "match" : "club_training",
    title: dayType === "match" ? "Mecz" : "Klub",
    durationMin: 0,
    secondSession: null,
    ...extra,
  }) as unknown as SessionDay;
const completion = (extra: Partial<SessionCompletion>): SessionCompletion => ({
  completed: true,
  status: "completed",
  rpe: 8,
  notes: "",
  ...extra,
});

describe("match minutes survive into the load chart", () => {
  it("30 min played × RPE 8 is 240 on the chart, with minutes played kept separate", () => {
    const completions = { m: completion({ matchMinutesPlayed: 30, rpe: 8 }) };
    const history = buildTrainingHistory([day("m", "match")], completions);
    expect(history[0]).toMatchObject({ category: "match", matchMinutesPlayed: 30, durationMin: 0 });
    const report = buildLoadReport(history, today, 7);
    expect(report.total).toBe(240);
    expect(report.hasData).toBe(true);
    expect(report.recordedCount).toBe(1);
    expect(report.matchMinutesPlayed).toBe(30);
    expect(report.missingDurationCount).toBe(0);
    // The same number as the shared completion rule used by the plan summary and adaptation.
    expect(estimatedSessionLoad(completions.m, "match").value).toBe(240);
    expect(historyLoad(history[0]).value).toBe(240);
    expect(buildTimeline(history)[0].detail).toContain("30 min gry");
  });

  it("0 minutes played is a known value, not missing data", () => {
    const completions = { m: completion({ matchMinutesPlayed: 0, rpe: 9 }) };
    const history = buildTrainingHistory([day("m", "match")], completions);
    const report = buildLoadReport(history, today, 7);
    expect(report.total).toBe(0);
    expect(report.recordedCount).toBe(1);
    expect(report.hasData).toBe(true);
    expect(report.missingDurationCount).toBe(0);
    expect(report.matchMinutesPlayed).toBe(0);
    expect(historyLoad(history[0])).toMatchObject({ value: 0, basis: "match_minutes_played" });
  });

  it("unknown minutes stay missing: never a silent zero, never the planned match length", () => {
    const history = buildTrainingHistory([day("m", "match", { durationMin: 90 })], {
      m: completion({ matchMinutesPlayed: null, rpe: 8 }),
    });
    expect(historyLoad(history[0]).value).toBeNull();
    const report = buildLoadReport(history, today, 7);
    expect(report.hasData).toBe(false);
    expect(report.missingDurationCount).toBe(1);
  });

  it("a club's 90 min is counted but flagged as an assumption; an estimated own time is not evidence", () => {
    const club = buildTrainingHistory([day("c", "club")], {
      c: completion({ durationMin: 90, durationSource: "club_default", rpe: 7 }),
    });
    expect(historyLoad(club[0])).toMatchObject({ value: 630, minutesAssumed: true });
    const report = buildLoadReport(club, today, 7);
    expect(report.total).toBe(630);
    expect(report.assumedMinutesCount).toBe(1);
    const own: SessionHistoryRecord = {
      key: "own",
      date: today,
      title: "Siła",
      category: "gym",
      durationMin: 60,
      durationEstimated: true,
      rpe: 6,
      notes: "",
    };
    expect(historyLoad(own).value).toBeNull();
  });

  it("merging a corrected completion keeps minutes played and the time source", () => {
    const base = buildTrainingHistory([day("m", "match")], {
      m: completion({ matchMinutesPlayed: 20, rpe: 8 }),
    });
    const merged = mergeTrainingHistory(base, [], {
      m: completion({ matchMinutesPlayed: 45, rpe: 7 }),
    });
    expect(merged[0]).toMatchObject({ matchMinutesPlayed: 45, rpe: 7 });
    expect(buildLoadReport(merged, today, 7).total).toBe(45 * 7);
  });

  it("the micro-cycle shows minutes played apart from whole-session time", () => {
    const history = buildTrainingHistory([day("m", "match", { durationMin: 0 })], {
      m: completion({ matchMinutesPlayed: 30, rpe: 8 }),
    });
    const micro = buildMicrocycle([day("m", "match")], history, today, 7);
    expect(micro.matchMinutesPlayed).toBe(30);
  });
});
