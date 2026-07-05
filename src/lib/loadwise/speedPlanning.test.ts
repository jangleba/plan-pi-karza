import { describe, it, expect } from "vitest";
import type { SchedDay, SchedSession } from "./dailyScheduling";
import {
  calculateWeeklyMinimumRequirements,
  type WeekRequirementContext,
} from "./weeklyRequirements";
import {
  countSpeedSessions,
  hasEnoughSpeedSessions,
  getRequiredSpeedSessions,
  findBestDayForSpeedSession,
  getSafeSpeedPlacements,
  createSpeedSessionVariant,
  createAccelerationDecelerationSession,
  createMaxVelocityCODSession,
  createYouthSpeedTechniqueSession,
  addMissingSpeedSessions,
  validateWeeklySpeedMinimum,
  classifySpeedFocus,
  validateSpeedSessionForAthleteProfile,
  type SpeedAthleteProfile,
} from "./speedPlanning";

// ---------------------------------------------------------------------------
// Helpery
// ---------------------------------------------------------------------------

function s(cat: SchedSession["category"], over: Partial<SchedSession> = {}): SchedSession {
  return { category: cat, ...over };
}
function day(over: Partial<SchedDay> = {}): SchedDay {
  return { sessions: [], ...over };
}
function week(clubDays: number[] = [], opts: { matchDay?: number } = {}): SchedDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = day({ dayOfWeek: i + 1 });
    if (clubDays.includes(i)) d.sessions.push(s("club", { rpe: 6 }));
    if (opts.matchDay === i) {
      d.sessions.push(s("match"));
      d.toMatch = 0;
    }
    return d;
  });
}

const adult: SpeedAthleteProfile = {
  developmentStage: "adult",
  gymExperienceLevel: "advanced",
  preferredTrainingStyle: "performance",
  readiness: 8,
};
const youth: SpeedAthleteProfile = {
  developmentStage: "early_youth",
  gymExperienceLevel: "beginner",
  preferredTrainingStyle: "foundation",
  readiness: 8,
};

function reqFor(clubTrainingCount: number, goal: string | undefined, athlete: SpeedAthleteProfile) {
  const ctx: WeekRequirementContext = { seasonPhase: "inseason", clubTrainingCount, matchCount: 0 };
  return calculateWeeklyMinimumRequirements(ctx, { clubTrainingDays: [] }, goal, athlete);
}
const wctx = (clubTrainingCount: number, matchCount = 0): WeekRequirementContext => ({
  seasonPhase: "inseason",
  clubTrainingCount,
  matchCount,
});

const firstReal = (d: SchedDay) =>
  (d.sessions ?? []).find((x) => x.category !== "rest" && x.category !== "mobility");

// ---------------------------------------------------------------------------
// Wymagania
// ---------------------------------------------------------------------------

describe("wymagana liczba szybkości", () => {
  const c = (n: number): WeekRequirementContext => ({ seasonPhase: "inseason", clubTrainingCount: n, matchCount: 0 });

  it("zwykły tydzień → minimum 1 speed", () => {
    expect(getRequiredSpeedSessions(c(3), null, "general", adult)).toBe(1);
  });
  it("cel szybkość → minimum 2 speed", () => {
    expect(getRequiredSpeedSessions(c(3), null, "szybkość", adult)).toBe(2);
  });
  it("cel przyspieszenie → minimum 2 speed", () => {
    expect(getRequiredSpeedSessions(c(3), null, "przyspieszenie", adult)).toBe(2);
  });
  it("cel change of direction → minimum 2 speed", () => {
    expect(getRequiredSpeedSessions(c(3), null, "change of direction", adult)).toBe(2);
  });
});

