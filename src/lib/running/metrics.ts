import type {
  KilometerSplit,
  RoutePoint,
  RunningActivityDraft,
  RunningActivitySource,
} from "./types";
import type { RunningIntervalResult } from "./types";
import { sanitizeIntervalResults } from "./intervals";

const EARTH_RADIUS_M = 6_371_000;
const MAX_ROUTE_POINTS = 5_000;
const MAX_ACCURACY_M = 100;
const MAX_PLAUSIBLE_SPEED_MPS = 14;
const MIN_MOVEMENT_M = 2;

export function haversineDistanceM(
  a: Pick<RoutePoint, "lat" | "lng">,
  b: Pick<RoutePoint, "lat" | "lng">,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isRoutePoint(value: unknown): value is RoutePoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return (
    finiteNumber(point.lat) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    finiteNumber(point.lng) &&
    point.lng >= -180 &&
    point.lng <= 180 &&
    typeof point.recordedAt === "string" &&
    Number.isFinite(Date.parse(point.recordedAt)) &&
    finiteNumber(point.elapsedSec) &&
    point.elapsedSec >= 0 &&
    (point.accuracyM === undefined ||
      (finiteNumber(point.accuracyM) && point.accuracyM >= 0 && point.accuracyM <= 10_000))
  );
}

/**
 * Odrzuca szum GPS i nierealne skoki. Dane nie opuszczają urządzenia podczas
 * obliczeń; do zapisu trafia maksymalnie 5000 punktów.
 */
export function sanitizeRoute(input: unknown): RoutePoint[] {
  if (!Array.isArray(input)) return [];
  const clean: RoutePoint[] = [];

  for (const raw of input) {
    if (!isRoutePoint(raw) || clean.length >= MAX_ROUTE_POINTS) continue;
    const point: RoutePoint = {
      lat: Number(raw.lat.toFixed(7)),
      lng: Number(raw.lng.toFixed(7)),
      recordedAt: raw.recordedAt,
      elapsedSec: Math.round(raw.elapsedSec * 10) / 10,
      ...(raw.accuracyM === undefined ? {} : { accuracyM: Math.round(raw.accuracyM * 10) / 10 }),
    };
    if ((point.accuracyM ?? 0) > MAX_ACCURACY_M) continue;

    const previous = clean.at(-1);
    if (!previous) {
      clean.push(point);
      continue;
    }
    if (point.elapsedSec < previous.elapsedSec) continue;

    const distance = haversineDistanceM(previous, point);
    const elapsed = point.elapsedSec - previous.elapsedSec;
    if (distance < MIN_MOVEMENT_M) continue;
    if (elapsed <= 0 || distance / elapsed > MAX_PLAUSIBLE_SPEED_MPS) continue;
    clean.push(point);
  }

  return clean;
}

export function routeDistanceM(route: RoutePoint[]): number {
  let total = 0;
  for (let index = 1; index < route.length; index += 1) {
    total += haversineDistanceM(route[index - 1], route[index]);
  }
  return total;
}

export function buildKilometerSplits(route: RoutePoint[]): KilometerSplit[] {
  if (route.length < 2) return [];
  const splits: KilometerSplit[] = [];
  let totalDistance = 0;
  let splitStartDistance = 0;
  let splitStartTime = route[0].elapsedSec;
  let nextBoundary = 1_000;

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    const segmentDistance = haversineDistanceM(previous, current);
    const beforeSegment = totalDistance;
    totalDistance += segmentDistance;

    while (segmentDistance > 0 && totalDistance >= nextBoundary) {
      const fraction = (nextBoundary - beforeSegment) / segmentDistance;
      const boundaryTime =
        previous.elapsedSec + (current.elapsedSec - previous.elapsedSec) * fraction;
      const durationSec = Math.max(1, boundaryTime - splitStartTime);
      splits.push({
        kilometer: splits.length + 1,
        distanceM: 1_000,
        durationSec,
        paceSecPerKm: durationSec,
        isPartial: false,
      });
      splitStartTime = boundaryTime;
      splitStartDistance = nextBoundary;
      nextBoundary += 1_000;
    }
  }

  const remainder = totalDistance - splitStartDistance;
  if (remainder >= 100) {
    const durationSec = Math.max(1, route.at(-1)!.elapsedSec - splitStartTime);
    splits.push({
      kilometer: splits.length + 1,
      distanceM: remainder,
      durationSec,
      paceSecPerKm: durationSec / (remainder / 1_000),
      isPartial: true,
    });
  }
  return splits;
}

export function buildRunningActivityDraft(input: {
  sessionId: string;
  date: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  route: RoutePoint[];
  source: RunningActivitySource;
  intervalResults?: RunningIntervalResult[];
}): RunningActivityDraft {
  const route = sanitizeRoute(input.route);
  const distanceM = routeDistanceM(route);
  const durationSec = Math.max(1, Math.round(input.durationSec));
  return {
    sessionId: input.sessionId,
    date: input.date,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationSec,
    distanceM: Math.round(distanceM * 10) / 10,
    avgPaceSecPerKm: distanceM >= 100 ? durationSec / (distanceM / 1_000) : null,
    route,
    splits: buildKilometerSplits(route),
    intervalResults: sanitizeIntervalResults(input.intervalResults ?? []),
    source: input.source,
  };
}

export function formatRunDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "—";
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

export function formatDistance(distanceM: number): string {
  return `${(Math.max(0, distanceM) / 1_000).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} km`;
}
