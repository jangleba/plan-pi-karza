import { describe, it, expect } from "vitest";
import { buildStrengthPowerStructured, type StrengthBlockContext } from "./strengthBlocks";
import type { Profile, TrainingExercise } from "./types";

const baseProfile: Profile = {
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "intermediate",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
};

const baseCtx: StrengthBlockContext = {
  mdLabel: null,
  powerFocus: false,
  weekPhase: "development",
  weekIndex: 1,
  gymSessionIndexInWeek: 0,
  gymSessionsThisWeekTotal: 2,
  readiness: 8,
  history: { usedRolesThisWeek: [], usedMainThisWeek: [], usedMainLastWeek: [] },
};

function allExercises(profile: Profile, ctx: StrengthBlockContext): TrainingExercise[] {
  const plan = buildStrengthPowerStructured(profile, ctx);
  if (!plan) return [];
  return plan.sections.flatMap((s) => s.blocks.flatMap((b) => b.exercises));
}

function findByLabel(profile: Profile, ctx: StrengthBlockContext, label: string) {
  return allExercises(profile, ctx).find((e) => e.label === label);
}

describe("Goblet squat — twarde zasady", () => {
  it("16+ z siłownią NIE dostaje Goblet squat jako głównego liftu", () => {
    const a1 = findByLabel(baseProfile, baseCtx, "A1");
    expect(a1).toBeDefined();
    expect(a1!.name.toLowerCase()).not.toContain("goblet");
    expect(a1!.name.toLowerCase()).toContain("sztang");
  });

  it("zawodnik < 16 MOŻE dostać goblet/hantle jako główny wzorzec (technika)", () => {
    const young = { ...baseProfile, age: 14, level: "beginner" as const };
    const a1 = findByLabel(young, baseCtx, "A1");
    expect(a1).toBeDefined();
    // Youth pool nie zawiera ciężkiej sztangi max — to technika (goblet/hantle/masa ciała/box).
    expect(a1!.name.toLowerCase()).not.toContain("high bar");
  });

  it("16+ początkujący (wyjątek) dostaje wariant techniczny, nie ciężką sztangę max", () => {
    const beginner16 = { ...baseProfile, age: 17, level: "beginner" as const };
    const a1 = findByLabel(beginner16, baseCtx, "A1");
    expect(a1).toBeDefined();
    expect(a1!.rpe ?? "").toContain("technika");
  });
});

describe("Główny lift siłowy — ciężko i krótko", () => {
  it("16+ development: 2–4 powtórzeń, wysokie RPE, docelowo ≥85% 1RM", () => {
    const a1 = findByLabel(baseProfile, baseCtx, "A1");
    expect(a1!.reps).toBe("2–4");
    expect(a1!.rpe ?? "").toMatch(/RPE 7,5|RPE 8/);
    expect(a1!.loadTarget ?? "").toMatch(/8[5-9]|9[0-2]|1RM/);
  });

  it("16+ peak: 1–3 powtórzeń", () => {
    const a1 = findByLabel(baseProfile, { ...baseCtx, weekPhase: "peak" }, "A1");
    expect(a1!.reps).toBe("1–3");
  });
});

describe("Izometria — osobne typy", () => {
  it("overcoming iso: maks. 2 serie, ~5 s, na początku jednostki", () => {
    const plan = buildStrengthPowerStructured(baseProfile, { ...baseCtx, weekPhase: "peak" })!;
    const prep = plan.sections.find((s) => s.type === "prep");
    const iso = prep?.blocks.flatMap((b) => b.exercises).find((e) => e.label === "ISO");
    expect(iso).toBeDefined();
    expect(iso!.sets).toBe("2");
    expect(iso!.reps ?? "").toContain("5 s");
    // Musi być przed głównym liftem (sekcja prep na początku).
    const prepIdx = plan.sections.findIndex((s) => s.type === "prep");
    const mainIdx = plan.sections.findIndex((s) => s.type === "main");
    expect(prepIdx).toBeGreaterThanOrEqual(0);
    expect(prepIdx).toBeLessThan(mainIdx);
  });

  it("holding/yielding iso: 12–15 s, maks. 2 serie (żadnych 20–30 s)", () => {
    const holds = allExercises(baseProfile, baseCtx).filter(
      (e) => (e.reps ?? "").includes("s") && (e.name.toLowerCase().includes("iso") || (e.reps ?? "").includes("utrzymania")),
    );
    for (const h of holds) {
      expect(h.reps ?? "").not.toMatch(/20–30 s/);
    }
  });
});

function blockDExercises(profile: Profile, ctx: StrengthBlockContext): TrainingExercise[] {
  const plan = buildStrengthPowerStructured(profile, ctx);
  if (!plan) return [];
  const blockD = plan.sections
    .flatMap((s) => s.blocks)
    .find((b) => b.title.includes("BLOK D"));
  return blockD?.exercises ?? [];
}

