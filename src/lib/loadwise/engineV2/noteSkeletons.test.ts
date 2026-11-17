import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import type { EngineSession } from "./model";
import { buildAdvancedStrength, attemptAdvancedStrength } from "./advancedSessions";
import {
  COACH_SKELETONS,
  skeletonClarifications,
  skeletonDoubts,
  type Skeleton,
} from "./coachSkeletons";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { NOTE_FUNCTIONS, functionViolations } from "./noteFunctions";
import { adaptDose, noteLevel, noteLevelDecision } from "./noteDosage";
import { getExerciseDefinition } from "../exerciseLibrary";
import { recommendStrengthProgression } from "./progression";
import type { TrainingExercise } from "../types";

const FULL_EQUIPMENT = [
  "barbell",
  "rack",
  "dumbbell",
  "machine",
  "band",
  "bench",
  "box",
  "platform",
  "med_ball",
  "gym_throw_zone",
  "kettlebell",
  "gym_jump_lane",
  "trap_bar",
  "nordic_setup",
  "swiss_ball",
  "sliders",
  "fixed_pins",
  "overhead_band_station",
  "low_band_station",
];
const base = {
  name: "Szkielet",
  age: 24,
  position: "midfielder",
  level: "elite",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: FULL_EQUIPMENT,
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
} as unknown as Profile;
const verified = {
  ...base,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 60,
  movementCompetence: "high",
  supervisionLevel: "full",
  trainingMethodPreferences: { coachedOlympicLifts: true },
} as Profile;
const profile = (extra: Partial<Profile>): Profile => ({ ...base, ...extra }) as Profile;

const skeletons = Object.values(COACH_SKELETONS).filter((s): s is Skeleton => Boolean(s));
const rows = (s: EngineSession) => s.exercises.filter((e) => e.noteSlot);

describe("the five photos as skeletons", () => {
  it("has the four note skeletons with the coach's numbering and lines", () => {
    expect(skeletons.map((s) => s.id).sort()).toEqual(
      ["N_clean_plyo", "N_squat_bench", "N_step_reactive", "N_trapbar"].sort(),
    );
    const lines = (id: keyof typeof COACH_SKELETONS) =>
      COACH_SKELETONS[id]!.blocks.flatMap((b) => b.slots.map((slot) => `${slot.id} ${slot.text}`));
    expect(lines("N_squat_bench")).toContain("3a Back Squat 4x2 (4-1-x)");
    expect(lines("N_squat_bench")).toContain("2 Hang Power Clean 3x3");
    expect(lines("N_clean_plyo")).toContain("0 Str L SL HT iso hold 3x8/side");
  });

  it("carries no kilograms anywhere in the skeleton or the doses", () => {
    const text = JSON.stringify(skeletons);
    expect(text).not.toMatch(/\bkg\b/i);
    for (const e of rows(buildAdvancedStrength(verified, "A", "development", 0)!))
      expect(Object.keys(e.dose)).not.toContain("loadKg");
  });

  it("marks what the photos do not state and does not guess it", () => {
    const doubts = skeletonDoubts();
    expect(doubts.length).toBeGreaterThan(8);
    expect(doubts.some((d) => /Tempo „x”/.test(d.doubt))).toBe(true);
    // The trapbar photo is a summary: its missing numbers stay open.
    expect(doubts.some((d) => d.skeleton === "N_trapbar")).toBe(true);
    const trapbar = COACH_SKELETONS.N_trapbar!;
    const unspecified = trapbar.blocks.flatMap((b) => b.slots).filter((s) => s.ref.unspecified);
    expect(unspecified.length).toBeGreaterThanOrEqual(5);
  });

  it("records the coach's later explanations as the source of the number, not as a doubt", () => {
    const text = (slot: string, skeleton: string) =>
      skeletonClarifications().find((c) => c.slot === slot && c.skeleton === skeleton)?.text ?? "";
    expect(text("1a", "N_squat_bench")).toMatch(/1 s mocno i 1 s luzu|1 s mocno, 1 s luz/);
    expect(text("0", "N_clean_plyo")).toMatch(/8 s/);
    expect(text("5c", "N_clean_plyo")).toMatch(/jedną stronę, potem na drugą/);
    expect(text("1b", "N_squat_bench")).toMatch(/prostych nogach/);
    expect(text("2a", "N_step_reactive")).toMatch(/zawsze obciążony/);
    const switchSlot = COACH_SKELETONS.N_step_reactive!.blocks.flatMap((b) => b.slots).find(
      (x) => x.id === "3b",
    )!;
    expect(switchSlot.ref).toMatchObject({ sets: 3, seconds: 5, perSide: true });
    // “x” of the tempo is still open.
    expect(skeletonDoubts().some((d) => /Tempo „x”/.test(d.doubt))).toBe(true);
  });
  it("a step-up is never done without load: no bodyweight step-up among the candidates", () => {
    expect(NOTE_FUNCTIONS.knee_single_leg_strength.candidates).not.toContain("step_up");
    for (const p of [verified, profile({ equipment: ["barbell", "rack", "bench", "band"] })]) {
      const s = buildAdvancedStrength(p, "B", "development", 1);
      expect(s?.exercises.map((e) => e.exerciseId) ?? []).not.toContain("step_up");
    }
  });
  it("every slot names a registered function with a library exercise or an equivalent", () => {
    for (const s of skeletons)
      for (const slot of s.blocks.flatMap((b) => b.slots)) {
        const fn = NOTE_FUNCTIONS[slot.fn];
        expect(fn, `${s.id} ${slot.id}`).toBeDefined();
        for (const id of [...(slot.prefer ?? []), ...fn.candidates])
          expect(getExerciseDefinition(id), `${slot.id}: ${id}`).toBeTruthy();
      }
  });
});

