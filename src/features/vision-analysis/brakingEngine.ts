/**
 * BrakingEngine — wspólny, deterministyczny silnik testów hamowania
 * (Sprint-to-Stop / DECELERATION).
 *
 * Protokół wymaga skalibrowanej strefy hamowania:
 *   - BRAKING_ENTRY    — linia wejścia w strefę hamowania,
 *   - STOP_ZONE_START  — początek strefy dozwolonego zatrzymania,
 *   - STOP_ZONE_END    — koniec strefy dozwolonego zatrzymania.
 *
 * Do wyniku liczbowego (prędkość, metry, droga hamowania) potrzebna jest PEŁNA
 * kalibracja: homografia podłoża + trzy linie strefy. Wtedy silnik zwraca:
 *   entryTimestampUs, entrySpeed, brakingStartTimestampUs, stopTimestampUs,
 *   brakingTime, brakingDistanceMm, contactsDuringBraking, bodyControlMetrics.
 *
 * Bez kalibracji dozwolony jest wyłącznie tryb TECHNIQUE_ONLY: bez prędkości,
 * metrów i drogi hamowania — tylko czas hamowania (s), liczba kontaktów i
 * metryki kontroli ciała liczone w pikselach.
 *
 * ZASADA GEOMETRYCZNA (niezmienna):
 *   - TUŁÓW służy WYŁĄCZNIE do pomiaru przecięć płaszczyzny czasowej (piksel,
 *     nigdy nie rzutowany przez homografię podłoża),
 *   - STOPA (rzutowana przez homografię, bo leży na podłożu) służy do pomiaru
 *     pozycji/prędkości w świecie, drogi hamowania i strefy zatrzymania.
 *
 * NIE liczymy siły reakcji podłoża ani przeciążenia z samego filmu.
 *
 * DETERMINIZM: ten sam film + ta sama kalibracja → identyczne klatki,
 * timestampy i wynik (10/10).
 */

import type { FramePose, TimingLineSpec } from "./types";
import { POSE } from "./types";
import type { Homography } from "./calibrationProfiles";
import { invert3x3, applyInverse } from "./homographyGeometry";
import { round } from "./physics";
import { TimingLineRegistry } from "./timingPlane";
import {
  frameSourceTimestampUs,
  torsoReferencePixel,
  medianIntervalUs,
  projectGroundLineU,
  MAX_CROSSING_UNCERTAINTY_MS,
} from "./calibratedLineCrossing";

export type BrakingErrorCode =
  | "BRAKING_ZONE_REQUIRED"
  | "TIMING_PLANE_CALIBRATION_FAILED"
  | "CALIBRATION_CAMERA_MOVED"
  | "ENTRY_SPEED_UNKNOWN"
  | "INVALID_APPROACH_SPRINT"
  | "NO_SPEED_REDUCTION"
  | "STOP_NOT_DETECTED"
  | "STOP_OUT_OF_ZONE"
  | "DIRECTION_CHANGE_NOT_STOP"
  | "CROSSING_UNCERTAINTY_TOO_HIGH";

export type BrakingMode = "CALIBRATED" | "TECHNIQUE_ONLY";
export type BrakingResultQuality = "OFFICIAL" | "ESTIMATED" | "TECHNIQUE_ONLY";

// --- Progi protokołu (deterministyczne) ---
/** Minimalna prędkość wejściowa uznawana za prawidłowy sprint (m/s). */
const MIN_APPROACH_SPEED_MS = 3;
/** Minimalna względna redukcja prędkości uznawana za hamowanie. */
const MIN_SPEED_REDUCTION = 0.5;
/** Prędkość uznawana za zatrzymanie (m/s). */
const STOP_SPEED_MS = 0.6;
/** Ujemna prędkość świadcząca o zmianie kierunku, nie zatrzymaniu (m/s). */
const REVERSE_SPEED_MS = -1;
/** Początek hamowania: prędkość spadła poniżej tego udziału prędkości wejściowej. */
const BRAKING_ONSET_FRACTION = 0.9;
/** Tolerancja pozycji zatrzymania względem strefy (mm). */
const STOP_ZONE_TOLERANCE_MM = 300;
/** Prędkość zatrzymania w pikselach/s dla trybu TECHNIQUE_ONLY. */
const STOP_SPEED_PX = 40;

const Y_SPAN = { min: 0, max: 3000 };

export interface BrakingInput {
  poses: FramePose[];
  homography: Homography | null;
  registry: TimingLineRegistry;
  width: number;
  height: number;
  cameraStable?: boolean | null;
  /** Znana prędkość wejściowa (m/s), gdy zmierzona zewnętrznie (bramka). */
  knownEntrySpeedMs?: number | null;
}

