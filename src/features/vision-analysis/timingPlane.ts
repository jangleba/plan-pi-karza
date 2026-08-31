/**
 * Timing Plane — wspólna warstwa pomiaru czasu dla wszystkich testów sprintu.
 *
 * Składa się z trzech nazwanych elementów wymaganych przez protokół:
 *  - TimingLineRegistry — rejestr skalibrowanych linii pomiaru czasu z rolami
 *    (START / FINISH / TIMING_A / TIMING_B) i znanymi punktami podłoża (mm).
 *  - TimingPlaneCrossingEngine — silnik detekcji przecięcia płaszczyzny
 *    pomiarowej zdefiniowanej przez linię na podłożu i geometrię kamery.
 *  - CrossingUncertaintyCalculator — deterministyczne liczenie niepewności
 *    momentu przecięcia (ms) z realnych odstępów sourceTimestampUs.
 *
 * ZASADA GEOMETRYCZNA (niezmienna):
 *  Homografia dotyczy WYŁĄCZNIE punktów podłoża (linie, markery, strefy, stopy).
 *  Punkt tułowia NIGDY nie jest rzutowany przez homografię podłoża — używamy
 *  jednego STABILNEGO torsoReferencePoint (piksel) i porównujemy go z rzutem
 *  linii podłoża (Timing Plane) w obrazie.
 *
 * DETERMINIZM:
 *  Ten sam film + ta sama kalibracja + ten sam protokół → identyczne
 *  frameBeforeIndex, frameAfterIndex, signedDistanceToPlane, crossingTimestampUs,
 *  interpolationFraction i elapsedTime.
 */

import type { FramePose, TimingLineSpec, TimingLineRole } from "./types";
import { POSE } from "./types";
import type { Homography } from "./calibrationProfiles";
import { invert3x3, applyInverse } from "./homographyGeometry";
import { round } from "./physics";
import {
  detectCalibratedCrossings,
  MAX_CROSSING_UNCERTAINTY_MS,
  type LineCrossing,
  type CrossingDebugRow,
  type LineCrossingErrorCode,
} from "./calibratedLineCrossing";

export type { TimingLineRole };

/** Kod błędu bramek jakości silnika Timing Plane (rozszerza kody przecięcia). */
export type TimingPlaneErrorCode =
  | LineCrossingErrorCode
  | "MISSING_TIMING_LINE"
  | "ATHLETE_TOO_SMALL"
  | "TORSO_OCCLUDED"
  | "INVALID_CAMERA_GEOMETRY"
  | "DISTANCE_UNKNOWN";

/** Jakość wyniku — nie udajemy oficjalnego czasu, gdy dane są słabe. */
export type ResultQuality = "OFFICIAL" | "ESTIMATED" | "REJECTED";

/** Minimalny udział wysokości sylwetki w kadrze (0-1). Poniżej → za mała. */
export const MIN_SILHOUETTE_HEIGHT_FRACTION = 0.18;
/** Minimalna średnia widoczność punktów tułowia. Poniżej → zasłonięty. */
export const MIN_TORSO_VISIBILITY = 0.4;
/** Próg niepewności dla wyniku OFFICIAL (ms). Powyżej (do limitu) → ESTIMATED. */
export const OFFICIAL_UNCERTAINTY_MS = 6;

// ---------------------------------------------------------------------------
// TimingLineRegistry
// ---------------------------------------------------------------------------

/**
 * Rejestr linii pomiaru czasu przypisanych do kalibracji filmu. Normalizuje
 * definicje (uzupełnia worldXmm z punktów podłoża) i udostępnia wyszukiwanie
 * po roli oraz liczenie znanego dystansu między rolami z punktów podłoża.
 */
export class TimingLineRegistry {
  private readonly byRole = new Map<TimingLineRole, TimingLineSpec>();
  readonly lines: TimingLineSpec[];

  constructor(lines: TimingLineSpec[] | null | undefined) {
    this.lines = (lines ?? []).map(normalizeLine);
    for (const line of this.lines) {
      if (line.role && !this.byRole.has(line.role)) this.byRole.set(line.role, line);
    }
  }

  static from(lines: TimingLineSpec[] | null | undefined): TimingLineRegistry {
    return new TimingLineRegistry(lines);
  }

  get size(): number {
    return this.lines.length;
  }

  has(role: TimingLineRole): boolean {
    return this.byRole.has(role);
  }

