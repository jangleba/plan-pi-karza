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
  TechniqueReview,
  ReviewMode,
  AnalysisStatus,
  VisibilityStatus,
  FrameDerived,



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
  linked_plan_id: string | null;
  linked_workout_id: string | null;
  linked_exercise_id: string | null;
  linked_exercise_name: string | null;
  linked_training_day: string | null;
  exercise_category: string | null;
  technique_review: TechniqueReview | null;
  review_mode: string | null;
  frame_analysis_status: string | null;
  marked_by: string | null;
  frame_derived: FrameDerived | null;
  frame_markers: Record<string, number> | null;
  analysis_status: string | null;
  visibility_status: string | null;
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
    reviewStatus: (row.review_status as ReviewStatus) ?? "ai_result",
    reviewType: (row.review_type as ReviewType) ?? null,
    coachId: row.coach_id ?? null,
    coachNote: row.coach_note ?? null,
    coachFeedback: row.coach_feedback ?? null,
    coachVerified: row.coach_verified ?? false,
    coachCorrected: row.coach_corrected ?? false,
    coachCorrectedFrames: row.coach_corrected_frames ?? null,
    calculationMethod: row.calculation_method ?? null,
    calculationBasis: row.calculation_basis ?? null,
    manualOverride: row.manual_override ?? false,
    manualOverrideReason: row.manual_override_reason ?? null,
    paidReviewRequested: row.paid_review_requested ?? false,
    paidReviewStatus: (row.paid_review_status as PaidReviewStatus) ?? "not_requested",
    linkedPlanId: row.linked_plan_id ?? null,
    linkedWorkoutId: row.linked_workout_id ?? null,
    linkedExerciseId: row.linked_exercise_id ?? null,
    linkedExerciseName: row.linked_exercise_name ?? null,
    linkedTrainingDay: row.linked_training_day ?? null,
    exerciseCategory: row.exercise_category ?? null,
    techniqueReview: row.technique_review ?? null,
    reviewMode: (row.review_mode as ReviewMode) ?? null,
    frameAnalysisStatus: (row.frame_analysis_status as VisionTestResult["frameAnalysisStatus"]) ?? null,
    markedBy: (row.marked_by as VisionTestResult["markedBy"]) ?? null,
    frameDerived: row.frame_derived ?? null,
    frameMarkers: row.frame_markers ?? null,
    analysisStatus: (row.analysis_status as AnalysisStatus) ?? "completed",
    visibilityStatus: (row.visibility_status as VisibilityStatus) ?? "visible_to_player",
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
    review_status: analysis.reviewStatus,
    review_type: analysis.reviewType,
    coach_verified: analysis.coachVerified,
    coach_corrected: analysis.coachCorrected,
    coach_corrected_frames: analysis.coachCorrectedFrames,
    calculation_method: analysis.calculationMethod,
    calculation_basis: analysis.calculationBasis,
    manual_override: analysis.manualOverride,
    paid_review_requested: analysis.paidReviewRequested,
    paid_review_status: analysis.paidReviewStatus,
  };

  const { data, error } = await db
    .from("vision_tests")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

// ===================== Gym Technique (analiza ćwiczeń z planu) =====================

import { GYM_EXERCISE_TEST_ID } from "./visionTests";
import type { GymReviewStatus, GymTechniqueSignal } from "./types";

export interface SaveGymReviewInput {
  userId: string;
  exerciseKey: string;
  exerciseName: string;
  trainingDayLabel: string;
  exerciseCategory: string;
  planDate: string;
  videoUrl: string | null;
  videoUploaded: boolean;
  captureMode: string;
  reviewMode: ReviewMode;
  techniqueReview: TechniqueReview;
  requestCoach: boolean;
  invalidVideo: boolean;
}

/** Wyprowadza status Gym Review z pól rekordu (nie zmienia enuma pomiarowego). */
export function deriveGymStatus(result: VisionTestResult): GymReviewStatus {
  if (result.validityStatus === "invalid") return "invalid_video";
  if (result.coachVerified || result.reviewStatus === "coach_feedback_added")
    return "coach_reviewed";
  if (result.paidReviewRequested) return "coach_review_requested";
  return "self_review";
}