describe("Blok D — support krótki, bez dublowania dwójek", () => {
  it("ciężka sesja dolna + moc: Blok D ma dokładnie 2 ćwiczenia", () => {
    const d = blockDExercises(baseProfile, baseCtx);
    expect(d.length).toBe(2);
  });

  it("Blok D nie zawiera żadnego ćwiczenia na tylną taśmę / hamstring", () => {
    const d = blockDExercises(baseProfile, baseCtx);
    const banned = /nordic|hamstring|rdl|martwy ciąg|leg curl|uginanie n|hip thrust|hip hinge|bridge|slider|good morning|glute/i;
    for (const e of d) {
      expect(e.name).not.toMatch(banned);
    }
  });

  it("Blok D wybiera tylko lekkie uzupełnienia (łydka / przywodziciel / łopatka)", () => {
    const d = blockDExercises(baseProfile, baseCtx);
    const allowed = /łydk|palce|stop|kostk|copenhagen|przywodzic|face pull|łopatk|guma/i;
    for (const e of d) {
      expect(e.name).toMatch(allowed);
    }
  });
});

// ---------------------------------------------------------------------------
// Faza rozwojowa 15–16 lat
// ---------------------------------------------------------------------------

function devProfile(over: Partial<Profile>): Profile {
  return { ...baseProfile, age: 16, ...over };
}

describe("15–16 lat — strukturalna siła i umiarkowana hipertrofia", () => {
  it("16 zaawansowany z siłownią: główny lift ze sztangą, 6–8 powt., 70–80% 1RM, 2–3 RIR", () => {
    const p = devProfile({ age: 16, level: "advanced" });
    const a1 = findByLabel(p, baseCtx, "A1")!;
    expect(a1.name.toLowerCase()).toContain("sztang");
    expect(a1.reps).toBe("6–8");
    expect(a1.rpe ?? "").toContain("RIR");
    expect(a1.loadTarget ?? "").toMatch(/75–80% 1RM/);
  });

  it("16 zaawansowany: brak maksymalnych ciężarów ≥85% 1RM i brak pracy do upadku", () => {
    for (const phase of ["adaptation", "development", "peak", "deload"] as const) {
      const p = devProfile({ age: 16, level: "advanced" });
      const exs = allExercises(p, { ...baseCtx, weekPhase: phase });
      for (const e of exs) {
        expect(e.loadTarget ?? "").not.toMatch(/8[5-9]%|9[0-9]%/);
        expect((e.rpe ?? "").toLowerCase()).not.toContain("upadk");
        expect((e.rpe ?? "").toLowerCase()).not.toMatch(/rpe 9|rpe 10/);
      }
    }
  });

  it("15 zaawansowany dostaje tę samą progresję co 16 (jedna konfiguracja wieku)", () => {
    const a15 = findByLabel(devProfile({ age: 15, level: "advanced" }), baseCtx, "A1")!;
    const a16 = findByLabel(devProfile({ age: 16, level: "advanced" }), baseCtx, "A1")!;
    expect(a15.reps).toBe(a16.reps);
    expect(a15.loadTarget).toBe(a16.loadTarget);
  });

  it("16 początkujący: wariant techniczny, bez progresji ciężaru maksymalnego", () => {
    const a1 = findByLabel(devProfile({ age: 16, level: "beginner" }), baseCtx, "A1")!;
    expect(a1.rpe ?? "").toContain("technika");
    expect(a1.loadTarget ?? "").not.toMatch(/% 1RM/);
  });

  it("16 bez siłowni: brak progresji obciążenia zewnętrznego w głównym wzorcu", () => {
    const a1 = findByLabel(devProfile({ age: 16, level: "advanced", hasGym: false }), baseCtx, "A1")!;
    expect(a1.loadTarget ?? "").not.toMatch(/% 1RM/);
  });

  it("16 zaawansowany: akcesoria w zakresie umiarkowanej hipertrofii (8–12)", () => {
    const exs = allExercises(devProfile({ age: 16, level: "advanced" }), baseCtx);
    const hyper = exs.filter((e) => (e.reps ?? "").includes("8–12"));
    expect(hyper.length).toBeGreaterThan(0);
  });

  it("16 zaawansowany: sesja zawiera pracę tułowia, tylnej taśmy, łydki/przywodziciela", () => {
    const names = allExercises(devProfile({ age: 16, level: "advanced" }), baseCtx)
      .map((e) => e.name.toLowerCase())
      .join(" | ");
    expect(names).toMatch(/nordic|rdl|hamstring|martwy|dwugłow|hip hinge|good morning|bridge|slider/);
    expect(names).toMatch(/łydk|palce|copenhagen|przywodzic/);
    expect(names).toMatch(/core|plank|deska|pallof|anty|brzuch|tułow/);
  });

  it("16 zaawansowany: struktura sesji identyczna jak u dorosłego (bez okrojenia jakości ruchu)", () => {
    const dev = buildStrengthPowerStructured(devProfile({ age: 16, level: "advanced" }), baseCtx)!;
    const adult = buildStrengthPowerStructured(devProfile({ age: 24, level: "advanced" }), baseCtx)!;
    expect(dev.sections.map((s) => s.type)).toEqual(adult.sections.map((s) => s.type));
    expect(dev.sections.flatMap((s) => s.blocks).length).toBe(
      adult.sections.flatMap((s) => s.blocks).length,
    );
  });

  it("16 zaawansowany: brak metod zaawansowanych (depth jump / kompleksy siła→moc)", () => {
    const names = [0, 1, 2]
      .flatMap((i) =>
        allExercises(devProfile({ age: 16, level: "advanced" }), {
          ...baseCtx,
          gymSessionIndexInWeek: i,
        }),
      )
      .map((e) => e.name.toLowerCase())
      .join(" | ");
    expect(names).not.toMatch(/depth|zeskok w głąb|cluster|klaster|kompleks/);
  });
});
