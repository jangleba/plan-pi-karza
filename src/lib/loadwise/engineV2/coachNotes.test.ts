import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import type { Dose, EngineSession } from "./model";
import { buildAdvancedStrength } from "./advancedSessions";
import { estimateSeconds } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";

/**
 * The coach's five messages, transcribed. Each group is one line of the note (1a/1b, 3a/3b …);
 * the numbers are the note's own. A fully prepared athlete with the full gym gets exactly these.
 */
const athlete = {
  name: "Notes",
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
  equipment: [
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
  ],
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
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 60,
  movementCompetence: "high",
  supervisionLevel: "full",
  trainingMethodPreferences: { coachedOlympicLifts: true },
} as unknown as Profile;

interface Spec {
  sets: number;
  reps?: number;
  /** Repetitions of a short hold; `seconds` is the length of one hold. */
  holdReps?: number;
  seconds?: number;
  perSide?: true;
  tempo?: [number, number, number];
}
type Row = [string, Spec];
const T441: [number, number, number] = [4, 1, 1];
const T311: [number, number, number] = [3, 1, 1];

const SQUAT_BENCH_WEEK_1: Row[][] = [
  [
    ["knee_iso_push", { sets: 3, holdReps: 5, seconds: 1, perSide: true }],
    ["single_leg_box_jump", { sets: 3, reps: 3, perSide: true }],
  ],
  [["power_clean", { sets: 3, reps: 3 }]],
  [
    ["heavy_back_squat", { sets: 4, reps: 2, tempo: T441 }],
    ["depth_jump_over_hurdle", { sets: 4, reps: 2 }],
  ],
  [
    ["barbell_bench_press", { sets: 4, reps: 2 }],
    ["face_pull_band", { sets: 3, reps: 8 }],
  ],
  [
    ["barbell_row", { sets: 3, reps: 3 }],
    ["single_leg_straight_leg_hip_thrust", { sets: 3, reps: 3, perSide: true }],
  ],
  [
    ["bilateral_slider_leg_curl", { sets: 3, reps: 4, tempo: T311 }],
    ["seated_soleus_raise", { sets: 3, reps: 12, perSide: true }],
    ["standing_banded_hip_flexion", { sets: 3, reps: 5, perSide: true }],
  ],
];
// The second message of the same Day 1: more volume, a supine hip flexor.
const SQUAT_BENCH_WEEK_2: Row[][] = [
  SQUAT_BENCH_WEEK_1[0],
  [["power_clean", { sets: 4, reps: 3 }]],
  [
    ["heavy_back_squat", { sets: 5, reps: 3, tempo: T441 }],
    ["depth_jump_over_hurdle", { sets: 4, reps: 3 }],
  ],
  [
    ["barbell_bench_press", { sets: 5, reps: 4 }],
    ["face_pull_band", { sets: 3, reps: 10 }],
  ],
  [
    ["barbell_row", { sets: 3, reps: 5 }],
    ["single_leg_straight_leg_hip_thrust", { sets: 3, reps: 5, perSide: true }],
  ],
  [
    ["bilateral_slider_leg_curl", { sets: 3, reps: 6, tempo: T311 }],
    ["seated_soleus_raise", { sets: 3, reps: 12, perSide: true }],
    ["supine_banded_hip_flexion", { sets: 3, reps: 8, perSide: true }],
  ],
];
// 16.09.2024
const CLEAN_PLYO: Row[][] = [
  [["single_leg_straight_leg_ht_iso", { sets: 3, seconds: 8, perSide: true }]],
  [
    ["power_clean", { sets: 4, reps: 2 }],
    ["bilateral_pogo", { sets: 3, reps: 6 }],
  ],
  [
    ["quarter_box_squat", { sets: 4, reps: 2 }],
    ["drop_jump", { sets: 4, reps: 3 }],
  ],
  [
    ["medicine_ball_shot_put", { sets: 3, reps: 5, perSide: true }],
    ["single_leg_banded_hip_thrust", { sets: 3, reps: 5, perSide: true }],
  ],
  [
    ["single_arm_plyo_row", { sets: 3, reps: 5, perSide: true }],
    ["rebound_back_extension", { sets: 3, reps: 6 }],
  ],
  [
    ["high_side_plank_abduction", { sets: 3, reps: 8, perSide: true }],
    ["standing_banded_hip_flexion", { sets: 3, reps: 8, perSide: true }],
    ["copenhagen_plank", { sets: 3, reps: 6, perSide: true }],
  ],
];
const STEP_REACTIVE: Row[][] = [
  [
    ["knee_iso_push", { sets: 3, holdReps: 3, seconds: 1, perSide: true }],
    ["depth_jump", { sets: 3, reps: 3 }],
  ],
  [
    ["step_up", { sets: 4, reps: 3, perSide: true }],
    ["weighted_step_up_jump", { sets: 3, reps: 2, perSide: true }],
    ["single_leg_assisted_cmj", { sets: 3, reps: 3, perSide: true }],
  ],
  [
    ["banded_plyo_push_up", { sets: 3, reps: 5 }],
    ["single_leg_straight_leg_iso_switch", { sets: 3, holdReps: 5, perSide: true }],
  ],
  [
    ["speed_barbell_row", { sets: 3, reps: 6 }],
    ["full_nordic_hamstring", { sets: 3, reps: 3 }],
  ],
  [
    ["single_leg_swiss_ball_pike", { sets: 3, reps: 6, perSide: true }],
    ["face_pull_band", { sets: 3, reps: 10 }],
    ["single_leg_swiss_ball_hip_twist", { sets: 3, reps: 6, perSide: true }],
  ],
];

