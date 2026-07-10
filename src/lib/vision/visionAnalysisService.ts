import type {
  VisionTest,
  VisionTestResult,
  VisionValidityStatus,
  VisionConfidenceScore,
  VisionValidityFlags,
  VisionMetric,
  VisionFeedback,
  VisionSignals,
  VisionCameraView,
  VisionInvalidReason,
  ReviewStatus,
} from "./types";
import { getVisionTest } from "./visionTests";
import { deriveFrames, buildCalculationBasis } from "./visionCalc";

/** Dane wejściowe do analizy — z ekranu uploadu / setupu. */
export interface VisionAnalyzeInput {
  videoUrl: string | null;
  fileName?: string | null;
  fps: number;
  cameraView: VisionCameraView;
  captureMode: string;
  /** Ręczne flagi z setup check (co użytkownik potwierdził). */
  setup?: Partial<{
    lightingOk: boolean;
    cameraStable: boolean;
    athleteInFrame: boolean;
    feetVisible: boolean;
    lineVisible: boolean;
    angleOk: boolean;
    groundContactClear: boolean;
  }>;
}

/** Wynik analizy — gotowy do zapisania (bez id/userId/createdAt). */
export type VisionAnalysisResult = Omit<
  VisionTestResult,
  "id" | "userId" | "createdAt" | "savedToProgress" | "comparisonToPrevious"
>;

/** Kroki pokazywane na ekranie analizy. */
export const VISION_ANALYSIS_STEPS = [
  "Sprawdzanie jakości wideo",
  "Odczyt FPS",
  "Wykrywanie pozycji zawodnika",
  "Weryfikacja poprawności setupu",
  "Wyszukiwanie kluczowych klatek ruchu",
  "Tworzenie raportu wydajności",
] as const;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Zwraca prawdopodobny wynik główny + jednostkę dla danego testu. */
function mainResultFor(test: VisionTest): { value: number; unit: string } {
  switch (test.id) {
    case "cmj":
      return { value: round(rand(28, 46), 0), unit: "cm" };
    case "broad_jump":
      return { value: round(rand(180, 260), 0), unit: "cm" };
    case "pogo_jumps":
      return { value: round(rand(1.4, 2.6), 2), unit: "RSI" };
    case "sprint_20m":
      return { value: round(rand(2.9, 3.5), 2), unit: "s" };
    case "sprint_30m":
      return { value: round(rand(3.9, 4.6), 2), unit: "s" };
    case "five_ten_five":
      return { value: round(rand(4.4, 5.6), 2), unit: "s" };
    case "sprint_to_stop":
      return { value: round(rand(1.6, 3.0), 2), unit: "m" };
    default:
      // Testy techniczne — ocena jakości 0-100.
      return { value: round(rand(62, 92), 0), unit: "/100" };
  }
}

function metricsFor(test: VisionTest): VisionMetric[] {
  return test.measuredMetrics.map((label, i) => ({
    key: `m${i}`,
    label,
    value: round(rand(55, 95), 0),
    unit: "/100",
  }));
}

const GOOD_POOL = [
  "eksplozywny pierwszy krok",
  "dynamiczne odbicie",
  "dobra praca ramion",
  "stabilny tułów w fazie napędu",
  "równomierne tempo",
];
const LIMIT_POOL = [
  "tułów unosi się zbyt wcześnie po czwartym kroku",
  "stabilność lądowania jest niestabilna",
  "kontakt z podłożem jest zbyt długi",
  "kolano zapada się przyśrodkowo przy zwrocie",
  "zbyt krótka faza pochylenia na starcie",
];
const IMPROVE_POOL = [
  "utrzymuj pochylenie do przodu dłużej na pierwszych metrach",
  "kontroluj oba kolana podczas lądowania",
  "skróć czas kontaktu z podłożem",
  "ustaw stopę szerzej przed zwrotem",
  "pracuj nad sztywnością kostki",
];

function feedbackFor(accuracy: VisionFeedback["accuracy"]): VisionFeedback {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return {
    good: pick(GOOD_POOL),
    limitingFactor: pick(LIMIT_POOL),
    improve: pick(IMPROVE_POOL),
    accuracy,
  };
}

/**
 * DEMO analiza. Jedyne miejsce z symulacją.
 * Aby podłączyć prawdziwe API bez zmian w UI:
 *   const res = await fetch("/api/vision/analyze-video", { method: "POST", body ... });
 *   return await res.json();
 */
