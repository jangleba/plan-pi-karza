/**
 * MotionWindow — coarse-pass wykrywania okna właściwego ruchu w nagraniu.
 *
 * Nie zmienia zachowania adapterów. Buduje osobną warstwę informacyjną nad
 * już przetworzonymi klatkami (FramePose), używaną przez:
 *  - raport dowodowy (Jak zmierzono / evidence panel),
 *  - tryb debug (?visionDebug=true),
 *  - warstwę ostrzeżeń (TEST_WINDOW_INCOMPLETE) — WARNING, nie blokuje wyniku.
 *
 * Algorytm: dla każdej klatki liczymy prostą "energię ruchu" jako sumę
 * przesunięć kluczowych landmarków (kostki, biodra, barki) między klatkami,
 * znormalizowaną wielkością sylwetki. Ruch = prób powyżej progu przez co
 * najmniej minRunFrames klatek. Zwracamy: startTs, endTs, próg, liczbę
 * wykrytych "aktywnych" okien i (opcjonalnie) liczbę oscylacji dla testów
 * typu REACTIVE_CONTACT (do walidacji expectedRepCount).
 */

import type { FramePose } from "./types";

export interface MotionWindow {
  /** Timestamp pierwszej klatki uznanej za ruch (s). */
  startTimestampSeconds: number | null;
  /** Timestamp ostatniej klatki uznanej za ruch (s). */
  endTimestampSeconds: number | null;
  /** Długość okna ruchu (s). */
  durationSeconds: number;
  /** Margines przed właściwym ruchem (s). */
  leadingMarginSeconds: number;
  /** Margines po ruchu do końca nagrania (s). */
  trailingMarginSeconds: number;
  /** Wykryty próg energii ruchu. */
  motionThreshold: number;
  /** Ilość odrębnych aktywnych fragmentów (informacyjnie). */
  activeSegments: number;
  /** Zgrubna liczba oscylacji pionowych bioder (do serii typu pogo/repeated). */
  approximateVerticalRepetitions: number;
  /** Klatki użyte do policzenia okna (z landmarkami). */
  framesConsidered: number;
}

const KEY_LANDMARKS = [11, 12, 23, 24, 27, 28] as const; // barki, biodra, kostki

function silhouetteSize(pose: FramePose): number {
  const lm = pose.landmarks;
  if (!lm) return 0;
  const shoulderY = (lm[11]?.y ?? 0.5 + lm[12]?.y ?? 0.5) / 2;
  const ankleY = ((lm[27]?.y ?? 0.9) + (lm[28]?.y ?? 0.9)) / 2;
  const h = Math.abs(ankleY - shoulderY);
  return h > 0.05 ? h : 0.5;
}

/** Coarse-pass po już zdekodowanych pozach — deterministyczny. */
export function detectMotionWindow(
  poses: FramePose[],
  totalDurationSeconds: number,
): MotionWindow {
  const framesConsidered = poses.filter((p) => p.landmarks != null).length;
  if (framesConsidered < 3) {
    return {
      startTimestampSeconds: null,
      endTimestampSeconds: null,
      durationSeconds: 0,
      leadingMarginSeconds: 0,
      trailingMarginSeconds: totalDurationSeconds,
      motionThreshold: 0,
      activeSegments: 0,
      approximateVerticalRepetitions: 0,
      framesConsidered,
    };
  }

  const energy: { ts: number; e: number }[] = [];
  let prev: FramePose | null = null;
  for (const p of poses) {
    if (!p.landmarks) {
      prev = p;
      continue;
    }
    const ts =
      p.sourceTimestampMs != null
        ? p.sourceTimestampMs / 1000
        : p.mediaTime;
    if (!prev?.landmarks) {
      energy.push({ ts, e: 0 });
      prev = p;
      continue;
    }
    const size = silhouetteSize(p) || 0.5;
    let sum = 0;
    for (const idx of KEY_LANDMARKS) {
      const a = prev.landmarks[idx];
      const b = p.landmarks[idx];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      sum += Math.hypot(dx, dy);
    }
    energy.push({ ts, e: sum / (size * KEY_LANDMARKS.length) });
    prev = p;
  }

  // Próg = 3x mediana szumu (dolna połowa energii) — deterministyczne.
  const sorted = [...energy.map((x) => x.e)].sort((a, b) => a - b);
  const lowHalf = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2)));
  const median = lowHalf[Math.floor(lowHalf.length / 2)] ?? 0;
  const threshold = Math.max(0.004, median * 3);

  const active = energy.map((x) => x.e > threshold);
  const minRun = 3;
  let firstIdx = -1;
  let lastIdx = -1;
  let segments = 0;
  let runLen = 0;
  for (let i = 0; i < active.length; i++) {
    if (active[i]) {
      runLen++;
      if (runLen === minRun) {
        segments++;
        if (firstIdx === -1) firstIdx = i - minRun + 1;
      }
      if (runLen >= minRun) lastIdx = i;
    } else {
      runLen = 0;
    }
  }

  const startTs = firstIdx >= 0 ? energy[firstIdx].ts : null;
  const endTs = lastIdx >= 0 ? energy[lastIdx].ts : null;
  const duration = startTs != null && endTs != null ? Math.max(0, endTs - startTs) : 0;

  // Zgrubne oscylacje pionowe bioder w oknie ruchu (repeated / pogo).
  let reps = 0;
  if (firstIdx >= 0 && lastIdx > firstIdx) {
    const hipY: number[] = [];
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      if (!p.landmarks) continue;
      const y = ((p.landmarks[23]?.y ?? 0) + (p.landmarks[24]?.y ?? 0)) / 2;
      hipY.push(y);
    }
    // Zliczanie zmian znaku pochodnej wygładzonej trajektorii.
    const smooth: number[] = [];
    for (let i = 0; i < hipY.length; i++) {
      const a = hipY[Math.max(0, i - 1)];
      const b = hipY[i];
      const c = hipY[Math.min(hipY.length - 1, i + 1)];
      smooth.push((a + b + c) / 3);
    }
    let lastDir = 0;
    let extrema = 0;
    for (let i = 1; i < smooth.length; i++) {
      const d = smooth[i] - smooth[i - 1];
      const dir = d > 0.001 ? 1 : d < -0.001 ? -1 : 0;
      if (dir !== 0 && dir !== lastDir) {
        if (lastDir !== 0) extrema++;
        lastDir = dir;
      }
    }
    reps = Math.max(0, Math.floor(extrema / 2));
  }

  return {
    startTimestampSeconds: startTs,
    endTimestampSeconds: endTs,
    durationSeconds: Number(duration.toFixed(3)),
    leadingMarginSeconds: startTs != null ? Number(startTs.toFixed(3)) : 0,
    trailingMarginSeconds:
      endTs != null ? Number(Math.max(0, totalDurationSeconds - endTs).toFixed(3)) : totalDurationSeconds,
    motionThreshold: Number(threshold.toFixed(5)),
    activeSegments: segments,
    approximateVerticalRepetitions: reps,
    framesConsidered,
  };
}
