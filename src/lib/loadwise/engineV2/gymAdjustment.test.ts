import { describe, it, expect } from "vitest";
import type { Profile, SessionCompletion, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { proposeGymAdjustment } from "./gymAdjustment";
import { strengthLandingCount } from "./gymPower";
import { isStrengthSession } from "../strengthCheckIn";
import { gymRecordKey, type GymRecord, type GymEquipment } from "../gymEvidence";
import { strengthWeekContext } from "./strengthPolicy";

const p: Profile = {
  name: "Gym adjustment",
  age: 20,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: ["barbell", "rack", "dumbbell", "bench", "band", "machine", "gym_jump_lane"],
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
};
function fixture() {
  const plan = generateTrainingPlan(p, {
    startDate: "2026-11-16",
    weeks: 2,
    expectedPlanId: "plan",
  }).plan.map((d) => ({
    ...d,
    dbId: crypto.randomUUID(),
    dayDbId: crypto.randomUUID(),
    planDbId: "plan",
  }));
  const strength = plan.find(isStrengthSession)!;
  const completions: Record<string, SessionCompletion> = {};
  for (const date of ["2026-11-12", "2026-11-14"]) {
    const id = crypto.randomUUID();
    completions[id] = {
      completed: true,
      status: "completed",
      rpe: 9,
      notes: "",
      writeVersion: 1,
      executionSnapshot: { ...structuredClone(strength), date, dbId: id, secondSession: null },
    };
  }
  return { profile: p, plan, completions, records: [], todayIso: "2026-11-16", planId: "plan" };
}
describe("reviewable updates of pending A/B sessions", () => {
  it("counts a completed lighter preference from today immediately, without counting it twice", () => {
    const input = fixture();
    const completion = Object.values(input.completions)[0];
    completion.executionSnapshot!.date = input.todayIso;
    completion.executionSnapshot!.strengthCheckIn = {
      version: 1,
      loadPreference: "lighter",
      date: input.todayIso,
      recordedAt: `${input.todayIso}T10:00:00Z`,
    };
    const ctx = strengthWeekContext(p, "2026-11-18", {
      startDate: input.todayIso,
      asOfDate: input.todayIso,
      completions: input.completions,
      strengthLoadResponses: [
        {
          kind: "response",
          version: 1,
          prescriptionKey: "dose",
          suggestionKey: "proposal",
          chosenKg: 75,
          equipment: {
            kind: "equipment",
            version: 1,
            id: crypto.randomUUID(),
            exerciseId: completion.executionSnapshot!.engineV2!.exercises.find(
              (e) => e.role === "knee_strength",
            )!.exerciseId,
            label: "Sztanga",
            convention: "total",
            incrementKg: 2.5,
          },
          sessionId: completion.executionSnapshot!.dbId!,
          exerciseId: completion.executionSnapshot!.engineV2!.exercises.find(
            (e) => e.role === "knee_strength",
          )!.exerciseId,
          decision: "lighter",
        },
      ],
    });
    expect(ctx.lighterRequests).toBe(1);
  });
  it("reacts to confirmed feedback, keeps dates and other training intact, and validates the entire plan", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const result = proposeGymAdjustment(input);
    expect(result).not.toBeNull();
    expect(result!.changes.length).toBeGreaterThan(0);
    expect(JSON.stringify(input)).toBe(before);
    expect(result!.candidatePlan.map((d) => d.date)).toEqual(input.plan.map((d) => d.date));
    for (let i = 0; i < input.plan.length; i++)
      if (!isStrengthSession(input.plan[i]))
        expect(result!.candidatePlan[i]).toEqual(input.plan[i]);
    expect(
      validateTrainingPlan(result!.candidatePlan, p, {
        startDate: input.plan[0].date,
        minutesPerSession: 75,
        sessionDurationMode: result!.sessionDurationMode,
      }),
    ).toEqual([]);
    expect(result!.changes.every((c) => c.before.date === c.after?.date)).toBe(true);
    expect(result!.candidatePlan.filter((d) => d.date > "2026-11-22")).toEqual(
      input.plan.filter((d) => d.date > "2026-11-22"),
    );
  });
  it("protects a whole day when a primary or second slot has already started", () => {
    const input = fixture(),
      s = input.plan.find(isStrengthSession)!;
    input.completions[s.dbId!] = {
      completed: false,
      status: "started",
      rpe: null,
      notes: "",
      writeVersion: 1,
      executionSnapshot: structuredClone(s),
    };
    const result = proposeGymAdjustment(input);
    expect(result?.candidatePlan.find((d) => d.date === s.date) ?? s).toEqual(s);
    expect(result?.changes.some((c) => c.sessionId === s.dbId) ?? false).toBe(false);
  });
  it("leaves manual dates and unconfirmed completions alone", () => {
    const input = fixture();
    expect(
      proposeGymAdjustment({ ...input, modifiedDates: new Set(input.plan.map((d) => d.date)) }),
    ).toBeNull();
    Object.values(input.completions).forEach((c) => (c.writeVersion = 0));
    expect(proposeGymAdjustment(input)).toBeNull();
  });
  it("does not use unconfirmed writes to update future sessions", () => {
    expect(proposeGymAdjustment({ ...fixture(), hasUnconfirmedWrites: true })).toBeNull();
  });
  it("uses two explicit smaller main-lift choices without calling them failed sets", () => {
    const input = fixture();
    Object.values(input.completions).forEach((c) => {
      c.rpe = 6;
      // Only the main-lift answers are under test: the completed note sessions' jumps would
      // otherwise (correctly) trigger the rolling 7-day landing limit on their own.
      const e = c.executionSnapshot!.engineV2!;
      e.exercises = e.exercises.filter((x) => strengthLandingCount([x]) === 0);
    });
    const records: GymRecord[] = Object.entries(input.completions).map(([sid, c]) => {
      const id = c.executionSnapshot!.engineV2!.exercises.find(
        (e) => e.role === "knee_strength",
      )!.exerciseId;
      const equipment: GymEquipment = {
        kind: "equipment",
        version: 1,
        id: "10000000-0000-4000-8000-000000000001",
        exerciseId: id,
        label: "Sztanga",
        convention: "total",
        incrementKg: 2.5,
      };
      const payload = {
        kind: "response" as const,
        version: 1 as const,
        sessionId: sid,
        exerciseId: id,
        prescriptionKey: "dose",
        suggestionKey: "proposal",
        decision: "lighter" as const,
        chosenKg: 75,
        suggestedKg: 80,
        reason: "not_ready" as const,
        equipment,
      };
      return {
        user_id: "u",
        record_key: gymRecordKey(payload),
        payload,
        revision: 1,
        last_operation_id: crypto.randomUUID(),
        updated_at: c.executionSnapshot!.date,
      };
    });
    const result = proposeGymAdjustment({ ...input, records });
    expect(result).not.toBeNull();
    expect(
      result!.candidatePlan
        .filter((d) => d.date <= "2026-11-22" && isStrengthSession(d))
        .every((s) => s.engineV2?.strengthFocus?.mode === "maintenance"),
    ).toBe(true);
    expect(result!.changes.every((c) => c.details?.length)).toBe(true);
    records.forEach((r) => {
      if (r.payload.kind === "response") r.payload.decision = "hold";
    });
    expect(proposeGymAdjustment({ ...input, records })).toBeNull();
  });
  it("does not re-apply a completed proposal or stack an increase from planned sessions", () => {
    const input = fixture(),
      result = proposeGymAdjustment(input)!;
    const saved = result.candidatePlan.map((d) => ({
      ...d,
      dbId: d.dbId ?? crypto.randomUUID(),
      planDbId: "next",
    }));
    expect(proposeGymAdjustment({ ...input, plan: saved, planId: "next" })).toBeNull();
  });
  it("rejects a plan whose profile changed and keeps existing A/B roles", () => {
    const input = fixture();
    expect(proposeGymAdjustment({ ...input, profile: { ...p, goal: "speed" } })).toBeNull();
    const result = proposeGymAdjustment(input)!;
    const roles = (a: SessionDay[]) => a.filter(isStrengthSession).map((s) => s.engineV2!.roles);
    expect(roles(result.candidatePlan)).toEqual(roles(input.plan));
  });
});