  get(role: TimingLineRole): TimingLineSpec | null {
    return this.byRole.get(role) ?? null;
  }

  /** Czy zdefiniowano komplet wymaganych ról. */
  hasRoles(roles: TimingLineRole[]): boolean {
    return roles.every((r) => this.byRole.has(r));
  }

  /** Podzbiór linii dla wybranych ról (w kolejności ról). */
  select(roles: TimingLineRole[]): TimingLineSpec[] {
    const out: TimingLineSpec[] = [];
    for (const r of roles) {
      const l = this.byRole.get(r);
      if (l) out.push(l);
    }
    return out;
  }

  /**
   * Znany dystans (mm) między dwiema rolami wyliczony z punktów podłoża.
   * Zwraca null, gdy którakolwiek linia nie ma pełnych punktów podłoża.
   */
  knownDistanceMm(a: TimingLineRole, b: TimingLineRole): number | null {
    const la = this.byRole.get(a);
    const lb = this.byRole.get(b);
    if (!la || !lb) return null;
    const ca = lineCenterMm(la);
    const cb = lineCenterMm(lb);
    if (!ca || !cb) {
      if (typeof la.worldXmm === "number" && typeof lb.worldXmm === "number") {
        return round(Math.abs(lb.worldXmm - la.worldXmm), 2);
      }
      return null;
    }
    return round(Math.hypot(cb.x - ca.x, cb.y - ca.y), 2);
  }
}

/** Uzupełnia worldXmm ze środka punktów podłoża, gdy brakuje (spójność legacy). */
function normalizeLine(line: TimingLineSpec): TimingLineSpec {
  if (typeof line.worldXmm === "number") return line;
  const c = lineCenterMm(line);
  return c ? { ...line, worldXmm: c.x } : line;
}

