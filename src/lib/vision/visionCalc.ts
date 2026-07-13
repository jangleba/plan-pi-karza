import type {
  VisionTest,
  CoachFrames,
  CalculationBasis,
  VisionCameraView,
  VisionValidityFlags,
} from "./types";
import { CAMERA_VIEW_LABELS } from "./types";

const G = 9.81;

export function isJump(test: VisionTest): boolean {
  return test.category === "jump";
}
export function isSprint(test: VisionTest): boolean {
  return test.category === "sprint";
}
export function isCod(test: VisionTest): boolean {
  return test.category === "cod";
}
export function isTechnique(test: VisionTest): boolean {
  return test.category === "technique";
}

/** Wysokość skoku z czasu lotu (cm). */
function heightFromFlightTime(t: number): number {
  const h = (G * t * t) / 8; // metry
  return Math.round(h * 100);
}

/**
 * Przelicza wynik główny z kluczowych klatek + FPS.
 * Zwraca null, gdy brakuje potrzebnych klatek dla danej kategorii.
 */
export function recomputeMainValue(
  test: VisionTest,
  fps: number,
  frames: CoachFrames,
): number | null {
  if (!fps || fps <= 0) return null;
  if (isJump(test)) {
    const { takeoff_frame, landing_frame } = frames;
    if (takeoff_frame == null || landing_frame == null) return null;
    const t = (landing_frame - takeoff_frame) / fps;
    if (t <= 0) return null;
    return heightFromFlightTime(t);
  }
  if (isSprint(test) || isCod(test)) {
    const start = frames.start_frame;
    const finish = frames.finish_frame;
    if (start == null || finish == null) return null;
    const time = (finish - start) / fps;
    if (time <= 0) return null;
    return Math.round(time * 100) / 100;
  }
  return null;
}

/** Buduje sekcję „Jak powstał wynik?” zależnie od kategorii testu. */
export function buildCalculationBasis(params: {
  test: VisionTest;
  fps: number;
  frames: CoachFrames;
  cameraView: VisionCameraView | null;
  flags: VisionValidityFlags;
  confidence: string;
  coachVerifiedFrames: boolean;
}): CalculationBasis {
  const { test, fps, frames, cameraView, flags, confidence, coachVerifiedFrames } = params;
  const view = cameraView ? CAMERA_VIEW_LABELS[cameraView] : "—";
  const yn = (b: boolean) => (b ? "Tak" : "Nie");
  const conf = confidence === "high" ? "Wysoka" : confidence === "medium" ? "Średnia" : "Niska";

  if (isJump(test)) {
    const t =
      frames.takeoff_frame != null && frames.landing_frame != null
        ? Math.round(((frames.landing_frame - frames.takeoff_frame) / fps) * 1000) / 1000
        : null;
    return {
      method: "Wynik liczony z czasu lotu (klatka oderwania → klatka lądowania).",
      coachVerifiedFrames,
      items: [
        { label: "FPS filmu", value: `${fps}` },
        { label: "Klatka oderwania od ziemi", value: `${frames.takeoff_frame ?? "—"}` },
        { label: "Klatka lądowania", value: `${frames.landing_frame ?? "—"}` },
        { label: "Czas lotu", value: t != null ? `${t} s` : "—" },
        { label: "Metoda", value: "h = g · t² / 8" },
        { label: "Confidence score", value: conf },
        { label: "Klatki zweryfikowane przez trenera", value: yn(coachVerifiedFrames) },
      ],
    };
  }
  if (isSprint(test)) {
    const nFrames =
      frames.start_frame != null && frames.finish_frame != null
        ? frames.finish_frame - frames.start_frame
        : null;
    return {
      method: "Czas liczony z liczby klatek między startem a metą podzielonej przez FPS.",
      coachVerifiedFrames,
      items: [
        { label: "FPS filmu", value: `${fps}` },
        { label: "Klatka startu", value: `${frames.start_frame ?? "—"}` },
        { label: "Klatka mety", value: `${frames.finish_frame ?? "—"}` },
        { label: "Liczba klatek start→meta", value: nFrames != null ? `${nFrames}` : "—" },
        { label: "Czas z FPS", value: nFrames != null ? `${Math.round((nFrames / fps) * 100) / 100} s` : "—" },
        { label: "Widoczność linii startu i mety", value: yn(flags.lineVisible) },
        { label: "Confidence score", value: conf },
        { label: "Klatki zweryfikowane przez trenera", value: yn(coachVerifiedFrames) },
      ],
    };
  }
  if (isCod(test)) {
    return {
      method: "Analiza fazy wejścia, zwrotu i wyjścia z kluczowych klatek.",
      coachVerifiedFrames,
      items: [
        { label: "FPS filmu", value: `${fps}` },
        { label: "Widoczność strefy wejścia", value: yn(flags.athleteInFrame) },
        { label: "Widoczność zwrotu", value: yn(flags.groundContactClear) },
        { label: "Widoczność wyjścia", value: yn(flags.athleteInFrame) },
        { label: "Klatka wejścia", value: `${frames.first_contact_frame ?? "—"}` },
        { label: "Klatka wyjścia", value: `${frames.last_contact_frame ?? "—"}` },
        { label: "Jakość hamowania", value: flags.groundContactClear ? "Czytelna" : "Niepewna" },
        { label: "Confidence score", value: conf },
      ],
    };
  }
  // technique
  return {
    method: "Ocena jakości ruchu na podstawie widoczności sylwetki i ustawienia kamery.",
    coachVerifiedFrames,
    items: [
      { label: "Widoczność całej sylwetki", value: yn(flags.athleteInFrame) },
      { label: "Widoczność stóp", value: yn(flags.feetVisible) },
      { label: "Widoczność kontaktu z podłożem", value: yn(flags.groundContactClear) },
      { label: "Ustawienie kamery", value: view },
      { label: "Confidence score", value: conf },
    ],
  };
}
