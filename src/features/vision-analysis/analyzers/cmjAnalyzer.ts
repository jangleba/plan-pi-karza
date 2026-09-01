import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { detectFlightPhase, flightPhaseEvents } from "./jumpDetection";
import { footBottomSeries, hipYSeries, reliableLm, timeSeries } from "../poseSeries";
import { meanFinite, argMax } from "../signal";
import { jointAngleDeg, round, withinPlausibleRange, PLAUSIBLE_RANGES } from "../physics";
import { POSE, type FramePose } from "../types";
import {
  calcTemporalResolutionNearEvents,
  computeMeasurementAccuracy,
  eventUncertaintyMs,
  formatResult,
  jumpHeightUncertaintyCm,
  summedTimeUncertaintyMs,
  validateCalibrationQuality,
  JUMP_FPS_POLICY,
  type MeasurementAccuracy,
} from "../measurementAccuracy";

const MIN_FPS = 60;

/**
 * Standardowe przyspieszenie ziemskie (CODATA) używane WYŁĄCZNIE przy końcowej
 * konwersji czasu lotu → wysokość skoku. Nie mieszamy z GRAVITY = 9.81 z
 * pozostałych modułów, bo w tym miejscu każda cyfra znacząca ma znaczenie.
 */
const G_CMJ = 9.80665;

function movementStartFrame(ctx: AnalysisContext, lowestFrame: number): number | null {
  const hip = hipYSeries(ctx.poses);
  if (lowestFrame < 3 || !Number.isFinite(hip[lowestFrame])) return null;
  const baselineEnd = Math.max(3, Math.min(lowestFrame, Math.floor(hip.length * 0.2)));
  const baseline = meanFinite(hip.slice(0, baselineEnd));
  const depth = hip[lowestFrame] - baseline;
  if (!Number.isFinite(baseline) || depth < 0.01) return null;
  const threshold = baseline + Math.max(0.005, depth * 0.12);
  for (let i = 1; i <= lowestFrame; i++) {
    if (Number.isFinite(hip[i - 1]) && Number.isFinite(hip[i]) && hip[i - 1] < threshold && hip[i] >= threshold) {
      return i;
    }
  }
  return null;
}

