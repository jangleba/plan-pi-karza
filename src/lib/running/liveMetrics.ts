import { haversineDistanceM } from "./metrics";
import type { RoutePoint } from "./types";

/**
 * Pomiary na żywo z GPS: stabilne tempo z okna czasu (nie z dwóch ostatnich
 * punktów) i dystans w dowolnej chwili biegu — do odcinków receptury, także
 * tych, których granica minęła przy zablokowanym ekranie.
 */

export interface DistanceSample {
  /** Sekundy aktywnego biegu (bez pauz). */
  elapsedSec: number;
  /** Łączny dystans do tej chwili. */
  distanceM: number;
}

/** Okno tempa: dość długie, żeby wygładzić szum GPS, dość krótkie, żeby widać zmianę. */
export const PACE_WINDOW_SEC = 30;
const MIN_WINDOW_DISTANCE_M = 25;
const SLOWEST_SHOWN_PACE = 20 * 60;

/** Próbki dystansu z trasy (segmenty po pauzie nie są łączone). */
export function samplesFromRoute(route: RoutePoint[]): DistanceSample[] {
  const samples: DistanceSample[] = [];
  let total = 0;
  route.forEach((point, index) => {
    const previous = route[index - 1];
    if (previous && previous.segment === point.segment)
      total += haversineDistanceM(previous, point);
    samples.push({ elapsedSec: point.elapsedSec, distanceM: total });
  });
  return samples;
}

/** Dodaje próbkę, zachowując rosnący czas; starsze niż `keepSec` są usuwane. */
export function pushSample(
  samples: DistanceSample[],
  sample: DistanceSample,
  keepSec = Infinity,
): DistanceSample[] {
  if (!Number.isFinite(sample.elapsedSec) || !Number.isFinite(sample.distanceM)) return samples;
  const last = samples.at(-1);
  if (last && sample.elapsedSec < last.elapsedSec) return samples;
  const next =
    last && sample.elapsedSec === last.elapsedSec
      ? [...samples.slice(0, -1), sample]
      : [...samples, sample];
  const cutoff = sample.elapsedSec - keepSec;
  const firstKept = next.findIndex((s) => s.elapsedSec >= cutoff);
  // Jedna próbka sprzed okna zostaje jako punkt odniesienia do interpolacji.
  return firstKept > 1 ? next.slice(firstKept - 1) : next;
}

/** Dystans w chwili `elapsedSec` (interpolacja liniowa między próbkami). */
export function distanceAt(samples: DistanceSample[], elapsedSec: number): number {
  if (!samples.length) return 0;
  if (elapsedSec <= samples[0].elapsedSec) return samples[0].distanceM;
  const last = samples[samples.length - 1];
  if (elapsedSec >= last.elapsedSec) return last.distanceM;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].elapsedSec <= elapsedSec) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.elapsedSec - a.elapsedSec;
  return span > 0
    ? a.distanceM + ((b.distanceM - a.distanceM) * (elapsedSec - a.elapsedSec)) / span
    : b.distanceM;
}

/**
 * Bieżące tempo (s/km) z ostatnich `windowSec` sekund. Null, gdy w oknie jest za
 * mało ruchu (postój, przerwa w marszu albo brak sygnału) — wtedy nie pokazujemy
 * przypadkowej liczby.
 */
export function stablePace(
  samples: DistanceSample[],
  nowElapsedSec: number,
  windowSec = PACE_WINDOW_SEC,
): number | null {
  const last = samples.at(-1);
  if (!last || samples.length < 2) return null;
  // Brak świeżej próbki (utrata sygnału) → brak tempa.
  if (nowElapsedSec - last.elapsedSec > 15) return null;
  const from = Math.max(samples[0].elapsedSec, last.elapsedSec - windowSec);
  const seconds = last.elapsedSec - from;
  if (seconds < Math.min(10, windowSec / 2)) return null;
  const meters = last.distanceM - distanceAt(samples, from);
  if (meters < MIN_WINDOW_DISTANCE_M) return null;
  const pace = (seconds / meters) * 1000;
  return pace > SLOWEST_SHOWN_PACE ? null : pace;
}

/** Bieżący, niepełny kilometr: ile metrów i jaki czas od ostatniej pełnej granicy. */
export function currentKilometer(
  samples: DistanceSample[],
  nowElapsedSec: number,
): { kilometer: number; distanceM: number; durationSec: number } | null {
  const last = samples.at(-1);
  if (!last) return null;
  const done = Math.floor(last.distanceM / 1000);
  const boundary = done * 1000;
  // Czas przejścia granicy kilometra (dla pierwszego kilometra: początek zapisu).
  let at = samples[0].elapsedSec;
  if (done > 0) {
    const i = samples.findIndex((sample) => sample.distanceM >= boundary);
    const a = samples[Math.max(0, i - 1)];
    const b = samples[i];
    const f = (boundary - a.distanceM) / Math.max(1e-6, b.distanceM - a.distanceM);
    at = a.elapsedSec + (b.elapsedSec - a.elapsedSec) * Math.min(1, Math.max(0, f));
  }
  return {
    kilometer: done + 1,
    distanceM: last.distanceM - boundary,
    durationSec: Math.max(0, nowElapsedSec - at),
  };
}
