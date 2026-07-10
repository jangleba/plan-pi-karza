import { supabase } from "@/integrations/supabase/client";
import type {
  VisionTestResult,
  VisionComparison,
  VisionCameraView,
  VisionValidityStatus,
  VisionConfidenceScore,
  VisionMetric,
  VisionValidityFlags,
  VisionFeedback,
  VisionSignals,
  ReviewStatus,
  ReviewType,
  PaidReviewStatus,
  CoachFrames,
  CoachFeedback,
  CalculationBasis,
} from "./types";
import { getVisionTest } from "./visionTests";
import { recomputeMainValue, buildCalculationBasis } from "./visionCalc";
import type { VisionAnalysisResult } from "./visionAnalysisService";

// Tabela vision_tests nie jest jeszcze w wygenerowanych typach — używamy luźnego klienta.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const BUCKET = "vision-videos";

interface VisionRow {
  id: string;
  user_id: string;
  test_type: string;
  test_category: string;
  test_name: string;
  video_url: string | null;
  capture_mode: string | null;
  fps: number | null;
  camera_view: string | null;
  validity_status: string;
  confidence_score: string;
  main_result_value: number | null;
  main_result_unit: string | null;
  measured_metrics: VisionMetric[] | null;
  validity_flags: VisionValidityFlags | null;
  ai_feedback: (VisionFeedback & { signals?: VisionSignals }) | null;
  comparison_to_previous: VisionComparison | null;
  saved_to_progress: boolean;
  created_at: string;
  review_status: string | null;
  review_type: string | null;
  coach_id: string | null;
  coach_note: string | null;
  coach_feedback: CoachFeedback | null;
  coach_verified: boolean | null;
  coach_corrected: boolean | null;
  coach_corrected_frames: CoachFrames | null;
  calculation_method: string | null;
  calculation_basis: CalculationBasis | null;
  manual_override: boolean | null;
  manual_override_reason: string | null;
  paid_review_requested: boolean | null;
  paid_review_status: string | null;
}

function rowToResult(row: VisionRow): VisionTestResult {
  return {
    id: row.id,
    userId: row.user_id,
    testType: row.test_type,
    testCategory: row.test_category as VisionTestResult["testCategory"],
    testName: row.test_name,
    videoUrl: row.video_url,
    captureMode: row.capture_mode ?? "upload",
    fps: row.fps,
    cameraView: (row.camera_view as VisionCameraView) ?? null,
    validityStatus: row.validity_status as VisionValidityStatus,
    confidenceScore: row.confidence_score as VisionConfidenceScore,
    mainResultValue: row.main_result_value,
    mainResultUnit: row.main_result_unit,
    measuredMetrics: row.measured_metrics ?? [],
    validityFlags:
      row.validity_flags ??
      ({
        fpsOk: true,
        lightingOk: true,
        cameraStable: true,
        athleteInFrame: true,
        feetVisible: true,
        lineVisible: true,
        angleOk: true,
        groundContactClear: true,
        reasons: [],
      } as VisionValidityFlags),
    aiFeedback:
      row.ai_feedback ??
      ({ good: "", limitingFactor: "", improve: "", accuracy: "estimated" } as VisionFeedback),
    comparisonToPrevious: row.comparison_to_previous ?? null,
    signals: row.ai_feedback?.signals,
    savedToProgress: row.saved_to_progress,
    createdAt: row.created_at,
  };
}

/** Wgrywa wideo do storage; gdy się nie uda, zwraca placeholder. */
export async function uploadVisionVideo(
  userId: string,
  testId: string,
  file: File,
): Promise<{ url: string; uploaded: boolean }> {
  try {
    const ext = file.name.split(".").pop() || "mp4";
    const path = `${userId}/${testId}-${Date.now()}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;
    return { url: path, uploaded: true };
  } catch (e) {
    console.warn("[vision] upload failed, using placeholder", e);
    return { url: `placeholder://${testId}/${file.name}`, uploaded: false };
  }
}