describe("countSpeedSessions / hasEnough", () => {
  it("klubowy bez tagu speed nie liczy się jako speed", () => {
    expect(countSpeedSessions(week([1, 3]))).toBe(0);
  });
  it("hasEnoughSpeedSessions porównuje z wymogiem", () => {
    const w = week();
    w[0].sessions.push(s("speed_sprint"));
    expect(hasEnoughSpeedSessions(w, { requiredSpeedSessions: 1 })).toBe(true);
    expect(hasEnoughSpeedSessions(w, { requiredSpeedSessions: 2 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifySpeedFocus
// ---------------------------------------------------------------------------

describe("classifySpeedFocus", () => {
  it("accel/decel i max velocity/COD rozpoznane", () => {
    expect(classifySpeedFocus(createAccelerationDecelerationSession({}, adult))).toBe(
      "acceleration_deceleration",
    );
    expect(classifySpeedFocus(createMaxVelocityCODSession({}, adult))).toBe("max_velocity_cod");
    expect(classifySpeedFocus(createYouthSpeedTechniqueSession({}, youth))).toBe("technical");
  });
});

// ---------------------------------------------------------------------------
// Warianty
// ---------------------------------------------------------------------------

describe("createSpeedSessionVariant", () => {
  it("slot 1 to accel/decel, slot 2 to max velocity/COD", () => {
    expect(createSpeedSessionVariant({ speedSlot: 1 }, adult).subcategory).toBe(
      "acceleration_deceleration",
    );
    expect(createSpeedSessionVariant({ speedSlot: 2 }, adult).subcategory).toBe("max_velocity_cod");
  });

  it("niski readiness → microdose, nie znika", () => {
    const g = createSpeedSessionVariant({ readiness: 3, speedSlot: 2 }, adult);
    expect(g.subcategory).toBe("speed_microdose");
    expect(g.category).toBe("speed_sprint");
  });

  it("MD-1 nie tworzy pełnej max velocity (primer)", () => {
    const g = createSpeedSessionVariant({ speedSlot: 2, toMatch: 1 }, adult);
    expect(g.subcategory).toBe("speed_primer");
    expect(g.tags).not.toContain("max_velocity");
  });

  it("14yo cel szybkość → youth-safe technique, nie max velocity", () => {
    const g = createSpeedSessionVariant({ speedSlot: 2, goal: "szybkość" }, youth);
    expect(g.subcategory).toBe("technical_speed");
    expect(g.tags).not.toContain("max_velocity");
    expect(g.loadLevel).toBe("low");
  });

  it("ból kolana → brak agresywnego COD (max velocity prostoliniowa)", () => {
    const injured: SpeedAthleteProfile = { ...adult, currentPain: ["knee"] };
    const g = createMaxVelocityCODSession({ speedSlot: 2 }, injured);
    expect(g.subcategory).toBe("max_velocity");
    expect(g.subcategory).not.toBe("max_velocity_cod");
  });

  it("historia dwugłowego → ostrożna progresja max velocity", () => {
    const hist: SpeedAthleteProfile = { ...adult, injuryHistory: ["hamstring"] };
    const g = createMaxVelocityCODSession({ speedSlot: 2 }, hist);
    expect(g.subcategory).toBe("max_velocity");
    expect(g.loadLevel).toBe("moderate");
    expect(g.sourceRule).toContain("hamstring");
  });
});

// ---------------------------------------------------------------------------
// validateSpeedSessionForAthleteProfile
// ---------------------------------------------------------------------------

describe("validateSpeedSessionForAthleteProfile", () => {
  it("youth + max velocity = niedozwolone", () => {
    const g = createMaxVelocityCODSession({ speedSlot: 2 }, adult);
    const rep = validateSpeedSessionForAthleteProfile(g, youth);
    expect(rep.ok).toBe(false);
    expect(rep.issues.some((i) => i.code === "youth_max_velocity")).toBe(true);
  });
  it("ból kolana + COD = niedozwolone", () => {
    const g = createMaxVelocityCODSession({ speedSlot: 2 }, adult);
    const injured: SpeedAthleteProfile = { ...adult, currentPain: ["knee"] };
    const rep = validateSpeedSessionForAthleteProfile(g, injured);
    expect(rep.issues.some((i) => i.code === "cod_with_knee_pain")).toBe(true);
  });
  it("MD-1 + pełna max velocity = niedozwolone", () => {
    const g = createMaxVelocityCODSession({ speedSlot: 2 }, adult);
    const rep = validateSpeedSessionForAthleteProfile(g, adult, { toMatch: 1 });
    expect(rep.issues.some((i) => i.code === "max_velocity_md1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scoring / dobór dnia
// ---------------------------------------------------------------------------

describe("getSafeSpeedPlacements / findBestDay", () => {
  it("nie proponuje dnia meczowego", () => {
    const w = week([], { matchDay: 6 });
    const places = getSafeSpeedPlacements(w, {}, { maxSessionsPerDay: 1 }, "szybkość", adult);
    expect(places.map((p) => p.dayIndex)).not.toContain(6);
  });

  it("nie proponuje dnia z ciężką siłą nóg ani ciężkim conditioningiem", () => {
    const w = week();
    w[0].sessions.push(s("gym_strength", { isHeavyLegs: true, loadLevel: "high" }));
    w[1].sessions.push(s("endurance_conditioning", { loadLevel: "high" }));
    const places = getSafeSpeedPlacements(w, {}, { maxSessionsPerDay: 2 }, "szybkość", adult);
    const idx = places.map((p) => p.dayIndex);
    expect(idx).not.toContain(0);
    expect(idx).not.toContain(1);
  });

  it("MD-1 oznaczone jako forcedPrimer", () => {
    const w = week();
    [0, 1, 2, 3, 4].forEach((i) => w[i].sessions.push(s("club")));
    w[5].toMatch = 1;
    w[6].toMatch = 0;
    w[6].sessions.push(s("match"));
    const res = findBestDayForSpeedSession(w, {}, { maxSessionsPerDay: 1 }, "szybkość", adult);
    expect(res.dayIndex).toBe(5);
    expect(res.forcedPrimer).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addMissingSpeedSessions — łączenie i kolejność
// ---------------------------------------------------------------------------

describe("addMissingSpeedSessions", () => {
  it("zwykły tydzień → minimum 1 speed", () => {
    const w = week([1, 3]);
    const req = reqFor(2, "general", adult);
    const res = addMissingSpeedSessions(
      w,
      wctx(2),
      { maxSessionsPerDay: 2, clubTrainingDays: [2, 4] },
      req,
      adult,
    );
    expect(res.count).toBe(1);
  });

  it("cel przyspieszenie → 2 speed: accel/decel + max velocity/COD", () => {
    const w = week([1, 3]);
    const req = reqFor(2, "przyspieszenie", adult);
    const res = addMissingSpeedSessions(
      w,
      wctx(2),
      { maxSessionsPerDay: 2, clubTrainingDays: [2, 4] },
      req,
      adult,
    );
    expect(res.requiredSpeedSessions).toBe(2);
    expect(res.count).toBe(2);
    const focuses: string[] = [];
    for (const d of w)
      for (const x of d.sessions) if (x.category === "speed_sprint") focuses.push(classifySpeedFocus(x));
    expect(focuses).toContain("acceleration_deceleration");
    expect(focuses).toContain("max_velocity_cod");
  });

  it("szybkość w dzień siłowni jest pierwsza", () => {
    const w = week();
    w[2].sessions.push(s("gym_strength", { loadLevel: "moderate" }));
    const req = reqFor(0, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(0), { maxSessionsPerDay: 2 }, req, adult);
    const gymDay = w.find((d) => d.sessions.some((x) => x.category === "gym_strength"))!;
    expect(firstReal(gymDay)!.category).toBe("speed_sprint");
  });

  it("szybkość w dzień klubowy jest pierwsza", () => {
    const w = week([2]);
    // wymuś umieszczenie na dniu klubowym: pozostałe dni zajęte meczem/klubem
    [0, 1, 3, 4, 5].forEach((i) => w[i].sessions.push(s("club")));
    w[6].toMatch = 0;
    w[6].sessions.push(s("match"));
    const req = reqFor(6, "szybkość", adult);
    addMissingSpeedSessions(
      w,
      wctx(6, 1),
      { maxSessionsPerDay: 2, clubTrainingDays: [1, 2, 3, 4, 5, 6] },
      req,
      adult,
    );
    const clubDay = w[2];
    expect(firstReal(clubDay)!.category).toBe("speed_sprint");
  });

  it("szybkość w dzień wydolności jest pierwsza", () => {
    const w = week();
    w[3].sessions.push(s("endurance_conditioning", { loadLevel: "low" }));
    const req = reqFor(0, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(0), { maxSessionsPerDay: 2 }, req, adult);
    const endDay = w.find((d) => d.sessions.some((x) => x.category === "endurance_conditioning"))!;
    expect(firstReal(endDay)!.category).toBe("speed_sprint");
  });

  it("nie tworzy pełnej max velocity dzień przed meczem", () => {
    const w = week([0, 1, 2, 3, 4], { matchDay: 6 });
    w[5].toMatch = 1;
    const req = reqFor(4, "szybkość", adult);
    addMissingSpeedSessions(
      w,
      wctx(4, 1),
      { maxSessionsPerDay: 1, clubTrainingDays: [1, 2, 3, 4, 5] },
      req,
      adult,
    );
    const md1Speed = w[5].sessions.find((x) => x.category === "speed_sprint");
    if (md1Speed) expect(md1Speed.isMaxVelocity).not.toBe(true);
  });

  it("przy niskim readiness szybkość zmienia się na microdose, nie znika", () => {
    const tired: SpeedAthleteProfile = { ...adult, readiness: 3 };
    const w = week();
    const req = reqFor(0, "szybkość", tired);
    const res = addMissingSpeedSessions(w, wctx(0), { maxSessionsPerDay: 2 }, req, tired);
    expect(res.count).toBeGreaterThanOrEqual(1);
    for (const d of w)
      for (const x of d.sessions)
        if (x.category === "speed_sprint") expect(x.isMaxVelocity).not.toBe(true);
  });

  it("nie tworzy dwóch szybkości jednego dnia", () => {
    const w = week([0, 1, 2, 3, 4]); // tylko dz5, dz6 wolne
    const req = reqFor(4, "szybkość", adult);
    addMissingSpeedSessions(
      w,
      wctx(4),
      { maxSessionsPerDay: 2, clubTrainingDays: [1, 2, 3, 4, 5] },
      req,
      adult,
    );
    for (const d of w) {
      const speeds = d.sessions.filter((x) => x.category === "speed_sprint").length;
      expect(speeds).toBeLessThanOrEqual(1);
    }
  });

  it("nie tworzy 3 sesji dziennie (maxSessionsPerDay = 2)", () => {
    const w = week();
    w[0].sessions.push(s("gym_strength", { loadLevel: "moderate" }));
    w[0].sessions.push(s("endurance_conditioning", { loadLevel: "low" }));
    const req = reqFor(0, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(0), { maxSessionsPerDay: 2 }, req, adult);
    for (const d of w) {
      const real = d.sessions.filter(
        (x) => x.category !== "rest" && x.category !== "mobility",
      ).length;
      expect(real).toBeLessThanOrEqual(2);
    }
  });

  it("14yo cel szybkość → 2 speed, youth-safe technique", () => {
    const w = week([1, 3]);
    const req = reqFor(2, "szybkość", youth);
    const res = addMissingSpeedSessions(
      w,
      wctx(2),
      { maxSessionsPerDay: 2, clubTrainingDays: [2, 4] },
      req,
      youth,
    );
    expect(res.requiredSpeedSessions).toBe(2);
    expect(res.count).toBe(2);
    for (const d of w)
      for (const x of d.sessions)
        if (x.category === "speed_sprint") expect(x.isMaxVelocity).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateWeeklySpeedMinimum
// ---------------------------------------------------------------------------

describe("validateWeeklySpeedMinimum", () => {
  it("wykrywa brak wymaganej liczby speed", () => {
    const w = week();
    const req = reqFor(2, "szybkość", adult); // wymaga 2
    const rep = validateWeeklySpeedMinimum(w, wctx(2), null, req, adult);
    expect(rep.ok).toBe(false);
  });

  it("2 różne charaktery przechodzą, 2 takie same ostrzegają", () => {
    const w = week();
    w[0].sessions.push(s("speed_sprint", { title: "Szybkość: przyspieszenie + hamowanie" }));
    w[2].sessions.push(s("speed_sprint", { title: "Szybkość: prędkość max + zmiana kierunku" }));
    const req = reqFor(3, "szybkość", adult);
    const ok = validateWeeklySpeedMinimum(w, wctx(3), null, req, adult);
    expect(ok.distinctFocusOk).toBe(true);

    const w2 = week();
    w2[0].sessions.push(s("speed_sprint", { title: "Szybkość: przyspieszenie + hamowanie" }));
    w2[2].sessions.push(s("speed_sprint", { title: "Szybkość: przyspieszenie + hamowanie" }));
    const bad = validateWeeklySpeedMinimum(w2, wctx(3), null, req, adult);
    expect(bad.distinctFocusOk).toBe(false);
  });
});
