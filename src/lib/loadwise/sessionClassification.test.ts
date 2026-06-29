import { describe, it, expect } from "vitest";
import type { SessionDay, DayType, Intensity } from "./types";
import {
  normalizeSessionCategory,
  isEnduranceSession,
  isSpeedSession,
  isMainGymSession,
  isStrengthSession,
  isClubSession,
  isMatchSession,
} from "./sessionClassification";

function makeSession(overrides: Partial<SessionDay>): SessionDay {
  const base: SessionDay = {
    date: "2026-06-29",
    dayName: "Poniedziałek",
    dayType: (overrides.dayType ?? "training") as DayType,
    title: "",
    goalLabel: "",
    intensity: (overrides.intensity ?? "umiarkowana") as Intensity,
    durationMin: 45,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "",
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
  };
  return normalizeSessionCategory({ ...base, ...overrides });
}

describe("normalizeSessionCategory", () => {
  it("trening klubowy nie liczy się jako endurance", () => {
    const s = makeSession({
      dayType: "club",
      title: "Trening klubowy",
      sessionType: "Klub",
    });
    expect(s.classification?.category).toBe("club");
    expect(isClubSession(s)).toBe(true);
    expect(isEnduranceSession(s)).toBe(false);
    expect(s.classification?.countsAsEndurance).toBe(false);
  });

  it("trening klubowy nie liczy się jako speed", () => {
    const s = makeSession({
      dayType: "club",
      title: "Team training",
      sessionType: "Klub",
    });
    expect(isSpeedSession(s)).toBe(false);
    expect(s.classification?.countsAsSpeed).toBe(false);
  });

  it("klubowy speed-focused liczy się jako speed", () => {
    const s = makeSession({
      dayType: "club",
      title: "Trening klubowy — sprint exposure / max velocity",
      sessionType: "Klub szybkościowy",
    });
    expect(isSpeedSession(s)).toBe(true);
    expect(s.classification?.subcategory).toBe("club_speed_focus");
  });

  it("prehab nie liczy się jako pełna siłownia", () => {
    const s = makeSession({
      title: "Prehab / mobilność",
      sessionType: "Prehab / mobilność (lekka)",
      intensity: "niska",
    });
    expect(s.classification?.category).toBe("recovery_prehab");
    expect(isMainGymSession(s)).toBe(false);
    expect(isStrengthSession(s)).toBe(false);
  });

  it("siłownia dolna/górna liczy się jako gym_strength", () => {
    const lower = makeSession({
      title: "Siła dolna — przysiad + moc",
      sessionType: "Siła / moc",
    });
    const upper = makeSession({
      title: "Siła górna — wyciskanie i wiosłowanie",
      sessionType: "Siła górna",
    });
    expect(lower.classification?.category).toBe("gym_strength");
    expect(isMainGymSession(lower)).toBe(true);
    expect(upper.classification?.category).toBe("gym_strength");
    expect(isMainGymSession(upper)).toBe(true);
  });

  it("easy run, bike, tempo aerobic i intervals liczą się jako endurance_conditioning", () => {
    const easy = makeSession({ title: "Easy run", sessionType: "Wytrzymałość" });
    const bike = makeSession({ title: "Bike conditioning", sessionType: "Rower" });
    const tempo = makeSession({ title: "Tempo aerobic", sessionType: "Tempo" });
    const intervals = makeSession({
      title: "Extensive intervals",
      sessionType: "Interwały tlenowe",
    });
    for (const s of [easy, bike, tempo, intervals]) {
      expect(s.classification?.category).toBe("endurance_conditioning");
      expect(isEnduranceSession(s)).toBe(true);
    }
  });

  it("acceleration, max velocity, COD i flying sprints liczą się jako speed_sprint", () => {
    const acc = makeSession({ title: "Acceleration / pierwszy krok", sessionType: "Szybkość" });
    const mv = makeSession({ title: "Max velocity", sessionType: "Szybkość" });
    const cod = makeSession({ title: "Change of direction / COD", sessionType: "Zwinność" });
    const flying = makeSession({ title: "Flying sprints", sessionType: "Szybkość" });
    for (const s of [acc, mv, cod, flying]) {
      expect(s.classification?.category).toBe("speed_sprint");
      expect(isSpeedSession(s)).toBe(true);
    }
    expect(acc.classification?.isAcceleration).toBe(true);
    expect(mv.classification?.isMaxVelocity).toBe(true);
    expect(cod.classification?.isChangeOfDirection).toBe(true);
  });

  it("mecz liczy się jako match, ale nie jako gym/endurance/speed", () => {
    const s = makeSession({ dayType: "match", title: "Mecz", sessionType: "Mecz" });
    expect(isMatchSession(s)).toBe(true);
    expect(isMainGymSession(s)).toBe(false);
    expect(isStrengthSession(s)).toBe(false);
    expect(isEnduranceSession(s)).toBe(false);
    expect(isSpeedSession(s)).toBe(false);
  });
});
