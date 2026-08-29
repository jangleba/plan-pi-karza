/**
 * Splity sprintu — czasy pośrednie z RZECZYWIŚCIE skalibrowanych linii.
 *
 * Nie estymujemy splitów z rozmiaru sylwetki ani z proporcji dystansu.
 * Każdy split musi mieć:
 *  - skalibrowaną linię (rola SPLIT_5M / SPLIT_10M / SPLIT_15M / SPLIT_20M),
 *  - znany dystans od linii startowej (punkty podłoża mm lub worldXmm),
 *  - wykryte przecięcie płaszczyzny pomiarowej przez punkt tułowia
 *    (ten sam CalibratedLineCrossingEngine, te same sourceTimestampUs).
 *
 * Determinizm: te same wejścia → identyczne klatki, timestampy i prędkości.
 */

import type { FramePose, TimingLineRole, TimingLineSpec } from "../types";
import type { Homography } from "../calibrationProfiles";
import { TimingLineRegistry } from "../timingPlane";
import {
  detectCalibratedCrossings,
  elapsedUncertaintyMs,
  type LineCrossing,
} from "../calibratedLineCrossing";
import { round, withinPlausibleRange, PLAUSIBLE_RANGES } from "../physics";
import type { SprintSplit, SprintSplitResult, SprintVelocityProfile } from "./types";

/** Role linii pośrednich obsługiwane w protokołach sprintu. */
export const SPLIT_ROLES: readonly TimingLineRole[] = [
  "SPLIT_5M",
  "SPLIT_10M",
  "SPLIT_15M",
  "SPLIT_20M",
] as const;

const ROLE_LABELS: Partial<Record<TimingLineRole, string>> = {
  SPLIT_5M: "Split 5 m",
  SPLIT_10M: "Split 10 m",
  SPLIT_15M: "Split 15 m",
  SPLIT_20M: "Split 20 m",
  FINISH: "Meta",
  TIMING_B: "Koniec odcinka",
};

/** Minimalna liczba odcinków wymagana do publikacji profilu prędkości. */
export const MIN_SEGMENTS_FOR_VELOCITY_PROFILE = 3;

export interface SplitInput {
  poses: FramePose[];
  homography: Homography | null;
  registry: TimingLineRegistry;
  /** Rola linii startowej protokołu (START lub TIMING_A). */
  startRole: TimingLineRole;
  /** Rola linii końcowej protokołu (FINISH lub TIMING_B). */
  finishRole: TimingLineRole;
  /** Dystans protokołu (m) — używany, gdy kalibracja nie podaje dystansu mety. */
  protocolDistanceM: number | null;
  width: number;
  height: number;
  cameraStable: boolean;
  /** Czy tor śledzenia tułowia jest stabilny (warunek profilu prędkości). */
  trackingStable: boolean;
}

interface Point {
  role: TimingLineRole;
  label: string;
  distanceM: number;
  crossing: LineCrossing;
}

/** Wykrywa przecięcie jednej linii — brak przecięcia nie blokuje całości. */
function crossingFor(
  input: SplitInput,
  line: TimingLineSpec,
  homography: Homography,
): LineCrossing | null {
  const res = detectCalibratedCrossings({
    poses: input.poses,
    homography,
    timingLines: [line],
    width: input.width,
    height: input.height,
    cameraStable: input.cameraStable,
  });
  if (!res.ok) return null;
  return res.crossings[0] ?? null;
}

/**
 * Liczy splity skumulowane, czasy odcinków i prędkości odcinkowe.
 * Raportuje WYŁĄCZNIE punkty faktycznie skalibrowane i wykryte.
 */
