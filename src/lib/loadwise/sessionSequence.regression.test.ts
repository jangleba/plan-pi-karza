import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import { compactPrescription } from "./sessionPresentation";
import { getExerciseDefinition } from "./exerciseLibrary";
import type { Profile, SessionDay } from "./types";
const base = {
  name: "Screen",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [1, 3],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: 7,
  matchDate: "2026-11-08",
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-02",
  seasonPhase: "inseason",
  seasonPhaseOverride: true,
  seasonStage: "match_week",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  equipment: [],
  homeEquipment: [],
  painInjury: false,
  gymExperienceLevel: "advanced",
  movementCompetence: "high",
  supervisionLevel: "none",
} as Profile;
const work = (s: SessionDay) =>
  s
    .structuredSections!.filter((s) => s.type === "main" || s.type === "accessory")
    .flatMap((s) => s.blocks.flatMap((b) => b.exercises));
describe("player screenshot regression: complete strength with a clear sequence", () => {
  it("keeps six purposeful work exercises, with the knee complement before isolation, for the blank-tenure screenshot", () => {
    const plan = generatePlan(base, new Date(2026, 10, 2), 7);
    const session = plan.find((s) => s.date === "2026-11-05")!,
      rows = work(session);
    expect(rows).toHaveLength(6);
    expect(rows.map((e) => e.exerciseId)).toEqual([
      "romanian_deadlift_db",
      "goblet_squat",
      "push_up",
      "one_arm_dumbbell_row",
      "side_plank",
      "standing_calf_raise",
    ]);
    expect(
      rows.some((e) =>
        ["power", "plyometric"].includes(getExerciseDefinition(e.exerciseId!)!.category),
      ),
    ).toBe(false);
    expect(rows.every((e) => !/^\d.* · \d+(?:[–-]\d+)?$/.test(compactPrescription(e)))).toBe(true);
    expect(compactPrescription(rows[0])).toBe("2 × 5–8 · 3–4 RIR");
    expect(base.strengthTrainingMonths).toBeUndefined();
  });
  it("uses available loaded pushing and controlled dynamic hamstring strength for a confirmed experienced adult in season", () => {
    const p = { ...base, strengthTrainingMonths: 36 };
    const plan = generatePlan(p, new Date(2026, 10, 2), 7);
    const a = plan.find((s) => s.title.includes("całe ciało A"))!,
      b = plan.find((s) => s.title.includes("całe ciało B"))!;
    expect(work(a).some((e) => e.exerciseId === "dumbbell_bench_press")).toBe(true);
    expect(work(a).some((e) => e.exerciseId?.includes("leg_curl"))).toBe(true);
    expect(getExerciseDefinition(work(b)[0].exerciseId!)?.movementPattern).toBe("hinge");
    expect(work(b)[1].exerciseId).toBe("goblet_squat");
    // Knee flexion is a different hamstring function from a hip hinge. The
    // experienced session can retain its controlled supplementary dose.
    expect(
      work(b).filter((e) => /leg_curl|nordic|hamstring_iso/.test(e.exerciseId ?? "")),
    ).toHaveLength(1);
  });
  it("prints one explicit RIR target instead of an unlabeled number or repeated load paragraph", () => {
    expect(
      compactPrescription({ id: "x", name: "Pompka", sets: "2", reps: "6–10", rir: "3" }),
    ).toBe("2 × 6–10 · 3 RIR");
    expect(
      compactPrescription({
        id: "x",
        name: "Przysiad",
        sets: "2",
        reps: "8",
        rir: "3–4 RIR",
        loadTarget: "Ciężar na 8 przy RPE 7",
      }),
    ).toBe("2 × 8 · 3–4 RIR");
  });
});
