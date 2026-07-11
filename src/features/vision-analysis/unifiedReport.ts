/**
 * UnifiedVisionReport — jeden, wspólny format raportu dla KAŻDEGO testu Vision Lab.
 *
 * Cel: każdy wynik — niezależnie od rodziny (skok, kontakt, dystans, sprint,
 * zmiana kierunku, hamowanie) — jest raportowany w identycznej strukturze,
 * z jawnym statusem wyniku, poziomem jakości, dowodem pomiaru ("Jak zmierzono")
 * i pełną listą prób. Raport NIGDY nie deklaruje dokładności, której dane nie
 * zapewniają: brak „100% pewności”, brak „wyniku laboratoryjnego”, brak
 * „wyniku dokładnego” bez walidacji. Liczba miejsc po przecinku wynika z
 * rzeczywistej niepewności (precisionFromUncertainty).
 *
 * Determinizm: te same wejścia zawsze dają identyczny raport.
 */

import type { VideoAnalysisResult, TestType } from "./types";
import type { SessionState, AttemptRecord } from "./attemptSessionManager";
import { getTestProtocol, type TestFamily } from "./testProtocols";
import { precisionFromUncertainty } from "./measurementAccuracy";

/** Jednolity status wyniku widoczny dla zawodnika i trenera. */
export type ResultStatus = "OFFICIAL" | "ESTIMATED" | "TECHNIQUE_ONLY" | "REJECTED";

/** Jednolity poziom jakości pomiaru (bez „LAB_GRADE” — nie mamy walidacji ref.). */
export type UnifiedQualityTier = "HIGH_ACCURACY" | "STANDARD_ESTIMATE" | "INSUFFICIENT_QUALITY";

export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  OFFICIAL: "Wynik oficjalny",
  ESTIMATED: "Wynik estymowany",
  TECHNIQUE_ONLY: "Tylko technika (bez pomiaru przestrzennego)",
  REJECTED: "Wynik odrzucony",
};

export const UNIFIED_QUALITY_TIER_LABELS: Record<UnifiedQualityTier, string> = {
  HIGH_ACCURACY: "Wysoka jakość pomiaru",
  STANDARD_ESTIMATE: "Estymacja na podstawie filmu",
  INSUFFICIENT_QUALITY: "Niewystarczająca jakość pomiaru",
};

/** Pojedyncza metryka raportu z niepewnością i dopasowaną precyzją. */
export interface ReportMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  uncertainty: number | null;
  displayPrecision: number;
  display: string;
}

/** Dowód pomiaru pojedynczego zdarzenia — sekcja „Jak zmierzono”. */
export interface HowMeasuredStep {
  eventType: string;
  /** Numer klatki bezpośrednio przed zdarzeniem. */
  frameBefore: number | null;
  /** Numer klatki bezpośrednio po zdarzeniu. */
  frameAfter: number | null;
  /** Punkt ciała używany do wyznaczenia zdarzenia (stopa/pięta/tułów). */
  markedBodyPart: string;
  /** Odniesienie przestrzenne (linia / podłoże / strefa). */
  reference: string;
  timestampSeconds: number;
  adapter: string;
  calibration: string;
  /** Niepewność momentu zdarzenia (ms) — połowa odstępu klatek. */
  uncertaintyMs: number | null;
}

/** Reprezentacja jednej próby w raporcie. */
export interface ReportAttempt {
  id: string;
  side: AttemptRecord["side"];
  valid: boolean;
  value: number | null;
  isBest: boolean;
}

export interface UnifiedVisionReport {
  // Nagłówek / tożsamość
  analysisId: string;
  selectedTestType: TestType;
  detectedTestType: string | null;
  detectedTestConfidence: number | null;
  protocolMatch: boolean;
  measurementFamily: TestFamily;

  // Status i jakość
  resultStatus: ResultStatus;
  qualityTier: UnifiedQualityTier;

  // Dane techniczne pomiaru
  measuredFrameRate: number | null;
  decodedFrames: number | null;
  analyzedFrames: number | null;
  calibrationHash: string | null;
  algorithmVersion: string;
  protocolVersion: string;

  // Zdarzenia i dowód pomiaru
  keyEvents: VideoAnalysisResult["keyEvents"];
  howMeasured: HowMeasuredStep[];

  // Próby i wynik
  attempts: ReportAttempt[];
  bestAttemptId: string | null;
  metrics: ReportMetric[];
  resultRelativeUncertainty: number | null;

  // Ostrzeżenia (bez stack trace’ów technicznych)
  warnings: string[];
}

/** Mapa status pipeline → jednolity status wyniku. */
function toResultStatus(result: VideoAnalysisResult): ResultStatus {
  switch (result.status) {
    case "technique_only":
      return "TECHNIQUE_ONLY";
    case "completed":
      return result.measurement?.officialResult ? "OFFICIAL" : "ESTIMATED";
    case "needs_review":
      return result.metrics.length > 0 ? "ESTIMATED" : "REJECTED";
    case "calibration_required":
    case "invalid_recording":
    case "failed":
    default:
      return "REJECTED";
  }
}

/** Mapa poziom jakości silnika → jednolity poziom (bez LAB_GRADE). */
function toQualityTier(result: VideoAnalysisResult): UnifiedQualityTier {
  const tier = result.measurement?.qualityTier;
  if (!tier) return "INSUFFICIENT_QUALITY";
  if (tier === "LAB_GRADE" || tier === "HIGH_ACCURACY") return "HIGH_ACCURACY";
  if (tier === "STANDARD_ESTIMATE") return "STANDARD_ESTIMATE";
  return "INSUFFICIENT_QUALITY";
}

