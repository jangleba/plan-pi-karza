import { describe, expect, it } from "vitest";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { proposeFeedbackAdjustment } from "./feedbackAdjustment";
import { lockedExecutionDays } from "./locks";
import { getPlanStatus, sessionStartIssue, todayTrainingState } from "./planStatus";
import { buildPlanSummary } from "../planSummary";
import { draftNextPlan, emptyAnswers } from "../nextPlanInterview";
import { sessionPrescription } from "../planIdentity";
import { clubDuration, estimatedSessionLoad } from "../sessionFeedback";
import { planFuelContexts } from "../../fuel/experience";
import type { Profile, SessionCompletion, SessionDay } from "../types";

const profile = {
  name: "Flow athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [1],
  individualTrainingDays: [2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: ["Hantle", "Ławka"],
  unavailableEquipmentIds: [],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
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
} as unknown as Profile;
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const own = (d: SessionDay) => slots(d).filter((s) => s.engineV2);

describe("plan → start → resume → finish → feedback → correction → progress → end → interview → next plan", () => {
  it("keeps one saved plan, protects history and carries the cycle into the next plan", () => {
    // 1. plan, as saved (identities assigned by the write)
    const plan = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 4 }).plan;
    for (const d of plan) {
      d.dayDbId = `day-${d.date}`;
      d.planDbId = "plan-1";
      slots(d).forEach((s, i) => {
        if (s.dayType !== "rest") s.dbId = `s-${s.date}-${i}`;
      });
    }
    expect(
      validateTrainingPlan(plan, profile, { startDate: "2026-11-02", minutesPerSession: 75 }),
    ).toEqual([]);

    // 2. club Monday finished with the fixed 90 minutes, RPE 8 and two categories
    const completions: Record<string, SessionCompletion> = {
      "s-2026-11-02-0": {
        completed: true,
        status: "completed",
        rpe: 8,
        notes: "",
        ...clubDuration(undefined),
        activityTags: ["running_endurance", "technical"],
        feedbackVersion: 1,
        endedAt: "2026-11-02T19:30:00Z",
      },
    };
    expect(completions["s-2026-11-02-0"]).toMatchObject({
      durationMin: 90,
      durationSource: "club_default",
    });
    expect(
      estimatedSessionLoad({ ...completions["s-2026-11-02-0"] } as SessionCompletion, "club").value,
    ).toBe(720);

    // 3. Tuesday's session is started; reopening (another device / refresh) shows the same dose
    const tuesday = plan.find((d) => d.date === "2026-11-03")!;
    const started = own(tuesday)[0];
    expect(
      sessionStartIssue({
        session: started,
        profile,
        todayIso: "2026-11-03",
        completion: undefined,
      }),
    ).toBeNull();
    completions[started.dbId!] = {
      completed: false,
      status: "started",
      rpe: null,
      notes: "",
      startedAt: "2026-11-03T17:00:00Z",
      executionSnapshot: JSON.parse(JSON.stringify(started)),
    };
    const resumed = completions[started.dbId!].executionSnapshot!;
    expect(sessionPrescription(resumed)).toBe(sessionPrescription(started));
    expect(todayTrainingState(plan, completions, "2026-11-03").session?.dbId).toBeTruthy();

    // 4. the hard club session proposes a correction of upcoming unstarted sessions only
    const proposal = proposeFeedbackAdjustment({
      profile,
      plan,
      completions,
      todayIso: "2026-11-03",
      planId: "plan-1",
    })!;
    expect(proposal).toBeTruthy();
    expect(proposal.affectedSessionIds).not.toContain(started.dbId);
    const frozen = lockedExecutionDays(plan, completions).filter((d) => d.date >= "2026-11-03");
    for (const f of frozen) {
      const kept = proposal.candidatePlan.find((d) => d.date === f.date)!;
      expect(kept.dbId).toBe(f.dbId);
      expect(sessionPrescription(kept)).toBe(sessionPrescription(f));
    }
    // beyond the nearest week nothing is rewritten
    for (const d of plan.filter((x) => x.date >= "2026-11-10"))
      expect(JSON.stringify(proposal.candidatePlan.find((x) => x.date === d.date))).toBe(
        JSON.stringify(d),
      );

    // 5. after acceptance every screen reads the same saved plan (Fuel included)
    const saved = [...plan.filter((d) => d.date < "2026-11-03"), ...proposal.candidatePlan];
    for (const change of proposal.changes) {
      const before = planFuelContexts(plan, change.before.date, completions).length;
      const after = planFuelContexts(saved, change.before.date, completions).length;
      expect(after).toBeLessThanOrEqual(before + 1);
    }
    expect(
      proposeFeedbackAdjustment({
        profile,
        plan: saved,
        completions,
        todayIso: "2026-11-03",
        planId: "plan-1",
      }),
    ).toBeNull();

    // 6. the window ends: progress summary, separate columns, no invented improvement
    const status = getPlanStatus({ plan: saved, profile, todayIso: "2026-12-02", completions });
    expect(status.kind).toBe("expired");
    const summary = buildPlanSummary({
      profile,
      plan: saved,
      completions,
      history: [],
      readiness: {},
      todayIso: "2026-12-02",
    })!;
    expect(summary.club.completed).toBe(1);
    expect(summary.club.loadUsesAssumedMinutes).toBe(true);
    expect(summary.comparable.join(" ")).toContain("Sama frekwencja nie oznacza poprawy");

    // 7. interview: less time and a missing machine change the next plan
    const draft = draftNextPlan(
      profile,
      75,
      { ...emptyAnswers(), barriers: ["time", "equipment"], unavailableEquipment: ["bench"] },
      new Set(["minutes", "equipment"]),
    );
    expect(draft.minutes).toBe(60);
    expect(draft.profile.unavailableEquipmentIds).toEqual(["bench"]);

    // 8. next plan: from the end of the old one, cycle continued, budget respected, history untouched
    const next = generateTrainingPlan(draft.profile, {
      startDate: "2026-12-02",
      weeks: 4,
      minutesPerSession: draft.minutes,
      previousPlan: saved,
      completions,
      lockedDays: lockedExecutionDays(saved, completions),
      precedingDays: saved.filter((d) => d.date < "2026-12-02"),
    });
    expect(next.plan[0].date).toBe("2026-12-02");
    for (const s of next.plan.flatMap(own)) expect(s.engineV2!.minutes).toBeLessThanOrEqual(60);
    const first = next.plan.flatMap(own).find((s) => s.engineV2!.cycle)!;
    expect(first.engineV2!.cycle!.anchorDate).toBe("2026-11-02");
    expect(first.engineV2!.cycle!.weekIndex).toBeGreaterThanOrEqual(4);
    // history: the started session of the old plan is unchanged
    expect(sessionPrescription(saved.find((d) => d.date === "2026-11-03")!)).toBe(
      sessionPrescription(tuesday),
    );
  });
});
