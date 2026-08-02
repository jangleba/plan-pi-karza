import { describe, expect, it } from "vitest";
import {
  compareWithCorrection,
  computeTargets,
  eatClock,
  evaluateFuel,
  requiredLead,
} from "./engine";
import type { FuelInput } from "./types";

function base(overrides: Partial<FuelInput> = {}): FuelInput {
  return {
    athlete: {
      age: 17,
      sex: "male",
      bodyMassKg: 70,
      heightCm: 178,
      position: "midfielder",
      level: "intermediate",
      goal: "speed",
    },
    session: {
      kind: "strength",
      intensity: "umiarkowana",
      durationMin: 60,
      minutesToStart: 180,
      title: "Siła dolna",
    },
    weekLoad: { hardSessions7d: 2, totalMinutes7d: 320 },
    intake: {
      mealSize: "medium",
      plannedCarbsG: 45,
      fatFiberHeavy: false,
      caffeine: false,
      fluidTodayMl: 2500,
      lastMealMinutesAgo: 240,
      gutIssues: false,
      restrictions: [],
    },
    ...overrides,
  };
}

describe("cele żywieniowe", () => {
  it("skaluje węglowodany z masą, intensywnością i czasem trwania", () => {
    const t = computeTargets(base());
    expect(t.carbTargetG).toBe(42); // 70 kg × 0.6
    const hard = computeTargets(
      base({
        session: {
          kind: "match",
          intensity: "wysoka",
          durationMin: 90,
          minutesToStart: 180,
          title: "Mecz",
        },
      }),
    );
    expect(hard.carbTargetG).toBe(101); // 70 × (1.0+0.2) × 1.2
  });

  it("obniża cel przy krótkim oknie przed startem", () => {
    const t = computeTargets(
      base({
        session: { ...base().session, minutesToStart: 40 },
      }),
    );
    expect(t.carbTargetG).toBe(21); // 0.6 × 0.5
  });

  it("liczy cel płynów z masy i czasu jednostki", () => {
    expect(computeTargets(base()).fluidTargetMl).toBe(2800); // 70×35 + 1h×350
  });

  it("wydłuża wymagany odstęp dla ciężkich posiłków i wrażliwego żołądka", () => {
    expect(requiredLead("medium", false, false)).toBe(120);
    expect(requiredLead("medium", true, true)).toBe(180);
    expect(requiredLead("liquid", false, true)).toBe(30);
  });
});

describe("ocena Fuel Score", () => {
  it("jest deterministyczna dla tych samych danych", () => {
    const a = evaluateFuel(base());
    const b = evaluateFuel(base());
    expect(a.score).toBe(b.score);
    expect(a.components.map((c) => c.points)).toEqual(b.components.map((c) => c.points));
  });

  it("daje wysoki wynik przy dopasowanym posiłku", () => {
    const r = evaluateFuel(base());
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.band).toBe("wysoka");
    expect(r.dataCompleteness).toBe(100);
  });

  it("wykrywa zbyt późny ciężki posiłek przed intensywną jednostką", () => {
    const r = evaluateFuel(
      base({
        session: {
          kind: "endurance",
          intensity: "wysoka",
          durationMin: 60,
          minutesToStart: 45,
          title: "Interwały",
        },
        intake: { ...base().intake, mealSize: "large", fatFiberHeavy: true, plannedCarbsG: 90 },
      }),
    );
    expect(r.mainProblem?.title).toBe("Zły moment spożycia");
    expect(r.discomfortRisk).toBeGreaterThan(0);
    expect(r.eatBeforeStartMin).toBe(210);
  });

  it("wykrywa niedobór węglowodanów przed meczem", () => {
    const r = evaluateFuel(
      base({
        session: {
          kind: "match",
          intensity: "wysoka",
          durationMin: 90,
          minutesToStart: 180,
          title: "Mecz",
        },
        intake: { ...base().intake, plannedCarbsG: 15 },
      }),
    );
    expect(r.mainProblem?.title).toBe("Za mało lub za dużo węglowodanów");
    expect(r.energyReadiness).toBeLessThan(80);
  });

  it("wykrywa niedobór płynów", () => {
    const r = evaluateFuel(base({ intake: { ...base().intake, fluidTodayMl: 700 } }));
    expect(r.hydrationPct).toBe(25);
    expect(r.mainProblem?.title).toBe("Niedobór płynów");
  });

  it("oznacza brakujące dane zamiast je zgadywać", () => {
    const r = evaluateFuel(
      base({
        athlete: { ...base().athlete, bodyMassKg: null },
        intake: { ...base().intake, plannedCarbsG: null, fluidTodayMl: null },
      }),
    );
    expect(r.components.find((c) => c.id === "carbs")?.points).toBeNull();
    expect(r.missingData).toContain("masa ciała");
    expect(r.dataCompleteness).toBe(50);
    expect(r.score).not.toBeNull();
  });

  it("nie zwraca wyniku, gdy brak wszystkich danych", () => {
    const r = evaluateFuel(
      base({
        athlete: { ...base().athlete, bodyMassKg: null },
        session: { kind: "none", intensity: null, durationMin: null, minutesToStart: null, title: null },
        intake: {
          mealSize: null,
          plannedCarbsG: null,
          fatFiberHeavy: null,
          caffeine: false,
          fluidTodayMl: null,
          lastMealMinutesAgo: null,
          gutIssues: null,
          restrictions: [],
        },
      }),
    );
    expect(r.score).toBeNull();
    expect(r.band).toBe("brak_danych");
  });

  it("różnicuje profile zawodników przy tym samym posiłku", () => {
    const light = evaluateFuel(base({ athlete: { ...base().athlete, bodyMassKg: 55 } }));
    const heavy = evaluateFuel(base({ athlete: { ...base().athlete, bodyMassKg: 92 } }));
    expect(light.score).toBeGreaterThan(heavy.score!);
  });
});

describe("porównanie przed/po korekcie", () => {
  it("korekta podnosi wynik", () => {
    const input = base({ intake: { ...base().intake, plannedCarbsG: 10, fluidTodayMl: 600 } });
    const cmp = compareWithCorrection(input);
    expect(cmp.after).not.toBeNull();
    expect(cmp.deltaScore).toBeGreaterThan(0);
  });

  it("brak korekty przy komplecie 100/100", () => {
    const cmp = compareWithCorrection(
      base({ intake: { ...base().intake, plannedCarbsG: 42, fluidTodayMl: 3000 } }),
    );
    expect(cmp.before.score).toBe(100);
    expect(cmp.after).toBeNull();
  });
});

describe("moment gotowości", () => {
  it("odejmuje wymagany odstęp od godziny startu", () => {
    expect(eatClock("18:00", 120)).toBe("16:00");
    expect(eatClock("00:30", 60)).toBe("23:30");
    expect(eatClock(null, 60)).toBeNull();
  });
});