const specOf = (d: Dose): Spec => ({
  sets: d.sets,
  ...(d.reps !== undefined ? { reps: d.reps } : {}),
  ...(d.holdReps !== undefined ? { holdReps: d.holdReps } : {}),
  ...(d.seconds !== undefined ? { seconds: d.seconds } : {}),
  ...(d.perSide ? { perSide: true as const } : {}),
  ...(d.tempo
    ? {
        tempo: [d.tempo.eccentricSeconds, d.tempo.pauseSeconds, d.tempo.concentricSeconds] as [
          number,
          number,
          number,
        ],
      }
    : {}),
});
/** The session as the note lists it: groups in order, singles alone, preparation left out. */
function asNote(r: EngineSession): Row[][] {
  const work = r.exercises.filter((e) => e.role !== "warmup" && e.role !== "mobility");
  const out: Row[][] = [];
  const seen = new Set<string>();
  for (const e of work) {
    if (seen.has(e.exerciseId)) continue;
    const pair = r.complexPairs?.find((g) => g.exerciseIds.includes(e.exerciseId));
    const ids = pair ? pair.exerciseIds : [e.exerciseId];
    for (const id of ids) seen.add(id);
    out.push(ids.map((id) => [id, specOf(work.find((x) => x.exerciseId === id)!.dose)] as Row));
  }
  return out;
}

