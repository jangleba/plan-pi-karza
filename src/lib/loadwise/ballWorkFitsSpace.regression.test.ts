import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { buildProposals } from "./modifications";
import {
  INDIVIDUAL_FOOTBALL_DRILLS,
  fitBallWorkToConditions,
  footballConditions,
  type FootballConditions,
} from "./individualFootballSessionEngine";
import type { ExerciseItem, Profile, Readiness, SessionDay } from "./types";

/**
 * Player report: ball sessions asked athletes without a pitch for finishing,
 * "positional action on the pitch" or wall passes. Ball work written outside
 * the solo engine (second sessions, match-week primers, the weekly ball
 * minimum, check-in swaps) ignored the declared pitch, straight and wall.
 */

type Drill = {
  id: string;
  space: "small" | "yard" | "pitch";
  positions?: readonly string[];
  wall?: boolean;
  goal?: boolean;
};
const DRILLS = new Map<string, Drill>(
  (INDIVIDUAL_FOOTBALL_DRILLS as readonly Drill[]).map((item) => [item.id, item]),
);
const GENERIC = "football_technical_self_selected";

function rows(session: SessionDay): Array<{ name: string; exerciseId?: string }> {
  const flat = Object.values(session.sections ?? {}).flatMap((list) => list as ExerciseItem[]);
  const structured = (session.structuredSections ?? []).flatMap((section) =>
    section.blocks.flatMap((block) => block.exercises),
  );
  return [...flat, ...structured];
}

/** Ball blocks the athlete cannot do where they train, or that say nothing concrete. */
function outOfReach(session: SessionDay, conditions: FootballConditions): string[] {
  const rank = { small: 0, yard: 1, pitch: 2 } as const;
  return rows(session).flatMap((row) => {
    if (row.exerciseId === GENERIC) return [`${session.title}: ogólnik „${row.name}”`];
    const drill = row.exerciseId ? DRILLS.get(row.exerciseId) : undefined;
    if (!drill) return [];
    return rank[drill.space] > rank[conditions.space] ||
      (drill.wall && !conditions.wall) ||
      (drill.goal && !conditions.goal)
      ? [`${session.title}: „${row.name}” (${drill.space}) przy ${conditions.space}`]
      : [];
  });
}

let seed = 20261109;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const subset = <T>(items: readonly T[], p: number) => items.filter(() => random() < p);

function noPitchProfile(): Profile {
  const age = pick([13, 15, 16, 18, 22, 28]);
  const matchDay = pick([6, 7, 3, "no_fixed_day"] as const);
  const individual = subset([1, 2, 3, 4, 5, 6, 7], 0.7);
  return {
    name: "Bez boiska",
    age,
    position: pick(["goalkeeper", "defender", "midfielder", "forward"]),
    level: pick(["beginner", "intermediate", "advanced", "elite"]),
    goal: pick([
      "speed",
      "strength",
      "endurance",
      "power",
      "agility",
      "general",
      "mobility",
      "matchready",
    ]),
    secondaryLimiter: pick([null, null, "ball", "speed", "fatigue", "return"]),
    clubTrainingDays: subset([1, 2, 3, 4, 5], 0.5),
    individualTrainingDays: individual.length ? individual : [2, 4],
    unavailableDays: [],
    usualMatchDay: matchDay,
    matchDate: matchDay === "no_fixed_day" && random() < 0.5 ? "2026-11-14" : null,
    equipment: subset(["band", "dumbbell", "box", "med_ball", "ściana"], 0.4),
    homeEquipment: subset(["band", "odbojnik"], 0.3),
    painInjury: false,
    painLocations: [],
    doubleSessionsAllowed: pick(["no", "light_only", "yes_if_safe"]),
    guardianConsent: age < 18,
    onboardingComplete: true,
    createdAt: "2026-10-01",
    seasonPhase: pick(["offseason", "preseason", "inseason", "transition"]),
    seasonPhaseOverride: random() < 0.5,
    seasonStage: "match_week",
    competitionLevel: age < 18 ? "academy" : pick(["okregowka", "iv_liga"]),
    weeklyMatches: random() < 0.8,
    hasGym: random() < 0.6,
    hasPitch: false,
    hasSprintSpace: random() < 0.5,
  } as Profile;
}

describe("ball work fits the athlete's space, wall and goal", () => {
  beforeAll(() => vi.spyOn(console, "debug").mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());
  const starts = [new Date(2026, 10, 2), new Date(2027, 0, 4), new Date(2026, 6, 6)];
  const chunks = Array.from({ length: 4 }, () =>
    Array.from({ length: 20 }, () => ({ profile: noPitchProfile(), start: pick(starts) })),
  );
  it.each(chunks.map((cases, index) => ({ cases, index })))(
    "seeded profiles without a pitch, part $index",
    ({ cases }) => {
      const found: string[] = [];
      for (const { profile, start } of cases) {
        const conditions = footballConditions(profile);
        for (const day of generatePlan(profile, start, 14))
          for (const session of [day, day.secondSession].filter(Boolean) as SessionDay[])
            found.push(...outOfReach(session, conditions));
      }
      expect(found).toEqual([]);
    },
    60_000,
  );
});