export async function analyzeVisionTestDemo(
  testId: string,
  input: VisionAnalyzeInput,
): Promise<VisionAnalysisResult> {
  const test = getVisionTest(testId);
  if (!test) throw new Error(`Nieznany test: ${testId}`);

  // Symulacja czasu przetwarzania.
  await new Promise((r) => setTimeout(r, 400));

  const setup = input.setup ?? {};
  const reasons: VisionInvalidReason[] = [];

  const fpsOk = input.fps >= test.minimumFps;
  if (!fpsOk) reasons.push("low_fps");

  const lightingOk = setup.lightingOk ?? true;
  if (!lightingOk) reasons.push("poor_lighting");
  const cameraStable = setup.cameraStable ?? true;
  if (!cameraStable) reasons.push("unstable_camera");
  const athleteInFrame = setup.athleteInFrame ?? true;
  if (!athleteInFrame) reasons.push("athlete_out_of_frame");
  const feetVisible = setup.feetVisible ?? true;
  if (!feetVisible) reasons.push("feet_not_visible");
  const lineVisible = setup.lineVisible ?? true;
  if (!lineVisible) reasons.push("line_not_visible");
  const angleOk = setup.angleOk ?? true;
  if (!angleOk) reasons.push("wrong_angle");
  const groundContactClear = setup.groundContactClear ?? true;
  if (!groundContactClear) reasons.push("unclear_ground_contact");

  const validityFlags: VisionValidityFlags = {
    fpsOk,
    lightingOk,
    cameraStable,
    athleteInFrame,
    feetVisible,
    lineVisible,
    angleOk,
    groundContactClear,
    reasons,
  };

  // Twarde warunki nieważności.
  const hardInvalid =
    !feetVisible ||
    !lineVisible ||
    !groundContactClear ||
    !athleteInFrame ||
    !fpsOk;

  let validityStatus: VisionValidityStatus;
  let confidenceScore: VisionConfidenceScore;
  let accuracy: VisionFeedback["accuracy"];

  if (hardInvalid) {
    validityStatus = "invalid";
    confidenceScore = "low";
    accuracy = "invalid";
  } else if (input.fps >= 120 && lightingOk && cameraStable && angleOk) {
    validityStatus = "valid";
    confidenceScore = "high";
    accuracy = "accurate";
  } else {
    // 30/60 FPS lub drobne problemy setupu → estymacja z zastrzeżeniem.
    validityStatus = "caution";
    confidenceScore = input.fps >= 60 ? "medium" : "low";
    accuracy = "estimated";
  }

  const main = validityStatus === "invalid" ? { value: 0, unit: test.category === "technique" ? "/100" : "" } : mainResultFor(test);
  const metrics = validityStatus === "invalid" ? [] : metricsFor(test);

  const signals: VisionSignals = {
    power_drop: false,
    sprint_drop: false,
    braking_issue: false,
    asymmetry_flag: false,
    landing_control_issue: false,
  };

  const mainValue = validityStatus === "invalid" ? null : main.value;
  const mainUnit = validityStatus === "invalid" ? null : main.unit;

  const frames =
    validityStatus === "invalid" ? {} : deriveFrames(test, input.fps, main.value);
  const calculationBasis = buildCalculationBasis({
    test,
    fps: input.fps,
    frames,
    cameraView: input.cameraView,
    flags: validityFlags,
    confidence: confidenceScore,
    coachVerifiedFrames: false,
  });

  let reviewStatus: ReviewStatus;
  if (validityStatus === "invalid") reviewStatus = "invalid_by_ai";
  else if (confidenceScore === "high") reviewStatus = "ai_high_confidence";
  else if (accuracy === "estimated") reviewStatus = "ai_estimated";
  else reviewStatus = "ai_result";

  return {
    testType: test.id,
    testCategory: test.category,
    testName: test.name,
    videoUrl: input.videoUrl,
    captureMode: input.captureMode,
    fps: input.fps,
    cameraView: input.cameraView,
    validityStatus,
    confidenceScore,
    mainResultValue: mainValue,
    mainResultUnit: mainUnit,
    measuredMetrics: metrics,
    validityFlags,
    aiFeedback: feedbackFor(accuracy),
    signals,
    reviewStatus,
    reviewType: null,
    coachId: null,
    coachNote: null,
    coachFeedback: null,
    coachVerified: false,
    coachCorrected: false,
    coachCorrectedFrames: frames,
    calculationMethod: calculationBasis.method,
    calculationBasis,
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
    reviewMode: null,
    analysisStatus: "completed",
    visibilityStatus: "visible_to_player",
  };
}

