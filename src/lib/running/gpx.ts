import { buildRunningActivityDraft } from "./metrics";
import type { RunningActivityDraft, RoutePoint } from "./types";

const TRACK_POINT = /<(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|rtept)>/gi;

function attribute(source: string, name: string): string | null {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

export function parseGpxTrack(xml: string): RoutePoint[] {
  if (xml.length > 5_000_000) throw new Error("Plik GPX jest za duży (maks. 5 MB).");
  const raw: Array<{ lat: number; lng: number; timestamp: number; recordedAt: string }> = [];
  let match: RegExpExecArray | null;
  TRACK_POINT.lastIndex = 0;

  while ((match = TRACK_POINT.exec(xml))) {
    const lat = Number(attribute(match[1], "lat"));
    const lng = Number(attribute(match[1], "lon"));
    const timeText = match[2].match(/<time\b[^>]*>([^<]+)<\/time>/i)?.[1]?.trim();
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
      raw.push({ lat, lng, timestamp, recordedAt: new Date(timestamp).toISOString() });
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