/** Punkt ciała używany do wyznaczenia danego zdarzenia. */
function bodyPartForEvent(eventType: string): string {
  const t = eventType.toLowerCase();
  if (t.includes("takeoff") || t.includes("landing")) return "stopa / pięta";
  if (t.includes("contact")) return "stopa";
  if (t.includes("crossing") || t.includes("start") || t.includes("stop") || t.includes("turn"))
    return "tułów";
  return "tułów";
}

/** Odniesienie przestrzenne zdarzenia zależne od rodziny pomiaru. */
function referenceForFamily(family: TestFamily): string {
  switch (family) {
    case "VERTICAL_JUMP":
    case "REACTIVE_CONTACT":
      return "podłoże (kontakt stopy)";
    case "GROUND_DISTANCE":
      return "podłoże (skalibrowana homografia)";
    case "SPRINT_TIMING":
      return "linia pomiaru czasu (Timing Plane)";
    case "CHANGE_OF_DIRECTION":
      return "linie / strefy zwrotu (Timing Plane)";
    case "DECELERATION":
      return "strefa hamowania (BRAKING_ENTRY → STOP_ZONE)";
    default:
      return "brak (ocena techniki)";
  }
}

/**
 * Buduje jeden, uczciwy raport z wyniku analizy. Opcjonalnie łączy stan prób
 * (AttemptSessionManager) — jeśli nie podano, raportuje bieżącą analizę jako
 * jedną próbę.
 */
export function buildUnifiedReport(
  result: VideoAnalysisResult,
  session?: SessionState | null,
): UnifiedVisionReport {
  const protocol = getTestProtocol(result.testType);
  const m = result.measurement ?? null;
  const frameIntervalMs = m?.frameIntervalMs ?? null;
  const eventUncertaintyMs = frameIntervalMs != null ? Number((frameIntervalMs / 2).toFixed(3)) : null;

  // Metryki z precyzją dopasowaną do niepewności (nie odwrotnie).
  const metrics: ReportMetric[] = result.metrics.map((mt) => {
    const uncertainty = mt.uncertainty ?? null;
    const displayPrecision =
      mt.displayPrecision ?? (uncertainty != null ? precisionFromUncertainty(uncertainty) : 2);
    const display =
      mt.display ??
      (uncertainty != null && uncertainty > 0
        ? `${mt.value.toFixed(displayPrecision)} ± ${uncertainty.toFixed(Math.max(displayPrecision, 1))} ${mt.unit}`.trim()
        : `${mt.value.toFixed(displayPrecision)} ${mt.unit}`.trim());
    return {
      key: mt.key,
      label: mt.label,
      value: mt.value,
      unit: mt.unit,
      uncertainty,
      displayPrecision,
      display,
    };
  });

  // Sekcja „Jak zmierzono” — dowód pomiaru dla każdego kluczowego zdarzenia.
  const howMeasured: HowMeasuredStep[] = result.keyEvents.map((e) => ({
    eventType: e.type,
    frameBefore: e.frameIndex > 0 ? e.frameIndex - 1 : null,
    frameAfter: e.frameIndex + 1,
    markedBodyPart: bodyPartForEvent(e.type),
    reference: referenceForFamily(protocol.measurementFamily),
    timestampSeconds: e.timestampSeconds,
    adapter: `${result.testType}@${result.analyzerVersion}`,
    calibration: result.calibration?.calibrationHash ?? "brak / nie wymagana",
    uncertaintyMs: eventUncertaintyMs,
  }));

  // Próby: z sesji, jeśli dostępna; inaczej bieżąca analiza jako jedna próba.
  let attempts: ReportAttempt[] = [];
  let bestAttemptId: string | null = null;
  if (session) {
    const bilateral = session.protocol.attemptProtocol.bilateral;
    const bestIds = new Set<string>();
    if (bilateral) {
      if (session.perSide.left.best) bestIds.add(session.perSide.left.best.id);
      if (session.perSide.right.best) bestIds.add(session.perSide.right.best.id);
    } else if (session.perSide.none.best) {
      bestIds.add(session.perSide.none.best.id);
      bestAttemptId = session.perSide.none.best.id;
    }
    attempts = session.attempts.map((a) => ({
      id: a.id,
      side: a.side,
      valid: a.valid,
      value: a.value,
      isBest: bestIds.has(a.id),
    }));
  } else {
    const value = metrics[0]?.value ?? null;
    const valid = result.status === "completed" || result.status === "technique_only";
    attempts = [
      { id: result.analysisId, side: "none", valid, value, isBest: valid },
    ];
    bestAttemptId = valid ? result.analysisId : null;
  }

  return {
    analysisId: result.analysisId,
    selectedTestType: result.testType,
    detectedTestType: result.recognition?.detectedSignature ?? null,
    detectedTestConfidence: result.recognition?.detectedTestConfidence ?? null,
    protocolMatch: result.recognition?.protocolMatch ?? false,
    measurementFamily: protocol.measurementFamily,
    resultStatus: toResultStatus(result),
    qualityTier: toQualityTier(result),
    measuredFrameRate: m?.sourceFrameRate ?? result.videoMetadata.fps ?? null,
    decodedFrames: result.decodedFrames ?? null,
    analyzedFrames: result.analyzedFrames ?? null,
    calibrationHash: result.calibration?.calibrationHash ?? null,
    algorithmVersion: result.analyzerVersion,
    protocolVersion: protocol.protocolVersion,
    keyEvents: result.keyEvents,
    howMeasured,
    attempts,
    bestAttemptId,
    metrics,
    resultRelativeUncertainty: m?.relativeUncertainty ?? null,
    warnings: [...new Set(result.qualityIssues)],
  };
}
