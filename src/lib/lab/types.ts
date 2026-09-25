export type LabTestId =
  "cmj" | "single_leg_cmj" | "sprint_10m" | "flying_10m" | "cod_505" | "sprint_10m_ball";

export type LabSide = "left" | "right" | null;
export type LabMarkerKind = "takeoff" | "landing" | "start" | "finish" | "entry" | "exit";
export type LabGuideAxis = "horizontal" | "vertical";

export interface LabMarkerDefinition {
  key: LabMarkerKind;
  label: string;
  instruction: string;
}

export interface LabTestDefinition {
  id: LabTestId;
  category: "jump" | "speed" | "change" | "ball";
  title: string;
  shortDescription: string;
  setup: string[];
  markers: readonly [LabMarkerDefinition, LabMarkerDefinition];
  guideAxis: LabGuideAxis;
  guideMode: "shared" | "separate";
  trialsPerSide: number;
  sides: readonly LabSide[];
  maxCaptureSeconds: number;
  distanceMeters?: number;
}

export interface LabAttempt {
  id: string;
  testId: LabTestId;
  side: LabSide;
  trialNumber: number;
  trialsForSide: number;
  sequenceNumber: number;
  sequenceLength: number;
}

export interface NativeVideoCapture {
  path: string;
  fps: number;
  frameCount: number;
  durationSeconds: number;
  width: number;
  height: number;
  codec?: string;
}

export interface LabMarkers {
  firstFrame: number | null;
  secondFrame: number | null;
  trimStartFrame: number;
  trimEndFrame: number;
  firstGuidePosition: number;
  secondGuidePosition: number;
}

export interface LabMetrics {
  primaryValue: number;
  primaryUnit: "cm" | "s";
  elapsedSeconds: number;
  jumpHeightCm?: number;
  flightTimeSeconds?: number;
  averageSpeedMps?: number;
  speedKmh?: number;
  asymmetryPercent?: number;
  ballPenaltyPercent?: number;
}

export interface LabQuality {
  valid: boolean;
  reasons: string[];
  fpsVerified: boolean;
  frameResolutionMs: number;
  protocolVersion: string;
}

export interface LabResult {
  id: string;
  userId: string;
  batchId: string;
  testId: LabTestId;
  side: LabSide;
  trialNumber: number;
  recordedAt: string;
  fps: number;
  frameCount: number;
  firstFrame: number;
  secondFrame: number;
  trimStartFrame: number;
  trimEndFrame: number;
  firstGuidePosition: number;
  secondGuidePosition: number;
  guideAxis: LabGuideAxis;
  metrics: LabMetrics;
  quality: LabQuality;
  synced: boolean;
}

export interface LabSummaryRow {
  testId: LabTestId;
  title: string;
  side: LabSide;
  bestValue: number;
  unit: "cm" | "s";
  attempts: number;
}
