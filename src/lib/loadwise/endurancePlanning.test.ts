import { describe, it, expect } from "vitest";
import type { SchedDay, SchedSession } from "./dailyScheduling";
import {
  calculateWeeklyMinimumRequirements,
  type WeekRequirementContext,
} from "./weeklyRequirements";
import {
  countEnduranceSessions,
  hasEnoughEnduranceSessions,
  getRequiredEnduranceSessions,
  findBestDayForEnduranceSession,
  createEnduranceSessionVariant,
  addMissingEnduranceSessions,
  validateWeeklyEnduranceMinimum,
  blockEnduranceOnClubDays,
  getSafeEndurancePlacements,
  validateEnduranceSessionForAthleteProfile,
  type EnduranceAthleteProfile,
} from "./endurancePlanning";

// ---------------------------------------------------------------------------
// Helpery
// ---------------------------------------------------------------------------

function s(cat: SchedSession["category"], over: Partial<SchedSession> = {}): SchedSession {
  return { category: cat, ...over };
}

function day(over: Partial<SchedDay> = {}): SchedDay {
  return { sessions: [], ...over };
}

/** Buduje pusty tydzień 7-dniowy z opcjonalnymi dniami klubowymi (indeksy). */
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

const adult: EnduranceAthleteProfile = {
  developmentStage: "adult",
  gymExperienceLevel: "advanced",
  preferredTrainingStyle: "performance",
  readiness: 8,
};

const youth: EnduranceAthleteProfile = {
  developmentStage: "early_youth",
  gymExperienceLevel: "beginner",
  preferredTrainingStyle: "foundation",
  readiness: 8,
};

function reqFor(
  clubTrainingCount: number,
  goal: string | undefined,
  athlete: EnduranceAthleteProfile,
  matchCount = 0,
) {
  const ctx: WeekRequirementContext = { seasonPhase: "inseason", clubTrainingCount, matchCount };
  return calculateWeeklyMinimumRequirements(ctx, { clubTrainingDays: [] }, goal, athlete);
}

// ---------------------------------------------------------------------------
// Wymagania liczbowe
// ---------------------------------------------------------------------------

