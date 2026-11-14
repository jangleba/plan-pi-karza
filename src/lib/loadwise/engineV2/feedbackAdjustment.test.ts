import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_POLICY,
  appliedProposalIds,
  proposalIdFor,
  proposeFeedbackAdjustment,
  type AdjustmentProposal,
} from "./feedbackAdjustment";
import { generateTrainingPlan, removeOwnSession, validateTrainingPlan } from "./planner";
import { lockedExecutionDays } from "./locks";
import type { Profile, SessionCompletion, SessionDay } from "../types";

const base = {
  name: "Feedback athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [1],
  individualTrainingDays: [2, 3, 4, 5, 6, 7],
  unavailableDays: [],
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
    "med_ball",
    "nordic_setup",
  ],
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

const CLUB_DATE = "2026-11-02"; // Monday
const TODAY = "2026-11-03";
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];

/** A saved plan: every slot gets identities like the persisted one. */
function savedPlan(p: Profile): SessionDay[] {
  const plan = generateTrainingPlan(p, { startDate: CLUB_DATE, weeks: 2 }).plan;
  for (const d of plan) {
    d.dayDbId = `day-${d.date}`;
    d.planDbId = "plan-1";
    slots(d).forEach((s, i) => {
      if (s.dayType !== "rest") s.dbId = `s-${s.date}-${i}`;
    });
  }
  return plan;
}
const clubId = `s-${CLUB_DATE}-0`;
const clubDone = (patch: Partial<SessionCompletion> = {}): Record<string, SessionCompletion> => ({
  [clubId]: {
    completed: true,
    status: "completed",
    rpe: 8,
    notes: "",
    durationMin: 90,
    durationSource: "club_default",
    activityTags: ["technical"],
    feedbackVersion: 1,
    endedAt: `${CLUB_DATE}T19:30:00Z`,
    ...patch,
  },
});
const propose = (
  p: Profile,
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
  extra: Partial<Parameters<typeof proposeFeedbackAdjustment>[0]> = {},
) =>
  proposeFeedbackAdjustment({
    profile: p,
    plan,
    completions,
    todayIso: TODAY,
    planId: "plan-1",
    ...extra,
  });
const issuesOf = (proposal: AdjustmentProposal, p: Profile) =>
  validateTrainingPlan(proposal.candidatePlan, p, {
    startDate: TODAY,
    minutesPerSession: proposal.minutesPerSession,
  });

