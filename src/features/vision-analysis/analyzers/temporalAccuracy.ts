import type { AnalysisContext, CalculatedMetric, DetectedEvent } from "../types";
import {
  calcTemporalResolutionNearEvents,
  computeMeasurementAccuracy,
  eventUncertaintyMs,
  formatResult,
  summedTimeUncertaintyMs,
  validateCalibrationQuality,
  speedUncertaintyMps,
  type MeasurementAccuracy,
  type FpsPolicy,
} from "../measurementAccuracy";
import { round } from "../physics";

/**
 * Wspólna warstwa niepewności CZASOWEJ dla testów opartych na czasie zdarzeń
 * (sprint, COD, hamowanie). Niepewność czasu = suma niepewności dwóch zdarzeń
 * (start/finish), każda = połowa odstępu klatek. Prędkość dziedziczy niepewność
 * czasu (dystans protokołu jest znany dokładnie).
 */
export function temporalAccuracy(input: {
  ev: DetectedEvent[];
  metrics: CalculatedMetric[];
  ctx: AnalysisContext;
  fpsPolicy: FpsPolicy;
  /** Klucz metryki czasu (np. sprint_time_s, total_time_s). */
  timeKey: string;
  /** Dystans protokołu w metrach (dla propagacji do prędkości), opcjonalnie. */
  distanceM?: number;
  maxRelativeUncertainty?: number;
}): { measurement: MeasurementAccuracy; metrics: CalculatedMetric[] } {
  const { ev, metrics, ctx, fpsPolicy, timeKey } = input;
  const temporal = calcTemporalResolutionNearEvents(ctx.poses, ev);
  const calibration = validateCalibrationQuality({ required: false, present: false });

  const evUnc = eventUncertaintyMs({ frameIntervalMs: temporal.frameIntervalMs });
  const startUncertaintyMs = evUnc;
  const finishUncertaintyMs = evUnc;
  const totalTimeUncertaintyMs = summedTimeUncertaintyMs(startUncertaintyMs, finishUncertaintyMs);
  const timeUncS = totalTimeUncertaintyMs / 1000;

  const timeMetric = metrics.find((m) => m.key === timeKey);
  const timeS = timeMetric?.value ?? 0;
  const relUnc = timeS > 0 ? timeUncS / timeS : 1;

  const distanceM = input.distanceM ?? 0;
  const speedUncMs =
    distanceM > 0 && timeS > 0 ? speedUncertaintyMps(distanceM, 0, timeS, timeUncS) : 0;

  const enriched = metrics.map((m) => {
    if (m.key === timeKey || m.unit === "s") {
      const f = formatResult(m.value, timeUncS, m.unit);
      return {
        ...m,
        uncertainty: f.uncertainty,
        displayPrecision: f.displayPrecision,
        display: f.display,
      };
    }
    if (m.unit === "m/s") {
      const f = formatResult(m.value, speedUncMs, m.unit);
      return {
        ...m,
        uncertainty: f.uncertainty,
        displayPrecision: f.displayPrecision,
        display: f.display,
      };
    }
    if (m.unit === "km/h") {
      const f = formatResult(m.value, round(speedUncMs * 3.6, 3), m.unit);
      return {
        ...m,
        uncertainty: f.uncertainty,
        displayPrecision: f.displayPrecision,
        display: f.display,
      };
    }
    return m;
  });

  const measurement = computeMeasurementAccuracy({
    domain: "temporal",
    fpsPolicy,
    temporal,
    calibration,
    relativeUncertainty: relUnc,
    maxRelativeUncertainty: input.maxRelativeUncertainty ?? 0.05,
    repeatability: "verified",
    protocolMatch: ev.length >= 2,
    referenceValidated: false,
  });

  return { measurement, metrics: enriched };
}
