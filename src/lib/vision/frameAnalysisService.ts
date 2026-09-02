import type {
  VisionTest,
  FrameMarkerDef,
  FrameMarkerKey,
  FrameManualInputs,
  FrameAnalysisResult,
  FrameAnalysisStatus,
  FrameDerived,
  MarkedBy,
  CalculationBasis,
  CalculationBasisItem,
  FrameQuality,
} from "./types";
import { FRAME_QUALITY_LABELS } from "./types";
import { getVisionTest } from "./visionTests";

const G = 9.80665;
const MIN_FLIGHT_TIME_S = 0.15;
const MAX_FLIGHT_TIME_S = 1.1;

/** Wymagane / opcjonalne markery klatkowe dla każdego testu. */
export const TEST_MARKERS: Record<string, FrameMarkerDef[]> = {
  cmj: [
    { key: "takeoff_frame", label: "Klatka oderwania", required: true },
    { key: "landing_frame", label: "Klatka lądowania", required: true },
  ],
  squat_jump: [
    { key: "takeoff_frame", label: "Klatka oderwania", required: true },
    { key: "landing_frame", label: "Klatka lądowania", required: true },
  ],
  drop_jump: [
    { key: "first_contact_frame", label: "Pierwszy kontakt po zejściu", required: true },
    { key: "takeoff_frame", label: "Klatka ponownego oderwania", required: true },
    { key: "landing_frame", label: "Klatka końcowego lądowania", required: true },
  ],
  broad_jump: [{ key: "landing_frame", label: "Pierwszy kontakt przy lądowaniu", required: true }],
  pogo_jumps: [
    { key: "first_contact_frame", label: "Pierwszy kontakt", required: true },
    { key: "last_contact_frame", label: "Ostatni kontakt", required: true },
  ],
  sprint_20m: [
    { key: "start_frame", label: "Klatka startu", required: true },
    { key: "finish_frame", label: "Klatka mety", required: true },
  ],
  sprint_30m: [
    { key: "start_frame", label: "Klatka startu", required: true },
    { key: "finish_frame", label: "Klatka mety", required: true },
  ],
  five_ten_five: [
    { key: "entry_frame", label: "Wejście", required: true },
    { key: "braking_start_frame", label: "Początek hamowania", required: true },
    { key: "stop_frame", label: "Zatrzymanie", required: true },
    { key: "exit_frame", label: "Wyjście (opcjonalnie)", required: false },
  ],
  sprint_to_stop: [
    { key: "entry_frame", label: "Wejście", required: true },
    { key: "braking_start_frame", label: "Początek hamowania", required: true },
    { key: "stop_frame", label: "Zatrzymanie", required: true },
    { key: "exit_frame", label: "Wyjście (opcjonalnie)", required: false },
  ],
};

export function getTestMarkers(testId: string): FrameMarkerDef[] {
  return TEST_MARKERS[testId] ?? [];
}

/** Testy, dla których zawodnik może samodzielnie zatwierdzić pełny wynik klatkowy. */
const ATHLETE_FRAME_TESTS = new Set(["cmj", "broad_jump"]);

export function isAthleteFrameAnalysisSupported(testId: string): boolean {
  return ATHLETE_FRAME_TESTS.has(testId);
}

/** Stały dystans dla sprintów. */
export function sprintDistance(testId: string): number | null {
  if (testId === "sprint_20m") return 20;
  if (testId === "sprint_30m") return 30;
  return null;
}

function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function qLabel(q: FrameQuality | null | undefined): string {
  return q ? FRAME_QUALITY_LABELS[q] : "—";
}

function jumpFromFrames(takeoff: number, landing: number, fps: number) {
  const frameCount = landing - takeoff;
  const flightTime = frameCount / fps;
  const temporalResolution = 1 / fps;
  const heightForTime = (seconds: number) => (G * seconds * seconds * 100) / 8;
  const jumpHeightCm = round(heightForTime(flightTime), 1);
  const lowerTime = Math.max(0, flightTime - temporalResolution);
  const upperTime = flightTime + temporalResolution;
  const jumpHeightMinCm = round(heightForTime(lowerTime), 1);
  const jumpHeightMaxCm = round(heightForTime(upperTime), 1);
  return {
    frameCount,
    flightTime,
    temporalResolutionMs: round(temporalResolution * 1000, 1),
    jumpHeightCm,
    jumpHeightMinCm,
    jumpHeightMaxCm,
  };
}

