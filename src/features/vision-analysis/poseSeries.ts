import type { FramePose, Landmark } from "./types";
import { POSE } from "./types";

/** Bezpieczny odczyt landmarku (null gdy brak pozy). */
function lm(pose: FramePose, index: number): Landmark | null {
  if (!pose.landmarks) return null;
  return pose.landmarks[index] ?? null;
}

/** Landmark używany w pomiarze, nie tylko zwrócony przez model. */
function reliableLm(pose: FramePose, index: number, minVisibility = 0.35): Landmark | null {
  const point = lm(pose, index);
  if (!point || point.visibility < minVisibility) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

/** Średnia współrzędna Y dwóch landmarków (NaN gdy brak). W obrazie Y rośnie w dół. */
function avgY(pose: FramePose, a: number, b: number): number {
  const la = reliableLm(pose, a);
  const lb = reliableLm(pose, b);
  if (!la || !lb) return NaN;
  return (la.y + lb.y) / 2;
}

function avgX(pose: FramePose, a: number, b: number): number {
  const la = reliableLm(pose, a);
  const lb = reliableLm(pose, b);
  if (!la || !lb) return NaN;
  return (la.x + lb.x) / 2;
}

/** Trajektoria środka bioder w osi pionowej (0 = góra obrazu). */
export function hipYSeries(poses: FramePose[]): number[] {
  return poses.map((p) => avgY(p, POSE.LEFT_HIP, POSE.RIGHT_HIP));
}

/** Trajektoria bioder w poziomie (do biegu / COD). */
export function hipXSeries(poses: FramePose[]): number[] {
  return poses.map((p) => avgX(p, POSE.LEFT_HIP, POSE.RIGHT_HIP));
}

/**
 * Najniższy punkt stóp (max Y z pięt i śródstopia) — im większe Y tym niżej
 * na obrazie. Do detekcji kontaktu z podłożem i lotu.
 */
export function footBottomSeries(poses: FramePose[]): number[] {
  return poses.map((p) => {
    const candidates = [
      reliableLm(p, POSE.LEFT_HEEL),
      reliableLm(p, POSE.RIGHT_HEEL),
      reliableLm(p, POSE.LEFT_FOOT_INDEX),
      reliableLm(p, POSE.RIGHT_FOOT_INDEX),
      reliableLm(p, POSE.LEFT_ANKLE),
      reliableLm(p, POSE.RIGHT_ANKLE),
    ].filter((l): l is Landmark => !!l);
    if (candidates.length === 0) return NaN;
    return Math.max(...candidates.map((l) => l.y));
  });
}

/** Timestampy prezentacji klatek (sekundy, pełna precyzja z mikrosekund). */
export function timeSeries(poses: FramePose[]): number[] {
  return poses.map((p) => {
    if (typeof p.sourceTimestampUs === "number") return p.sourceTimestampUs / 1_000_000;
    if (typeof p.sourceTimestampMs === "number") return p.sourceTimestampMs / 1000;
    return p.presentationTimestamp;
  });
}

/** Udział klatek z wykrytą pozą (0-1). */
export function detectionRate(poses: FramePose[]): number {
  if (poses.length === 0) return 0;
  const detected = poses.filter((p) => p.landmarks && p.trackingConfidence > 0.3).length;
  return detected / poses.length;
}

/**
 * Czy druga osoba jest widoczna w sposób ciągły, a nie tylko w pojedynczej
 * błędnej klatce modelu. Lustro, cień albo artefakt kompresji nie mogą
 * automatycznie odrzucić całej poprawnej próby.
 */
export function multiplePeopleDetected(poses: FramePose[]): boolean {
  const detectedFrames = poses.filter((pose) => pose.landmarks != null);
  if (detectedFrames.length === 0) return false;

  let multiFrames = 0;
  let consecutive = 0;
  let longestRun = 0;
  for (const pose of detectedFrames) {
    if (pose.peopleCount > 1) {
      multiFrames += 1;
      consecutive += 1;
      longestRun = Math.max(longestRun, consecutive);
    } else {
      consecutive = 0;
    }
  }

  const requiredFrames = Math.min(8, Math.max(3, Math.ceil(detectedFrames.length * 0.12)));
  return multiFrames / detectedFrames.length >= 0.25 && longestRun >= requiredFrames;
}

/** Czy stopy wychodzą poza kadr (Y > 0.99) w istotnej części nagrania. */
export function feetOutOfFrameRate(poses: FramePose[]): number {
  const foot = footBottomSeries(poses);
  const valid = foot.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return 1;
  const out = valid.filter((v) => v > 0.99 || v < 0.01).length;
  return out / valid.length;
}

export { lm, reliableLm };