describe("selection keeps the function of the exercise", () => {
  it("every candidate satisfies its function's contraction and action", () => {
    expect(Object.values(NOTE_FUNCTIONS).flatMap(functionViolations)).toEqual([]);
  });
  it("no candidate list contains an exercise of another function (e.g. a throw instead of a jump)", () => {
    for (const fn of Object.values(NOTE_FUNCTIONS))
      if (["reactive_jump_light", "reactive_jump_depth"].includes(fn.id))
        for (const id of fn.candidates) expect(FUNCTIONAL_CATALOGUE[id]?.actions).toContain("jump");
    expect(NOTE_FUNCTIONS.reactive_jump_depth.candidates).not.toContain("med_ball_throw");
  });
  it("a substitute is recorded with the coach's exercise and the reason", () => {
    const session = buildAdvancedStrength(
      profile({
        gymExperienceLevel: "beginner",
        strengthTrainingMonths: 3,
        movementCompetence: "medium",
        supervisionLevel: "some",
      }),
      "A",
      "development",
      0,
    );
    expect(session).not.toBeNull();
    const swapped = rows(session!).filter((e) => e.substituteFor);
    expect(swapped.length).toBeGreaterThan(0);
    for (const e of swapped) {
      expect(e.doseAdjustments?.[0]).toMatchObject({
        field: "exercise",
        from: e.substituteFor,
        to: e.exerciseId,
      });
      expect(e.doseAdjustments?.[0].reason.length).toBeGreaterThan(10);
      expect(
        NOTE_FUNCTIONS[e.noteSlot!.function as keyof typeof NOTE_FUNCTIONS].candidates,
      ).toContain(e.exerciseId);
    }
  });
});

describe("dosing: the reference dose stands unless there is a reason", () => {
  it("a verified adult gets the coach's own numbers without any adjustment", () => {
    const s = buildAdvancedStrength(verified, "A", "development", 0)!;
    expect(noteLevel(verified)).toBe("full");
    expect(rows(s).flatMap((e) => e.doseAdjustments ?? [])).toEqual([]);
    const squat = s.exercises.find((e) => e.noteSlot?.id === "3a")!;
    expect(squat.dose).toMatchObject({
      sets: 4,
      reps: 2,
      tempo: { eccentricSeconds: 4, pauseSeconds: 1, concentricSeconds: 1 },
    });
  });
  it("football level alone never makes the athlete advanced in the gym", () => {
    const elite = profile({ level: "elite" });
    const decision = noteLevelDecision(elite);
    expect(decision.level).toBe("standard");
    expect(decision.basis).toMatch(/Poziom piłkarski nie przesądza/);
    const s = buildAdvancedStrength(elite, "A", "development", 0)!;
    const squat = s.exercises.find((e) => e.noteSlot?.id === "3a");
    expect(squat?.dose.reps ?? 4).toBeGreaterThanOrEqual(4);
    expect(squat?.exerciseId).not.toBe("power_clean");
    expect(s.noteLevelBasis).toBe(decision.basis);
  });
  it("every change of the reference dose has a reason (youth, beginner, lighter week)", () => {
    const youth = buildAdvancedStrength(
      profile({
        age: 17,
        gymExperienceLevel: "intermediate",
        strengthTrainingMonths: 18,
        movementCompetence: "medium",
        supervisionLevel: "some",
      }),
      "A",
      "development",
      2,
    )!;
    const changed = rows(youth).filter((e) =>
      e.doseAdjustments?.some((a) => a.field !== "exercise"),
    );
    expect(changed.length).toBeGreaterThan(0);
    for (const e of rows(youth)) {
      expect(e.dose.sets).toBeLessThanOrEqual(3);
      for (const a of e.doseAdjustments ?? []) expect(a.reason.length).toBeGreaterThan(10);
    }
    const bench = youth.exercises.find((e) => e.noteSlot?.id === "4a");
    if (bench) expect(bench.dose.reps).toBeGreaterThanOrEqual(4);
  });
  it("a lift's heavy low reps are never given to a substitute", () => {
    const r = adaptDose({
      slot: COACH_SKELETONS.N_squat_bench!.blocks[2].slots[0],
      ref: { sets: 4, reps: 2 },
      exerciseId: "goblet_squat",
      substitute: true,
      level: "full",
      p: verified,
      phase: "development",
    });
    expect(r.dose.reps).toBe(5);
    expect(r.adjustments[0].reason).toMatch(/Zamiennik/);
  });
  it("product defaults are labelled, rests are never the coach's", () => {
    const s = buildAdvancedStrength(verified, "B", "development", 0)!;
    const flagged = rows(s).filter((e) => e.productDefaults?.length);
    expect(flagged.length).toBeGreaterThanOrEqual(3);
  });
});