function lineCenterMm(line: TimingLineSpec): { x: number; y: number } | null {
  if (line.groundStartPointMm && line.groundEndPointMm) {
    return {
      x: (line.groundStartPointMm.x + line.groundEndPointMm.x) / 2,
      y: (line.groundStartPointMm.y + line.groundEndPointMm.y) / 2,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// CrossingUncertaintyCalculator
// ---------------------------------------------------------------------------

/**
 * Deterministyczne liczenie niepewności czasu z realnych odstępów klatek.
 * Bazą jest połowa mediany odstępu klatek (rozdzielczość próbkowania), a łączna
 * niepewność dwóch przecięć to suma kwadratowa (RSS).
 */
export const CrossingUncertaintyCalculator = {
  frameIntervalMs(poses: FramePose[]): number {
    const ts = poses
      .map(sourceUs)
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => a - b);
    if (ts.length < 2) return 0;
    const diffs: number[] = [];
    for (let i = 1; i < ts.length; i++) {
      const d = ts[i] - ts[i - 1];
      if (d > 0) diffs.push(d);
    }
    if (diffs.length === 0) return 0;
    diffs.sort((a, b) => a - b);
    return diffs[Math.floor(diffs.length / 2)] / 1000;
  },
  singleCrossingMs(poses: FramePose[]): number {
    return round(this.frameIntervalMs(poses) / 2, 3);
  },
  elapsedMs(a: LineCrossing, b: LineCrossing): number {
    return round(Math.hypot(a.crossingUncertaintyMs, b.crossingUncertaintyMs), 3);
  },
};

function sourceUs(p: FramePose): number | null {
  if (typeof p.sourceTimestampUs === "number") return p.sourceTimestampUs;
  if (typeof p.sourceTimestampMs === "number") return Math.round(p.sourceTimestampMs * 1000);
  return null;
}

// ---------------------------------------------------------------------------
// Bramki jakości sylwetki / tułowia / geometrii
// ---------------------------------------------------------------------------

/** Mediana udziału wysokości sylwetki w kadrze (0-1) — nose→ankles. */
function silhouetteHeightFraction(poses: FramePose[]): number {
  const fracs: number[] = [];
  for (const p of poses) {
    const lm = p.landmarks;
    if (!lm) continue;
    const top = lm[POSE.NOSE];
    const la = lm[POSE.LEFT_ANKLE];
    const ra = lm[POSE.RIGHT_ANKLE];
    if (!top || (!la && !ra)) continue;
    const bottomY = Math.max(la?.y ?? 0, ra?.y ?? 0);
    const h = bottomY - top.y;
    if (Number.isFinite(h) && h > 0) fracs.push(h);
  }
  if (fracs.length === 0) return 0;
  fracs.sort((a, b) => a - b);
  return fracs[Math.floor(fracs.length / 2)];
}

/** Mediana widoczności punktów tułowia (ramiona + biodra). */
function torsoVisibility(poses: FramePose[]): number {
  const vis: number[] = [];
  for (const p of poses) {
    const lm = p.landmarks;
    if (!lm) continue;
    const ids = [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER, POSE.LEFT_HIP, POSE.RIGHT_HIP];
    const vals = ids
      .map((i) => lm[i]?.visibility)
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 4) vis.push(vals.reduce((a, b) => a + b, 0) / 4);
  }
  if (vis.length === 0) return 0;
  vis.sort((a, b) => a - b);
  return vis[Math.floor(vis.length / 2)];
}

/** Czy homografia daje sensowną, odwracalną geometrię płaszczyzny. */
function cameraGeometryValid(homography: Homography, width: number, height: number): boolean {
  const inv = invert3x3(homography);
  if (!inv) return false;
  return applyInverse(inv, width / 2, height / 2) != null;
}

// ---------------------------------------------------------------------------
// TimingPlaneCrossingEngine
// ---------------------------------------------------------------------------

export interface TimingPlaneInput {
  poses: FramePose[];
  homography: Homography | null;
  registry: TimingLineRegistry;
  /** Role linii wymagane przez protokół (np. START+FINISH lub TIMING_A+TIMING_B). */
  requiredRoles: TimingLineRole[];
  width: number;
  height: number;
  cameraStable?: boolean | null;
  /** Znany dystans protokołu (mm) — dla dystansów fizycznie ustalonych. */
  protocolDistanceMm?: number | null;
}

export interface TimingPlaneCrossing extends LineCrossing {
  role: TimingLineRole | null;
  /** Podpisana odległość tułowia od płaszczyzny w klatce po przecięciu (px). */
  signedDistanceToPlane: number;
}

export interface TimingPlaneSuccess {
  ok: true;
  resultQuality: Exclude<ResultQuality, "REJECTED">;
  crossings: TimingPlaneCrossing[];
  /** Dystans użyty do pomiaru (mm) — znany fizycznie lub z kalibracji. */
  distanceMm: number;
  /** Łączna niepewność czasu między pierwszym a ostatnim przecięciem (ms). */
  elapsedUncertaintyMs: number;
  debug: CrossingDebugRow[];
}

export interface TimingPlaneFailure {
  ok: false;
  resultQuality: "REJECTED";
  code: TimingPlaneErrorCode;
  debug: CrossingDebugRow[];
}

export type TimingPlaneResult = TimingPlaneSuccess | TimingPlaneFailure;

/**
 * Główne wejście silnika płaszczyzny pomiarowej. Uruchamia bramki jakości,
 * następnie deterministyczny CalibratedLineCrossingEngine, a na końcu klasyfikuje
 * wynik jako OFFICIAL / ESTIMATED / REJECTED. Nigdy nie udaje oficjalnego czasu.
 */
export function detectTimingPlaneCrossings(input: TimingPlaneInput): TimingPlaneResult {
  const empty: CrossingDebugRow[] = [];

  // 1. Kamera nieruchoma.
  if (input.cameraStable === false) {
    return { ok: false, resultQuality: "REJECTED", code: "CALIBRATION_CAMERA_MOVED", debug: empty };
  }
  // 2. Homografia + geometria kamery.
  if (!input.homography) {
    return {
      ok: false,
      resultQuality: "REJECTED",
      code: "TIMING_LINE_NOT_CALIBRATED",
      debug: empty,
    };
  }
  if (!cameraGeometryValid(input.homography, input.width, input.height)) {
    return { ok: false, resultQuality: "REJECTED", code: "INVALID_CAMERA_GEOMETRY", debug: empty };
  }
  // 3. Wymagane role linii.
  if (input.registry.size === 0) {
    return {
      ok: false,
      resultQuality: "REJECTED",
      code: "TIMING_LINE_NOT_CALIBRATED",
      debug: empty,
    };
  }
  if (!input.registry.hasRoles(input.requiredRoles)) {
    return { ok: false, resultQuality: "REJECTED", code: "MISSING_TIMING_LINE", debug: empty };
  }
  // 4. Znany dystans.
  const distanceMm = resolveDistanceMm(input);
  if (distanceMm == null || !(distanceMm > 0)) {
    return { ok: false, resultQuality: "REJECTED", code: "DISTANCE_UNKNOWN", debug: empty };
  }
  // 5. Sylwetka wystarczająco duża.
  if (silhouetteHeightFraction(input.poses) < MIN_SILHOUETTE_HEIGHT_FRACTION) {
    return { ok: false, resultQuality: "REJECTED", code: "ATHLETE_TOO_SMALL", debug: empty };
  }
  // 6. Tułów widoczny (referencyjny punkt czasu).
  if (torsoVisibility(input.poses) < MIN_TORSO_VISIBILITY) {
    return { ok: false, resultQuality: "REJECTED", code: "TORSO_OCCLUDED", debug: empty };
  }

  const lines = input.registry.select(input.requiredRoles);
  const res = detectCalibratedCrossings({
    poses: input.poses,
    homography: input.homography,
    timingLines: lines,
    width: input.width,
    height: input.height,
    cameraStable: input.cameraStable ?? true,
  });

  if (!res.ok) {
    return { ok: false, resultQuality: "REJECTED", code: res.code, debug: res.debug };
  }

  // Powiąż przecięcia z rolami po lineId.
  const roleById = new Map<string, TimingLineRole | null>();
  for (const l of lines) roleById.set(l.id, l.role ?? null);
  const debugByLine = new Map<string, CrossingDebugRow>();
  for (const row of res.debug) debugByLine.set(row.lineId, row);

  const crossings: TimingPlaneCrossing[] = res.crossings.map((c) => ({
    ...c,
    role: roleById.get(c.lineId) ?? null,
    signedDistanceToPlane: signedDistance(debugByLine.get(c.lineId)),
  }));

  // Każda linia może zostać przecięta poprawnym kierunkiem osobno, ale cały
  // test jest ważny dopiero wtedy, gdy role wystąpiły w kolejności protokołu.
  // Chroni to przed zaakceptowaniem nagrania odtworzonego od środka, źle
  // opisanych linii albo geometrii z odwróconą osią toru.
  const crossingByRole = new Map<TimingLineRole, TimingPlaneCrossing>();
  for (const crossing of crossings) {
    if (crossing.role && !crossingByRole.has(crossing.role)) {
      crossingByRole.set(crossing.role, crossing);
    }
  }
  const protocolCrossings = input.requiredRoles
    .map((role) => crossingByRole.get(role))
    .filter((crossing): crossing is TimingPlaneCrossing => !!crossing);
  for (let i = 1; i < protocolCrossings.length; i++) {
    if (protocolCrossings[i].crossingTimestampUs <= protocolCrossings[i - 1].crossingTimestampUs) {
      return {
        ok: false,
        resultQuality: "REJECTED",
        code: "WRONG_CROSSING_DIRECTION",
        debug: res.debug,
      };
    }
  }

  const ordered = [...crossings].sort((a, b) => a.crossingTimestampUs - b.crossingTimestampUs);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const elapsedUncertaintyMs = CrossingUncertaintyCalculator.elapsedMs(first, last);
  const maxUnc = Math.max(...crossings.map((c) => c.crossingUncertaintyMs));

  const resultQuality: Exclude<ResultQuality, "REJECTED"> =
    maxUnc <= OFFICIAL_UNCERTAINTY_MS ? "OFFICIAL" : "ESTIMATED";

  return {
    ok: true,
    resultQuality,
    crossings,
    distanceMm,
    elapsedUncertaintyMs,
    debug: res.debug,
  };
}

function signedDistance(row: CrossingDebugRow | undefined): number {
  if (!row || row.lineImageU == null || !Number.isFinite(row.torsoUAfter)) return NaN;
  return round(row.torsoUAfter - row.lineImageU, 2);
}

function resolveDistanceMm(input: TimingPlaneInput): number | null {
  const [a, b] = input.requiredRoles;
  if (a && b) {
    const known = input.registry.knownDistanceMm(a, b);
    if (known != null && known > 0) return known;
  }
  if (typeof input.protocolDistanceMm === "number" && input.protocolDistanceMm > 0) {
    return input.protocolDistanceMm;
  }
  return null;
}

export { MAX_CROSSING_UNCERTAINTY_MS };
