import { describe, expect, it } from "vitest";
import type { DoubleSessions, Goal, Level, Profile, SessionDay } from "../types";
import { mainGoalTasks } from "./goalPolicy";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";

/**
 * Matrix: every goal × age × level crossed with club/match calendars, access, time and double
 * sessions. A cell must end as a plan the validator accepts, or as an explicit unmet goal — never
 * as a recipe the validator refuses (the generator and the validator share one requirement rule).
 */
const goals: Goal[] = [
  "speed",
  "strength",
  "endurance",
  "power",
  "agility",
  "general",
  "mobility",
  "return",
  "matchready",
];
const ages = [13, 15, 16, 17, 18, 27];
const levels: Level[] = ["beginner", "intermediate", "advanced", "elite"];
const calendars = [
  { name: "no club", club: [] as number[], matches: [] as string[] },
  { name: "club", club: [2, 4], matches: [] },
  { name: "club+match", club: [2, 4], matches: ["2026-11-07"] },
  { name: "two matches", club: [], matches: ["2026-11-04", "2026-11-08"] },
];
const full = [
  "barbell",
  "rack",
  "dumbbell",
  "machine",
  "band",
  "bench",
  "med_ball",
  "nordic_setup",
  "overhead_band_station",
  "low_band_station",
  "gym_jump_lane",
  "football",
  "rebounder",
];
const access = [
  { name: "limited", gym: false, pitch: false, sprint: false, equipment: [] as string[] },
  { name: "full", gym: true, pitch: true, sprint: true, equipment: full },
  {
    name: "gym only",
    gym: true,
    pitch: false,
    sprint: false,
    equipment: ["barbell", "rack", "dumbbell", "machine", "band", "bench"],
  },
  { name: "pitch + ball", gym: false, pitch: true, sprint: true, equipment: ["football", "band"] },
  { name: "sprint lane only", gym: false, pitch: false, sprint: true, equipment: [] },
];
const minutes = [30, 75];
const doubles: DoubleSessions[] = ["no", "light_only", "yes_if_safe"];

function profile(i: number): { p: Profile; label: string; budget: number } {
  // Mixed radix over goal × age × level; the other axes use coprime strides so every value of
  // every axis meets every goal, age and level.
  const goal = goals[i % goals.length];
  const age = ages[Math.floor(i / goals.length) % ages.length];
  const level = levels[Math.floor(i / (goals.length * ages.length)) % levels.length];
  const cal = calendars[(i * 3) % calendars.length];
  const acc = access[(i * 7) % access.length];
  const budget = minutes[(i * 5) % minutes.length];
  const double = doubles[(i * 11) % doubles.length];
  const beginner = level === "beginner";
  const p = {
    name: "matrix",
    age,
    position: "midfielder",
    level,
    goal,
    secondaryLimiter: null,
    clubTrainingDays: [...cal.club],
    individualTrainingDays: [1, 3, 5, 6, 7].filter((d) => !cal.club.includes(d)),
    unavailableDays: [],
    usualMatchDay: null,
    matchDate: null,
    matchDates: [...cal.matches],
    equipment: acc.equipment,
    painInjury: false,
    doubleSessionsAllowed: double,
    guardianConsent: age < 18,
    onboardingComplete: true,
    createdAt: "2026-11-01",
    seasonPhase: "preseason",
    seasonStage: null,
    competitionLevel: "iv_liga",
    weeklyMatches: false,
    hasGym: acc.gym,
    hasPitch: acc.pitch,
    hasSprintSpace: acc.sprint,
    gymExperienceLevel: beginner ? "beginner" : "advanced",
    strengthTrainingMonths: beginner ? 0 : 24,
    movementCompetence: beginner ? "low" : "high",
    supervisionLevel: acc.gym ? "full" : "none",
  } as unknown as Profile;
  return {
    p,
    budget,
    label: `${goal} · ${age} · ${level} · ${cal.name} · ${acc.name} · ${budget} min · ${double}`,
  };
}
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const CASES = goals.length * ages.length * levels.length; // 216 cells; every triple appears once

describe("plan matrix: a valid plan or an explicitly unmet goal", () => {
  it("covers every value of every axis", () => {
    const seen = new Set<string>();
    for (let i = 0; i < CASES; i++) {
      const { p, budget } = profile(i);
      seen.add(`goal:${p.goal}`);
      seen.add(`age:${p.age}`);
      seen.add(`level:${p.level}`);
      seen.add(`club:${p.clubTrainingDays.length}:${p.matchDates?.length}`);
      seen.add(`gym:${p.hasGym}/${p.hasPitch}/${p.hasSprintSpace}`);
      seen.add(`min:${budget}`);
      seen.add(`double:${p.doubleSessionsAllowed}`);
    }
    for (const g of goals) expect(seen.has(`goal:${g}`)).toBe(true);
    for (const a of ages) expect(seen.has(`age:${a}`)).toBe(true);
    for (const l of levels) expect(seen.has(`level:${l}`)).toBe(true);
    for (const c of calendars)
      expect(seen.has(`club:${c.club.length}:${c.matches.length}`)).toBe(true);
    for (const a of access) expect(seen.has(`gym:${a.gym}/${a.pitch}/${a.sprint}`)).toBe(true);
    for (const m of minutes) expect(seen.has(`min:${m}`)).toBe(true);
    for (const d of doubles) expect(seen.has(`double:${d}`)).toBe(true);
  });

  it(`all ${CASES} cells validate, respect time and double-session choice, and show unmet goals`, () => {
    const failures: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const { p, budget, label } = profile(i);
      try {
        const result = generateTrainingPlan(p, {
          startDate: "2026-11-02",
          weeks: 2,
          minutesPerSession: budget,
        });
        const issues = validateTrainingPlan(result.plan, p, {
          startDate: "2026-11-02",
          minutesPerSession: budget,
        });
        if (issues.length)
          failures.push(`${label}: ${[...new Set(issues.map((x) => x.code))].join(", ")}`);
        const own = result.plan.flatMap(slots).filter((s) => s.engineV2);
        for (const s of own)
          if (s.durationMin > budget + 5)
            failures.push(`${label}: ${s.title} ${s.durationMin} min > ${budget}`);
        if (p.doubleSessionsAllowed === "no")
          for (const d of result.plan)
            if (d.secondSession?.engineV2 && d.engineV2)
              failures.push(`${label}: double session on ${d.date} although not allowed`);
        // A main-goal stimulus that is absent must be reported, not silently dropped.
        if (!["return", "mobility"].includes(p.goal) && !p.painInjury)
          for (const task of mainGoalTasks(p)) {
            const present = own.some((s) => s.engineV2!.roles.includes(task as never));
            const reported = result.issues.some((x) => x.code.startsWith("UNMET"));
            if (!present && !reported)
              failures.push(`${label}: ${task} missing without an explicit unmet goal`);
          }
      } catch (e) {
        failures.push(`${label}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  }, 300_000);
});
