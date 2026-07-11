import type { AnalysisContext, QualityIssueCode, ValidationResult, AnalysisStatus } from "../types";
import { QUALITY_ISSUE_LABELS } from "../types";
import { detectionRate, multiplePeopleDetected, feetOutOfFrameRate } from "../poseSeries";

/** Instrukcje ponownego nagrania per powód. */
const RETAKE: Record<QualityIssueCode, string> = {
  LOW_CONFIDENCE: "Nagraj ponownie: stabilny telefon, dobre światło, jeden zawodnik w kadrze.",
  INVALID_CAMERA_POSITION: "Ustaw telefon nieruchomo, z boku, prostopadle do ruchu.",
  ATHLETE_OUT_OF_FRAME:
    "Odsuń telefon dalej — cała sylwetka i stopy muszą być widoczne przez cały ruch.",
  MULTIPLE_PEOPLE: "W kadrze może być tylko jeden zawodnik. Usuń inne osoby z tła.",
  INSUFFICIENT_FPS: "Nagraj w wyższej liczbie klatek na sekundę (tryb slow-motion / 120 FPS).",
  NO_CALIBRATION: "Zaznacz linie / punkt odniesienia o znanej odległości, aby przeliczyć wynik.",
  MISSING_START_LINE: "Zaznacz wyraźnie linię startu w kadrze.",
  MISSING_FINISH_LINE: "Zaznacz wyraźnie linię mety w kadrze.",
  INVALID_TEST_EXECUTION: "Wykonaj test zgodnie z protokołem i nagraj ponownie.",
  TEST_PROTOCOL_MISMATCH:
    "Wybrano test Pogo Jumps, ale nagranie przedstawia prawdopodobnie CMJ. Pogo Jumps wymaga serii szybkich odbić z krótkim kontaktem z podłożem.",
  EVENTS_NOT_DETECTED:
    "Nie rozpoznano kluczowych faz ruchu. Nagraj cały ruch z boku, bez ścinania kadru.",
  LOW_RESOLUTION: "Nagraj w wyższej rozdzielczości (min. 720p).",
  POSE_NOT_DETECTED:
    "Nie wykryto sylwetki. Zadbaj o kontrast zawodnika względem tła i dobre światło.",
  CALIBRATION_PROFILE_MISMATCH:
    "Wykonaj kalibrację dla tej konfiguracji telefonu (aparat, obiektyw, orientacja, rozdzielczość, FPS, zoom).",
  CALIBRATION_CAMERA_MOVED:
    "Kamera poruszyła się po kalibracji. Ustaw telefon nieruchomo i nagraj ponownie ten sam kadr.",
  TIMING_LINE_NOT_CALIBRATED:
    "Skalibruj linię pomiaru czasu na podłożu (Timing Plane) dla tej konfiguracji kamery.",
  TIMING_PLANE_CALIBRATION_FAILED:
    "Płaszczyzna pomiarowa jest niepoprawna. Powtórz kalibrację z widoczną linią na podłożu.",
  LINE_CROSSING_NOT_DETECTED:
    "Nagraj tak, aby zawodnik wyraźnie przekroczył całą linię startu i mety w kadrze.",
  WRONG_CROSSING_DIRECTION:
    "Ustaw kamerę i wykonaj test zgodnie z kierunkiem protokołu.",
  CROSSING_UNCERTAINTY_TOO_HIGH:
    "Nagraj z wyższym FPS (min. 120) i całkowicie nieruchomą kamerą.",
  WRONG_REPETITION_COUNT:
    "Nagraj jeden film na jedną próbę. Dla testów serii nagraj jedną pełną, prawidłową serię.",
  CAMERA_SETUP_CHANGED:
    "Kamera ma inne ustawienie niż kalibracja. Wykonaj nową kalibrację tego filmu.",
  LANDING_OUT_OF_CALIBRATION_AREA:
    "Skalibruj podłoże obejmujące pełną strefę lądowania, a następnie nagraj ponownie.",
  HEEL_OCCLUDED:
    "Nagraj tak, aby pięta lądowania była wyraźnie widoczna (bez zasłonięcia).",
  MISSING_TIMING_LINE:
    "Skalibruj wymagane linie pomiaru czasu (START/FINISH lub TIMING_A/TIMING_B) na podłożu.",
  ATHLETE_TOO_SMALL:
    "Nagraj z bliższej odległości — sylwetka jest zbyt mała, by wiarygodnie zmierzyć przecięcie.",
  TORSO_OCCLUDED:
    "Zapewnij widoczność tułowia w momencie przecięcia linii (bez zasłonięcia).",
  INVALID_CAMERA_GEOMETRY:
    "Ustaw kamerę prostopadle do osi ruchu — obecna geometria uniemożliwia pomiar czasu.",
  DISTANCE_UNKNOWN:
    "Podaj dystans protokołu lub skalibruj linie o znanej odległości na podłożu.",
  TIMING_LINES_REQUIRED:
    "Skalibruj linie/strefy COD (TIMING_A + linia zwrotu lub CENTER + TURN_LEFT + TURN_RIGHT).",
  TURN_NOT_DETECTED:
    "Wykonaj pełny zwrot o 180°. Zwykły bieg bez zwrotu nie jest testem COD.",
  TURN_LINE_NOT_REACHED:
    "Dobiegnij stopą do linii/strefy zwrotu przed zawróceniem i nagraj ponownie.",
  WRONG_LINE_SEQUENCE:
    "Wykonaj test w prawidłowej kolejności linii (środek → zwrot → środek → zwrot → środek).",
  WRONG_TURNING_SIDE:
    "Wykonaj zwrot na wskazaną nogę (osobne próby dla lewej i prawej strony).",
};

/** Wspólna walidacja jakości nagrania dla wszystkich analizatorów. */
export function baseValidation(
  ctx: AnalysisContext,
  minimumFps: number,
): { issues: QualityIssueCode[] } {
  const issues: QualityIssueCode[] = [];
  const { metadata, poses } = ctx;

  if (metadata.fps < minimumFps) issues.push("INSUFFICIENT_FPS");
  if (metadata.width < 480 || metadata.height < 480) issues.push("LOW_RESOLUTION");
  if (multiplePeopleDetected(poses)) issues.push("MULTIPLE_PEOPLE");

  const rate = detectionRate(poses);
  if (rate < 0.4) issues.push("POSE_NOT_DETECTED");
  else if (feetOutOfFrameRate(poses) > 0.25) issues.push("ATHLETE_OUT_OF_FRAME");

  return { issues };
}

/** Buduje ValidationResult ze statusem i instrukcjami. */
export function buildValidation(
  issues: QualityIssueCode[],
  hardFail: QualityIssueCode[],
): ValidationResult {
  const isHard = issues.some((i) => hardFail.includes(i));
  const status: AnalysisStatus = isHard ? "invalid_recording" : "completed";
  return {
    ok: !isHard,
    status,
    issues,
    retakeInstructions: issues.map((i) => RETAKE[i]),
  };
}

export { QUALITY_ISSUE_LABELS };