describe("gym sessions are the coach's notes, line by line", () => {
  it("“Jutro zrób tak” (Day 1, first message) — the squat/bench note", () => {
    const r = buildAdvancedStrength(athlete, "A", "development", 0)!;
    expect(r.advancedTemplate).toBe("N_squat_bench");
    expect(asNote(r)).toEqual(SQUAT_BENCH_WEEK_1);
  });

  it("Day 1, second message — the same note in its heavier week, every second time", () => {
    const r = buildAdvancedStrength(athlete, "A", "development", 2)!;
    expect(r.advancedTemplate).toBe("N_squat_bench");
    expect(asNote(r)).toEqual(SQUAT_BENCH_WEEK_2);
    // And back to the first message the next time it comes round (rotation 4).
    expect(asNote(buildAdvancedStrength(athlete, "A", "development", 4)!)).toEqual(
      SQUAT_BENCH_WEEK_1,
    );
  });

  it("Day 1 of 16.09.2024 — clean + plyo", () => {
    for (const rotation of [1, 3]) {
      const r = buildAdvancedStrength(athlete, "A", "development", rotation)!;
      expect(r.advancedTemplate).toBe("N_clean_plyo");
      expect(asNote(r)).toEqual(CLEAN_PLYO);
    }
  });

  it("Day 1, step-up message — step up + weighted jump + assisted CMJ", () => {
    const r = buildAdvancedStrength(athlete, "B", "development", 1)!;
    expect(r.advancedTemplate).toBe("N_step_reactive");
    expect(asNote(r)).toEqual(STEP_REACTIVE);
  });

  it("the Polish summary — iso push + jumps, trap bar + plyo + assisted jumps, upper to 5 reps, accessories", () => {
    const r = buildAdvancedStrength(athlete, "B", "development", 0)!;
    expect(r.advancedTemplate).toBe("N_trapbar");
    const note = asNote(r);
    expect(note[0].map(([id]) => id)).toEqual(["knee_iso_push", "box_jump"]);
    expect(note[0].map(([, s]) => s.sets)).toEqual([2, 2]); // “2 serie”
    expect(note[1].map(([id]) => id)).toEqual([
      "trap_bar_deadlift",
      "bilateral_pogo",
      "gym_cmj_assisted",
    ]);
    expect(note[1][0][1].reps).toBeLessThanOrEqual(3); // “maks 3 reps”
    expect(note[1][2][1].reps).toBeLessThanOrEqual(3);
    expect(note[2]).toEqual([
      ["barbell_bench_press", { sets: 3, reps: 5 }],
      ["pull_up", { sets: 3, reps: 5 }],
    ]);
    expect(note.length).toBeGreaterThanOrEqual(4); // accessories “wedle uznania”
  });

  it("the screen shows the note's numbers: holds as 5 × 1 s, throws per side, unequal sets", () => {
    const plan = generateTrainingPlan(athlete, {
      startDate: "2026-11-02",
      weeks: 2,
      minutesPerSession: 120,
    }).plan;
    const a = plan
      .flatMap((d) => [d, d.secondSession])
      .find((s): s is SessionDay => s?.engineV2?.advancedTemplate === "N_clean_plyo")!;
    const rows = a.structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises));
    const text = (id: string) => rows.find((r) => r.exerciseId === id)?.displayPrescription;
    expect(text("medicine_ball_shot_put")).toBe("3 × 5 / stronę");
    expect(text("power_clean")).toBe("4 × 2");
    expect(text("bilateral_pogo")).toBe("3 × 6");
    expect(text("drop_jump")).toBe("4 × 3");
    const squat = plan
      .flatMap((d) => [d, d.secondSession])
      .find((s): s is SessionDay => s?.engineV2?.advancedTemplate === "N_squat_bench")!;
    const squatRows = squat.structuredSections!.flatMap((s) =>
      s.blocks.flatMap((b) => b.exercises),
    );
    expect(squatRows.find((r) => r.exerciseId === "knee_iso_push")?.displayPrescription).toBe(
      "3 × 5 × 1 s / stronę",
    );
    // In this two-week plan the squat/bench note comes up in its second, heavier week.
    expect(squatRows.find((r) => r.exerciseId === "barbell_bench_press")?.displayPrescription).toBe(
      "5 × 4",
    );
    expect(squatRows.find((r) => r.exerciseId === "face_pull_band")?.displayPrescription).toBe(
      "3 × 10",
    );
  });

  it("with enough time the whole note is planned, valid, in both loading weeks", () => {
    const options = { startDate: "2026-11-02", weeks: 4, minutesPerSession: 120 };
    const plan = generateTrainingPlan(athlete, options).plan;
    expect(validateTrainingPlan(plan, athlete, options)).toEqual([]);
    const sessions = plan
      .flatMap((d) => [d, d.secondSession])
      .filter((s): s is SessionDay => !!s?.engineV2?.advancedTemplate);
    const week2 = sessions.filter((s) => s.engineV2!.advancedTemplate === "N_squat_bench");
    expect(week2.length).toBe(2);
    const notes = week2.map((s) => asNote(s.engineV2 as EngineSession));
    expect(notes).toContainEqual(SQUAT_BENCH_WEEK_1);
    expect(notes).toContainEqual(SQUAT_BENCH_WEEK_2);
    for (const s of sessions) expect(s.engineV2!.strengthTimeOmissions).toBeUndefined();
  });

  it("the time of a group with unequal sets prices solo sets with the full round rest", () => {
    const r = buildAdvancedStrength(athlete, "A", "development", 0)!;
    const bench = r.exercises.find((e) => e.exerciseId === "barbell_bench_press")!;
    const facePull = r.exercises.find((e) => e.exerciseId === "face_pull_band")!;
    // Bench 4 sets against face pull 3: three rounds with a partner, the fourth alone.
    expect(bench.dose).toMatchObject({ sets: 4, pairedSets: 3, soloRestSeconds: 150 });
    expect(bench.dose.restSeconds).toBe(30);
    expect(bench.dose.postRestSeconds).toBe(150);
    expect(facePull.dose.sets).toBe(3);
    expect(facePull.dose.restSeconds).toBe(150);
    // Two solo sets (6 against 3): the rest after the first solo set is the round rest.
    const long = { ...bench, dose: { ...bench.dose, sets: 6 } };
    const asIfPaired = {
      ...long,
      dose: { ...long.dose, pairedSets: undefined, soloRestSeconds: undefined },
    };
    expect(estimateSeconds(long) - estimateSeconds(asIfPaired)).toBe(2 * (150 - 30));
  });
});
