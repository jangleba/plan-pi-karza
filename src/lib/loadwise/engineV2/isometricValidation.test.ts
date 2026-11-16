import { describe, expect, it } from "vitest";
import { generateTrainingPlan } from "./planner";
import { validateEngineSession } from "./validation";
import { sessionStartIssue } from "./planStatus";
import type { Profile, SessionDay } from "../types";

const athlete: Profile = {
  name: "Isometric contracts",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["barbell", "rack", "dumbbell", "fixed_pins", "band", "nordic_setup"],
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
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
  trainingMethodPreferences: { strength: "M14", coachedIsometricPrimer: true },
};

function session(profile = athlete, role: "strengthA" | "strengthB" = "strengthA"): SessionDay {
  const result = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 1 });
  const found = result.plan
    .flatMap((day) => [day, day.secondSession])
    .find((day) => day?.engineV2?.roles.includes(role));
  expect(found).toBeDefined();
  return structuredClone(found!);
}
const codes = (day: SessionDay, profile = athlete) =>
  validateEngineSession(day, profile).map((issue) => issue.code);

describe("isometric execution contracts", () => {
  it("prevents a new start of an invalid saved prescription while retaining a started snapshot", () => {
    const day = session();
    expect(sessionStartIssue({ session: day, profile: athlete, todayIso: day.date })).toBeNull();
    const rows = day.engineV2!.exercises;
    const [primer] = rows.splice(
      rows.findIndex((row) => row.role === "iso_primer"),
      1,
    );
    rows.push(primer);
    expect(
      sessionStartIssue({ session: day, profile: athlete, todayIso: day.date }),
    ).not.toBeNull();
    expect(
      sessionStartIssue({
        session: day,
        profile: athlete,
        todayIso: day.date,
        completion: { completed: false, status: "started", rpe: null, notes: "" },
      }),
    ).toBeNull();
  });
  it("accepts the existing supervised primer and separately prescribed holding support", () => {
    expect(codes(session())).toEqual([]);
    expect(codes(session(athlete, "strengthB"))).toEqual([]);
  });
  it("does not repurpose the maximal primer as a mobility or recovery task", () => {
    const day = session();
    day.engineV2!.roles = ["mobility"];
    expect(codes(day)).toContain("ISOMETRIC_PRIMER_ORDER");
  });

  it.each(["before_warmup", "after_power", "without_warmup"])(
    "rejects a correctly dosed primer in the wrong place: %s",
    (placement) => {
      const day = session();
      const rows = day.engineV2!.exercises;
      const [primer] = rows.splice(
        rows.findIndex((row) => row.role === "iso_primer"),
        1,
      );
      if (placement === "before_warmup") rows.unshift(primer);
      else if (placement === "after_power") {
        rows.splice(rows.findIndex((row) => row.role === "power") + 1, 0, primer);
      } else {
        day.engineV2!.exercises = [primer, ...rows.filter((row) => row.role !== "warmup")];
      }
      expect(codes(day)).toContain("ISOMETRIC_PRIMER_ORDER");
    },
  );

  it.each(["explosive", "controlled", "easy"] as const)(
    "does not reinterpret a hamstring hold as %s work",
    (intent) => {
      const day = session(athlete, "strengthB");
      day.engineV2!.exercises.find((row) => row.role === "hamstring_iso")!.dose.intent = intent;
      expect(codes(day)).toContain("ISOMETRIC_DOSE_MISMATCH");
    },
  );

  it("keeps holding support after the high-quality power and main strength work", () => {
    const day = session(athlete, "strengthB");
    const rows = day.engineV2!.exercises;
    const [hold] = rows.splice(
      rows.findIndex((row) => row.role === "hamstring_iso"),
      1,
    );
    rows.splice(
      rows.findIndex((row) => row.role === "power"),
      0,
      hold,
    );
    expect(codes(day)).toContain("ISOMETRIC_SUPPORT_ORDER");
  });

  it.each([undefined, 90, Number.NaN])(
    "does not lose the prescribed heel-dig angle: %s",
    (angle) => {
      const day = session(athlete, "strengthB");
      const row = day.engineV2!.exercises.find((item) => item.role === "hamstring_iso")!;
      row.exerciseId = "heel_dig_hamstring_iso_30";
      row.dose.jointAngleDegrees = angle;
      expect(codes(day)).toContain("ISOMETRIC_ANGLE_MISMATCH");
      row.dose.jointAngleDegrees = 30;
      expect(codes(day)).not.toContain("ISOMETRIC_ANGLE_MISMATCH");
    },
  );

  it.each([16, 17])("does not infer maximal primer readiness from youth age %s", (age) => {
    const profile = { ...athlete, age };
    const day = session(profile);
    expect(day.engineV2!.exercises.some((row) => row.role === "iso_primer")).toBe(false);
    expect(codes(day, profile)).toEqual([]);
  });
});
