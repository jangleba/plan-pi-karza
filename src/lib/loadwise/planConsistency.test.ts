import { describe, expect, it } from "vitest";
import type { Profile, Readiness, SessionDay } from "./types";
import {
  applyCheckInToPlanDay,
  resolveAdjustedDay,
  nextMatchDate,
} from "./dailyCheckin";

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
  matchDate: "2026-08-09",
} as unknown as Profile;

function baseSession(overrides: Partial<SessionDay> = {}): SessionDay {
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
      main: [{ name: "Sprint 30 m", prescription: "6 × 30 m" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: {
      ...baseSecond(),
    },
    ...overrides,
  } as SessionDay;
}

function baseSecond(): SessionDay {
  return {
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
    sections: {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
  } as SessionDay;
}

function clubSession(): SessionDay {
  return baseSession({
    dayType: "club",
    title: "Trening klubowy",
    sessionType: "Trening klubowy",
    intensity: "umiarkowana",
  });
}

function readiness(overrides: Partial<Readiness> = {}): Readiness {
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

describe("spójność Start / Plan / szczegóły", () => {
  it("dzień klubowy przy gotowości 2/10 pozostaje treningiem klubowym", () => {
    const r = readiness({ overall: 2 });
    const res = applyCheckInToPlanDay([clubSession()], r.date, r, PROFILE);
    const day = res.plan[0];
    expect(day.dayType).toBe("club");
    expect(day.title).toBe("Trening klubowy");
    expect(day.title).not.toMatch(/Regeneracja/i);
    expect(day.loadLabelOverride).toBe("Ogranicz");
    expect(day.externalCommitment).toBe(true);
    expect(day.safetyNote).toMatch(/ogranicz obciążenie|trenerowi/i);
    expect(day.secondSession).toBeNull();
  });

  it("aktywny ból na dniu klubowym zaleca przerwanie i konsultację", () => {
    const r = readiness({ overall: 2, jointPain: 7 });
    const res = applyCheckInToPlanDay([clubSession()], r.date, r, PROFILE);
    const day = res.plan[0];
    expect(day.dayType).toBe("club");
    expect(day.safetyNote).toMatch(/przerwij trening/i);
    expect(day.safetyNote).toMatch(/lekarz|fizjoterapeut/i);
    expect(day.secondSession).toBeNull();
  });

  it("własna sesja przy gotowości 1–3 zamienia się na regenerację", () => {
    const r = readiness({ overall: 2 });
    const res = applyCheckInToPlanDay([baseSession()], r.date, r, PROFILE);
    const day = res.plan[0];
    expect(day.title).toMatch(/Regeneracja/i);
    expect(day.intensity).toBe("niska");
    expect(day.sessionType).toBe("Regeneracja");
    expect(day.secondSession).toBeNull();
  });

  it("Start, Plan i szczegóły widzą ten sam obiekt sesji", () => {
    const r = readiness({ overall: 2 });
    const res = applyCheckInToPlanDay([clubSession()], r.date, r, PROFILE);
    const stored = res.plan[0];
    const start = resolveAdjustedDay(stored, r, PROFILE);
    const plan = resolveAdjustedDay(stored, r, PROFILE);
    const details = resolveAdjustedDay(stored, r, PROFILE);
    expect(start).toBe(stored);
    expect(JSON.stringify(plan)).toBe(JSON.stringify(details));
    expect(plan.title).toBe(stored.title);
    expect(plan.loadLabelOverride).toBe(stored.loadLabelOverride);
  });

  it("ponowne załadowanie danych nie nakłada adaptacji dwa razy", () => {
    const r = readiness({ overall: 2 });
    const first = applyCheckInToPlanDay([clubSession()], r.date, r, PROFILE);
    const second = applyCheckInToPlanDay(first.plan, r.date, r, PROFILE);
    expect(second.changed).toBe(false);
    expect(second.plan[0].durationMin).toBe(first.plan[0].durationMin);
    expect(resolveAdjustedDay(second.plan[0], r, PROFILE)).toBe(second.plan[0]);
  });

  it("karta meczu pokazuje najbliższy przyszły mecz z planu", () => {
    const plan: SessionDay[] = [
      baseSession({ date: "2026-08-09", dayType: "match", title: "Mecz" }),
      baseSession({ date: "2026-08-23", dayType: "match", title: "Mecz" }),
      baseSession({ date: "2026-08-30", dayType: "match", title: "Mecz" }),
    ];
    expect(nextMatchDate(plan, "2026-08-17", "2026-08-09")).toBe("2026-08-23");
  });

  it("brak przyszłego meczu w planie i przeszła data profilu daje brak meczu", () => {
    expect(nextMatchDate([], "2026-08-17", "2026-08-09")).toBeNull();
  });
});
