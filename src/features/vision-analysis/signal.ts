/**
 * Przetwarzanie sygnału trajektorii landmarków: wygładzanie, prędkość,
 * wykrywanie ekstremów i interpolacja krótkich braków detekcji.
 * Wszystko czyste i deterministyczne (pokryte testami).
 */

/** Wygładzanie ruchomą średnią o zadanym oknie (nieparzyste okno). */
export function movingAverage(values: number[], window = 5): number[] {
  if (window <= 1 || values.length === 0) return [...values];
  const half = Math.floor(window / 2);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < values.length && Number.isFinite(values[j])) {
        sum += values[j];
        count++;
      }
    }
    out.push(count > 0 ? sum / count : values[i]);
  }
  return out;
}

/**
 * Prędkość jako pochodna sygnału po czasie (różnice centralne).
 * timestamps w sekundach. Zwraca tablicę tej samej długości.
 */
export function derivative(values: number[], timestamps: number[]): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const prev = Math.max(0, i - 1);
    const next = Math.min(n - 1, i + 1);
    const dt = timestamps[next] - timestamps[prev];
    out[i] = dt > 0 ? (values[next] - values[prev]) / dt : 0;
  }
  return out;
}

/**
 * Interpolacja krótkich braków (NaN) w sygnale. Luki dłuższe niż
 * `maxGap` próbek pozostają NaN — nie zmyślamy danych, których model nie widział.
 */
export function interpolateShortGaps(values: number[], maxGap = 3): number[] {
  const out = [...values];
  let i = 0;
  while (i < out.length) {
    if (!Number.isFinite(out[i])) {
      const start = i;
      while (i < out.length && !Number.isFinite(out[i])) i++;
      const end = i; // pierwszy poprawny po luce
      const gap = end - start;
      const before = start - 1;
      if (before >= 0 && end < out.length && gap <= maxGap) {
        const v0 = out[before];
        const v1 = out[end];
        for (let k = start; k < end; k++) {
          const ratio = (k - before) / (end - before);
          out[k] = v0 + ratio * (v1 - v0);
        }
      }
    } else {
      i++;
    }
  }
  return out;
}

/** Indeks globalnego minimum (ignoruje NaN). -1 gdy brak danych. */
export function argMin(values: number[]): number {
  let idx = -1;
  let best = Infinity;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i]) && values[i] < best) {
      best = values[i];
      idx = i;
    }
  }
  return idx;
}

/** Indeks globalnego maksimum (ignoruje NaN). -1 gdy brak danych. */
export function argMax(values: number[]): number {
  let idx = -1;
  let best = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i]) && values[i] > best) {
      best = values[i];
      idx = i;
    }
  }
  return idx;
}

/** Średnia wartości skończonych. */
export function meanFinite(values: number[]): number {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}
