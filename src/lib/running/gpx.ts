import { buildRunningActivityDraft } from "./metrics";
import type { RunningActivityDraft, RoutePoint } from "./types";

const TRACK_POINT = /<(?:[\w.-]+:)?(trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?\1>/gi;
const SEGMENT_END = /<\/(?:[\w.-]+:)?(?:trkseg|trk|rte)\s*>/i;

function attribute(source: string, name: string): string | null {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

export function parseGpxTrack(xml: string): RoutePoint[] {
  if (xml.length > 5_000_000) throw new Error("Plik GPX jest za duży (maks. 5 MB).");
  const raw: Array<{
    lat: number;
    lng: number;
    timestamp: number;
    recordedAt: string;
    segment: number;
  }> = [];
  let match: RegExpExecArray | null;
  let previousPointEnd = 0;
  let segment = 0;
  TRACK_POINT.lastIndex = 0;

  while ((match = TRACK_POINT.exec(xml))) {
    // Track breaks represent missing GPS, not a measured straight line between tracks.
    if (SEGMENT_END.test(xml.slice(previousPointEnd, match.index))) segment += 1;
    previousPointEnd = TRACK_POINT.lastIndex;
    const latitude = attribute(match[2], "lat");
    const longitude = attribute(match[2], "lon");
    const lat = latitude?.trim() ? Number(latitude) : Number.NaN;
    const lng = longitude?.trim() ? Number(longitude) : Number.NaN;
    const timeText = match[3]
      .match(/<(?:[\w.-]+:)?time\b[^>]*>([^<]+)<\/(?:[\w.-]+:)?time>/i)?.[1]
      ?.trim();
    const timestamp = timeText ? Date.parse(timeText) : Number.NaN;
    if (
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      Number.isFinite(lng) &&
      lng >= -180 &&
      lng <= 180 &&
      Number.isFinite(timestamp)
    ) {
      const previous = raw.at(-1);
      if (previous && timestamp < previous.timestamp)
        throw new Error("Punkty GPX muszą być zapisane w kolejności czasu.");
      if (previous && timestamp === previous.timestamp) continue;
      raw.push({ lat, lng, timestamp, recordedAt: new Date(timestamp).toISOString(), segment });
    }
  }

  if (raw.length < 2) {
    throw new Error("GPX musi zawierać co najmniej 2 punkty trasy ze znacznikiem czasu.");
  }
  const startedAtMs = raw[0].timestamp;
  return raw.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    recordedAt: point.recordedAt,
    elapsedSec: Math.max(0, (point.timestamp - startedAtMs) / 1_000),
    segment: point.segment,
  }));
}

export function activityDraftFromGpx(input: {
  xml: string;
  date: string;
  sessionId: string;
}): RunningActivityDraft {
  const route = parseGpxTrack(input.xml);
  const startedAt = route[0].recordedAt;
  const endedAt = route.at(-1)!.recordedAt;
  const durationSec = route.at(-1)!.elapsedSec;
  if (durationSec <= 0) throw new Error("Czas w pliku GPX jest nieprawidłowy.");
  return buildRunningActivityDraft({
    sessionId: input.sessionId,
    date: input.date,
    startedAt,
    endedAt,
    durationSec,
    route,
    source: "gpx",
  });
}
