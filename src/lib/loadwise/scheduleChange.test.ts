import { describe, expect, it } from "vitest";
import { describeScheduleChanges, windowDiff } from "./scheduleChange";
import { generateTrainingPlan } from "./engineV2/planner";
import { getPlanStatus } from "./engineV2/planStatus";
import type { Profile } from "./types";

const profile = {
  name: "Change athlete",
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
  matchDates: ["2026-11-07"],
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
const generate = (p: Profile, minutes = 75) =>
  generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 2, minutesPerSession: minutes }).plan;

describe("schedule change proposals", () => {
  it("a generated plan records the inputs it was built from", () => {
    expect(generate(profile)[0].planInputs).toMatchObject({
      matchDates: ["2026-11-07"],
      individualTrainingDays: [2, 3, 4, 5, 6, 7],
      clubTrainingDays: [1],
      minutesPerSession: 75,
    });
  });

  it("names a moved match, changed days, club days, time and equipment", () => {
    const saved = generate(profile)[0].planInputs;
    const lines = describeScheduleChanges(
      saved,
      {
        ...profile,
        matchDates: ["2026-11-08"],
        individualTrainingDays: [3, 5],
        clubTrainingDays: [2],
        equipment: ["Ławka"],
        unavailableEquipmentIds: ["bench"],
      } as Profile,
      45,
      "2026-11-03",
    );
    expect(lines.map((l) => l.kind)).toEqual(["match", "days", "club", "minutes", "equipment"]);
    expect(lines[0].line).toContain("7.11 → 8.11");
    expect(lines[3].line).toBe("Czas na jednostkę: 75 → 45 min.");
    expect(lines[4].line).toContain("brak Hantle");
  });

  it("names nothing when nothing changed, and nothing for a plan without recorded inputs", () => {
    const saved = generate(profile)[0].planInputs;
    expect(describeScheduleChanges(saved, profile, 75, "2026-11-03")).toEqual([]);
    expect(describeScheduleChanges(undefined, profile, 45)).toEqual([]);
  });

  it("a match that already passed is not reported as a change", () => {
    const saved = generate(profile)[0].planInputs;
    expect(
      describeScheduleChanges(saved, { ...profile, matchDates: [] } as Profile, 75, "2026-11-10"),
    ).toEqual([]);
  });

  it("a changed match day makes the plan stale and the preview differs only in the affected days", () => {
    const saved = generate(profile);
    const changed = { ...profile, matchDates: ["2026-11-05"] } as Profile;
    expect(getPlanStatus({ plan: saved, profile: changed, todayIso: "2026-11-03" })).toMatchObject({
      kind: "stale",
      staleReason: "profile",
    });
    const preview = generate(changed);
    const diff = windowDiff(saved, preview, "2026-11-03");
    expect(diff.length).toBeGreaterThan(0);
    for (const d of diff) {
      expect(d.date >= "2026-11-03" && d.date <= "2026-11-09").toBe(true);
      expect(d.before).not.toBe(d.after);
    }
  });
});