export interface BodyControlMetrics {
  /** Zakres pionowego wychylenia tułowia podczas hamowania (piksele). */
  torsoVerticalRangePx: number;
  /** Gładkość deceleracji: odchylenie std różnic prędkości (m/s), null w technice. */
  decelerationSmoothness: number | null;
}

export interface BrakingDebugRow {
  event: string;
  timestampUs: number;
  detail?: string;
}

export interface BrakingSuccess {
  ok: true;
  mode: BrakingMode;
  resultQuality: BrakingResultQuality;
  entryTimestampUs: number;
  entrySpeedMs: number | null;
  brakingStartTimestampUs: number;
  stopTimestampUs: number;
  brakingTimeS: number;
  brakingDistanceMm: number | null;
  contactsDuringBraking: number;
  bodyControl: BodyControlMetrics;
  elapsedUncertaintyMs: number;
  debug: BrakingDebugRow[];
}

export interface BrakingFailure {
  ok: false;
  resultQuality: "REJECTED";
  code: BrakingErrorCode;
  debug: BrakingDebugRow[];
}

export type BrakingResult = BrakingSuccess | BrakingFailure;

// ---------------------------------------------------------------------------
// Prymitywy
// ---------------------------------------------------------------------------

function fail(code: BrakingErrorCode, debug: BrakingDebugRow[]): BrakingFailure {
  return { ok: false, resultQuality: "REJECTED", code, debug };
}

interface FrameSample {
  idx: number;
  ts: number;
  torsoU: number;
  torsoV: number;
  feetWorldX: number | null;
  feetPxX: number | null;
  footYmax: number | null;
}

/** Środek linii/strefy w świecie (mm). */
function lineWorldX(line: TimingLineSpec): number | null {
  if (line.groundStartPointMm && line.groundEndPointMm) {
    return (line.groundStartPointMm.x + line.groundEndPointMm.x) / 2;
  }
  return typeof line.worldXmm === "number" ? line.worldXmm : null;
}