describe("generated variants for different profiles", () => {
  const profiles: [string, Profile][] = [
    ["dorosły zweryfikowany", verified],
    ["elita bez deklaracji siłowej", profile({ level: "elite" })],
    [
      "16 lat, średni",
      profile({
        age: 16,
        level: "intermediate",
        gymExperienceLevel: "intermediate",
        strengthTrainingMonths: 12,
        movementCompetence: "medium",
        supervisionLevel: "full",
      }),
    ],
    [
      "początkujący",
      profile({
        level: "advanced",
        gymExperienceLevel: "beginner",
        strengthTrainingMonths: 2,
        movementCompetence: "low",
        supervisionLevel: "none",
      }),
    ],
    [
      "bez skrzyni i trap bara",
      { ...verified, equipment: ["barbell", "rack", "dumbbell", "bench", "band"] } as Profile,
    ],
    ["cel mocy", { ...verified, goal: "power" } as Profile],
  ];
  for (const [name, p] of profiles)
    for (const variant of ["A", "B"] as const)
      for (const rotation of [0, 1, 2, 3])
        it(`${name}, ${variant}, rotacja ${rotation}: kompletny, w limitach, bez zgadywania`, () => {
          const attempt = attemptAdvancedStrength(p, variant, "development", rotation);
          if (!attempt.session) {
            expect(attempt.path?.cause).toBeTruthy();
            return;
          }
          const s = attempt.session;
          const slotRows = rows(s);
          expect(slotRows.length).toBeGreaterThanOrEqual(5);
          // The function of each row is one of the slot's equivalents.
          for (const e of slotRows)
            expect(
              NOTE_FUNCTIONS[e.noteSlot!.function as keyof typeof NOTE_FUNCTIONS].candidates.concat(
                NOTE_FUNCTIONS[e.noteSlot!.function as keyof typeof NOTE_FUNCTIONS].alt
                  ?.candidates ?? [],
              ),
            ).toContain(e.exerciseId);
          // No throw stands in for a jump, no load is set by the engine.
          expect(
            slotRows.some(
              (e) =>
                e.exerciseId === "med_ball_throw" && e.noteSlot!.function !== "upper_throw_power",
            ),
          ).toBe(false);
          for (const e of slotRows) expect(JSON.stringify(e.dose)).not.toMatch(/kg|loadKg|weight/i);
          if (p.age < 18 || noteLevel(p) === "intro")
            for (const e of slotRows) expect(e.dose.sets).toBeLessThanOrEqual(3);
          // Everything left out names its cause.
          for (const o of s.noteOmissions ?? [])
            expect(["equipment", "preparation", "recipe"]).toContain(o.cause);
          // Reference sets are kept or the change is explained.
          for (const e of slotRows) {
            const ref = COACH_SKELETONS[s.advancedTemplate!]!.blocks.flatMap((b) => b.slots).find(
              (x) => x.id === e.noteSlot!.id,
            )!;
            if (e.dose.sets !== ref.ref.sets && !(ref.heavy?.ref?.sets === e.dose.sets))
              expect(
                e.doseAdjustments?.some((a) => a.field === "sets"),
                `${ref.id}`,
              ).toBe(true);
          }
        });
});

describe("individual load", () => {
  const exercise: TrainingExercise = { id: "x", name: "Przysiad", sets: "4", reps: "6", rir: "2" };
  it("without logged performance the engine suggests no kilograms", () => {
    expect(recommendStrengthProgression(exercise, [])).toBeNull();
    expect(recommendStrengthProgression(exercise, [], "2026-11-17")).toBeNull();
  });
  it("a suggestion comes only from the athlete's own logged sets", () => {
    const log = (id: string, date: string) => ({
      sessionKey: id,
      performedAt: date,
      sets: [1, 2, 3, 4].map((setNumber) => ({ setNumber, weightKg: 60, reps: 6, rir: 3 })),
    });
    const advice = recommendStrengthProgression(
      exercise,
      [log("a", "2026-11-09"), log("b", "2026-11-02")],
      "2026-11-12",
    );
    if (advice?.weightKg !== undefined) expect(advice.weightKg).toBeGreaterThanOrEqual(60);
  });
});
