import type { FramePose, Landmark } from "./types";
import { POSE } from "./types";

/** Bezpieczny odczyt landmarku (null gdy brak pozy). */
function lm(pose: FramePose, index: number): Landmark | null {
  if (!pose.landmarks) return null;
  return pose.landmarks[index] ?? null;
}

/** Średnia współrzędna Y dwóch landmarków (NaN gdy brak). W obrazie Y rośnie w dół. */
function avgY(pose: FramePose, a: number, b: number): number {
  const la = lm(pose, a);
  const lb = lm(pose, b);
  if (!la || !lb) return NaN;
  return (la.y + lb.y) / 2;
}

function avgX(pose: FramePose, a: number, b: number): number {
  const la = lm(pose, a);
  const lb = lm(pose, b);
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
      lm(p, POSE.LEFT_HEEL),
      lm(p, POSE.RIGHT_HEEL),
      lm(p, POSE.LEFT_FOOT_INDEX),
      lm(p, POSE.RIGHT_FOOT_INDEX),
      lm(p, POSE.LEFT_ANKLE),
      lm(p, POSE.RIGHT_ANKLE),
    ].filter((l): l is Landmark => !!l);
    if (candidates.length === 0) return NaN;
    return Math.max(...candidates.map((l) => l.y));
  });
}

/** Timestampy prezentacji klatek (sekundy). */
export function timeSeries(poses: FramePose[]): number[] {
  return poses.map((p) =>
    typeof p.sourceTimestampMs === "number" ? p.sourceTimestampMs / 1000 : p.presentationTimestamp,
  );
}

/** Udział klatek z wykrytą pozą (0-1). */
export function detectionRate(poses: FramePose[]): number {
  if (poses.length === 0) return 0;
  const detected = poses.filter((p) => p.landmarks && p.trackingConfidence > 0.3).length;
  return detected / poses.length;
}

/** Czy w którejkolwiek kluczowej klatce wykryto więcej niż jedną osobę. */
export function multiplePeopleDetected(poses: FramePose[]): boolean {
  return poses.some((p) => p.peopleCount > 1);
}

/** Czy stopy wychodzą poza kadr (Y > 0.99) w istotnej części nagrania. */
export function feetOutOfFrameRate(poses: FramePose[]): number {
  const foot = footBottomSeries(poses);
  const valid = foot.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return 1;
  const out = valid.filter((v) => v > 0.99 || v < 0.01).length;
  return out / valid.length;
}

export { lm };
