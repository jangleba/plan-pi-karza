import { describe, expect, it } from "vitest";
import type { Profile, Readiness, SessionDay } from "./types";
import { applyCheckInToPlanDay, nextMatchDate, resolveEffectiveDay } from "./dailyCheckin";

const PROFILE: Profile = {
  id: "p1",
  name: "Player",
  age: 20,
  goal: "speed",
  sessionsPerWeek: 3,
  painInjury: false,
  gender: "male",
  position: "midfielder",
  level: "amateur",
  matchDate: "2026-08-25",
} as unknown as Profile;

function makeSession(): SessionDay {
  return {
    date: "2026-08-17",
    dayName: "Poniedziałek",
    dayType: "training",
    title: "Szybkość",
    goalLabel: "",
    intensity: "wysoka",
    durationMin: 90,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Szybkość / sprint",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: "Rano + Wieczór",
    sections: {
      warmup: [],
      main: [
        { name: "Sprint 30 m", prescription: "6 × 30 m" },
        { name: "Plyometria", prescription: "3 × 6" },
        { name: "Marsz techniczny", prescription: "4 × 20 m" },
      ],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: {
      date: "2026-08-17",
      dayName: "Poniedziałek",
      dayType: "training",
      title: "Prehab",
      goalLabel: "",
      intensity: "niska",
      durationMin: 20,
      reason: "",
      safetyNote: null,
      whyToday: "",
      sessionType: "Prehab",
      goalOfSession: "",
      riskManaged: "",
      avoidToday: "",
      mdLabel: null,
      slotLabel: null,
      sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
      secondSession: null,
    },
  } as SessionDay;
}

function readiness(overrides: Partial<Readiness>): Readiness {
  return {
    date: "2026-08-17",
    sleep: 7,
    energy: 7,
    fatigue: 3,
    soreness: 2,
    jointPain: 2,
    stress: 3,
    motivation: 7,
    overall: 7,
    ...overrides,
  };
}

describe("daily check-in integration", () => {
  it("submit low readiness + pain applies safety adaptation and removes second session", () => {
    const basePlan = [makeSession()];
    const result = applyCheckInToPlanDay(
      basePlan,
      "2026-08-17",
      readiness({ overall: 2, fatigue: 9, jointPain: 7, sleep: 3 }),
      PROFILE,
    );
    expect(result.changed).toBe(true);
    expect(result.adjusted?.secondSession).toBeNull();
    expect(result.adjusted?.safetyNote).toMatch(/ból nasila|fizjoterapeut/i);
  });

  it("immediately updates plan day and persists readiness marker", () => {
    const result = applyCheckInToPlanDay(
      [makeSession()],
      "2026-08-17",
      readiness({ overall: 6, jointPain: 5 }),
      PROFILE,
    );
    expect(result.plan[0].readinessAdjustedDate).toBe("2026-08-17");
    expect(result.plan[0].readinessOriginalSession).not.toBeNull();
  });

  it("removes second session on daily pain even with medium/high readiness", () => {
    const result = applyCheckInToPlanDay(
      [makeSession()],
      "2026-08-17",
      readiness({ overall: 8, jointPain: 5 }),
      PROFILE,
    );
    expect(result.adjusted?.secondSession).toBeNull();
  });

  it("rehydration/reload is idempotent and does not compound reductions", () => {
    const first = applyCheckInToPlanDay(
      [makeSession()],
      "2026-08-17",
      readiness({ overall: 6, jointPain: 5 }),
      PROFILE,
    );
    const second = applyCheckInToPlanDay(
      first.plan,
      "2026-08-17",
      readiness({ overall: 6, jointPain: 5 }),
      PROFILE,
    );
    expect(second.changed).toBe(false);
    expect(second.plan[0].durationMin).toBe(first.plan[0].durationMin);
  });

  it("does not overwrite other persisted plan fields (match date context unchanged)", () => {
    const plan = [makeSession(), { ...makeSession(), date: "2026-08-18" }];
    const result = applyCheckInToPlanDay(
      plan,
      "2026-08-17",
      readiness({ overall: 6, jointPain: 5 }),
      PROFILE,
    );
    expect(result.plan[1].date).toBe("2026-08-18");
    expect(PROFILE.matchDate).toBe("2026-08-25");
  });

  it("returns nearest future match only", () => {
    const nearest = nextMatchDate(
      [
        { ...makeSession(), date: "2026-08-14", dayType: "match" },
        { ...makeSession(), date: "2026-08-19", dayType: "match" },
        { ...makeSession(), date: "2026-08-22", dayType: "match" },
      ],
      "2026-08-17",
      "2026-08-25",
    );
    expect(nearest).toBe("2026-08-19");
  });

  it("uses the same swapped session for every surface", () => {
    const swapped = { ...makeSession(), title: "Ręcznie zamieniona szybkość" };
    const result = resolveEffectiveDay(
      makeSession(),
      readiness({}),
      PROFILE,
      [
        {
          id: "swap-1",
          date: "2026-08-17",
          type: "swap",
          reason: "manual",
          safetyStatus: "swapped_by_user",
          session: swapped,
          originalSession: makeSession(),
          createdAt: "2026-08-17T08:00:00Z",
        },
      ],
    );
    expect(result).toBe(swapped);
  });
});