function meanPair(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function jointAnglesAt(pose: FramePose | undefined): {
  knee: number | null;
  hip: number | null;
} {
  if (!pose) return { knee: null, hip: null };
  const side = (left: boolean) => {
    const shoulder = reliableLm(pose, left ? POSE.LEFT_SHOULDER : POSE.RIGHT_SHOULDER, 0.45);
    const hip = reliableLm(pose, left ? POSE.LEFT_HIP : POSE.RIGHT_HIP, 0.45);
    const knee = reliableLm(pose, left ? POSE.LEFT_KNEE : POSE.RIGHT_KNEE, 0.45);
    const ankle = reliableLm(pose, left ? POSE.LEFT_ANKLE : POSE.RIGHT_ANKLE, 0.45);
    return {
      knee: hip && knee && ankle ? jointAngleDeg(hip, knee, ankle) : null,
      hip: shoulder && hip && knee ? jointAngleDeg(shoulder, hip, knee) : null,
    };
  };
  const left = side(true);
  const right = side(false);
  return {
    knee: meanPair([left.knee, right.knee]),
    hip: meanPair([left.hip, right.hip]),
  };
}

function bodyHeightInFrame(ctx: AnalysisContext, beforeFrame: number): number | null {
  const foot = footBottomSeries(ctx.poses);
  const values: number[] = [];
  const end = Math.max(1, Math.min(beforeFrame, ctx.poses.length));
  for (let i = 0; i < end; i++) {
    const pose = ctx.poses[i];
    const left = reliableLm(pose, POSE.LEFT_SHOULDER, 0.45);
    const right = reliableLm(pose, POSE.RIGHT_SHOULDER, 0.45);
    if (!left || !right || !Number.isFinite(foot[i])) continue;
    const shoulderY = (left.y + right.y) / 2;
    const height = foot[i] - shoulderY;
    if (height > 0.15) values.push(height);
  }
  return values.length > 0 ? meanFinite(values) : null;
}

function events(ctx: AnalysisContext): DetectedEvent[] {
  const phase = detectFlightPhase(ctx.poses);
  if (!phase) return [];
  const base = flightPhaseEvents(phase, ctx.poses);
  const t = timeSeries(ctx.poses);
  // Dodatkowe zdarzenia dowodowe — sekcja „Jak zmierzono”.
  // Numery klatek i timestampy pochodzą bezpośrednio z sourceTimestampUs.
  const evidence: DetectedEvent[] = [];
  const beforeIdx = Math.max(0, phase.takeoffFrame - 1);
  evidence.push({
    type: "last_contact_before_takeoff",
    frameIndex: beforeIdx,
    timestampSeconds: t[beforeIdx] ?? phase.takeoffTime,
    confidence: phase.confidence,
  });
  evidence.push({
    type: "first_flight_frame",
    frameIndex: phase.takeoffFrame,
    timestampSeconds: t[phase.takeoffFrame] ?? phase.takeoffTime,
    confidence: phase.confidence,
  });
  const lastFlight = Math.max(phase.takeoffFrame, phase.landingFrame - 1);
  evidence.push({
    type: "last_flight_frame",
    frameIndex: lastFlight,
    timestampSeconds: t[lastFlight] ?? phase.landingTime,
    confidence: phase.confidence,
  });
  evidence.push({
    type: "first_landing_frame",
    frameIndex: phase.landingFrame,
    timestampSeconds: t[phase.landingFrame] ?? phase.landingTime,
    confidence: phase.confidence,
  });
  const startFrame = movementStartFrame(ctx, phase.lowestHipFrame);
  if (startFrame != null) {
    evidence.push({
      type: "movement_start",
      frameIndex: startFrame,
      timestampSeconds: t[startFrame] ?? 0,
      confidence: phase.confidence * 0.9,
    });
  }
  return [...base, ...evidence];
}

function metrics(ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
  const takeoff = ev.find((e) => e.type === "takeoff");
  const landing = ev.find((e) => e.type === "landing");
  const lowest = ev.find((e) => e.type === "lowest_position");
  const movementStart = ev.find((e) => e.type === "movement_start");
  if (!takeoff || !landing) return [];
  // Surowy czas lotu z realnych sourceTimestampUs (bez pre-zaokrągleń).
  const flightTime = landing.timestampSeconds - takeoff.timestampSeconds;
  if (
    !withinPlausibleRange(
      flightTime,
      PLAUSIBLE_RANGES.flight_time_s.min,
      PLAUSIBLE_RANGES.flight_time_s.max,
    )
  )
    return [];
  // h = g · t² / 8 (m) → cm. Zero zaokrągleń przed sekcją accuracy().
  const heightCm = ((G_CMJ * flightTime * flightTime) / 8) * 100;
  if (
    !withinPlausibleRange(
      heightCm,
      PLAUSIBLE_RANGES.jump_height_cm.min,
      PLAUSIBLE_RANGES.jump_height_cm.max,
    )
  )
    return [];

  const conf = takeoff.confidence;
  const out: CalculatedMetric[] = [
    {
      key: "jump_height_cm",
      label: "Wysokość wyskoku",
      value: heightCm,
      unit: "cm",
      confidence: conf,
    },
    {
      key: "flight_time_s",
      label: "Czas w powietrzu",
      value: flightTime,
      unit: "s",
      confidence: conf,
    },
  ];

  // Głębokość zejścia (countermovement) względem pozycji stojącej.
  if (lowest) {
    const hip = hipYSeries(ctx.poses);
    const standing = meanFinite(hip.slice(0, Math.max(2, Math.floor(hip.length * 0.1))));
    const depth = (hip[lowest.frameIndex] ?? standing) - standing; // Y rośnie w dół
    const bodyHeight = bodyHeightInFrame(ctx, lowest.frameIndex);
    if (bodyHeight && depth > 0) {
      out.push({
        key: "countermovement_depth_pct",
        label: "Głębokość zejścia",
        value: round((depth / bodyHeight) * 100, 1),
        unit: "% sylwetki",
        confidence: conf * 0.8,
      });
    }

    const angles = jointAnglesAt(ctx.poses[lowest.frameIndex]);
    if (angles.knee != null && angles.knee >= 20 && angles.knee <= 180) {
      out.push({
        key: "knee_angle_bottom_deg",
        label: "Kąt kolana w dole",
        value: round(angles.knee, 1),
        unit: "°",
        confidence: conf * 0.8,
      });
    }
    if (angles.hip != null && angles.hip >= 20 && angles.hip <= 180) {
      out.push({
        key: "hip_angle_bottom_deg",
        label: "Kąt biodra w dole",
        value: round(angles.hip, 1),
        unit: "°",
        confidence: conf * 0.8,
      });
    }

    const propulsionSeconds = takeoff.timestampSeconds - lowest.timestampSeconds;
    if (propulsionSeconds > 0 && propulsionSeconds < 1.5) {
      out.push({
        key: "propulsion_time_s",
        label: "Czas wybicia od najniższej pozycji",
        value: round(propulsionSeconds, 3),
        unit: "s",
        confidence: conf * 0.85,
      });
    }
  }

  if (movementStart) {
    const timeToTakeoff = takeoff.timestampSeconds - movementStart.timestampSeconds;
    if (timeToTakeoff > 0.1 && timeToTakeoff < 2.5) {
      out.push(
        {
          key: "time_to_takeoff_s",
          label: "Czas do wybicia",
          value: round(timeToTakeoff, 3),
          unit: "s",
          confidence: conf * 0.85,
        },
        {
          key: "rsi_modified",
          label: "RSI-mod (estymacja wideo)",
          value: round(heightCm / 100 / timeToTakeoff, 2),
          unit: "m/s",
          confidence: conf * 0.8,
        },
      );
      if (lowest) {
        const eccentricSeconds = lowest.timestampSeconds - movementStart.timestampSeconds;
        if (eccentricSeconds > 0) {
          out.push({
            key: "eccentric_phase_time_s",
            label: "Czas fazy zejścia",
            value: round(eccentricSeconds, 3),
            unit: "s",
            confidence: conf * 0.8,
          });
        }
      }
    }
  }
  return out;
}

function confidence(ev: DetectedEvent[]): ConfidenceResult {
  const perEvent = ev.map((e) => e.confidence);
  const overall = perEvent.length >= 2 ? Math.min(...perEvent) : 0;
  return { overall: round(overall, 2), perEvent };
}

function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  const phase = detectFlightPhase(ctx.poses);
  if (!phase) {
    // Nie wykryto pojedynczej fazy lotu — konkretny powód, NIE zamieniany
    // wyżej na TEST_PROTOCOL_MISMATCH.
    issues.push("EVENTS_NOT_DETECTED");
  }
  // Countermovement bywa niewidoczny przy szumie landmarków bioder w niższym FPS.
  // Zostawiamy go jako informację diagnostyczną (patrz metrics), nie jako twardy gate —
  // pojedyncza faza lotu z prawidłowym take-off/landing wystarcza do wyniku CMJ.
  return buildValidation(issues, [
    "INSUFFICIENT_FPS",
    "POSE_NOT_DETECTED",
    "ATHLETE_OUT_OF_FRAME",
    "MULTIPLE_PEOPLE",
    "EVENTS_NOT_DETECTED",
  ]);
}

