import { supabase } from "@/integrations/supabase/client";
import type {
  VisionTestResult,
  FrameAnalysisResult,
  VisionCameraView,
  VisionMetric,
  MarkedBy,
} from "./types";
import { getVisionTest } from "./visionTests";
import { getVisionResult, listVisionResults, computeComparison } from "./visionRepo";

// Luźny klient — tabela vision_tests nie jest w wygenerowanych typach.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const LS_KEY = "vision_results_v1";

/** Kontekst zapisu wyniku analizy klatkowej. */
export interface SaveFrameResultInput {
  userId: string | null;
  frame: FrameAnalysisResult;
  videoUrl: string | null;
  cameraView: VisionCameraView | null;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLocal(): VisionTestResult[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]") as VisionTestResult[];
  } catch {
    return [];
  }
}

function writeLocal(items: VisionTestResult[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

/** Buduje metryki pochodne do wyświetlenia (0-100 bary nie mają sensu — używamy tabeli). */
function frameMetrics(): VisionMetric[] {
  return [];
}

/** Buduje pełny VisionTestResult z wyniku analizy klatkowej (dla localStorage / UI). */
function buildResult(input: SaveFrameResultInput, id: string): VisionTestResult {
  const { frame } = input;
  const test = getVisionTest(frame.testId);
  const invalid = frame.status === "invalid";
  const reviewStatus =
    frame.markedBy === "coach" ? "coach_verified" : invalid ? "invalid_by_ai" : "ai_result";
  return {
    id,
    userId: input.userId ?? "local",
    testType: frame.testId,
    testCategory: frame.category,
    testName: test?.name ?? frame.testId,
    videoUrl: input.videoUrl,
    captureMode: "frame_analyzer",
    fps: frame.fps,
    cameraView: input.cameraView,
    validityStatus: invalid ? "invalid" : "valid",
    confidenceScore:
      frame.status === "frame_verified" || frame.status === "coach_verified"
        ? "high"
        : frame.status === "estimated"
          ? "medium"
          : "high",
    mainResultValue: frame.mainResultValue,
    mainResultUnit: frame.mainResultUnit,
    measuredMetrics: frameMetrics(),
    validityFlags: {
      fpsOk: frame.fps >= (test?.minimumFps ?? 30),
      lightingOk: true,
      cameraStable: true,
      athleteInFrame: true,
      feetVisible: true,
      lineVisible: true,
      angleOk: true,
      groundContactClear: true,
      reasons: [],
    },
    aiFeedback: { good: "", limitingFactor: "", improve: "", accuracy: invalid ? "invalid" : "accurate" },
    comparisonToPrevious: null,
    savedToProgress: false,
    createdAt: new Date().toISOString(),
    reviewStatus,
    reviewType: null,
    coachId: null,
    coachNote: null,
    coachFeedback: null,
    coachVerified: frame.markedBy === "coach",
    coachCorrected: false,
    coachCorrectedFrames: null,
    calculationMethod: frame.method,
    calculationBasis: frame.basis,
    manualOverride: false,
    manualOverrideReason: null,
    paidReviewRequested: false,
    paidReviewStatus: "not_requested",
    linkedPlanId: null,
    linkedWorkoutId: null,
    linkedExerciseId: null,
    linkedExerciseName: null,
    linkedTrainingDay: null,
    exerciseCategory: null,
    techniqueReview: null,
    reviewMode: "frame_analysis",
    frameAnalysisStatus: frame.status,
    markedBy: frame.markedBy,
    frameDerived: frame.derived,
    frameMarkers: frame.markers,
    analysisStatus: "completed",
    visibilityStatus: "visible_to_player",
  };
}

/** Buduje payload do bazy z wyliczonymi kolumnami klatkowymi. */
function buildDbPayload(input: SaveFrameResultInput, base: VisionTestResult) {
  const { frame } = input;
  const d = frame.derived;
  const m = frame.markers;
  return {
    user_id: input.userId,
    test_type: base.testType,
    test_category: base.testCategory,
    test_name: base.testName,
    video_url: base.videoUrl,
    capture_mode: base.captureMode,
    fps: base.fps,
    camera_view: base.cameraView,
    validity_status: base.validityStatus,
    confidence_score: base.confidenceScore,
    main_result_value: base.mainResultValue,
    main_result_unit: base.mainResultUnit,
    measured_metrics: base.measuredMetrics,
    validity_flags: base.validityFlags,
    ai_feedback: base.aiFeedback,
    comparison_to_previous: base.comparisonToPrevious,
    saved_to_progress: false,
    review_status: base.reviewStatus,
    calculation_method: base.calculationMethod,
    calculation_basis: base.calculationBasis,
    review_mode: "frame_analysis",
    // Kolumny realnej analizy klatkowej:
    frame_analysis_enabled: true,
    frame_analysis_status: frame.status,
    marked_by: frame.markedBy,
    verified_by_coach: frame.markedBy === "coach",
    takeoff_frame: m.takeoff_frame ?? null,
    landing_frame: m.landing_frame ?? null,
    start_frame: m.start_frame ?? null,
    finish_frame: m.finish_frame ?? null,
    first_contact_frame: m.first_contact_frame ?? null,
    last_contact_frame: m.last_contact_frame ?? null,
    entry_frame: m.entry_frame ?? null,
    braking_start_frame: m.braking_start_frame ?? null,
    stop_frame: m.stop_frame ?? null,
    exit_frame: m.exit_frame ?? null,
    frame_count: d.frameCount ?? null,
    flight_time: d.flightTime ?? null,
    sprint_time: d.sprintTime ?? null,
    braking_time: d.brakingTime ?? null,
    jump_height_cm: d.jumpHeightCm ?? null,
    distance_m: d.distanceM ?? null,
    distance_cm: d.distanceCm ?? null,
    speed_m_s: d.speedMs ?? null,
    speed_km_h: d.speedKmh ?? null,
    number_of_contacts: d.numberOfContacts ?? null,
  };
}

/**
 * Zapisuje wynik analizy klatkowej.
 * Najpierw do Supabase; jeśli baza zawiedzie — do localStorage.
 * Zawsze zwraca id, na które można przekierować.
 */
export async function saveFrameResult(
  input: SaveFrameResultInput,
): Promise<{ id: string; result: VisionTestResult; storedIn: "supabase" | "local" }> {
  const base = buildResult(input, uuid());
  if (input.userId) {
    try {
      const comparison = await computeComparison(input.userId, {
        testType: base.testType,
        mainResultValue: base.mainResultValue,
        mainResultUnit: base.mainResultUnit,
        validityStatus: base.validityStatus,
      });
      const payload = { ...buildDbPayload(input, base), comparison_to_previous: comparison };
      const { data, error } = await db.from("vision_tests").insert(payload).select("id").single();
      if (error) throw error;
      return { id: data.id as string, result: { ...base, id: data.id, comparisonToPrevious: comparison }, storedIn: "supabase" };
    } catch (e) {
      console.warn("[vision] supabase save failed, using localStorage", e);
    }
  }
  const items = readLocal();
  items.unshift(base);
  writeLocal(items);
  return { id: base.id, result: base, storedIn: "local" };
}

/** Czyta wynik po id — najpierw Supabase, potem localStorage. */
export async function getResultById(id: string): Promise<VisionTestResult | null> {
  try {
    const row = await getVisionResult(id);
    if (row) return row;
  } catch {
    /* przechodzimy do localStorage */
  }
  return readLocal().find((r) => r.id === id) ?? null;
}

/** Lista wszystkich wyników — Supabase + localStorage. */
export async function listAllResults(userId: string | null): Promise<VisionTestResult[]> {
  let remote: VisionTestResult[] = [];
  if (userId) {
    try {
      remote = await listVisionResults(userId);
    } catch {
      remote = [];
    }
  }
  const local = readLocal();
  const all = [...remote, ...local];
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return all;
}

export type { MarkedBy };
