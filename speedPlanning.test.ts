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

  it("MD-1 jest wykluczone jako hard speed date", () => {
    const w = week();
    [0, 1, 2, 3, 4].forEach((i) => w[i].sessions.push(s("club")));
    w[5].toMatch = 1;
    w[6].toMatch = 0;
    w[6].sessions.push(s("match"));
    const res = findBestDayForSpeedSession(w, {}, { maxSessionsPerDay: 1 }, "szybkość", adult);
    expect(res.dayIndex).toBe(null);
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
    // reszta dni zablokowana (ciężkie nogi / mecz), by dzień siłowni był jedyny
    [0, 1, 3, 4, 5].forEach((i) =>
      w[i].sessions.push(s("gym_strength", { isHeavyLegs: true, loadLevel: "high" })),
    );
    w[6].toMatch = 0;
    w[6].sessions.push(s("match"));
    const req = reqFor(0, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(0, 1), { maxSessionsPerDay: 2 }, req, adult);
    expect(firstReal(w[2])!.category).toBe("speed_sprint");
  });

  it("szybkość w dzień klubowy jest pierwsza", () => {
    const w = week([2]);
    // reszta dni zablokowana (ciężkie nogi / mecz), by dzień klubowy był jedyny
    [0, 1, 3, 4, 5].forEach((i) =>
      w[i].sessions.push(s("gym_strength", { isHeavyLegs: true, loadLevel: "high" })),
    );
    w[6].toMatch = 0;
    w[6].sessions.push(s("match"));
    const req = reqFor(1, "szybkość", adult);
    addMissingSpeedSessions(
      w,
      wctx(1, 1),
      { maxSessionsPerDay: 2, clubTrainingDays: [3] },
      req,
      adult,
    );
    expect(firstReal(w[2])!.category).toBe("speed_sprint");
  });

  it("szybkość w dzień wydolności jest pierwsza", () => {
    const w = week();
    w[3].sessions.push(s("endurance_conditioning", { loadLevel: "low" }));
    [0, 1, 2, 4, 5].forEach((i) =>
      w[i].sessions.push(s("gym_strength", { isHeavyLegs: true, loadLevel: "high" })),
    );
    w[6].toMatch = 0;
    w[6].sessions.push(s("match"));
    const req = reqFor(0, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(0, 1), { maxSessionsPerDay: 2 }, req, adult);
    expect(firstReal(w[3])!.category).toBe("speed_sprint");
  });

  it("nie tworzy szybkości dzień przed meczem", () => {
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
    expect(w[5].sessions.some((x) => x.category === "speed_sprint")).toBe(false);
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

// ---------------------------------------------------------------------------
// Regresja: nigdy dwie jednostki speed_sprint jednego dnia + speed po ciężkich nogach
// ---------------------------------------------------------------------------

import {
  validateNoDuplicateSpeedSameDay,
  repairDuplicateSpeedSameDay,
  findAlternativeDayForSpeed,
} from "./speedPlanning";
import {
  canAddSessionToDay,
  hasSpeedSession,
  countSpeedSessionsForDay,
  wouldCreateDuplicateSpeedDay,
} from "./dailyScheduling";

const twoADay = { maxSessionsPerDay: 2 };

function reqs(ctx: WeekRequirementContext, goal: string | null) {
  return calculateWeeklyMinimumRequirements(
    ctx,
    { hasGym: true, clubTrainingDays: [], matchDate: null },
    goal,
    { developmentStage: "adult", gymExperienceLevel: "intermediate" },
  );
}

describe("Twarda zasada: nigdy dwie szybkości jednego dnia", () => {
  it("1. Dzień nie może mieć dwóch speed_sprint (walidator wykrywa)", () => {
    const wk = week();
    wk[1].sessions.push(s("speed_sprint", { loadLevel: "high" }));
    wk[1].sessions.push(s("speed_sprint", { loadLevel: "low" }));
    const report = validateNoDuplicateSpeedSameDay(wk);
    expect(report.ok).toBe(false);
    expect(report.offendingDayIndices).toContain(1);
  });

  it("4. canAddSessionToDay zwraca false przy dodawaniu drugiej szybkości", () => {
    const d = day({ dayOfWeek: 3 });
    d.sessions.push(s("speed_sprint", { loadLevel: "high" }));
    const res = canAddSessionToDay(d, s("speed_sprint", { loadLevel: "low" }), twoADay);
    expect(res.allowed).toBe(false);
    expect(hasSpeedSession(d)).toBe(true);
    expect(wouldCreateDuplicateSpeedDay(d, s("speed_sprint"))).toBe(true);
  });

  it("5. repairDuplicateSpeedSameDay naprawia dzień z dwoma speed (przenosi)", () => {
    const wk = week();
    wk[1].sessions.push(s("speed_sprint", { loadLevel: "high", title: "A" }));
    wk[1].sessions.push(s("speed_sprint", { loadLevel: "high", title: "B" }));
    const res = repairDuplicateSpeedSameDay(wk, { userSettings: twoADay });
    expect(countSpeedSessionsForDay(wk[1])).toBe(1);
    expect(validateNoDuplicateSpeedSameDay(wk).ok).toBe(true);
    expect(res.moved + res.removed).toBe(1);
  });

  it("9. Walidator uruchomiony dwa razy nie tworzy duplikatów", () => {
    const wk = week();
    wk[1].sessions.push(s("speed_sprint", { loadLevel: "high" }));
    wk[1].sessions.push(s("speed_sprint", { loadLevel: "high" }));
    repairDuplicateSpeedSameDay(wk, { userSettings: twoADay });
    repairDuplicateSpeedSameDay(wk, { userSettings: twoADay });
    expect(validateNoDuplicateSpeedSameDay(wk).ok).toBe(true);
    const total = wk.reduce((n, d) => n + countSpeedSessionsForDay(d), 0);
    expect(total).toBe(2);
  });

  it("2+3. Cel szybkość/przyspieszenie: 2 speed w tygodniu nie lądują tego samego dnia", () => {
    for (const goal of ["szybkość", "przyspieszenie"]) {
      const ctx: WeekRequirementContext = { seasonPhase: null, isFullWeek: true, clubTrainingCount: 0, matchCount: 0 };
      const wk = week();
      const profile: SpeedAthleteProfile = {
        athleteGoal: goal,
        readiness: 8,
        developmentStage: "adult",
        gymExperienceLevel: "intermediate",
      };
      const r = reqs(ctx, goal);
      expect(r.requiredSpeedSessions).toBeGreaterThanOrEqual(2);
      addMissingSpeedSessions(wk, { ...ctx }, twoADay, r, profile);
      expect(validateNoDuplicateSpeedSameDay(wk).ok).toBe(true);
      const speedDays = wk.filter((d) => countSpeedSessionsForDay(d) > 0).length;
      expect(speedDays).toBe(countSpeedSessions(wk));
    }
  });

  it("6. Wymagane 2 speed → są na różnych dniach", () => {
    const ctx: WeekRequirementContext = { seasonPhase: null, isFullWeek: true, clubTrainingCount: 0, matchCount: 0 };
    const wk = week();
    const profile: SpeedAthleteProfile = {
      athleteGoal: "szybkość",
      readiness: 8,
      developmentStage: "adult",
      gymExperienceLevel: "intermediate",
    };
    const r = reqs(ctx, "szybkość");
    addMissingSpeedSessions(wk, { ...ctx }, twoADay, r, profile);
    expect(countSpeedSessions(wk)).toBe(2);
    const days = wk.map((d, i) => (countSpeedSessionsForDay(d) > 0 ? i : -1)).filter((i) => i >= 0);
    expect(new Set(days).size).toBe(2);
  });
});

describe("Speed po ciężkich nogach: dozwolone, downgrade tylko przy ryzyku", () => {
  it("7. Pełna szybkość MOŻE być dzień po heavy lower gdy readiness i load OK", () => {
    const wk = week();
    wk[1].sessions.push(s("gym_strength", { isHeavyLegs: true, loadLevel: "high" }));
    const profile: SpeedAthleteProfile = {
      athleteGoal: "szybkość",
      readiness: 8,
      developmentStage: "adult",
      gymExperienceLevel: "intermediate",
    };
    const placements = getSafeSpeedPlacements(wk, { seasonPhase: null }, twoADay, "szybkość", profile);
    const dayAfter = placements.find((p) => p.dayIndex === 2);
    expect(dayAfter).toBeDefined();
    expect(dayAfter!.forcedDowngrade).toBe(false);
  });

  it("8. Speed po heavy lower zostaje downgraded przy niskim readiness", () => {
    const wk = week();
    wk[1].sessions.push(s("gym_strength", { isHeavyLegs: true, loadLevel: "high" }));
    const profile: SpeedAthleteProfile = {
      athleteGoal: "szybkość",
      readiness: 4,
      developmentStage: "adult",
      gymExperienceLevel: "intermediate",
    };
    const placements = getSafeSpeedPlacements(wk, { seasonPhase: null }, twoADay, "szybkość", profile);
    const dayAfter = placements.find((p) => p.dayIndex === 2);
    expect(dayAfter).toBeDefined();
    expect(dayAfter!.forcedDowngrade).toBe(true);
  });

  it("findAlternativeDayForSpeed nigdy nie wskazuje dnia ze szybkością ani źródła", () => {
    const wk = week();
    wk[1].sessions.push(s("speed_sprint", { loadLevel: "high" }));
    const alt = findAlternativeDayForSpeed(wk, s("speed_sprint"), {
      userSettings: twoADay,
      excludeDayIndex: 1,
    });
    expect(alt.dayIndex).not.toBe(1);
    if (alt.dayIndex !== null) expect(hasSpeedSession(wk[alt.dayIndex])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TWARDA ZASADA: nigdy speed_sprint dzień po dniu (min. 1 dzień przerwy)
// ---------------------------------------------------------------------------

import {
  getSpeedDays,
  areSpeedDaysTooClose,
  validateMinimumGapBetweenSpeedSessions,
  validateNoBackToBackSpeedDays,
  repairBackToBackSpeedSessions,
  findAlternativeDayForSpeedWithGap,
} from "./speedPlanning";

describe("Min. 1 dzień przerwy między speed_sprint", () => {
  it("1. Plan nie może mieć dwóch speed_sprint jednego dnia (walidator duplikatów)", () => {
    const w = week();
    w[1].sessions.push(s("speed_sprint"));
    w[1].sessions.push(s("speed_sprint"));
    expect(validateNoDuplicateSpeedSameDay(w).ok).toBe(false);
  });

  it("2. Wykrywa speed_sprint dzień po dniu", () => {
    const w = week();
    w[0].sessions.push(s("speed_sprint"));
    w[1].sessions.push(s("speed_sprint"));
    const rep = validateNoBackToBackSpeedDays(w);
    expect(rep.ok).toBe(false);
    expect(rep.tooClosePairs).toContainEqual([0, 1]);
  });

  it("areSpeedDaysTooClose: sąsiednie true, z przerwą false", () => {
    expect(areSpeedDaysTooClose(0, 1)).toBe(true);
    expect(areSpeedDaysTooClose(0, 2)).toBe(false);
    expect(getSpeedDays(week())).toEqual([]);
  });

  it("3. Cel szybkość → 2 speed rozdzielone min. 1 dniem", () => {
    const w = week();
    const req = reqFor(0, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(0), { maxSessionsPerDay: 2 }, req, adult);
    expect(countSpeedSessions(w)).toBe(2);
    expect(validateNoBackToBackSpeedDays(w).ok).toBe(true);
  });

  it("4. Cel przyspieszenie → 2 speed, nie dzień po dniu", () => {
    const w = week();
    const req = reqFor(0, "przyspieszenie", adult);
    addMissingSpeedSessions(w, wctx(0), { maxSessionsPerDay: 2 }, req, adult);
    expect(countSpeedSessions(w)).toBe(2);
    expect(validateNoBackToBackSpeedDays(w).ok).toBe(true);
  });

  it("5. Speed w poniedziałek → drugi speed najwcześniej w środę", () => {
    const w = week();
    w[0].sessions.push(s("speed_sprint")); // poniedziałek
    const req = reqFor(0, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(0), { maxSessionsPerDay: 2 }, req, adult);
    const days = getSpeedDays(w);
    expect(days[0]).toBe(0);
    expect(days[1]).toBeGreaterThanOrEqual(2);
  });

  it("6. Generator nie kładzie speed we wtorek po poniedziałkowym speed", () => {
    const w = week();
    w[0].sessions.push(s("speed_sprint"));
    const places = getSafeSpeedPlacements(w, {}, { maxSessionsPerDay: 2 }, "szybkość", adult);
    expect(places.map((p) => p.dayIndex)).not.toContain(1);
  });

  it("repairBackToBackSpeedSessions rozdziela speed dzień po dniu", () => {
    const w = week();
    w[0].sessions.push(s("speed_sprint", { title: "A" }));
    w[1].sessions.push(s("speed_sprint", { title: "B" }));
    repairBackToBackSpeedSessions(w, { userSettings: { maxSessionsPerDay: 2 } });
    expect(validateNoBackToBackSpeedDays(w).ok).toBe(true);
  });

  it("7. Dzień między speed może zawierać klubowy", () => {
    const w = week([1]); // klubowy we wtorek
    w[0].sessions.push(s("speed_sprint"));
    const req = reqFor(1, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(1), { maxSessionsPerDay: 2, clubTrainingDays: [2] }, req, adult);
    expect(validateNoBackToBackSpeedDays(w).ok).toBe(true);
    expect(w[1].sessions.some((x) => x.category === "club")).toBe(true);
  });

  it("8. Dzień między speed może zawierać siłownię + klubowy", () => {
    const w = week([1]);
    w[1].sessions.push(s("gym_strength", { loadLevel: "moderate" }));
    w[0].sessions.push(s("speed_sprint"));
    const req = reqFor(1, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(1), { maxSessionsPerDay: 2, clubTrainingDays: [2] }, req, adult);
    expect(validateNoBackToBackSpeedDays(w).ok).toBe(true);
  });

  it("9. Dzień między speed może zawierać siłownię + endurance", () => {
    const w = week();
    w[1].sessions.push(s("gym_strength", { loadLevel: "moderate" }));
    w[1].sessions.push(s("endurance_conditioning", { loadLevel: "low" }));
    w[0].sessions.push(s("speed_sprint"));
    const req = reqFor(0, "szybkość", adult);
    addMissingSpeedSessions(w, wctx(0), { maxSessionsPerDay: 2 }, req, adult);
    expect(validateNoBackToBackSpeedDays(w).ok).toBe(true);
  });

  it("12. Walidator/naprawa dwa razy nie tworzy duplikatów", () => {
    const w = week();
    w[0].sessions.push(s("speed_sprint"));
    w[1].sessions.push(s("speed_sprint"));
    repairBackToBackSpeedSessions(w, { userSettings: { maxSessionsPerDay: 2 } });
    repairBackToBackSpeedSessions(w, { userSettings: { maxSessionsPerDay: 2 } });
    expect(validateNoBackToBackSpeedDays(w).ok).toBe(true);
    expect(validateNoDuplicateSpeedSameDay(w).ok).toBe(true);
  });

  it("findAlternativeDayForSpeedWithGap nie wskazuje dnia sąsiadującego ze speed", () => {
    const w = week();
    w[2].sessions.push(s("speed_sprint"));
    const alt = findAlternativeDayForSpeedWithGap(w, s("speed_sprint"), {
      userSettings: { maxSessionsPerDay: 2 },
    });
    if (alt.dayIndex !== null) {
      expect([1, 2, 3]).not.toContain(alt.dayIndex);
    }
  });
});