describe("root cause: hand-written ball blocks", () => {
  const session = (main: ExerciseItem[], footballTransfer: ExerciseItem[] = []): SessionDay =>
    ({
      date: "2026-11-10",
      dayName: "Wtorek",
      dayType: "training",
      title: "Technika i decyzje z piłką",
      intensity: "niska",
      durationMin: 25,
      sections: { warmup: [], main, accessory: [], footballTransfer, cooldown: [] },
    }) as unknown as SessionDay;
  const generic = (name: string, prescription: string): ExerciseItem => ({
    name,
    prescription,
    exerciseId: GENERIC,
  });
  const athlete = (overrides: Partial<Profile>) =>
    ({
      age: 17,
      level: "intermediate",
      position: "forward",
      equipment: [],
      homeEquipment: [],
      hasPitch: false,
      hasSprintSpace: false,
      ...overrides,
    }) as Profile;

  it("turns finishing and positional action into small-space drills for the player's position", () => {
    const fitted = fitBallWorkToConditions(
      session(
        [generic("Pierwszy kontakt i skanowanie", "10 min przyjęć kierunkowych")],
        [generic("Akcja pozycyjna w spokojnym tempie", "5 min wg roli na boisku")],
      ),
      athlete({}),
    );
    const ids = rows(fitted).map((row) => row.exerciseId);
    expect(ids).toEqual(["football_self_feed_first_touch", expect.any(String)]);
    const positional = DRILLS.get(ids[1]!)!;
    expect(positional.space).toBe("small");
    expect(positional.positions).toContain("forward");
    expect(rows(fitted).map((row) => (row as ExerciseItem).prescription)).toEqual([
      expect.stringContaining("blok 10 min"),
      expect.stringContaining("blok 5 min"),
    ]);
  });

  it("uses wall drills only when a wall is declared", () => {
    const main = [generic("Pierwszy kontakt i skanowanie", "10 min")];
    expect(rows(fitBallWorkToConditions(session(main), athlete({})))[0].exerciseId).toBe(
      "football_self_feed_first_touch",
    );
    expect(
      rows(fitBallWorkToConditions(session(main), athlete({ homeEquipment: ["ściana"] })))[0]
        .exerciseId,
    ).toBe("football_wall_first_touch");
  });

  it("replaces a pitch drill left in a session after the athlete lost pitch access", () => {
    const fitted = fitBallWorkToConditions(
      session([
        { name: "Wykończenie", prescription: "10 min", exerciseId: "football_finishing_corners" },
      ]),
      athlete({ hasSprintSpace: true }),
    );
    const drill = DRILLS.get(rows(fitted)[0].exerciseId!)!;
    expect(drill.space).not.toBe("pitch");
  });

  it("leaves non-ball work and doable ball drills untouched", () => {
    const original = session([
      { name: "Koci grzbiet", prescription: "2 × 8", exerciseId: "cat_cow" },
      { name: "Czucie piłki", prescription: "8 min", exerciseId: "football_ball_mastery" },
    ]);
    expect(fitBallWorkToConditions(original, athlete({}))).toBe(original);
  });
});

describe("check-in swap to ball work follows the place picked for today", () => {
  const readiness = {
    date: "2026-09-14",
    sleep: 8,
    energy: 8,
    fatigue: 3,
    soreness: 2,
    jointPain: 0,
    painLocation: null,
    stress: 3,
    motivation: 8,
    overall: 8,
  } as Readiness;
  const today = {
    date: "2026-09-14",
    dayName: "Poniedziałek",
    dayType: "training",
    title: "Lekki dzień",
    intensity: "niska",
    durationMin: 30,
    sessionType: "Technika",
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
  } as unknown as SessionDay;
  const player = {
    age: 20,
    position: "forward",
    level: "advanced",
    goal: "general",
    painInjury: false,
    hasPitch: true,
  } as unknown as Profile;

  it.each([
    ["dom", { space: "small", wall: false, goal: false }],
    ["boisko", { space: "pitch", wall: false, goal: true }],
  ] as const)("at %s", (place, conditions) => {
    const result = buildProposals([today], player, today.date, readiness, "swap", place, 30);
    const ball = result.safe.find((proposal) => proposal.category === "ball");
    expect(ball).toBeDefined();
    expect(rows(ball!.session).some((row) => DRILLS.has(row.exerciseId ?? ""))).toBe(true);
    expect(outOfReach(ball!.session, conditions)).toEqual([]);
  });
});