/** Zapisuje analizę techniki ćwiczenia z planu (frame/self/coach review). */
export async function saveGymReview(
  input: SaveGymReviewInput,
): Promise<VisionTestResult> {
  const signal: GymTechniqueSignal =
    input.techniqueReview.signal ??
    (input.invalidVideo ? "invalid_execution" : "good_execution");

  const payload = {
    user_id: input.userId,
    test_type: GYM_EXERCISE_TEST_ID,
    test_category: "technique",
    test_name: input.exerciseName,
    video_url: input.videoUrl,
    capture_mode: input.captureMode,
    fps: null,
    camera_view: "side",
    validity_status: input.invalidVideo ? "invalid" : "valid",
    confidence_score: "medium",
    main_result_value: null,
    main_result_unit: null,
    measured_metrics: [],
    validity_flags: null,
    ai_feedback: null,
    comparison_to_previous: null,
    saved_to_progress: false,
    review_status: "ai_result",
    review_mode: input.reviewMode,
    technique_review: { ...input.techniqueReview, signal },
    linked_exercise_id: input.exerciseKey,
    linked_exercise_name: input.exerciseName,
    linked_training_day: input.trainingDayLabel,
    exercise_category: input.exerciseCategory,
    paid_review_requested: input.requestCoach,
    paid_review_status: input.requestCoach ? "requested" : "not_requested",
    review_type: input.requestCoach ? "technique_review" : null,
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
  return /sprint|five_ten_five|sprint_to_stop/.test(testType);
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

// ===================== Coach Review =====================

/** Czy zalogowany użytkownik ma rolę trenera. */
export async function isCoach(userId: string): Promise<boolean> {
  const { data, error } = await db.rpc("has_role", {
    _user_id: userId,
    _role: "coach",
  });
  if (error) return false;
  return Boolean(data);
}

/** Zawodnik zamawia analizę trenera dla konkretnego testu. */
export async function requestCoachReview(
  id: string,
  reviewType: ReviewType,
): Promise<VisionTestResult> {
  const { data, error } = await db
    .from("vision_tests")
    .update({
      review_type: reviewType,
      paid_review_requested: true,
      paid_review_status: "requested",
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

/**
 * Kolejka trenera/admina — wszystkie przesłane filmy oczekujące na analizę
 * lub w trakcie recenzji. Nie ogranicza się do płatnych zgłoszeń.
 */
export async function listCoachQueue(): Promise<VisionTestResult[]> {
  const { data, error } = await db
    .from("vision_tests")
    .select("*")
    .in("analysis_status", ["uploaded", "waiting_for_analysis", "in_review"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as VisionRow[]).map(rowToResult);
}

/**
 * Zawodnik przesyła film do analizy. Tworzy rekord bez wyniku:
 * analysis_status = waiting_for_analysis, visibility = hidden_from_player.
 * Zawodnik NIE zaznacza klatek — robi to trener/admin w Frame Analyzer.
 */
export async function createPendingUpload(input: {
  userId: string;
  test: { id: string; name: string; category: string };
  videoUrl: string | null;
  fps: number | null;
  cameraView: VisionCameraView | null;
  reviewType?: ReviewType | null;
}): Promise<VisionTestResult> {
  const payload = {
    user_id: input.userId,
    test_type: input.test.id,
    test_category: input.test.category,
    test_name: input.test.name,
    video_url: input.videoUrl,
    capture_mode: "upload",
    fps: input.fps,
    camera_view: input.cameraView,
    validity_status: "valid",
    confidence_score: "medium",
    main_result_value: null,
    main_result_unit: null,
    measured_metrics: [],
    validity_flags: null,
    ai_feedback: null,
    comparison_to_previous: null,
    saved_to_progress: false,
    review_status: "ai_result",
    review_mode: "frame_analysis",
    analysis_status: "waiting_for_analysis",
    visibility_status: "hidden_from_player",
    paid_review_requested: Boolean(input.reviewType),
    paid_review_status: input.reviewType ? "requested" : "not_requested",
    review_type: input.reviewType ?? null,
  };
  const { data, error } = await db
    .from("vision_tests")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

/**
 * Trener/admin publikuje wynik po analizie klatkowej istniejącego rekordu.
 * System liczy wartość matematycznie — trener nie wpisuje jej z głowy.
 */
export async function coachPublishFrameResult(
  result: VisionTestResult,
  coachId: string,
  frame: import("./frameAnalysisService").FrameAnalysisResult,
): Promise<VisionTestResult> {
  const d = frame.derived;
  const m = frame.markers;
  const patch: Record<string, unknown> = {
    coach_id: coachId,
    fps: frame.fps,
    main_result_value: frame.mainResultValue,
    main_result_unit: frame.mainResultUnit,
    validity_status: "valid",
    confidence_score: "high",
    calculation_method: frame.method,
    calculation_basis: frame.basis,
    review_status: "coach_verified",
    coach_verified: true,
    verified_by_coach: true,
    marked_by: "coach",
    frame_analysis_enabled: true,
    frame_analysis_status: "coach_verified",
    frame_derived: d,
    frame_markers: m,
    analysis_status: "completed",
    visibility_status: "visible_to_player",
    paid_review_status: result.paidReviewRequested ? "completed" : "not_requested",
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
  const comparison = await computeComparison(result.userId, {
    testType: result.testType,
    mainResultValue: frame.mainResultValue,
    mainResultUnit: frame.mainResultUnit,
    validityStatus: "valid",
  });
  patch.comparison_to_previous = comparison;

  const { data, error } = await db
    .from("vision_tests")
    .update(patch)
    .eq("id", result.id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

/** Trener/admin odrzuca film jako nieprawidłowy — zawodnik dostaje prośbę o powtórkę. */
export async function coachRejectVideo(
  id: string,
  coachId: string,
  note: string | null,
): Promise<VisionTestResult> {
  const { data, error } = await db
    .from("vision_tests")
    .update({
      coach_id: coachId,
      coach_verified: false,
      coach_note: note,
      validity_status: "invalid",
      review_status: "invalid_by_coach",
      analysis_status: "invalid_video",
      visibility_status: "visible_to_player",
      paid_review_status: "rejected_invalid_video",
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

/** Trener/admin oznacza film jako będący w trakcie recenzji. */
export async function coachMarkInReview(id: string, coachId: string): Promise<void> {
  await db
    .from("vision_tests")
    .update({ coach_id: coachId, analysis_status: "in_review" })
    .eq("id", id);
}

/** Trener zatwierdza test jako poprawny (Coach Verified). */
export async function coachVerify(
  id: string,
  coachId: string,
  note: string | null,
): Promise<VisionTestResult> {
  const { data, error } = await db
    .from("vision_tests")
    .update({
      coach_id: coachId,
      coach_verified: true,
      coach_note: note,
      review_status: "coach_verified",
      paid_review_status: "completed",
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

/** Trener oznacza test jako nieważny (Invalid by Coach). */
export async function coachInvalidate(
  id: string,
  coachId: string,
  note: string | null,
): Promise<VisionTestResult> {
  const { data, error } = await db
    .from("vision_tests")
    .update({
      coach_id: coachId,
      coach_verified: false,
      coach_note: note,
      validity_status: "invalid",
      review_status: "invalid_by_coach",
      paid_review_status: "rejected_invalid_video",
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

/** Trener dodaje analizę techniki i zalecenia (Coach Feedback Added). */
export async function coachAddFeedback(
  id: string,
  coachId: string,
  feedback: CoachFeedback,
  note: string | null,
): Promise<VisionTestResult> {
  const { data, error } = await db
    .from("vision_tests")
    .update({
      coach_id: coachId,
      coach_feedback: feedback,
      coach_note: note,
      review_status: "coach_feedback_added",
      paid_review_status: "completed",
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

/**
 * Trener poprawia kluczowe klatki — system PRZELICZA wynik automatycznie.
 * Trener nie wpisuje wyniku z głowy.
 */
export async function coachCorrectFrames(
  result: VisionTestResult,
  coachId: string,
  frames: CoachFrames,
  note: string | null,
): Promise<VisionTestResult> {
  const test = getVisionTest(result.testType);
  if (!test) throw new Error("Nieznany test");
  const fps = result.fps ?? 0;
  const recomputed = recomputeMainValue(test, fps, frames);

  const basis = buildCalculationBasis({
    test,
    fps,
    frames,
    cameraView: result.cameraView,
    flags: result.validityFlags,
    confidence: result.confidenceScore,
    coachVerifiedFrames: true,
  });

  const patch: Record<string, unknown> = {
    coach_id: coachId,
    coach_corrected: true,
    coach_verified: true,
    coach_corrected_frames: frames,
    calculation_method: basis.method,
    calculation_basis: basis,
    review_status: "coach_corrected",
    coach_note: note,
    paid_review_status: "completed",
  };
  if (recomputed != null && result.mainResultUnit) {
    patch.main_result_value = recomputed;
  }

  const { data, error } = await db
    .from("vision_tests")
    .update(patch)
    .eq("id", result.id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}

/**
 * Ręczna korekta wyniku przez trenera — dozwolona tylko z wyraźnym
 * oznaczeniem i uzasadnieniem.
 */
export async function coachManualOverride(
  id: string,
  coachId: string,
  value: number,
  reason: string,
): Promise<VisionTestResult> {
  const { data, error } = await db
    .from("vision_tests")
    .update({
      coach_id: coachId,
      main_result_value: value,
      manual_override: true,
      manual_override_reason: reason,
      coach_corrected: true,
      review_status: "coach_corrected",
      paid_review_status: "completed",
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToResult(data as VisionRow);
}
