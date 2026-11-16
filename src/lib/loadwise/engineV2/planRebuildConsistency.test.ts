import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile, SessionCompletion, SessionDay } from "../types";
import type { GymObservation } from "./gymProgression";
import { generateTrainingPlan } from "./planner";
import { calibratePendingRunningPlan } from "./runningCalibration";
import { runningCalibrationKey } from "./runningCalibrationKey";
import { gymAthlete } from "./testFixtures";
import { proposeFeedbackAdjustment } from "./feedbackAdjustment";
import { gymPlanContext, type GymRecord } from "../gymEvidence";

const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const power = (plan: SessionDay[], date: string) =>
  plan
    .filter((d) => d.date === date)
    .flatMap(slots)
    .find((s) => s.engineV2?.roles.includes("strengthA"))
    // The reviewed gym jump; advanced A sessions also contain pogo and depth-jump pairs.
    ?.engineV2?.exercises.find((e) => e.role === "power" && e.exerciseId.startsWith("gym_cmj"));

function lostControlHistory(plan: SessionDay[]) {
  const done = plan.find((d) => d.engineV2?.roles.includes("strengthA"))!;
  const jump = done.engineV2!.exercises.find(
    (e) => e.role === "power" && e.exerciseId.startsWith("gym_cmj"),
  )!;
  const observation: GymObservation = {
    sessionId: "done-a",
    exerciseId: jump.exerciseId,
    source: "athlete_observed",
    sets: [{ setNumber: 1, side: "both", completed: 1, control: "lost" }],
  };
  const completion: SessionCompletion = {
    completed: true,
    status: "completed",
    rpe: 6,
    notes: "",
    writeVersion: 1,
    executionSnapshot: sessionFixture({
      dbId: "done-a",
      date: done.date,
      engineV2: structuredClone(done.engineV2!),
    }),
  };
  const record: GymRecord = {
    user_id: "owner",
    record_key: `observation:done-a:${jump.exerciseId}`,
    payload: {
      version: 1,
      kind: "observation",
      sessionId: "done-a",
      exerciseId: jump.exerciseId,
      observation,
    },
    revision: 1,
    updated_at: "2026-11-16T10:00:00Z",
    last_operation_id: "11111111-1111-4111-8111-111111111111",
  } as GymRecord;
  return { jump, completions: { "done-a": completion }, records: [record] };
}

describe("running recalibration keeps the gym decisions in force", () => {
  it("loss of control → accepted reduction → new MAS does not bring the banded jump back", () => {
    // Keep the trained resistance variant explicit; a layout's default jump is
    // not permission to transfer its execution evidence to another exercise.
    const trained: Profile = {
      ...gymAthlete,
      trainingMethodPreferences: { gymExercises: { powerA: "gym_cmj_resisted" } },
    };
    const start = { startDate: "2026-11-16", weeks: 3, minutesPerSession: 75 };
    const first = generateTrainingPlan(trained, { ...start, asOfDate: "2026-11-16" }).plan;
    expect(power(first, "2026-11-30")?.exerciseId).toBe("gym_cmj_resisted");
    const { jump, completions, records } = lostControlHistory(first);
    expect(jump.exerciseId).toBe("gym_cmj_resisted");
    const ctx = gymPlanContext(records);
    const reduced = generateTrainingPlan(trained, {
      ...start,
      asOfDate: "2026-11-17",
      previousPlan: first,
      completions,
      gymProgression: ctx.gymProgression,
      strengthLoadResponses: ctx.strengthLoadResponses,
    }).plan;
    const afterLoss = power(reduced, "2026-11-30")!;
    expect(afterLoss.exerciseId).toBe("gym_cmj");
    expect(afterLoss.dose).toMatchObject({ sets: 1, reps: 2 });
    for (const [i, d] of reduced.entries()) {
      d.dbId = `s${i}`;
      d.dayDbId = `d${i}`;
      d.planDbId = "plan1";
    }
    const measured = {
      ...trained,
      fieldMasKmh: 15.6,
      fieldMasTestedAt: "2026-11-17",
      fieldMasSourceSessionId: "verified-test",
      runningProgressionLevel: 0,
    } as Profile;
    const calibrated = calibratePendingRunningPlan({
      profile: measured,
      plan: reduced,
      completions,
      todayIso: "2026-11-17",
      gymProgression: ctx.gymProgression,
      strengthLoadResponses: ctx.strengthLoadResponses,
    });
    expect(calibrated).not.toBeNull();
    const pending = calibrated!
      .filter((d) => d.date >= "2026-11-17")
      .flatMap(slots)
      .filter((s) => s.engineV2?.roles.includes("endurance"));
    expect(pending.length).toBeGreaterThan(0);
    expect(
      pending.every((s) => s.engineV2?.runningCalibrationKey === runningCalibrationKey(measured)),
    ).toBe(true);
    const kept = power(calibrated!, "2026-11-30") ?? power(calibrated!, "2026-12-01");
    expect(kept?.exerciseId).toBe("gym_cmj");
    expect(kept?.dose).toMatchObject({ sets: 1, reps: 2 });
    // Without the shared context the old behaviour would have restored the banded 3x3 jump;
    // it is refused instead of being written without showing the athlete.
    const blind = calibratePendingRunningPlan({
      profile: measured,
      plan: reduced,
      completions,
      todayIso: "2026-11-17",
    });
    expect(blind).toBeNull();
  });
});

