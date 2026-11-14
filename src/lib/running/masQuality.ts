import { samplesFromRoute, distanceAt } from "./liveMetrics";
import type { RunningActivity, RunningIntervalResult } from "./types";

/** GPS acceptance thresholds are product heuristics, not validation of a clinical MAS test. */
export const MAS_GPS_POLICY = {
  seconds: 300,
  maxAccuracyM: 35,
  maxGapSec: 10,
  boundaryToleranceSec: 3,
  minPoints: 20,
  minKmh: 7,
  maxKmh: 26,
} as const;
export interface MasTestEvidence {
  version: 1;
  recipeId: string;
  source: "gps";
  interrupted: boolean;
  startElapsedSec: number;
  durationSec: number;
  wallDurationSec: number;
  coverageSec: number;
  maxGapSec: number;
  maxAccuracyM: number;
  pointCount: number;
  discontinuities: number;
  distanceM: number;
}
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export const masTrial = (results: RunningIntervalResult[]) =>
  results.find(
    (r) =>
      r.kind === "work" &&
      r.phase === "main" &&
      r.completed &&
      r.targetMode === "time" &&
      r.targetValue === 300 &&
      r.durationSec === 300 &&
      r.recipeId?.startsWith("v2:mas-test:"),
  );

/** Coordinates remain local. Only this summary is sent with the atomic result write. */
export function measureMasEvidence(
  activity: Pick<RunningActivity, "route" | "source" | "intervalResults">,
  interrupted = false,
): MasTestEvidence | null {
  const trial = masTrial(activity.intervalResults);
  if (!trial || activity.source !== "gps" || !finite(trial.startElapsedSec)) return null;
  const start = trial.startElapsedSec,
    end = start + 300;
  const route = activity.route;
  let before = -1;
  route.forEach((p, i) => {
    if (p.elapsedSec <= start) before = i;
  });
  const after = route.findIndex((p) => p.elapsedSec >= end);
  // Bracket both boundaries. No extrapolation across missing beginning/end samples.
  if (before < 0 || after <= before) return null;
  const points = route.slice(before, after + 1);
  const first = points[0],
    last = points[points.length - 1];
  if (start - first.elapsedSec > 3 || last.elapsedSec - end > 3) return null;
  const gaps = points.slice(1).map((p, i) => p.elapsedSec - points[i].elapsedSec);
  const discontinuities = points
    .slice(1)
    .filter(
      (p, i) =>
        p.segment !== points[i].segment ||
        p.elapsedSec <= points[i].elapsedSec ||
        Math.abs((Date.parse(p.recordedAt) - Date.parse(points[i].recordedAt)) / 1000 - gaps[i]) >
          2,
    ).length;
  if (points.some((p) => !finite(p.accuracyM) || !finite(Date.parse(p.recordedAt)))) return null;
  const samples = samplesFromRoute(route);
  return {
    version: 1,
    recipeId: trial.recipeId!,
    source: "gps",
    interrupted,
    startElapsedSec: start,
    durationSec: 300,
    wallDurationSec:
      (Date.parse(last.recordedAt) - Date.parse(first.recordedAt)) / 1000 -
      (last.elapsedSec - first.elapsedSec - 300),
    coverageSec: 300 - Math.max(0, start - first.elapsedSec) - Math.max(0, last.elapsedSec - end),
    maxGapSec: Math.max(...gaps),
    maxAccuracyM: Math.max(...points.map((p) => p.accuracyM!)),
    pointCount: points.length,
    discontinuities,
    distanceM: distanceAt(samples, end) - distanceAt(samples, start),
  };
}

export function masEvidenceProblem(e: MasTestEvidence | null | undefined): string | null {
  if (!e || e.version !== 1 || e.source !== "gps" || !e.recipeId?.startsWith("v2:mas-test:"))
    return "Brak pełnego zapisu pięciominutowej próby GPS.";
  if (
    [
      e.startElapsedSec,
      e.durationSec,
      e.wallDurationSec,
      e.coverageSec,
      e.maxGapSec,
      e.maxAccuracyM,
      e.pointCount,
      e.discontinuities,
      e.distanceM,
    ].some((n) => !finite(n))
  )
    return "Niekompletne pomiary GPS.";
  if (
    e.interrupted !== false ||
    e.discontinuities !== 0 ||
    e.durationSec !== 300 ||
    Math.abs(e.wallDurationSec - 300) > 2
  )
    return "Próba była przerwana lub nie obejmuje 300 ciągłych sekund.";
  if (
    e.startElapsedSec < 0 ||
    e.coverageSec < 294 ||
    e.coverageSec > 300 ||
    e.maxGapSec < 0 ||
    e.maxGapSec > 10 ||
    !Number.isInteger(e.pointCount) ||
    e.pointCount < 20
  )
    return "Zbyt małe pokrycie próby punktami GPS lub długa luka w pomiarze.";
  if (e.maxAccuracyM < 0 || e.maxAccuracyM > 35) return "Zbyt mała dokładność GPS podczas próby.";
  const kmh = (e.distanceM / 300) * 3.6;
  if (e.distanceM < 600 || kmh < 7 || kmh > 26)
    return "Wynik poza obsługiwanym zakresem testu terenowego.";
  return null;
}

export function verifiedMasKmh(e: MasTestEvidence | null | undefined): number | null {
  return masEvidenceProblem(e) ? null : Math.round((e!.distanceM / 300) * 360) / 100;
}