describe("feedback-based adjustment proposals", () => {
  it("pins the product policy as an explicit, versioned object", () => {
    expect(DEFAULT_FEEDBACK_POLICY).toMatchObject({ hardRpe: 8, windowHours: 48, horizonDays: 7 });
    expect(DEFAULT_FEEDBACK_POLICY.version).toMatch(/^feedback-policy-/);
  });

  it("proposes nothing for RPE below the threshold, a missing RPE, or an unfinished club", () => {
    const plan = savedPlan(base);
    expect(propose(base, plan, clubDone({ rpe: 7 }))).toBeNull();
    expect(propose(base, plan, clubDone({ rpe: null }))).toBeNull();
    expect(propose(base, plan, clubDone({ completed: false, status: "started" }))).toBeNull();
    expect(propose(base, plan, {})).toBeNull();
  });

  it("after a hard club session proposes a validated change to the next unexecuted session", () => {
    const plan = savedPlan(base);
    const proposal = propose(base, plan, clubDone())!;
    expect(proposal).toBeTruthy();
    expect(proposal.id).toBe(proposalIdFor(clubId, clubDone()[clubId]));
    expect(proposal.sourceSessionId).toBe(clubId);
    expect(proposal.changes.length).toBeGreaterThan(0);
    expect(proposal.reason).toContain("Po ciężkim treningu klubowym");
    // 48 h window from the club date, seven-day horizon from today
    for (const c of proposal.changes) {
      expect(c.before.date >= CLUB_DATE && c.before.date <= "2026-11-04").toBe(true);
      expect(["reschedule", "lighter", "compact", "skip"]).toContain(c.kind);
      expect(c.line.length).toBeGreaterThan(5);
    }
    expect(proposal.affectedSessionIds).toEqual(proposal.changes.map((c) => c.sessionId));
    expect(proposal.candidatePlan[0].date).toBe(TODAY);
    // nothing outside the 7-day horizon is rewritten
    const original = plan.filter((d) => d.date >= "2026-11-10");
    for (const d of original)
      expect(JSON.stringify(proposal.candidatePlan.find((x) => x.date === d.date))).toBe(
        JSON.stringify(d),
      );
    expect(issuesOf(proposal, base)).toEqual([]);
  });

  it("is deterministic and pure: the same input gives the same proposal and never mutates the plan", () => {
    const plan = savedPlan(base);
    const before = JSON.stringify(plan);
    const a = propose(base, plan, clubDone())!;
    const b = propose(base, plan, clubDone())!;
    expect(JSON.stringify(plan)).toBe(before);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.id).toBe(b.id);
  });

  it("a changed RPE makes a different proposal id; storing the same value again does not", () => {
    const plan = savedPlan(base);
    const first = propose(base, plan, clubDone({ rpe: 8 }))!;
    const again = propose(base, plan, clubDone({ rpe: 8, endedAt: "2026-11-02T21:00:00Z" }))!;
    const other = propose(base, plan, clubDone({ rpe: 9 }))!;
    expect(again.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
  });

  it("an applied proposal is recorded in the plan and is not proposed twice", () => {
    const plan = savedPlan(base);
    const first = propose(base, plan, clubDone())!;
    const applied = [...plan.filter((d) => d.date < TODAY), ...first.candidatePlan];
    expect(appliedProposalIds(applied).has(first.id)).toBe(true);
    expect(propose(base, applied, clubDone())).toBeNull();
    // changed feedback voids the old id: a new proposal may follow
    expect(propose(base, applied, clubDone({ rpe: 10 }))?.id).not.toBe(first.id);
  });

  it("never touches a started or completed session and ignores it as a trigger target", () => {
    const plan = savedPlan(base);
    const tue = plan.find((d) => d.date === TODAY)!;
    const target = slots(tue).find(
      (s) => s.engineV2 && s.engineV2.roles[0].startsWith("strength"),
    )!;
    const completions = {
      ...clubDone(),
      [target.dbId!]: {
        completed: false,
        status: "started",
        rpe: null,
        notes: "",
      } as SessionCompletion,
    };
    const proposal = propose(base, plan, completions);
    expect(proposal?.affectedSessionIds ?? []).not.toContain(target.dbId);
    if (proposal) {
      const frozen = lockedExecutionDays(plan, completions).filter((d) => d.date >= TODAY);
      for (const f of frozen)
        expect(JSON.stringify(proposal.candidatePlan.find((d) => d.date === f.date)?.dbId)).toBe(
          JSON.stringify(f.dbId),
        );
    }
  });

  it("technical work at RPE 9 can lighten the next sessions but never credits endurance", () => {
    const profile = { ...base, goal: "endurance" } as Profile;
    const plan = savedPlan(profile);
    const proposal = propose(profile, plan, clubDone({ rpe: 9, activityTags: ["technical"] }));
    expect(proposal?.changes.some((c) => c.kind === "external_credit") ?? false).toBe(false);
    expect(proposal && issuesOf(proposal, profile)).toEqual([]);
    expect(proposal!.candidatePlan.flatMap((d) => d.externalGoalCredits ?? [])).toEqual([]);
  });

  it("does not replace the main endurance session, intervals, a MAS test or sprint by RPE alone", () => {
    const profile = { ...base, goal: "endurance" } as Profile;
    const plan = savedPlan(profile);
    const proposal = propose(
      profile,
      plan,
      clubDone({ rpe: 6, activityTags: ["running_endurance"] }),
    )!;
    expect(proposal).toBeTruthy();
    const credit = proposal.changes.find((c) => c.kind === "external_credit")!;
    const removed = plan.flatMap(slots).find((s) => s.dbId === credit.sessionId)!;
    expect(removed.engineV2!.roles).toEqual(["endurance"]);
    expect((removed.runningRecipe ?? removed.engineV2!.runningRecipe)?.method).toBe(
      "easy_continuous",
    );
    // the first (main) endurance session of the week stays
    const weekEndurance = plan
      .filter((d) => d.date >= CLUB_DATE && d.date <= "2026-11-08")
      .flatMap(slots)
      .filter((s) => s.engineV2?.roles.includes("endurance"));
    expect(weekEndurance.length).toBe(2);
    expect(credit.sessionId).not.toBe(weekEndurance[0].dbId);
    // credit is a separate, external_reported record; no fabricated completed session
    const credits = proposal.candidatePlan.flatMap((d) => d.externalGoalCredits ?? []);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({
      goal: "endurance",
      status: "external_reported",
      sourceSessionId: clubId,
      rpe: 6,
    });
    expect(credit.line).toContain("Uwzględniono zgłoszoną pracę wydolnościową w klubie");
    expect(issuesOf(proposal, profile)).toEqual([]);
  });

  it("RPE 5 qualifies a running club session, RPE 4 does not, and the label is required", () => {
    const profile = { ...base, goal: "endurance" } as Profile;
    const plan = savedPlan(profile);
    const credited = (rpe: number, tags: SessionCompletion["activityTags"]) =>
      propose(profile, plan, clubDone({ rpe, activityTags: tags }))?.changes.some(
        (c) => c.kind === "external_credit",
      ) ?? false;
    expect(credited(5, ["running_endurance"])).toBe(true);
    expect(credited(4, ["running_endurance"])).toBe(false);
    expect(credited(6, ["running_endurance", "technical", "tactical_game"])).toBe(true);
    expect(credited(6, ["technical"])).toBe(false);
    expect(credited(6, [])).toBe(false);
    // legacy: explicit running_endurance type counts, mixed does not
    expect(
      propose(
        profile,
        plan,
        clubDone({ rpe: 6, activityTags: null, activityType: "running_endurance" }),
      )?.changes.some((c) => c.kind === "external_credit"),
    ).toBe(true);
    expect(
      propose(profile, plan, clubDone({ rpe: 6, activityTags: null, activityType: "mixed" })),
    ).toBeNull();
  });

  it("a club session replaces only one goal and a return route keeps its mandatory run", () => {
    const profile = { ...base, goal: "endurance" } as Profile;
    const plan = savedPlan(profile);
    const first = propose(
      profile,
      plan,
      clubDone({ rpe: 6, activityTags: ["running_endurance"] }),
    )!;
    const applied = [...plan.filter((d) => d.date < TODAY), ...first.candidatePlan];
    // same club, a different signature, but the credit is already attributed
    const next = propose(
      profile,
      applied,
      clubDone({ rpe: 7, activityTags: ["running_endurance"] }),
    );
    expect(next?.changes.some((c) => c.kind === "external_credit") ?? false).toBe(false);
    const reduced = { ...base, goal: "return" } as Profile;
    const reducedPlan = savedPlan(reduced);
    expect(
      propose(
        reduced,
        reducedPlan,
        clubDone({ rpe: 7, activityTags: ["running_endurance"] }),
      )?.changes.some((c) => c.kind === "external_credit") ?? false,
    ).toBe(false);
  });

  it("a match needs played minutes: zero minutes never opens a proposal", () => {
    const profile = { ...base, matchDates: ["2026-11-02"], clubTrainingDays: [] } as Profile;
    const plan = savedPlan(profile);
    const match = plan.find((d) => d.date === CLUB_DATE)!;
    expect(match.dayType).toBe("match");
    match.dbId = "m1";
    const done = (minutes: number | null): Record<string, SessionCompletion> => ({
      m1: {
        completed: true,
        status: "completed",
        rpe: 9,
        notes: "",
        durationMin: 120,
        matchMinutesPlayed: minutes,
        feedbackVersion: 1,
        endedAt: `${CLUB_DATE}T20:00:00Z`,
      },
    });
    expect(propose(profile, plan, done(0))).toBeNull();
    expect(propose(profile, plan, done(null))).toBeNull();
  });

  it("a match combines played minutes with RPE: a short cameo or a long easy match is not 'hard'", () => {
    const profile = { ...base, matchDates: ["2026-11-02"], clubTrainingDays: [] } as Profile;
    const plan = savedPlan(profile);
    plan.find((d) => d.date === CLUB_DATE)!.dbId = "m1";
    const done = (rpe: number, minutes: number): Record<string, SessionCompletion> => ({
      m1: {
        completed: true,
        status: "completed",
        rpe,
        notes: "",
        matchMinutesPlayed: minutes,
        feedbackVersion: 1,
        endedAt: `${CLUB_DATE}T20:00:00Z`,
      },
    });
    // load = minutes × RPE must reach the policy value, and RPE must not be tiny
    expect(DEFAULT_FEEDBACK_POLICY.matchLoadAu).toBe(240);
    expect(propose(profile, plan, done(10, 0))).toBeNull(); // did not play
    expect(propose(profile, plan, done(9, 10))).toBeNull(); // 90 AU cameo
    expect(propose(profile, plan, done(3, 90))).toBeNull(); // long, but RPE below the floor
    // 80 min at RPE 7 (560 AU) qualifies although RPE alone is below the club threshold of 8
    const proposal = propose(profile, plan, done(7, 80))!;
    expect(proposal.reason).toContain("Po meczu (80 min gry, RPE 7)");
    expect(proposal.sourceKind).toBe("match");
    expect(proposal.changes.length).toBeGreaterThan(0);
    expect(issuesOf(proposal, profile)).toEqual([]);
  });

  it("returns nothing when the plan does not cover today, is stale for the profile, or has overlays", () => {
    const plan = savedPlan(base);
    expect(
      propose(
        base,
        plan.filter((d) => d.date !== TODAY),
        clubDone(),
      ),
    ).toBeNull();
    expect(propose({ ...base, level: "beginner" } as Profile, plan, clubDone())).toBeNull();
    expect(propose(base, plan, clubDone(), { hasModificationsInWindow: true })).toBeNull();
  });

  it("uses the ladder in order: reschedule, then a lighter or compact variant, only then a skip", () => {
    const opts = { startDate: TODAY, minutesPerSession: 75 };
    // 1. slack in the week: the same session moves to a later allowed date, outside the 48 h
    const roomy = { ...base, goal: "speed", individualTrainingDays: [2, 3, 6] } as Profile;
    let slack = savedPlan(roomy).filter((d) => d.date < "2026-11-10");
    for (const d of slack.filter((x) => x.date > "2026-11-03"))
      for (const s of slots(d))
        if (s.engineV2 && s.dbId) slack = removeOwnSession(slack, s.dbId, roomy, opts) ?? slack;
    const moved = propose(roomy, slack, clubDone({ rpe: 9 }))!;
    expect(moved.changes.map((c) => c.kind)).toEqual(["reschedule"]);
    expect(moved.changes[0].after!.date > "2026-11-04").toBe(true);
    expect(issuesOf(moved, roomy)).toEqual([]);
    // the old identity is retired and the target day gets the same prescription
    const target = moved.candidatePlan.find((d) => d.date === moved.changes[0].after!.date)!;
    expect(slots(target).some((s) => s.engineV2?.roles.includes("strengthA"))).toBe(true);
    expect(
      moved.candidatePlan.flatMap(slots).some((s) => s.dbId === moved.changes[0].sessionId),
    ).toBe(false);

    // 2. a full week: a lighter variant on the same day
    const lighter = propose(base, savedPlan(base), clubDone())!;
    expect(lighter.changes[0].kind).toBe("lighter");
    expect(lighter.changes[0].after!.minutes).toBeLessThan(lighter.changes[0].before.minutes);

    // 3. an already reduced route has no lighter variant: the compact strength variant is used
    const tired = { ...base, secondaryLimiter: "fatigue" } as Profile;
    expect(propose(tired, savedPlan(tired), clubDone())!.changes[0].kind).toBe("compact");
  });

  it("skips only a session that is not the main goal, and only when nothing lighter exists", () => {
    const speed = { ...base, goal: "speed", secondaryLimiter: "fatigue" } as Profile;
    const plan = savedPlan(speed);
    const tue = plan.find((d) => d.date === TODAY)!;
    const strength = slots(tue).find((s) => s.engineV2?.roles.includes("strengthA"))!;
    // 28 min: no compact variant exists below 30 min, the reduced route is already reduced
    strength.engineV2!.minutes = 28;
    const proposal = propose(speed, plan, clubDone())!;
    const skip = proposal.changes.find((c) => c.sessionId === strength.dbId)!;
    expect(skip.kind).toBe("skip");
    expect(skip.after).toBeNull();
    expect(issuesOf(proposal, speed)).toEqual([]);
    // the same situation with the main goal never skips it
    const strengthGoal = { ...base, secondaryLimiter: "fatigue" } as Profile;
    const own = savedPlan(strengthGoal);
    slots(own.find((d) => d.date === TODAY)!).find((s) =>
      s.engineV2?.roles.includes("strengthA"),
    )!.engineV2!.minutes = 28;
    expect(
      propose(strengthGoal, own, clubDone())?.changes.some((c) => c.kind === "skip") ?? false,
    ).toBe(false);
  });
});
