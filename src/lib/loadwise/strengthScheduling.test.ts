import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "./types";
import { gymChangeBlockReason, gymSpacingIssues, repairGymSpacing } from "./strengthScheduling";
import { normalizeSessionCategory } from "./sessionClassification";
import { validatePersistedPlan } from "./persistedPlanValidation";
import { assertFinalPlanMeetsMinimums, requirementsFor } from "./weekFinalization";

const profile = {
  name: "Test",
  position: "midfielder",
  secondaryLimiter: null,
  matchDate: null,
  equipment: [],
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-01-01",
  seasonStage: null,
  competitionLevel: "iv_liga",
  hasSprintSpace: true,
  age: 21,
  level: "advanced",
  goal: "strength",
  hasGym: true,
  hasPitch: true,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  seasonPhase: "preseason",
  painInjury: false,
  usualMatchDay: null,
  weeklyMatches: false,
} as Profile;

function day(date: string, gym = false, extra: Partial<SessionDay> = {}): SessionDay {
  return normalizeSessionCategory({
    date,
    dayName: "Test",
    dayType: "training",
    title: gym ? "Siła nóg" : "Technika z piłką",
    sessionType: gym ? "Siła / moc" : "Piłka / technika",
    goalLabel: gym ? "Siła" : "Piłka",
    intensity: gym ? "wysoka" : "niska",
    durationMin: 40,
    reason: "Test",
    whyToday: "Test",
    goalOfSession: "Test",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    safetyNote: null,
    slotLabel: null,
    generatorVersion: "current",
    sections: {
      warmup: [],
      main: gym
        ? [{ exerciseId: "back_squat", name: "Przysiad", prescription: "4 × 5" }]
        : [{ name: "Prowadzenie piłki", prescription: "10 min" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
    ...extra,
  });
}

describe("gym calendar scheduling", () => {
  it("finds a Sunday second-slot deadlift followed by Monday squat, even in an unsorted plan", () => {
    const sunday = day("2026-10-11", false, { secondSession: day("2026-10-11", true) });
    const monday = day("2026-10-12", true);
    expect(gymSpacingIssues([monday, sunday])).toEqual([
      { code: "adjacent-gym-days", date: monday.date },
    ]);
    expect(validatePersistedPlan([sunday, monday], profile, "current").issues).toContainEqual(
      expect.objectContaining({ code: "adjacent-gym-days" }),
    );
  });

  it("accepts a complete intervening calendar day, including sparse saved plans", () => {
    const plan = [day("2026-10-05", true), day("2026-10-07", true)];
    expect(gymSpacingIssues(plan)).toEqual([]);
    expect(validatePersistedPlan(plan, profile, "current").issues).toEqual([]);
  });

  it("moves the whole prescription and keeps destination calendar IDs and both non-gym slots", () => {
    const first = day("2026-10-05", true);
    const second = day("2026-10-06", true, {
      dbId: "tuesday-id",
      dayDbId: "tuesday-day",
      secondSession: day("2026-10-06"),
    });
    const third = day("2026-10-07", false, {
      dbId: "wednesday-id",
      dayDbId: "wednesday-day",
      dayType: "recovery",
      title: "Regeneracja",
      sessionType: "Regeneracja",
      sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    });
    const prescription = second.sections;
    const plan = [first, second, third];
    repairGymSpacing(plan, profile);
    expect(gymSpacingIssues(plan)).toEqual([]);
    expect(plan[2].sections).toBe(prescription);
    expect(plan[2]).toMatchObject({
      date: "2026-10-07",
      dbId: "wednesday-id",
      dayDbId: "wednesday-day",
    });
    expect(plan[1]).toMatchObject({
      date: "2026-10-06",
      dbId: "tuesday-id",
      dayDbId: "tuesday-day",
    });
    expect(plan[1].secondSession).toEqual(second.secondSession);
  });

  it("repairs two gyms on one day by moving the second slot", () => {
    const plan = [
      day("2026-10-05", true, { secondSession: day("2026-10-05", true) }),
      day("2026-10-06"),
      day("2026-10-07"),
    ];
    repairGymSpacing(plan, profile);
    expect(gymSpacingIssues(plan)).toEqual([]);
    expect(plan.filter((item) => item.classification?.isGym)).toHaveLength(2);
  });

  it("never fills an unavailable or match day when the only available days are consecutive", () => {
    const match = day("2026-10-08", false, {
      dayType: "match",
      title: "Mecz",
      sessionType: "Mecz",
    });
    const unavailable = day("2026-10-07", false, { dayType: "rest", isUnavailable: true });
    const plan = [day("2026-10-05", true), day("2026-10-06", true), unavailable, match];
    repairGymSpacing(plan, profile);
    expect(gymSpacingIssues(plan)).toEqual([]);
    expect(plan[1].sections.main).toEqual([]);
    expect(plan[2]).toBe(unavailable);
    expect(plan[3]).toBe(match);
    expect(
      assertFinalPlanMeetsMinimums(plan, requirementsFor(plan, profile), profile).finalStatus,
    ).toBe("invalid");
  });

  it("final hard gate rejects adjacent gyms even if all weekly minimums were counted", () => {
    const plan = [day("2026-10-05", true), day("2026-10-06", true)];
    const report = assertFinalPlanMeetsMinimums(plan, requirementsFor(plan, profile), profile);
    expect(report.noBackToBackGymDays).toBe(false);
    expect(report.finalStatus).toBe("invalid");
  });

  it("blocks manual additions next to a second-slot gym and duplicate additions on one day", () => {
    const monday = day("2026-10-05", false, { secondSession: day("2026-10-05", true) });
    const tuesday = day("2026-10-06");
    expect(gymChangeBlockReason([monday, tuesday], tuesday.date, day(tuesday.date, true))).toMatch(
      /dzień/,
    );
    expect(
      gymChangeBlockReason(
        [monday],
        monday.date,
        day(monday.date, true, { secondSession: monday.secondSession }),
      ),
    ).toMatch(/drugiej/);
  });

  it("keeps two separated weekly gyms and refuses a third added session", () => {
    const plan = [day("2026-10-05", true), day("2026-10-07", true), day("2026-10-09")];
    expect(gymChangeBlockReason(plan, "2026-10-09", day("2026-10-09", true))).toMatch(/dwie/);
    expect(gymChangeBlockReason(plan, "2026-10-07", day("2026-10-07", true))).toBeNull();
  });
});