function validateFlightTime(flightTime: number): string | null {
  if (flightTime < MIN_FLIGHT_TIME_S || flightTime > MAX_FLIGHT_TIME_S) {
    return "Zaznaczone klatki dają nierealny czas lotu. Sprawdź oderwanie i lądowanie.";
  }
  return null;
}

/** Konwersja czasu wideo na numer klatki. */
export function timeToFrame(currentTime: number, fps: number): number {
  return Math.round(currentTime * fps);
}

/** Konwersja numeru klatki na czas wideo. */
export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

function invalid(
  testId: string,
  category: VisionTest["category"],
  fps: number,
  markers: Partial<Record<FrameMarkerKey, number>>,
  manual: FrameManualInputs,
  message: string,
): FrameAnalysisResult {
  return {
    testId,
    category,
    fps,
    markers,
    manual,
    status: "invalid",
    error: message,
    mainResultValue: null,
    mainResultUnit: null,
    method: "—",
    markedBy: "user",
    derived: {},
    basis: {
      method: message,
      items: [{ label: "FPS filmu", value: `${fps || "—"}` }],
      coachVerifiedFrames: false,
    },
  };
}

/**
 * Realna analiza klatkowa. Cała matematyka jest tutaj — nie w UI.
 * Zwraca wynik ze statusem invalid, gdy brakuje FPS lub kluczowych klatek.
 */
