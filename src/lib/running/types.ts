export type RunningActivitySource = "gps" | "gpx";

export interface RoutePoint {
  lat: number;
  lng: number;
  recordedAt: string;
  /** Czas aktywnego biegu — pauza nie jest wliczana. */
  elapsedSec: number;
  accuracyM?: number;
}

export interface KilometerSplit {
  kilometer: number;
  distanceM: number;
  durationSec: number;
  paceSecPerKm: number;
  isPartial: boolean;
}

export type RunningIntervalKind = "work" | "recovery";
export type RunningIntervalTargetMode = "time" | "distance" | "manual";

export interface RunningIntervalTarget {
  mode: RunningIntervalTargetMode;
  /** Sekundy dla `time`, metry dla `distance`, null dla kroku ręcznego. */
  value: number | null;
  label: string;
  /** Krótkich odcinków GPS nie kończymy automatycznie ze względu na dokładność sygnału. */
  autoAdvance: boolean;
  /** Indywidualny zakres tempa; obecny tylko dla odcinków, nie dla przerw. */
  paceTarget?: {
    fastestSecPerKm: number;
    slowestSecPerKm: number;
    label: string;
  };
}

export interface RunningIntervalStep {
  id: string;
  kind: RunningIntervalKind;
  label: string;
  instruction: string;
  repeatIndex: number;
  repeatTotal: number;
  target: RunningIntervalTarget;
}

export interface RunningIntervalProtocol {
  title: string;
  summary: string;
  steps: RunningIntervalStep[];
}

export interface RunningIntervalResult {
  stepId: string;
  kind: RunningIntervalKind;
  label: string;
  repeatIndex: number;
  repeatTotal: number;
  targetMode: RunningIntervalTargetMode;
  targetValue: number | null;
  targetLabel: string;
  durationSec: number;
  distanceM: number;
  paceSecPerKm: number | null;
  targetPaceFastestSecPerKm?: number | null;
  targetPaceSlowestSecPerKm?: number | null;
  completed: boolean;
}

export interface RunningActivity {
  id: string;
  sessionId: string;
  date: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  avgPaceSecPerKm: number | null;
  route: RoutePoint[];
  splits: KilometerSplit[];
  intervalResults: RunningIntervalResult[];
  source: RunningActivitySource;
  createdAt: string;
  updatedAt: string;
}

export type RunningActivityDraft = Omit<RunningActivity, "id" | "createdAt" | "updatedAt">;
