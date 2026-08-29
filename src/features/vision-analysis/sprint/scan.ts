/**
 * Składanie jednego „Sprint Performance Scan”.
 *
 * Scan nie liczy czasu głównego — ten pochodzi z istniejącego sprintAnalyzer
 * i timingPlane. Tutaj dokładamy wyłącznie warstwy, które da się udowodnić na
 * tym filmie: splity, fazy, mechanikę, limiter i zalecenie.
 *
 * Nigdy nie unieważniamy poprawnego czasu z powodu mechaniki (pkt 7 wymagań):
 * gdy sylwetka jest za mała do mechaniki, czas zostaje, a scan sygnalizuje
 * potrzebę dogrania bliższego ujęcia.
 */

import type { AnalysisContext } from "../types";
import { TimingLineRegistry } from "../timingPlane";
import { computeSprintSplits } from "./splits";
import { detectSprintPhases } from "./phases";
import { analyzeSprintMechanics } from "./mechanics";
import { selectSprintLimiter } from "./limiter";
import { recommendationForLimiter } from "./recommendations";
import {
  SPRINT_SCAN_VERSION,
  type SprintPerformanceScan,
  type SprintProtocolId,
} from "./types";

const PROTOCOL_ROLES: Record<
  SprintProtocolId,
  { start: "START" | "TIMING_A"; finish: "FINISH" | "TIMING_B"; distanceM: number | null }
> = {
  sprint_20m: { start: "START", finish: "FINISH", distanceM: 20 },
  sprint_30m: { start: "START", finish: "FINISH", distanceM: 30 },
  flying_sprint: { start: "TIMING_A", finish: "TIMING_B", distanceM: null },
};

export interface ScanInput {
  protocol: SprintProtocolId;
  ctx: AnalysisContext;
  /** Czy główny pomiar czasu zakończył się realnym wynikiem. */
  timingAvailable: boolean;
}

export function buildSprintPerformanceScan(input: ScanInput): SprintPerformanceScan {
  const { ctx, protocol } = input;
  const cfg = PROTOCOL_ROLES[protocol];
  const registry = TimingLineRegistry.from(ctx.calibration?.timingLines);
  const cameraStable = ctx.calibration?.cameraMoved ? false : true;

  const phases = detectSprintPhases(ctx.poses);
  const mechanics = analyzeSprintMechanics(ctx.poses, phases);

  const splitResult = computeSprintSplits({
    poses: ctx.poses,
    homography: ctx.calibration?.homography ?? null,
    registry,
    startRole: cfg.start,
    finishRole: cfg.finish,
    protocolDistanceM: cfg.distanceM,
    width: ctx.metadata.width,
    height: ctx.metadata.height,
    cameraStable,
    trackingStable: cameraStable && mechanics.availability !== "LOW_VISIBILITY",
  });

  const { limiter, reason } = selectSprintLimiter(mechanics);

  return {
    version: SPRINT_SCAN_VERSION,
    protocol,
    timingAvailable: input.timingAvailable,
    splits: splitResult.splits,
    velocityProfile: splitResult.velocityProfile,
    splitsBlockedBy: splitResult.blockedBy,
    phases,
    mechanics,
    limiter,
    limiterReason: limiter ? "" : reason,
    recommendation: recommendationForLimiter(limiter?.id),
    needsCloseUpForMechanics:
      input.timingAvailable && mechanics.availability === "ATHLETE_TOO_SMALL_FOR_MECHANICS",
  };
}