describe("wymagana liczba endurance", () => {
  const ctxOf = (n: number): WeekRequirementContext => ({
    seasonPhase: "inseason",
    clubTrainingCount: n,
    matchCount: 0,
  });

  it("normalny cel + 4 klubowe → minimum 1 endurance", () => {
    expect(getRequiredEnduranceSessions(ctxOf(4), null, "general", adult)).toBe(1);
  });

  it("cel wydolność + 2 klubowe → 3 endurance", () => {
    expect(getRequiredEnduranceSessions(ctxOf(2), null, "endurance", adult)).toBe(3);
  });

  it("cel wydolność + 3 klubowe → 2 endurance", () => {
    expect(getRequiredEnduranceSessions(ctxOf(3), null, "endurance", adult)).toBe(2);
  });

  it("cel wydolność + 4 klubowe → 2 endurance, absoluteMinimum 1", () => {
    const r = reqFor(4, "endurance", adult);
    expect(r.requiredEnduranceSessions).toBe(2);
    expect(r.absoluteMinimumEnduranceSessions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Zliczanie
// ---------------------------------------------------------------------------

describe("countEnduranceSessions / hasEnough", () => {
  it("klubowy bez tagu conditioning nie liczy się jako endurance", () => {
    const w = week([1, 3]);
    expect(countEnduranceSessions(w)).toBe(0);
  });

  it("hasEnoughEnduranceSessions porównuje z wymogiem", () => {
    const w = week();
    w[0].sessions.push(s("endurance_conditioning"));
    expect(hasEnoughEnduranceSessions(w, { requiredEnduranceSessions: 1 })).toBe(true);
    expect(hasEnoughEnduranceSessions(w, { requiredEnduranceSessions: 2 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blokada w dni klubowe
// ---------------------------------------------------------------------------

describe("blockEnduranceOnClubDays", () => {
  it("usuwa endurance wrzucone w dzień klubowy", () => {
    const w = week([2]);
    w[2].sessions.push(s("endurance_conditioning"));
    const res = blockEnduranceOnClubDays(w);
    expect(res.removed).toBe(1);
    expect(w[2].sessions.some((x) => x.category === "endurance_conditioning")).toBe(false);
  });
});

describe("getSafeEndurancePlacements", () => {
  it("nie proponuje dni klubowych ani meczowych", () => {
    const w = week([1, 3], { matchDay: 6 });
    const places = getSafeEndurancePlacements(w, {}, { maxSessionsPerDay: 1 }, undefined, adult);
    const idx = places.map((p) => p.dayIndex);
    expect(idx).not.toContain(1);
    expect(idx).not.toContain(3);
    expect(idx).not.toContain(6);
  });

  it("preferuje dzień z siłownią (endurance + gym)", () => {
    const w = week();
    w[0].sessions.push(s("gym_strength", { loadLevel: "moderate" }));
    const places = getSafeEndurancePlacements(w, {}, { maxSessionsPerDay: 2 }, undefined, adult);
    // dzień z gym powinien mieć wyższy score niż pusty (przy 2/dzień)
    const gymDay = places.find((p) => p.dayIndex === 0)!;
    const emptyDay = places.find((p) => p.dayIndex === 4)!;
    expect(gymDay.score).toBeGreaterThan(emptyDay.score);
  });
});

// ---------------------------------------------------------------------------
// findBestDayForEnduranceSession
// ---------------------------------------------------------------------------

describe("findBestDayForEnduranceSession", () => {
  it("wybiera dzień bez klubu i bez meczu", () => {
    const w = week([0, 1, 2, 3], { matchDay: 6 });
    const res = findBestDayForEnduranceSession(w, {}, { maxSessionsPerDay: 1 }, undefined, adult);
    expect(res.dayIndex).not.toBeNull();
    expect([0, 1, 2, 3, 6]).not.toContain(res.dayIndex);
  });

  it("gdy wszystkie dni są klubowe/meczowe → unresolvedIssue", () => {
    const w = week([0, 1, 2, 3, 4, 5], { matchDay: 6 });
    const res = findBestDayForEnduranceSession(w, {}, { maxSessionsPerDay: 1 }, undefined, adult);
    expect(res.dayIndex).toBeNull();
    expect(res.unresolvedIssue).toBeTruthy();
  });

  it("MD-1 jest oznaczone jako forcedLow", () => {
    const w = week();
    w[5].toMatch = 1; // MD-1
    // zablokuj wszystkie inne dni klubem, żeby MD-1 był jedyną opcją
    [0, 1, 2, 3, 4].forEach((i) => w[i].sessions.push(s("club")));
    w[6].toMatch = 0;
    w[6].sessions.push(s("match"));
    const res = findBestDayForEnduranceSession(w, {}, { maxSessionsPerDay: 1 }, undefined, adult);
    expect(res.dayIndex).toBe(5);
    expect(res.forcedLow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createEnduranceSessionVariant
// ---------------------------------------------------------------------------

describe("createEnduranceSessionVariant", () => {
  it("zwraca null dla dnia klubowego", () => {
    expect(createEnduranceSessionVariant({ hasClub: true }, adult)).toBeNull();
  });

  it("niski readiness → low-impact", () => {
    const gen = createEnduranceSessionVariant({ readiness: 3 }, adult)!;
    expect(gen.subcategory).toBe("low_impact_conditioning");
    expect(gen.loadLevel).toBe("low");
  });

  it("14yo beginner cel wydolność → easy/low-impact/short aerobic, nie HIIT", () => {
    const gen = createEnduranceSessionVariant({ goal: "endurance" }, youth)!;
    expect(
      ["short_aerobic_block", "low_impact_conditioning", "easy_aerobic", "easy_run", "recovery_run"],
    ).toContain(gen.subcategory);
    expect(gen.loadLevel).toBe("low");
  });

  it("14yo beginner nie dostaje agresywnego HIIT jako domyślnej jednostki", () => {
    const gen = createEnduranceSessionVariant({ goal: "endurance" }, youth)!;
    expect(["extensive_intervals", "aerobic_intervals", "repeated_tempo"]).not.toContain(
      gen.subcategory,
    );
    expect(["high", "very_high"]).not.toContain(gen.loadLevel);
  });

  it("ból kolana → low-impact zamiast ciężkiego biegania", () => {
    const injured: EnduranceAthleteProfile = { ...adult, currentPain: ["knee"] };
    const gen = createEnduranceSessionVariant({ goal: "endurance" }, injured)!;
    expect(gen.subcategory).toBe("low_impact_conditioning");
  });
});

// ---------------------------------------------------------------------------
// validateEnduranceSessionForAthleteProfile
// ---------------------------------------------------------------------------

describe("validateEnduranceSessionForAthleteProfile", () => {
  it("youth + agresywny HIIT = niedozwolone", () => {
    const gen = createEnduranceSessionVariant({ goal: "endurance" }, adult)!; // extensive_intervals high
    const rep = validateEnduranceSessionForAthleteProfile(gen, youth);
    expect(rep.ok).toBe(false);
    expect(rep.issues.some((i) => i.code === "youth_aggressive_hiit")).toBe(true);
  });

  it("MD-1 + ciężkie bieganie = niedozwolone", () => {
    const gen = createEnduranceSessionVariant({ goal: "endurance" }, adult)!;
    const rep = validateEnduranceSessionForAthleteProfile(gen, adult, { toMatch: 1 });
    expect(rep.ok).toBe(false);
    expect(rep.issues.some((i) => i.code === "heavy_running_md1")).toBe(true);
  });

  it("low-impact dla youth jest ok", () => {
    const gen = createEnduranceSessionVariant({ readiness: 3 }, youth)!;
    expect(validateEnduranceSessionForAthleteProfile(gen, youth).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addMissingEnduranceSessions — pełne scenariusze
// ---------------------------------------------------------------------------

describe("addMissingEnduranceSessions", () => {
  const wctx = (clubTrainingCount: number, matchCount = 0): WeekRequirementContext => ({
    seasonPhase: "inseason",
    clubTrainingCount,
    matchCount,
  });

  it("normalny cel + 4 klubowe → minimum 1 endurance i żadne w dzień klubowy", () => {
    const w = week([0, 1, 2, 3]);
    const req = reqFor(4, "general", adult);
    const res = addMissingEnduranceSessions(
      w,
      wctx(4),
      { maxSessionsPerDay: 2, clubTrainingDays: [1, 2, 3, 4] },
      req,
      adult,
    );
    expect(res.count).toBeGreaterThanOrEqual(1);
    // Endurance nie trafia w dni klubowe
    [0, 1, 2, 3].forEach((i) =>
      expect(w[i].sessions.some((x) => x.category === "endurance_conditioning")).toBe(false),
    );
  });

  it("cel wydolność + 2 klubowe → 3 endurance", () => {
    const w = week([1, 3]);
    const req = reqFor(2, "endurance", adult);
    const res = addMissingEnduranceSessions(
      w,
      wctx(2),
      { maxSessionsPerDay: 2, clubTrainingDays: [2, 4] },
      req,
      adult,
    );
    expect(res.requiredEnduranceSessions).toBe(3);
    expect(res.count).toBe(3);
    expect(res.unresolvedIssues).toHaveLength(0);
  });

  it("cel wydolność + 3 klubowe → 2 endurance", () => {
    const w = week([1, 3, 5]);
    const req = reqFor(3, "endurance", adult);
    const res = addMissingEnduranceSessions(
      w,
      wctx(3),
      { maxSessionsPerDay: 2, clubTrainingDays: [2, 4, 6] },
      req,
      adult,
    );
    expect(res.requiredEnduranceSessions).toBe(2);
    expect(res.count).toBe(2);
  });

  it("cel wydolność + 4 klubowe → próba 2, absoluteMinimum 1, brak endurance w dni klubowe", () => {
    const w = week([0, 1, 2, 3]);
    const req = reqFor(4, "endurance", adult);
    const res = addMissingEnduranceSessions(
      w,
      wctx(4),
      { maxSessionsPerDay: 2, clubTrainingDays: [1, 2, 3, 4] },
      req,
      adult,
    );
    expect(res.absoluteMinimumEnduranceSessions).toBe(1);
    expect(res.count).toBeGreaterThanOrEqual(1);
    [0, 1, 2, 3].forEach((i) =>
      expect(w[i].sessions.some((x) => x.category === "endurance_conditioning")).toBe(false),
    );
  });

  it("gdy brak dnia bez klubu → count minimum, unresolvedIssue dla brakującej", () => {
    // 6 dni klubowych + mecz w niedzielę: brak wolnego dnia, ale maxSessionsPerDay=1
    const w = week([0, 1, 2, 3, 4, 5], { matchDay: 6 });
    const req = reqFor(4, "endurance", adult);
    const res = addMissingEnduranceSessions(
      w,
      wctx(4, 1),
      { maxSessionsPerDay: 1, clubTrainingDays: [1, 2, 3, 4, 5, 6] },
      req,
      adult,
    );
    expect(res.unresolvedIssues.length).toBeGreaterThan(0);
    // nic w dni klubowe
    [0, 1, 2, 3, 4, 5].forEach((i) =>
      expect(w[i].sessions.some((x) => x.category === "endurance_conditioning")).toBe(false),
    );
  });

  it("tydzień z meczem nie dostaje ciężkiego biegania dzień przed meczem", () => {
    const w = week([0, 1, 2, 3, 4], { matchDay: 6 });
    w[5].toMatch = 1; // MD-1 jest jedynym wolnym dniem
    const req = reqFor(4, "endurance", adult);
    addMissingEnduranceSessions(
      w,
      wctx(4, 1),
      { maxSessionsPerDay: 1, clubTrainingDays: [1, 2, 3, 4, 5] },
      req,
      adult,
    );
    const md1End = w[5].sessions.find((x) => x.category === "endurance_conditioning");
    if (md1End) {
      expect(["high", "very_high"]).not.toContain(md1End.loadLevel);
    }
  });

  it("14yo beginner cel wydolność → wymagane endurance w wersji easy/low-impact", () => {
    const w = week([1, 3]);
    const req = reqFor(2, "endurance", youth);
    const res = addMissingEnduranceSessions(
      w,
      wctx(2),
      { maxSessionsPerDay: 2, clubTrainingDays: [2, 4] },
      req,
      youth,
    );
    expect(res.count).toBeGreaterThanOrEqual(1);
    for (const d of w) {
      for (const sess of d.sessions) {
        if (sess.category === "endurance_conditioning") {
          expect(["high", "very_high"]).not.toContain(sess.loadLevel);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// validateWeeklyEnduranceMinimum
// ---------------------------------------------------------------------------

describe("validateWeeklyEnduranceMinimum", () => {
  const wctx: WeekRequirementContext = { seasonPhase: "inseason", clubTrainingCount: 2, matchCount: 0 };

  it("wykrywa brak wymaganej liczby endurance", () => {
    const w = week();
    const req = reqFor(2, "endurance", adult); // wymaga 3
    const rep = validateWeeklyEnduranceMinimum(w, wctx, null, req, adult);
    expect(rep.ok).toBe(false);
    expect(rep.unresolvedIssues.length).toBeGreaterThan(0);
  });

  it("wykrywa endurance w dzień klubowy jako unresolvedIssue", () => {
    const w = week([2]);
    w[2].sessions.push(s("endurance_conditioning"));
    const req = reqFor(2, "general", adult);
    const rep = validateWeeklyEnduranceMinimum(w, wctx, null, req, adult);
    expect(rep.onClubDay).toBe(1);
    expect(rep.ok).toBe(false);
  });

  it("poprawny tydzień przechodzi walidację", () => {
    const w = week();
    w[0].sessions.push(s("endurance_conditioning"));
    const req = reqFor(4, "general", adult); // wymaga 1
    const rep = validateWeeklyEnduranceMinimum(
      w,
      { ...wctx, clubTrainingCount: 4 },
      null,
      req,
      adult,
    );
    expect(rep.ok).toBe(true);
  });
});
