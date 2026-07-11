import type { TestAnalyzer, TestType } from "./types";
import { cmjAnalyzer } from "./analyzers/cmjAnalyzer";
import { squatJumpAnalyzer } from "./analyzers/squatJumpAnalyzer";
import { dropJumpAnalyzer } from "./analyzers/dropJumpAnalyzer";
import { repeatedJumpsAnalyzer } from "./analyzers/repeatedJumpsAnalyzer";
import { pogoAnalyzer } from "./analyzers/pogoAnalyzer";
import { broadJumpAnalyzer } from "./analyzers/broadJumpAnalyzer";
import { sprint20mAnalyzer, sprint30mAnalyzer } from "./analyzers/sprintAnalyzer";
import { fiveTenFiveAnalyzer, sprintToStopAnalyzer } from "./analyzers/codAnalyzer";
import { gymAnalyzer } from "./analyzers/gymAnalyzer";

/**
 * Centralny rejestr analizatorów. Każdy test Vision Lab ma własny, kompletny
 * analizator. Test bez analizatora NIE może zostać uruchomiony.
 */
export const testAnalyzerRegistry: Record<TestType, TestAnalyzer> = {
  cmj: cmjAnalyzer,
  squat_jump: squatJumpAnalyzer,
  drop_jump: dropJumpAnalyzer,
  repeated_jumps: repeatedJumpsAnalyzer,
  broad_jump: broadJumpAnalyzer,
  pogo_jumps: pogoAnalyzer,
  sprint_20m: sprint20mAnalyzer,
  sprint_30m: sprint30mAnalyzer,
  five_ten_five: fiveTenFiveAnalyzer,
  sprint_to_stop: sprintToStopAnalyzer,
  analyze_gym_exercise: gymAnalyzer,
};

export function getAnalyzer(testType: string): TestAnalyzer | null {
  return (testAnalyzerRegistry as Record<string, TestAnalyzer>)[testType] ?? null;
}

export function hasAnalyzer(testType: string): boolean {
  return testType in testAnalyzerRegistry;
}
