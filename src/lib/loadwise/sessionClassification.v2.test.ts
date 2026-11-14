import { describe, expect, it } from "vitest";
import type { Profile, SessionCompletion, SessionDay } from "./types";
import { generateTrainingPlan } from "./engineV2/planner";
import {
  classifySession,
  isEnduranceSession,
  isMainGymSession,
  isSpeedSession,
  isStrengthSession,
  normalizeSessionCategory,
} from "./sessionClassification";
import { sessionFromPlan, sessionKindFrom } from "../fuel/planAdapter";
import { planFuelContexts, resolveFuelTiming } from "../fuel/experience";
import { buildTrainingHistory } from "../progress/progress";
import { isSprintRunnerSession } from "./sprintPresentation";

const profile: Profile = {
  name: "V2 integration athlete",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "general",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: 7,
  matchDate: "2026-11-08",
  equipment: ["barbell", "rack", "dumbbell", "trap_bar", "band", "Piłka nożna"],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "inseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
};

function sessions(patch: Partial<Profile> = {}) {
  return generateTrainingPlan(
    { ...profile, ...patch },
    { startDate: "2026-11-02", weeks: 2, minutesPerSession: 120 },
  )
    .plan.flatMap((day) => [day, day.secondSession])
    .filter((session): session is SessionDay => Boolean(session?.engineV2));
}
const mainSessions = sessions();
const mobilitySessions = sessions({ goal: "mobility" });
const enduranceSessions = sessions({
  goal: "endurance",
  weeklyMatches: false,
  matchDate: null,
  usualMatchDay: "no_fixed_day",
  fieldMasKmh: 18,
  fieldMasTestedAt: "2026-11-01",
  fieldMasSourceSessionId: "measured-field-test",
});

type EngineRole = NonNullable<SessionDay["engineV2"]>["roles"][number];

function roleSession(role: EngineRole, candidates = mainSessions): SessionDay {
  const found = candidates.find((session) => session.engineV2!.roles.includes(role));
  expect(found, `real generated ${role} session`).toBeDefined();
  return structuredClone(found!);
}
const translated = (session: SessionDay): SessionDay => ({
  ...session,
  title: "Match / strength / sprint / endurance",
  sessionType: "Test mecz siła sprint interwały",
  goalLabel: "Mecz i wydolność",
  goalOfSession: "Translated presentation",
});

describe("V2 numeric prescription shared by session, Fuel and Progress", () => {
  it("opens the sprint runner for a real generated speed session without a legacy generator stamp", () => {
    const session = translated(
      roleSession(
        "speed",
        sessions({
          doubleSessionsAllowed: "no",
          weeklyMatches: false,
          matchDate: null,
          usualMatchDay: "no_fixed_day",
        }),
      ),
    );
    expect(session.classification).toBeUndefined();
    expect(session.speedGeneratorVersion).toBeUndefined();
    expect(isSprintRunnerSession(session)).toBe(true);
    expect(sessionKindFrom(session)).toBe("speed");
    expect(isSprintRunnerSession(translated(roleSession("activation")))).toBe(false);
  });

  it("keeps both actual stimuli in a combined strength and sprint session despite translated titles or stale classification", () => {
    // V2.5 no longer generates these; immutable V2.4 execution history must
    // still retain both stimuli for Fuel and Progress.
    const gym = structuredClone(roleSession("strengthA"));
    const speed = roleSession("speed");
    gym.generatorVersion = "ballwise-v2.4";
    gym.engineV2!.roles.push("speed");
    gym.engineV2!.exercises.push(...structuredClone(speed.engineV2!.exercises));
    gym.engineV2!.sprintMetres = speed.engineV2!.sprintMetres;
    gym.engineV2!.highLower = true;
    const session = translated(gym);
    session.classification = classifySession(roleSession("activation"));
    expect(isStrengthSession(session)).toBe(true);
    expect(isMainGymSession(session)).toBe(true);
    expect(isSpeedSession(session)).toBe(true);
    expect(isEnduranceSession(session)).toBe(false);
    expect(classifySession(session)).toMatchObject({
      category: "gym_strength",
      countsAsStrength: true,
      countsAsSpeed: true,
      isHeavyLegs: true,
      isHighImpactRunning: true,
    });
    expect(sessionKindFrom(session)).toBe("strength");
  });

  it.each([
    ["activation", "other", "activation", "recovery"],
    ["recovery", "recovery_prehab", "recovery", "recovery"],
    ["mobility", "mobility", "mobility", "recovery"],
    ["skills", "other", "ball_technical", "football"],
  ] as const)(
    "classifies actual %s work without turning its display words into a match or hard training",
    (role, category, subcategory, fuelKind) => {
      const session = translated(
        roleSession(role, role === "mobility" ? mobilitySessions : mainSessions),
      );
      const original = JSON.stringify([session.engineV2, session.structuredSections]);
      const normalized = normalizeSessionCategory(session);
      expect(normalized.classification).toMatchObject({
        category,
        subcategory,
        loadLevel: "low",
        countsAsStrength: false,
        countsAsSpeed: false,
        countsAsEndurance: false,
        countsAsMatch: false,
      });
      expect(sessionKindFrom(normalized)).toBe(fuelKind);
      expect(planFuelContexts([normalized], session.date, {})[0].load).toBe("low");
      expect(JSON.stringify([normalized.engineV2, normalized.structuredSections])).toBe(original);
    },
  );

  it("distinguishes real easy and interval running for Fuel using the stored work and recovery recipe", () => {
    const easy = translated(roleSession("endurance"));
    const interval = translated(
      enduranceSessions.find((session) => session.runningRecipe?.paceSource === "field_mas")!,
    );
    expect(interval.engineV2).toBeDefined();
    for (const session of [easy, interval]) {
      expect(isEnduranceSession(session)).toBe(true);
      expect(isStrengthSession(session)).toBe(false);
      expect(sessionKindFrom(session)).toBe("endurance");
    }
    expect(classifySession(easy).loadLevel).toBe("low");
    expect(sessionFromPlan(easy, easy.date).intensity).toBe("niska");
    expect(planFuelContexts([easy], easy.date, {})[0].load).toBe("low");
    expect(classifySession(interval)).toMatchObject({
      loadLevel: "high",
      isHighImpactRunning: true,
    });
    expect(planFuelContexts([interval], interval.date, {})[0].load).toBe("high");
  });

  it("carries a completed generated activation into recovery history and Fuel after-training with its original numeric dose", () => {
    const snapshot = { ...roleSession("activation"), dbId: "completed-activation" };
    const completion: SessionCompletion = {
      completed: true,
      status: "completed",
      rpe: 3,
      notes: "",
      durationMin: 12,
      endedAt: `${snapshot.date}T12:30:00Z`,
      executionSnapshot: snapshot,
    };
    const completions = { [snapshot.dbId]: completion };
    const history = buildTrainingHistory([snapshot], completions);
    expect(history).toMatchObject([{ category: "recovery", durationMin: 12 }]);
    const context = planFuelContexts([snapshot], snapshot.date, completions)[0];
    expect(context).toMatchObject({ kind: "recovery", completed: true, load: "low" });
    expect(resolveFuelTiming(context).phase).toBe("after");
    expect(completion.executionSnapshot?.engineV2).toEqual(snapshot.engineV2);
  });
});