/** Rzut stopy (pięty/kostki) na podłoże (world x, mm) — średnia z widocznych stóp. */
function feetWorldX(
  p: FramePose,
  invH: Homography,
  width: number,
  height: number,
): number | null {
  const lm = p.landmarks;
  if (!lm) return null;
  const project = (heelIdx: number, ankleIdx: number): number | null => {
    const point = lm[heelIdx] ?? lm[ankleIdx];
    if (!point) return null;
    const g = applyInverse(invH, point.x * width, point.y * height);
    return g ? g.x : null;
  };
  const xs = [
    project(POSE.LEFT_HEEL, POSE.LEFT_ANKLE),
    project(POSE.RIGHT_HEEL, POSE.RIGHT_ANKLE),
  ].filter((v): v is number => v != null);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Pozioma pozycja stóp w pikselach (średnia) — dla trybu TECHNIQUE_ONLY. */
function feetPixelX(p: FramePose, width: number): number | null {
  const lm = p.landmarks;
  if (!lm) return null;
  const xs = [
    lm[POSE.LEFT_HEEL] ?? lm[POSE.LEFT_ANKLE],
    lm[POSE.RIGHT_HEEL] ?? lm[POSE.RIGHT_ANKLE],
  ]
    .filter((v): v is NonNullable<typeof v> => v != null)
    .map((v) => v.x * width);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Najniższy punkt stóp (footY, znormalizowany) — do wykrywania kontaktów. */
function footYmax(p: FramePose): number | null {
  const lm = p.landmarks;
  if (!lm) return null;
  const ys = [
    lm[POSE.LEFT_HEEL] ?? lm[POSE.LEFT_ANKLE],
    lm[POSE.RIGHT_HEEL] ?? lm[POSE.RIGHT_ANKLE],
  ]
    .filter((v): v is NonNullable<typeof v> => v != null)
    .map((v) => v.y);
  if (ys.length === 0) return null;
  return Math.max(...ys);
}

/** Buduje deterministyczną serię próbek (posortowane po czasie źródłowym). */
function buildSamples(
  input: BrakingInput,
  invH: Homography | null,
): FrameSample[] {
  const out: FrameSample[] = [];
  for (let i = 0; i < input.poses.length; i++) {
    const p = input.poses[i];
    const ts = frameSourceTimestampUs(p);
    const torso = torsoReferencePixel(p, input.width, input.height);
    if (ts == null || !torso) continue;
    out.push({
      idx: i,
      ts,
      torsoU: torso.u,
      torsoV: torso.v,
      feetWorldX: invH ? feetWorldX(p, invH, input.width, input.height) : null,
      feetPxX: feetPixelX(p, input.width),
      footYmax: footYmax(p),
    });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/** Prędkość świata (m/s) w indeksie k serii pozycji (central difference). */
function speedSeries(
  samples: FrameSample[],
  pos: (s: FrameSample) => number | null,
  toMeters: number,
): (number | null)[] {
  const speeds: (number | null)[] = samples.map(() => null);
  for (let k = 1; k < samples.length - 1; k++) {
    const a = samples[k - 1];
    const b = samples[k + 1];
    const xa = pos(a);
    const xb = pos(b);
    if (xa == null || xb == null) continue;
    const dt = (b.ts - a.ts) / 1_000_000;
    if (dt <= 0) continue;
    speeds[k] = ((xb - xa) * toMeters) / dt;
  }
  return speeds;
}

/** Liczba kontaktów hamujących między dwoma indeksami (zbocza narastające footY). */
function countContacts(samples: FrameSample[], from: number, to: number): number {
  const GROUND = 0.72;
  let contacts = 0;
  let below = true;
  for (let k = from; k <= to; k++) {
    const y = samples[k]?.footYmax;
    if (y == null) continue;
    if (below && y >= GROUND) {
      contacts++;
      below = false;
    } else if (!below && y < GROUND) {
      below = true;
    }
  }
  return contacts;
}

/** Odchylenie standardowe. */
function std(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varc = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(varc);
}

/** Pierwsze przecięcie linii przez tułów w kierunku "forward" (rosnące u). */
function firstForwardCrossingIdx(
  input: BrakingInput,
  samples: FrameSample[],
  line: TimingLineSpec,
): { idx: number; ts: number } | null {
  const lineU = projectGroundLineU(input.homography!, line, Y_SPAN);
  if (!lineU) return null;
  let prev: { signed: number; ts: number } | null = null;
  for (let k = 0; k < samples.length; k++) {
    const s = samples[k];
    const lu = lineU(s.torsoV);
    if (!Number.isFinite(lu)) continue;
    const signed = s.torsoU - lu;
    if (prev && prev.signed < 0 !== signed < 0 && prev.signed !== signed) {
      const dir = signed > prev.signed ? "forward" : "backward";
      if (dir === "forward") {
        const frac = prev.signed / (prev.signed - signed);
        const clamped = Math.min(1, Math.max(0, frac));
        return { idx: k, ts: Math.round(prev.ts + clamped * (s.ts - prev.ts)) };
      }
    }
    prev = { signed, ts: s.ts };
  }
  return null;
}

function classifyQuality(uncMs: number): "OFFICIAL" | "ESTIMATED" {
  return uncMs <= 6 ? "OFFICIAL" : "ESTIMATED";
}

// ---------------------------------------------------------------------------
// Główne wejście
// ---------------------------------------------------------------------------

/**
 * Wykrywa hamowanie. Gdy dostępna pełna kalibracja (homografia + 3 linie strefy)
 * → tryb CALIBRATED z pełnymi metrykami. W przeciwnym razie → TECHNIQUE_ONLY
 * (bez prędkości/metrów/drogi hamowania). Ruch kamery unieważnia próbę.
 */
export function detectBraking(input: BrakingInput): BrakingResult {
  const debug: BrakingDebugRow[] = [];

  if (input.cameraStable === false) return fail("CALIBRATION_CAMERA_MOVED", debug);

  const entryLine = input.registry.get("BRAKING_ENTRY");
  const zoneStart = input.registry.get("STOP_ZONE_START");
  const zoneEnd = input.registry.get("STOP_ZONE_END");
  const invH = input.homography ? invert3x3(input.homography) : null;
  const fullCalibration =
    !!input.homography && !!invH && !!entryLine && !!zoneStart && !!zoneEnd;

  if (!fullCalibration) {
    return techniqueOnly(input, debug);
  }
  if (input.homography && !invH) return fail("TIMING_PLANE_CALIBRATION_FAILED", debug);

  return calibrated(input, invH!, entryLine!, zoneStart!, zoneEnd!, debug);
}

// ---------------------------------------------------------------------------
// Tryb CALIBRATED
// ---------------------------------------------------------------------------

function calibrated(
  input: BrakingInput,
  invH: Homography,
  entryLine: TimingLineSpec,
  zoneStart: TimingLineSpec,
  zoneEnd: TimingLineSpec,
  debug: BrakingDebugRow[],
): BrakingResult {
  const samples = buildSamples(input, invH);
  if (samples.length < 4) return fail("STOP_NOT_DETECTED", debug);

  const zsX = lineWorldX(zoneStart);
  const zeX = lineWorldX(zoneEnd);
  if (zsX == null || zeX == null) return fail("BRAKING_ZONE_REQUIRED", debug);
  const zoneLo = Math.min(zsX, zeX);
  const zoneHi = Math.max(zsX, zeX);

  // Wejście do strefy (przecięcie BRAKING_ENTRY przez tułów).
  const entry = firstForwardCrossingIdx(input, samples, entryLine);
  if (!entry) return fail("INVALID_APPROACH_SPRINT", debug);
  debug.push({ event: "braking_entry", timestampUs: entry.ts });

  const speeds = speedSeries(samples, (s) => s.feetWorldX, 1 / 1000);

  // Prędkość wejściowa: znana z bramki albo z okna przed wejściem.
  let entrySpeed: number | null = input.knownEntrySpeedMs ?? null;
  if (entrySpeed == null) {
    const pre = speeds
      .slice(Math.max(0, entry.idx - 6), entry.idx + 1)
      .filter((v): v is number => v != null && v > 0);
    if (pre.length === 0) return fail("ENTRY_SPEED_UNKNOWN", debug);
    pre.sort((a, b) => a - b);
    entrySpeed = pre[Math.floor(pre.length / 2)];
  }
  debug.push({ event: "entry_speed", timestampUs: entry.ts, detail: `${round(entrySpeed, 2)} m/s` });

  if (entrySpeed < MIN_APPROACH_SPEED_MS) return fail("INVALID_APPROACH_SPRINT", debug);

  // Analiza fazy po wejściu.
  const post = speeds
    .map((v, k) => ({ v, k }))
    .filter((e) => e.k >= entry.idx && e.v != null) as { v: number; k: number }[];
  if (post.length < 2) return fail("STOP_NOT_DETECTED", debug);

  const minSpeed = Math.min(...post.map((e) => e.v));
  const reduction = (entrySpeed - minSpeed) / entrySpeed;
  if (reduction < MIN_SPEED_REDUCTION) return fail("NO_SPEED_REDUCTION", debug);

  // Zmiana kierunku zamiast zatrzymania.
  if (minSpeed < REVERSE_SPEED_MS) return fail("DIRECTION_CHANGE_NOT_STOP", debug);

  // Początek hamowania: pierwsza klatka po wejściu z prędkością < 90% wejściowej.
  const brakingStart = post.find((e) => e.v < entrySpeed * BRAKING_ONSET_FRACTION);
  if (!brakingStart) return fail("NO_SPEED_REDUCTION", debug);
  const brakingStartTs = samples[brakingStart.k].ts;
  debug.push({ event: "braking_start", timestampUs: brakingStartTs });

  // Zatrzymanie: pierwsza klatka po starcie hamowania z prędkością ≤ progu stopu.
  const stop = post.find((e) => e.k >= brakingStart.k && e.v <= STOP_SPEED_MS);
  if (!stop) return fail("STOP_NOT_DETECTED", debug);
  const stopTs = samples[stop.k].ts;
  debug.push({ event: "stop", timestampUs: stopTs });

  // Pozycja zatrzymania w strefie.
  const stopX = samples[stop.k].feetWorldX;
  if (stopX == null) return fail("STOP_NOT_DETECTED", debug);
  if (stopX < zoneLo - STOP_ZONE_TOLERANCE_MM || stopX > zoneHi + STOP_ZONE_TOLERANCE_MM) {
    debug.push({ event: "stop_position", timestampUs: stopTs, detail: `${round(stopX, 0)} mm` });
    return fail("STOP_OUT_OF_ZONE", debug);
  }

  const startX = samples[brakingStart.k].feetWorldX;
  const brakingDistanceMm =
    startX != null ? round(Math.abs(stopX - startX), 1) : null;
  const brakingTimeS = round((stopTs - brakingStartTs) / 1_000_000, 4);
  const contacts = countContacts(samples, brakingStart.k, stop.k);

  // Niepewność czasu z odstępów klatek.
  const frameIntervalUs = medianIntervalUs(input.poses);
  const singleUncMs = round(frameIntervalUs / 2 / 1000, 3);
  const elapsedUncertaintyMs = round(Math.hypot(singleUncMs, singleUncMs), 3);
  if (singleUncMs > MAX_CROSSING_UNCERTAINTY_MS) {
    return fail("CROSSING_UNCERTAINTY_TOO_HIGH", debug);
  }

  const bodyControl = buildBodyControl(samples, entry.idx, stop.k, post);

  return {
    ok: true,
    mode: "CALIBRATED",
    resultQuality: classifyQuality(singleUncMs),
    entryTimestampUs: entry.ts,
    entrySpeedMs: round(entrySpeed, 2),
    brakingStartTimestampUs: brakingStartTs,
    stopTimestampUs: stopTs,
    brakingTimeS,
    brakingDistanceMm,
    contactsDuringBraking: contacts,
    bodyControl,
    elapsedUncertaintyMs,
    debug,
  };
}

function buildBodyControl(
  samples: FrameSample[],
  fromIdx: number,
  toIdx: number,
  post: { v: number; k: number }[],
): BodyControlMetrics {
  const torsoVs = samples.slice(fromIdx, toIdx + 1).map((s) => s.torsoV);
  const torsoVerticalRangePx =
    torsoVs.length > 0 ? round(Math.max(...torsoVs) - Math.min(...torsoVs), 2) : 0;
  const diffs: number[] = [];
  const decel = post.filter((e) => e.k >= fromIdx && e.k <= toIdx);
  for (let i = 1; i < decel.length; i++) diffs.push(decel[i].v - decel[i - 1].v);
  const decelerationSmoothness = diffs.length > 0 ? round(std(diffs), 4) : null;
  return { torsoVerticalRangePx, decelerationSmoothness };
}

// ---------------------------------------------------------------------------
// Tryb TECHNIQUE_ONLY (bez kalibracji: brak prędkości/metrów/drogi)
// ---------------------------------------------------------------------------

function techniqueOnly(input: BrakingInput, debug: BrakingDebugRow[]): BrakingResult {
  const samples = buildSamples(input, null);
  if (samples.length < 4) return fail("STOP_NOT_DETECTED", debug);

  // Prędkość w pikselach (do wykrycia hamowania i zatrzymania) po torsie.
  const speedsPx = speedSeries(samples, (s) => s.torsoU, 1);
  const valid = speedsPx
    .map((v, k) => ({ v, k }))
    .filter((e) => e.v != null) as { v: number; k: number }[];
  if (valid.length < 3) return fail("STOP_NOT_DETECTED", debug);

  const absSpeeds = valid.map((e) => Math.abs(e.v));
  const peak = Math.max(...absSpeeds);
  if (peak <= 0) return fail("NO_SPEED_REDUCTION", debug);

  // Faza szybka (peak) → punkt startu hamowania.
  const peakEntry = valid.find((e) => Math.abs(e.v) >= peak * BRAKING_ONSET_FRACTION);
  if (!peakEntry) return fail("NO_SPEED_REDUCTION", debug);

  // Zmiana kierunku (znak prędkości się odwraca po fazie szybkiej).
  const sign = Math.sign(peakEntry.v);
  const reversed = valid.find((e) => e.k > peakEntry.k && Math.sign(e.v) === -sign && Math.abs(e.v) > STOP_SPEED_PX);
  const stop = valid.find((e) => e.k >= peakEntry.k && Math.abs(e.v) <= STOP_SPEED_PX);

  if (reversed && (!stop || reversed.k < stop.k)) {
    return fail("DIRECTION_CHANGE_NOT_STOP", debug);
  }
  if (!stop) return fail("STOP_NOT_DETECTED", debug);

  const brakingStartTs = samples[peakEntry.k].ts;
  const stopTs = samples[stop.k].ts;
  debug.push({ event: "technique_only", timestampUs: brakingStartTs, detail: "no calibration" });
  debug.push({ event: "braking_start", timestampUs: brakingStartTs });
  debug.push({ event: "stop", timestampUs: stopTs });

  const brakingTimeS = round((stopTs - brakingStartTs) / 1_000_000, 4);
  const contacts = countContacts(samples, peakEntry.k, stop.k);
  const torsoVs = samples.slice(peakEntry.k, stop.k + 1).map((s) => s.torsoV);
  const torsoVerticalRangePx =
    torsoVs.length > 0 ? round(Math.max(...torsoVs) - Math.min(...torsoVs), 2) : 0;

  return {
    ok: true,
    mode: "TECHNIQUE_ONLY",
    resultQuality: "TECHNIQUE_ONLY",
    entryTimestampUs: brakingStartTs,
    entrySpeedMs: null,
    brakingStartTimestampUs: brakingStartTs,
    stopTimestampUs: stopTs,
    brakingTimeS,
    brakingDistanceMm: null,
    contactsDuringBraking: contacts,
    bodyControl: { torsoVerticalRangePx, decelerationSmoothness: null },
    elapsedUncertaintyMs: 0,
    debug,
  };
}

export { MAX_CROSSING_UNCERTAINTY_MS };