export function computeSprintSplits(input: SplitInput): SprintSplitResult {
  const empty = (blockedBy: SprintSplitResult["blockedBy"]): SprintSplitResult => ({
    splits: [],
    velocityProfile: null,
    blockedBy,
  });

  if (!input.homography) return empty("NO_CALIBRATION");
  const startLine = input.registry.get(input.startRole);
  if (!startLine) return empty("NO_START_LINE");

  const startCrossing = crossingFor(input, startLine, input.homography);
  if (!startCrossing) return empty("CROSSINGS_NOT_DETECTED");

  const candidates: { role: TimingLineRole; line: TimingLineSpec; distanceM: number }[] = [];
  for (const role of SPLIT_ROLES) {
    const line = input.registry.get(role);
    if (!line) continue;
    const mm = input.registry.knownDistanceMm(input.startRole, role);
    if (mm == null || !(mm > 0)) continue;
    candidates.push({ role, line, distanceM: round(mm / 1000, 3) });
  }

  const finishLine = input.registry.get(input.finishRole);
  if (finishLine) {
    const mm = input.registry.knownDistanceMm(input.startRole, input.finishRole);
    const distanceM =
      mm != null && mm > 0
        ? round(mm / 1000, 3)
        : input.protocolDistanceM != null && input.protocolDistanceM > 0
          ? input.protocolDistanceM
          : null;
    if (distanceM != null) {
      candidates.push({ role: input.finishRole, line: finishLine, distanceM });
    }
  }

  if (candidates.length === 0) return empty("NO_SPLIT_LINES");

  const points: Point[] = [];
  for (const c of candidates) {
    const crossing = crossingFor(input, c.line, input.homography);
    if (!crossing) continue;
    if (crossing.crossingTimestampUs <= startCrossing.crossingTimestampUs) continue;
    points.push({
      role: c.role,
      label: ROLE_LABELS[c.role] ?? c.role,
      distanceM: c.distanceM,
      crossing,
    });
  }
  if (points.length === 0) return empty("CROSSINGS_NOT_DETECTED");

  points.sort((a, b) => a.distanceM - b.distanceM);

  const splits: SprintSplit[] = [];
  let prevTimeS = 0;
  let prevDistanceM = 0;
  for (const p of points) {
    const cumulativeTimeS = round(
      (p.crossing.crossingTimestampUs - startCrossing.crossingTimestampUs) / 1_000_000,
      3,
    );
    const segmentTimeS = round(cumulativeTimeS - prevTimeS, 3);
    const segmentDistanceM = round(p.distanceM - prevDistanceM, 3);
    let segmentSpeedMs: number | null = null;
    if (segmentTimeS > 0 && segmentDistanceM > 0) {
      const raw = round(segmentDistanceM / segmentTimeS, 2);
      segmentSpeedMs = withinPlausibleRange(
        raw,
        PLAUSIBLE_RANGES.sprint_speed_ms.min,
        PLAUSIBLE_RANGES.sprint_speed_ms.max,
      )
        ? raw
        : null;
    }
    splits.push({
      role: p.role,
      label: p.label,
      distanceM: p.distanceM,
      cumulativeTimeS,
      segmentTimeS: segmentTimeS > 0 ? segmentTimeS : null,
      segmentSpeedMs,
      segmentSpeedKmh: segmentSpeedMs != null ? round(segmentSpeedMs * 3.6, 2) : null,
      cumulativeUncertaintyS: round(elapsedUncertaintyMs(startCrossing, p.crossing) / 1000, 4),
      frameBeforeIndex: p.crossing.frameBeforeIndex,
      frameAfterIndex: p.crossing.frameAfterIndex,
    });
    prevTimeS = cumulativeTimeS;
    prevDistanceM = p.distanceM;
  }

  return { splits, velocityProfile: buildVelocityProfile(splits, input.trackingStable), blockedBy: null };
}

/**
 * Profil prędkości publikujemy tylko przy wiarygodnej podstawie:
 * kalibracja podłoża (już wymagana dla splitów), stabilny tor śledzenia oraz
 * co najmniej 3 pełne odcinki z fizycznie sensowną prędkością.
 * W innym wypadku metryki nie ma — nie estymujemy jej dekoracyjnie.
 */
export function buildVelocityProfile(
  splits: SprintSplit[],
  trackingStable: boolean,
): SprintVelocityProfile | null {
  if (!trackingStable) return null;
  const usable = splits.filter((s) => s.segmentSpeedMs != null);
  if (usable.length < MIN_SEGMENTS_FOR_VELOCITY_PROFILE) return null;
  if (usable.length !== splits.length) return null; // luka w danych → brak profilu

  let peak = usable[0];
  for (const s of usable) {
    if ((s.segmentSpeedMs as number) > (peak.segmentSpeedMs as number)) peak = s;
  }
  return {
    basis: "calibrated_splits",
    segments: usable.length,
    peakSegmentSpeedMs: peak.segmentSpeedMs as number,
    peakSegmentSpeedKmh: peak.segmentSpeedKmh as number,
    peakSegmentLabel: peak.label,
    peakAtLastSegment: peak === usable[usable.length - 1],
  };
}
