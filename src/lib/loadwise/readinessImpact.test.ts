import { describe, expect, it } from "vitest";
import { generateTrainingPlan } from "./engineV2/planner";
import { gymAthlete } from "./engineV2/testFixtures";
import { buildReadiness } from "./readinessModel";
import { readinessImpact } from "./readinessImpact";
import { readinessKey } from "./engineV2/planStatus";
import type { Profile, SessionDay } from "./types";

const profile = { ...gymAthlete, goal: "strength" } as unknown as Profile;
const plan = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 1 }).plan;
const own = plan.flatMap((d) => [d, d.secondSession]).filter((s): s is SessionDay => !!s?.engineV2);
const strength = own.find((s) => s.engineV2!.roles.includes("strengthA"))!;
const sprint = own.find((s) => s.engineV2!.roles.includes("speed"))!;
const answers = (sleep: number, fatigue: number, soreness: number, pain = 0) =>
  buildReadiness("2026-11-02", {
    sleep,
    fatigue,
    soreness,
    jointPain: pain,
    painLocation: pain ? "knee" : null,
  });

describe("effect of a saved check-in on today's session", () => {
  it("uses the engine's own thresholds", () => {
    expect(readinessImpact(answers(8, 3, 2), strength).kind).toBe("none");
    expect(readinessImpact(answers(5, 6, 6), strength).kind).toBe("hold");
    const lighter = readinessImpact(answers(2, 9, 9), strength);
    expect(lighter.kind).toBe("lighter");
    expect(lighter.text).toContain("zaktualizuj plan");
  });

  it("after the session was recalculated for that very check-in it says what was done, not 'update the plan'", () => {
    const readiness = answers(2, 9, 9);
    const adjusted: SessionDay = {
      ...strength,
      readinessAdjustedDate: readiness.date,
      readinessAdjustmentKey: readinessKey(readiness),
      readinessAdjustment: {
        kind: "lighter",
        score: readiness.overall,
        reason: "test",
        changes: ["a"],
        beforeMinutes: 80,
        afterMinutes: 55,
      },
    };
    const impact = readinessImpact(readiness, adjusted);
    expect(impact.kind).toBe("adjusted");
    expect(impact.text).toContain("80 → 55 min");
    // A different later answer is not covered by the old correction.
    expect(readinessImpact(answers(8, 3, 2), adjusted).kind).not.toBe("adjusted");
  });

  it("pain pauses the own session; a red flag stops training whatever the session", () => {
    expect(readinessImpact(answers(8, 3, 2, 3), sprint).kind).toBe("paused");
    const flagged = buildReadiness("2026-11-02", {
      sleep: 8,
      fatigue: 3,
      soreness: 2,
      jointPain: 0,
      redFlags: ["fainting"],
    });
    expect(readinessImpact(flagged, null).kind).toBe("stop");
  });

  it("without an own session it changes nothing and says so", () => {
    const none = readinessImpact(answers(8, 3, 2), null);
    expect(none.kind).toBe("none");
    expect(none.text).toContain("nie masz sesji własnej");
    expect(readinessImpact(answers(8, 3, 2, 3), null).kind).toBe("paused");
  });

  it("agrees with the start gate: the lighter plan text appears exactly when the engine asks for it", () => {
    for (const [s, f, m] of [
      [8, 3, 2],
      [2, 9, 9],
      [5, 6, 6],
    ] as const) {
      const r = answers(s, f, m);
      const lighter = readinessImpact(r, strength).kind === "lighter";
      expect(lighter).toBe(r.overall <= 4);
    }
  });
});
