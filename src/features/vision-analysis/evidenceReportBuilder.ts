/**
 * EvidenceReportBuilder — składa jeden, uczciwy raport dowodowy z wyniku analizy.
 *
 * Raport pokazuje wyłącznie to, co pipeline potrafi udowodnić: rzeczywiste FPS,
 * medianę odstępu klatek, rodzaj kalibracji, reprojectionError, mm/px, kluczowe
 * timestampy, niepewność każdej metryki i końcową niepewność wyniku, a także
 * czy wynik jest oficjalny. Nie deklaruje precyzji, której dane nie zapewniają.
 */

import type { VideoAnalysisResult } from "./types";
import type { ProtocolRecognition } from "./testProtocolRecognizer";
import { getTestProtocol } from "./testProtocols";

export interface EvidenceMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  uncertainty: number | null;
  display: string;
}

export interface EvidenceReport {
  testType: string;
  algorithmVersion: string;
  protocolVersion: string;
  measurementFamily: string;
  status: string;
  official: boolean;
  // Rozdzielczość czasowa
  measuredFps: number | null;
  frameIntervalMs: number | null;
  temporalResolutionMs: number | null;
  // Kalibracja
  calibrationType: string;
  usedHomography: boolean;
  reprojectionErrorPx: number | null;
  mmPerPixel: number | null;
  calibrationHash: string | null;
  // Zdarzenia i niepewność
  keyTimestamps: { type: string; timestampSeconds: number; confidence: number }[];
  metrics: EvidenceMetric[];
  resultRelativeUncertainty: number | null;
  qualityTier: string | null;
  // Rozpoznanie protokołu
  protocol: {
    detectedSignature: string;
    detectedTestConfidence: number;
    protocolMatch: boolean;
  } | null;
  qualityIssues: string[];
}

export function buildEvidenceReport(
  result: VideoAnalysisResult,
  recognition?: ProtocolRecognition | null,
): EvidenceReport {
  const protocol = getTestProtocol(result.testType);
  const m = result.measurement;
  const cal = result.calibration;

  const metrics: EvidenceMetric[] = result.metrics.map((mt) => ({
    key: mt.key,
    label: mt.label,
    value: mt.value,
    unit: mt.unit,
    uncertainty: mt.uncertainty ?? null,
    display: mt.display ?? `${mt.value}${mt.unit ? " " + mt.unit : ""}`,
  }));

  return {
    testType: result.testType,
    algorithmVersion: result.analyzerVersion,
    protocolVersion: protocol.protocolVersion,
    measurementFamily: protocol.measurementFamily,
    status: result.status,
    official: m?.officialResult ?? false,
    measuredFps: m?.sourceFrameRate ?? result.videoMetadata.fps ?? null,
    frameIntervalMs: m?.frameIntervalMs ?? null,
    temporalResolutionMs: m?.temporalResolutionMs ?? null,
    calibrationType: protocol.requiredCalibration,
    usedHomography: cal?.usedHomography ?? false,
    reprojectionErrorPx: cal?.reprojectionErrorPx ?? null,
    mmPerPixel: m?.spatialResolutionMmPerPixel ?? null,
    calibrationHash: cal?.calibrationHash ?? null,
    keyTimestamps: result.keyEvents.map((e) => ({
      type: e.type,
      timestampSeconds: e.timestampSeconds,
      confidence: e.confidence,
    })),
    metrics,
    resultRelativeUncertainty: m?.relativeUncertainty ?? null,
    qualityTier: m?.qualityTier ?? null,
    protocol: recognition
      ? {
          detectedSignature: recognition.detectedSignature,
          detectedTestConfidence: recognition.detectedTestConfidence,
          protocolMatch: recognition.protocolMatch,
        }
      : null,
    qualityIssues: result.qualityIssues,
  };
}