describe("order of events", () => {
  const measured = {
    ...gymAthlete,
    fieldMasKmh: 15.6,
    fieldMasTestedAt: "2026-11-17",
    fieldMasSourceSessionId: "verified-test",
    runningProgressionLevel: 0,
  } as Profile;

  it("a session started on another device is not rewritten while running is recalibrated", () => {
    const start = {
      startDate: "2026-11-16",
      weeks: 2,
      minutesPerSession: 75,
      asOfDate: "2026-11-17",
    };
    const plan = generateTrainingPlan(gymAthlete, start).plan;
    for (const [i, d] of plan.entries()) {
      d.dbId = `s${i}`;
      d.dayDbId = `d${i}`;
      d.planDbId = "plan1";
    }
    const started = plan.find((d) => d.date === "2026-11-18")!;
    expect(started.engineV2?.roles).toContain("strengthB");
    const completions = {
      [started.dbId!]: { completed: false, status: "started", rpe: null, notes: "" },
    } as Record<string, SessionCompletion>;
    const before = JSON.stringify(started.engineV2);
    const calibrated = calibratePendingRunningPlan({
      profile: measured,
      plan,
      completions,
      todayIso: "2026-11-17",
    });
    expect(calibrated).not.toBeNull();
    expect(JSON.stringify(calibrated!.find((d) => d.date === "2026-11-18")!.engineV2)).toBe(before);
  });

  it("offline club entry → sync → proposal: nothing is proposed until the server confirms", () => {
    const club = {
      ...gymAthlete,
      clubTrainingDays: [1],
      individualTrainingDays: [2, 3, 4, 5, 6, 7],
    };
    const plan = generateTrainingPlan(club, { startDate: "2026-11-02", weeks: 2 }).plan;
    for (const d of plan) {
      d.dayDbId = `day-${d.date}`;
      d.planDbId = "plan-1";
      slots(d).forEach((s, i) => {
        if (s.dayType !== "rest") s.dbId = `s-${d.date}-${i}`;
      });
    }
    const clubId = "s-2026-11-02-0";
    const entry = (writeVersion: number): Record<string, SessionCompletion> => ({
      [clubId]: {
        completed: true,
        status: "completed",
        rpe: 9,
        notes: "",
        durationMin: 90,
        durationSource: "club_default",
        activityTags: ["technical"],
        feedbackVersion: 1,
        endedAt: "2026-11-02T19:30:00Z",
        writeVersion,
      },
    });
    const propose = (completions: Record<string, SessionCompletion>, pending: boolean) =>
      proposeFeedbackAdjustment({
        profile: club,
        plan,
        completions,
        todayIso: "2026-11-03",
        planId: "plan-1",
        hasUnconfirmedWrites: pending,
      });
    // 1. saved offline: local entry (writeVersion 0), write queued
    expect(propose(entry(0), true)).toBeNull();
    // 2. the queue reports it synced but the local copy is still unconfirmed
    expect(propose(entry(0), false)).toBeNull();
    // 3. the server confirms (writeVersion 1) while another write is still unresolved
    expect(propose(entry(1), true)).toBeNull();
    // 4. everything confirmed: now the same feedback authorises one proposal
    expect(propose(entry(1), false)).not.toBeNull();
  });
});