/**
 * Warstwa rzetelności pomiaru dla CMJ. Liczy niepewność czasu lotu z realnej
 * rozdzielczości czasowej (mediana odstępu klatek) i propaguje ją na wysokość.
 * Pipeline jest deterministyczny (patrz test powtarzalności) → repeatability
 * = "verified". Bez urządzenia referencyjnego NIE przyznajemy LAB_GRADE.
 */
function accuracy(
  ev: DetectedEvent[],
  mtx: CalculatedMetric[],
  ctx: AnalysisContext,
): { measurement: MeasurementAccuracy; metrics: CalculatedMetric[] } {
  const temporal = calcTemporalResolutionNearEvents(ctx.poses, ev);
  const calibration = validateCalibrationQuality({ required: false, present: false });

  const flight = mtx.find((m) => m.key === "flight_time_s");
  const height = mtx.find((m) => m.key === "jump_height_cm");
  const flightTime = flight?.value ?? 0;

  // Niepewność pojedynczego zdarzenia = połowa odstępu klatek (konserwatywnie).
  const evUnc = eventUncertaintyMs({ frameIntervalMs: temporal.frameIntervalMs });
  const flightUncMs = summedTimeUncertaintyMs(evUnc, evUnc);
  const flightUncS = flightUncMs / 1000;
  const heightUncCm = jumpHeightUncertaintyCm(flightTime, flightUncS);
  const relUnc = flightTime > 0 ? flightUncS / flightTime : 1;

  const enriched: CalculatedMetric[] = mtx.map((m) => {
    if (m.key === "flight_time_s") {
      const f = formatResult(m.value, flightUncS, m.unit);
      // metric.value = wartość zaokrąglona wg niepewności → identyczna liczba
      // w karcie głównej, kluczowych metrykach, DB i raporcie technicznym.
      return {
        ...m,
        value: f.value,
        uncertainty: f.uncertainty,
        displayPrecision: f.displayPrecision,
        display: f.display,
      };
    }
    if (m.key === "jump_height_cm") {
      const f = formatResult(m.value, heightUncCm, m.unit);
      return {
        ...m,
        value: f.value,
        uncertainty: f.uncertainty,
        displayPrecision: f.displayPrecision,
        display: f.display,
      };
    }
    return m;
  });

  const measurement = computeMeasurementAccuracy({
    domain: "temporal",
    fpsPolicy: JUMP_FPS_POLICY,
    temporal,
    calibration,
    relativeUncertainty: relUnc,
    maxRelativeUncertainty: 0.05,
    repeatability: "verified",
    protocolMatch: ev.length >= 2,
    referenceValidated: false,
  });

  return { measurement, metrics: enriched };
}

export const cmjAnalyzer: TestAnalyzer = {
  testType: "cmj",
  analyzerVersion: "cmj-2.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (ev, ctx) => metrics(ev, ctx),
  calculateConfidence: (ev) => confidence(ev),
  computeAccuracy: (ev, mtx, ctx) => accuracy(ev, mtx, ctx),
};

// argMax re-eksport używany w testach jednostkowych scenariuszy.
export { argMax };
