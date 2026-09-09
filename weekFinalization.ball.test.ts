import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "./types";
import { normalizeSessionCategory } from "./sessionClassification";
import {
  addMissingBallSessions,
  countBallSessions,
  validateAndRepairWeekPlan,
} from "./weekFinalization";
import { calculateWeeklyMinimumRequirements } from "./weeklyRequirements";

const DATES = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
];

function day(
  date: string,
  title: string,
  sessionType: string,
  dayType: SessionDay["dayType"] = "training",
): SessionDay {
  return normalizeSessionCategory({
    date,
    dayName: date,
    dayType,
    title,
    goalLabel: title,
    intensity: dayType === "rest" ? "niska" : "umiarkowana",
    durationMin: dayType === "rest" ? 0 : 45,
    reason: "test",
    safetyNote: null,
    whyToday: "test",
    sessionType,
    goalOfSession: title,
    riskManaged: "test",
    avoidToday: "test",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
  });
}

function profile(): Profile {
  return {
    age: 21,
    level: "intermediate",
    goal: "general",
    seasonPhase: "preseason",
    clubTrainingDays: [2],
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    gymExperienceLevel: "intermediate",
  } as unknown as Profile;
}

function completeWeekWithoutBall(): SessionDay[] {
  return [
    day(DATES[0], "Siła ogólna", "Siła / moc"),
    day(DATES[1], "Trening klubowy", "Trening klubowy", "club"),
    day(DATES[2], "Sprint — przyspieszenie", "Szybkość"),
    day(DATES[3], "Siła ogólna", "Siła / moc"),
    day(DATES[4], "Easy run", "Wytrzymałość"),
    day(DATES[5], "Regeneracja", "Regeneracja", "recovery"),
    day(DATES[6], "Odpoczynek", "Odpoczynek", "rest"),
  ];
}

describe("week finalization — własna piłka", () => {
  it("nie liczy treningu klubowego jako własnej sesji piłkarskiej", () => {
    expect(countBallSessions(completeWeekWithoutBall())).toBe(0);
  });

  it("dodaje 30-minutową własną sesję z przyciskiem Trenera reakcji", () => {
    const p = profile();
    const week = completeWeekWithoutBall();
    const requirements = calculateWeeklyMinimumRequirements(
      { seasonPhase: p.seasonPhase, clubTrainingCount: 1, matchCount: 0, isFullWeek: true },
      { hasGym: true },
      p.goal,
      { gymExperienceLevel: "intermediate" },
    );
    const result = addMissingBallSessions(week, requirements, p);
    expect(result.count).toBe(1);
    const ball = week.flatMap((entry) => [entry, ...(entry.secondSession ? [entry.secondSession] : [])])
      .find((entry) => entry.classification?.subcategory === "ball_technical");
    expect(ball?.durationMin).toBe(30);
    expect(ball?.sections.main.some((item) => item.name.includes("Trener reakcji"))).toBe(true);
  });

  it("finalny gate wymaga własnej piłki nawet gdy w tygodniu jest klub", () => {
    const p = profile();
    const week = completeWeekWithoutBall();
    const { report } = validateAndRepairWeekPlan(week, p);
    expect(report.requiredBallSessions).toBe(1);
    expect(report.ballSessionsCount).toBe(1);
    expect(report.finalStatus).toBe("valid");
  });
});