/** Zwraca podpisany URL do odtworzenia wideo (jeśli plik jest w storage). */
export async function getVisionVideoUrl(path: string | null): Promise<string | null> {
  if (!path || path.startsWith("placeholder://")) return null;
  try {
    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Zapisuje wynik analizy do bazy i zwraca kompletny rekord. */
export async function saveVisionResult(
  userId: string,
  analysis: VisionAnalysisResult,
): Promise<VisionTestResult> {
  const comparison = await computeComparison(userId, analysis);

  const payload = {
    user_id: userId,
    test_type: analysis.testType,
    test_category: analysis.testCategory,
    test_name: analysis.testName,
    video_url: analysis.videoUrl,
    capture_mode: analysis.captureMode,
    fps: analysis.fps,
    camera_view: analysis.cameraView,
    validity_status: analysis.validityStatus,
    confidence_score: analysis.confidenceScore,
    main_result_value: analysis.mainResultValue,
    main_result_unit: analysis.mainResultUnit,
    measured_metrics: analysis.measuredMetrics,
    validity_flags: analysis.validityFlags,
    ai_feedback: { ...analysis.aiFeedback, signals: analysis.signals },
    comparison_to_previous: comparison,
    saved_to_progress: false,
  };

  const { data, error } = await db
    .from("vision_tests")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

export async function getVisionResult(id: string): Promise<VisionTestResult | null> {
  const { data, error } = await db
    .from("vision_tests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToResult(data as VisionRow) : null;
}

export async function listVisionResults(userId: string): Promise<VisionTestResult[]> {
  const { data, error } = await db
    .from("vision_tests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as VisionRow[]).map(rowToResult);
}

export async function setSavedToProgress(
  id: string,
  saved: boolean,
): Promise<void> {
  const { error } = await db
    .from("vision_tests")
    .update({ saved_to_progress: saved })
    .eq("id", id);
  if (error) throw error;
}

/** Dla testów czasowych/hamowania mniejszy wynik = lepiej. */
function lowerIsBetter(testType: string): boolean {
  return /sprint|5-10-5|l-drill|t-test|braking-test|flying|to-stop/.test(testType);
}

/** Buduje porównanie do poprzedniego i najlepszego wyniku tego samego testu. */
export async function computeComparison(
  userId: string,
  current: Pick<
    VisionAnalysisResult,
    "testType" | "mainResultValue" | "mainResultUnit" | "validityStatus"
  >,
): Promise<VisionComparison | null> {
  if (current.validityStatus === "invalid" || current.mainResultValue == null) {
    return null;
  }
  const { data } = await db
    .from("vision_tests")
    .select("main_result_value, validity_status, created_at")
    .eq("user_id", userId)
    .eq("test_type", current.testType)
    .neq("validity_status", "invalid")
    .order("created_at", { ascending: false });

  const rows = ((data as VisionRow[]) ?? []).filter(
    (r) => r.main_result_value != null,
  );
  if (rows.length === 0) {
    return { vsPrevious: "Pierwszy wynik tego testu.", vsBest: null, label: "none", techniqueNote: null };
  }

  const unit = current.mainResultUnit ?? "";
  const cur = current.mainResultValue;
  const prev = rows[0].main_result_value as number;
  const lower = lowerIsBetter(current.testType);
  const values = rows.map((r) => r.main_result_value as number);
  const best = lower ? Math.min(...values) : Math.max(...values);

  const diff = cur - prev;
  const improved = lower ? diff < 0 : diff > 0;
  const same = Math.abs(diff) < (unit === "s" ? 0.01 : 0.5);

  const absDiff = Math.abs(Math.round(diff * 100) / 100);
  let vsPrevious: string;
  let label: VisionComparison["label"];
  if (same) {
    vsPrevious = `Wynik bez zmian (${cur}${unit}).`;
    label = "unchanged";
  } else if (improved) {
    vsPrevious = `Poprawa o ${absDiff}${unit} względem poprzedniego.`;
    label = "improvement";
  } else {
    vsPrevious = `Spadek o ${absDiff}${unit} względem poprzedniego.`;
    label = "regression";
  }

  const bestDiff = Math.abs(Math.round((cur - best) * 100) / 100);
  const isBest = lower ? cur <= best : cur >= best;
  const vsBest = isBest
    ? "To Twój najlepszy wynik tego testu!"
    : `Do najlepszego wyniku brakuje ${bestDiff}${unit}.`;

  return { vsPrevious, vsBest, label, techniqueNote: null };
}
