import { buildEnduranceForDate } from "@/lib/loadwise/engineV2/endurance";
import type { Profile } from "@/lib/loadwise/types";
import type { RunningIntervalResult } from "../types";

const athlete: Profile = {
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-10-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "none",
  strengthTrainingMonths: 0,
  movementCompetence: "medium",
  supervisionLevel: "none",
  fieldMasKmh: 16,
  fieldMasTestedAt: "2026-10-01",
  fieldMasSourceSessionId: "5f261acf-d1d6-4f50-9513-2fb027932041",
  runningProgressionLevel: 0,
};

/** Actual engine recipe: 6 x 60s work / 60s recovery, planned work RPE 8-9. */
export function hardHiitExecution() {
  const engineV2 = buildEnduranceForDate(athlete, "2026-10-17", "peak")!;
  const runningRecipe = engineV2.runningRecipe!;
  return { engineV2, runningRecipe };
}

export function hiitResults(): RunningIntervalResult[] {
  const { runningRecipe } = hardHiitExecution();
  const block = runningRecipe.blocks[0];
  const count = block.sets * block.repsPerSet;
  return Array.from({ length: count }, (_, i) => ({
    stepId: `interval:${i + 1}`,
    kind: "work",
    label: "Odcinek",
    repeatIndex: i + 1,
    repeatTotal: count,
    targetMode: "time",
    targetValue: block.work.seconds,
    targetLabel: "1:00",
    durationSec: block.work.seconds,
    distanceM: (block.work.seconds / 225) * 1000,
    paceSecPerKm: 225,
    completed: true,
  }));
}