export function computeFrameResult(params: {
  testId: string;
  fps: number;
  markers: Partial<Record<FrameMarkerKey, number>>;
  manual?: FrameManualInputs;
  markedBy?: MarkedBy;
}): FrameAnalysisResult {
  const { testId, fps } = params;
  const markers = params.markers ?? {};
  const manual = params.manual ?? {};
  const markedBy: MarkedBy = params.markedBy ?? "user";
  const test = getVisionTest(testId);
  if (!test) throw new Error(`Nieznany test: ${testId}`);

  if (!fps || fps <= 0) {
    return invalid(
      testId,
      test.category,
      fps,
      markers,
      manual,
      "Nie udało się automatycznie odczytać FPS filmu.",
    );
  }

  const estimated = fps < test.minimumFps;

  // ---------------- CMJ / Squat Jump ----------------
  if (testId === "cmj" || testId === "squat_jump") {
    const takeoff = markers.takeoff_frame;
    const landing = markers.landing_frame;
    if (takeoff == null)
      return invalid(testId, "jump", fps, markers, manual, "Brak klatki oderwania.");
    if (landing == null)
      return invalid(testId, "jump", fps, markers, manual, "Brak klatki lądowania.");
    if (landing <= takeoff)
      return invalid(
        testId,
        "jump",
        fps,
        markers,
        manual,
        "Klatka lądowania musi być po klatce oderwania.",
      );
    const jump = jumpFromFrames(takeoff, landing, fps);
    const flightError = validateFlightTime(jump.flightTime);
    if (flightError) return invalid(testId, "jump", fps, markers, manual, flightError);
    const derived: FrameDerived = {
      frameCount: jump.frameCount,
      flightTime: round(jump.flightTime, 3),
      jumpHeightCm: jump.jumpHeightCm,
      jumpHeightMinCm: jump.jumpHeightMinCm,
      jumpHeightMaxCm: jump.jumpHeightMaxCm,
      temporalResolutionMs: jump.temporalResolutionMs,
    };
    const basis: CalculationBasis = {
      method: "Flight Time Method",
      coachVerifiedFrames: markedBy === "coach",
      items: [
        { label: "Metoda", value: "Flight Time Method" },
        { label: "FPS", value: `${fps}` },
        { label: "Klatka oderwania", value: `${takeoff}` },
        { label: "Klatka lądowania", value: `${landing}` },
        { label: "Liczba klatek", value: `${jump.frameCount}` },
        { label: "Czas lotu", value: `${round(jump.flightTime, 3)} s` },
        { label: "Wzór", value: "h = 9.80665 × t² / 8" },
        { label: "Wysokość skoku", value: `${jump.jumpHeightCm} cm` },
        {
          label: "Zakres rozdzielczości klatek",
          value: `${jump.jumpHeightMinCm}–${jump.jumpHeightMaxCm} cm`,
        },
        { label: "Oznaczone przez", value: markedByLabel(markedBy) },
      ],
    };
    return {
      testId,
      category: "jump",
      fps,
      markers,
      manual,
      status: statusFor(estimated, markedBy),
      error: null,
      mainResultValue: jump.jumpHeightCm,
      mainResultUnit: "cm",
      method: "Flight Time Method",
      markedBy,
      derived,
      basis,
    };
  }

  // ---------------- Drop Jump ----------------
  if (testId === "drop_jump") {
    const firstContact = markers.first_contact_frame;
    const takeoff = markers.takeoff_frame;
    const landing = markers.landing_frame;
    if (firstContact == null)
      return invalid(testId, "jump", fps, markers, manual, "Brak klatki pierwszego kontaktu.");
    if (takeoff == null)
      return invalid(testId, "jump", fps, markers, manual, "Brak klatki ponownego oderwania.");
    if (landing == null)
      return invalid(testId, "jump", fps, markers, manual, "Brak klatki końcowego lądowania.");
    if (takeoff <= firstContact || landing <= takeoff)
      return invalid(
        testId,
        "jump",
        fps,
        markers,
        manual,
        "Klatki muszą być ustawione w kolejności: kontakt, oderwanie, lądowanie.",
      );
    const jump = jumpFromFrames(takeoff, landing, fps);
    const flightError = validateFlightTime(jump.flightTime);
    if (flightError) return invalid(testId, "jump", fps, markers, manual, flightError);
    const contactTime = (takeoff - firstContact) / fps;
    if (contactTime < 0.05 || contactTime > 1.5)
      return invalid(
        testId,
        "jump",
        fps,
        markers,
        manual,
        "Zaznaczone klatki dają nierealny czas kontaktu.",
      );
    const rsi = jump.jumpHeightCm / 100 / contactTime;
    const derived: FrameDerived = {
      frameCount: jump.frameCount,
      flightTime: round(jump.flightTime, 3),
      contactTime: round(contactTime, 3),
      jumpHeightCm: jump.jumpHeightCm,
      jumpHeightMinCm: jump.jumpHeightMinCm,
      jumpHeightMaxCm: jump.jumpHeightMaxCm,
      temporalResolutionMs: jump.temporalResolutionMs,
      reactiveStrengthIndex: round(rsi, 2),
    };
    const basis: CalculationBasis = {
      method: "Frame-Based Drop Jump",
      coachVerifiedFrames: markedBy === "coach",
      items: [
        { label: "Metoda", value: "Klatki kontaktu i lotu" },
        { label: "FPS", value: `${fps}` },
        { label: "Czas kontaktu", value: `${round(contactTime, 3)} s` },
        { label: "Czas lotu", value: `${round(jump.flightTime, 3)} s` },
        { label: "Wysokość odbicia", value: `${jump.jumpHeightCm} cm` },
        { label: "RSI", value: `${round(rsi, 2)} m/s` },
        {
          label: "Zakres rozdzielczości klatek",
          value: `${jump.jumpHeightMinCm}–${jump.jumpHeightMaxCm} cm`,
        },
        { label: "Oznaczone przez", value: markedByLabel(markedBy) },
      ],
    };
    return {
      testId,
      category: "jump",
      fps,
      markers,
      manual,
      status: statusFor(estimated, markedBy),
      error: null,
      mainResultValue: round(rsi, 2),
      mainResultUnit: "m/s",
      method: "Frame-Based Drop Jump",
      markedBy,
      derived,
      basis,
    };
  }

  // ---------------- Broad Jump ----------------
  if (testId === "broad_jump") {
    const distanceCm = manual.distance_cm;
    const landing = markers.landing_frame;
    if (landing == null)
      return invalid(testId, "jump", fps, markers, manual, "Brak klatki pierwszego lądowania.");
    if (distanceCm == null || distanceCm <= 0)
      return invalid(
        testId,
        "jump",
        fps,
        markers,
        manual,
        "Nie wskazano pięty lądowania na skalibrowanym podłożu.",
      );
    if (!manual.calibration_official || !manual.calibration_id || !manual.calibration_hash)
      return invalid(
        testId,
        "jump",
        fps,
        markers,
        manual,
        "Broad Jump wymaga pełnej kalibracji podłoża.",
      );
    const derived: FrameDerived = {
      distanceCm: round(distanceCm, 0),
      distanceM: round(distanceCm / 100, 2),
    };
    const basis: CalculationBasis = {
      method: "Calibrated Ground Plane",
      coachVerifiedFrames: markedBy === "coach",
      items: [
        { label: "Metoda", value: "Homografia skalibrowanej płaszczyzny podłoża" },
        { label: "Klatka lądowania", value: `${landing}` },
        {
          label: "Punkt pięty",
          value: `${round(manual.landing_point_u ?? 0, 1)}, ${round(manual.landing_point_v ?? 0, 1)} px`,
        },
        { label: "Odległość", value: `${round(distanceCm, 0)} cm` },
        { label: "Kalibracja", value: manual.calibration_id },
        {
          label: "Błąd reprojekcji",
          value: `${round(manual.calibration_reprojection_error_px ?? 0, 2)} px`,
        },
        { label: "FPS", value: `${fps}` },
        { label: "Oznaczone przez", value: markedByLabel(markedBy) },
      ],
    };
    return {
      testId,
      category: "jump",
      fps,
      markers,
      manual,
      status: markedBy === "coach" ? "coach_verified" : "user_marked",
      error: null,
      mainResultValue: round(distanceCm, 0),
      mainResultUnit: "cm",
      method: "Calibrated Ground Plane",
      markedBy,
      derived,
      basis,
    };
  }

  // ---------------- Pogo Jumps ----------------
  if (testId === "pogo_jumps") {
    const first = markers.first_contact_frame;
    const last = markers.last_contact_frame;
    const contacts = manual.number_of_contacts;
    if (first == null)
      return invalid(testId, "jump", fps, markers, manual, "Brak klatki pierwszego kontaktu.");
    if (last == null)
      return invalid(testId, "jump", fps, markers, manual, "Brak klatki ostatniego kontaktu.");
    if (last <= first)
      return invalid(
        testId,
        "jump",
        fps,
        markers,
        manual,
        "Ostatni kontakt musi być po pierwszym.",
      );
    if (contacts == null || contacts <= 0)
      return invalid(testId, "jump", fps, markers, manual, "Podaj liczbę kontaktów.");
    const totalTime = (last - first) / fps;
    const rhythm = contacts / totalTime;
    const derived: FrameDerived = {
      frameCount: last - first,
      totalTime: round(totalTime, 3),
      numberOfContacts: contacts,
      contactRhythm: round(rhythm, 2),
    };
    const basis: CalculationBasis = {
      method: "Frame-Based Rhythm",
      coachVerifiedFrames: markedBy === "coach",
      items: [
        { label: "Metoda", value: "Rytm kontaktów z klatek" },
        { label: "FPS", value: `${fps}` },
        { label: "Pierwszy kontakt", value: `${first}` },
        { label: "Ostatni kontakt", value: `${last}` },
        { label: "Liczba kontaktów", value: `${contacts}` },
        { label: "Czas próby", value: `${round(totalTime, 3)} s` },
        { label: "Rytm kontaktów", value: `${round(rhythm, 2)} /s` },
        { label: "Oznaczone przez", value: markedByLabel(markedBy) },
      ],
    };
    return {
      testId,
      category: "jump",
      fps,
      markers,
      manual,
      status: statusFor(estimated, markedBy),
      error: null,
      mainResultValue: round(rhythm, 2),
      mainResultUnit: "/s",
      method: "Frame-Based Rhythm",
      markedBy,
      derived,
      basis,
    };
  }

  // ---------------- Sprint 20 / 30 ----------------
  if (testId === "sprint_20m" || testId === "sprint_30m") {
    const start = markers.start_frame;
    const finish = markers.finish_frame;
    const distanceM = sprintDistance(testId)!;
    if (start == null)
      return invalid(testId, "sprint", fps, markers, manual, "Brak klatki startu.");
    if (finish == null) return invalid(testId, "sprint", fps, markers, manual, "Brak klatki mety.");
    if (finish <= start)
      return invalid(
        testId,
        "sprint",
        fps,
        markers,
        manual,
        "Klatka mety musi być po klatce startu.",
      );
    const frameCount = finish - start;
    const sprintTime = frameCount / fps;
    const speedMs = distanceM / sprintTime;
    const speedKmh = speedMs * 3.6;
    const derived: FrameDerived = {
      frameCount,
      sprintTime: round(sprintTime, 2),
      distanceM,
      speedMs: round(speedMs, 2),
      speedKmh: round(speedKmh, 2),
    };
    const basis: CalculationBasis = {
      method: "Frame-Based Timing",
      coachVerifiedFrames: markedBy === "coach",
      items: [
        { label: "Metoda", value: "Frame-Based Timing" },
        { label: "FPS", value: `${fps}` },
        { label: "Klatka startu", value: `${start}` },
        { label: "Klatka mety", value: `${finish}` },
        { label: "Liczba klatek", value: `${frameCount}` },
        { label: "Dystans", value: `${distanceM} m` },
        { label: "Czas", value: `${round(sprintTime, 2)} s` },
        { label: "Prędkość", value: `${round(speedMs, 2)} m/s (${round(speedKmh, 2)} km/h)` },
        { label: "Oznaczone przez", value: markedByLabel(markedBy) },
      ],
    };
    return {
      testId,
      category: "sprint",
      fps,
      markers,
      manual,
      status: statusFor(estimated, markedBy),
      error: null,
      mainResultValue: round(sprintTime, 2),
      mainResultUnit: "s",
      method: "Frame-Based Timing",
      markedBy,
      derived,
      basis,
    };
  }

  // ---------------- COD / Braking ----------------
  if (testId === "five_ten_five" || testId === "sprint_to_stop") {
    const entry = markers.entry_frame;
    const brakingStart = markers.braking_start_frame;
    const stop = markers.stop_frame;
    const exit = markers.exit_frame;
    if (brakingStart == null)
      return invalid(testId, "cod", fps, markers, manual, "Brak klatki początku hamowania.");
    if (stop == null)
      return invalid(testId, "cod", fps, markers, manual, "Brak klatki zatrzymania.");
    if (stop <= brakingStart)
      return invalid(
        testId,
        "cod",
        fps,
        markers,
        manual,
        "Zatrzymanie musi być po początku hamowania.",
      );
    const brakingTime = (stop - brakingStart) / fps;
    const totalTime = exit != null && entry != null && exit > entry ? (exit - entry) / fps : null;
    const derived: FrameDerived = {
      brakingTime: round(brakingTime, 3),
      totalTime: totalTime != null ? round(totalTime, 3) : null,
    };
    const items: CalculationBasisItem[] = [
      { label: "Metoda", value: "Frame Braking Analysis" },
      { label: "FPS", value: `${fps}` },
      { label: "Początek hamowania", value: `${brakingStart}` },
      { label: "Zatrzymanie", value: `${stop}` },
      { label: "Czas hamowania", value: `${round(brakingTime, 3)} s` },
    ];
    if (totalTime != null)
      items.push({ label: "Czas całkowity", value: `${round(totalTime, 3)} s` });
    items.push(
      { label: "Kontrola kolana", value: qLabel(manual.knee_control) },
      { label: "Kontrola tułowia", value: qLabel(manual.trunk_control) },
      { label: "Ustawienie stopy", value: qLabel(manual.foot_placement) },
      {
        label: "Liczba kroków hamowania",
        value: manual.braking_steps != null ? `${manual.braking_steps}` : "—",
      },
      { label: "Oznaczone przez", value: markedByLabel(markedBy) },
    );
    const basis: CalculationBasis = {
      method: "Frame Braking Analysis",
      coachVerifiedFrames: markedBy === "coach",
      items,
    };
    return {
      testId,
      category: "cod",
      fps,
      markers,
      manual,
      status: statusFor(estimated, markedBy),
      error: null,
      mainResultValue: round(brakingTime, 2),
      mainResultUnit: "s",
      method: "Frame Braking Analysis",
      markedBy,
      derived,
      basis,
    };
  }

  return invalid(
    testId,
    test.category,
    fps,
    markers,
    manual,
    "Ten test nie obsługuje analizy klatkowej.",
  );
}

function statusFor(estimated: boolean, markedBy: MarkedBy): FrameAnalysisStatus {
  if (markedBy === "coach") return "coach_verified";
  if (estimated) return "estimated";
  return "frame_verified";
}

function markedByLabel(m: MarkedBy): string {
  return m === "coach" ? "Trener" : m === "ai" ? "AI" : "Użytkownik";
}
