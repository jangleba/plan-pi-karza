import { describe, expect, it } from "vitest";
import type { SessionDay } from "./types";
import {
  interviewQuestionCount,
  normalizePostSessionAnswers,
  postSessionKind,
} from "./postSessionInterview";

function session(dayType: SessionDay["dayType"]): SessionDay {
  return {
    date: "2026-09-20",
    dayName: "Niedziela",
    dayType,
    title: "Test",
    goalLabel: "Test",
    intensity: "umiarkowana",
    durationMin: 60,
    reason: "test",
    safetyNote: null,
    whyToday: "test",
    sessionType: "Test",
    goalOfSession: "test",
    riskManaged: "test",
    avoidToday: "",
    mdLabel: dayType === "match" ? "MD" : null,
    slotLabel: null,
    sections: {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
  };
}

describe("post-session interview", () => {
  it("zwykły trening ma tylko jedno pytanie", () => {
    expect(interviewQuestionCount(session("training"))).toBe(1);
  });

  it("mecz zapisuje minuty i wysiłek bez notatek zdrowotnych", () => {
    const match = session("match");
    const result = normalizePostSessionAnswers({
      session: match,
      effort: "hard",
      durationMin: 73,
    });

    expect(postSessionKind(match)).toBe("match");
    expect(interviewQuestionCount(match)).toBe(2);
    expect(result).toEqual({
      rpe: 8,
      notes: "",
      details: { durationMin: 73, activityType: "mixed" },
    });
  });

  it("trening klubowy zachowuje trzy dane potrzebne do sterowania obciążeniem", () => {
    const club = session("club");
    const result = normalizePostSessionAnswers({
      session: club,
      effort: "planned",
      durationMin: 95,
      activityType: "technical",
    });

    expect(interviewQuestionCount(club)).toBe(3);
    expect(result.details).toEqual({
      durationMin: 95,
      activityType: "technical",
    });
  });

  it("własna sesja używa czasu z planu i nie pyta o niego ponownie", () => {
    const own = session("training");
    const result = normalizePostSessionAnswers({
      session: own,
      effort: "light",
      durationMin: 999,
      activityType: "running_endurance",
    });

    expect(result.details).toEqual({ durationMin: 60, activityType: null });
    expect(result.rpe).toBe(4);
  });
});
