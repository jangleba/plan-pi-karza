/** Matematyka wykresów: gładka krzywa przez punkty (bez przestrzałów) i „ładne” podziałki osi. */
export type XY = [number, number];

/**
 * Krzywa monotoniczna (Fritsch–Carlson): przechodzi przez każdy punkt i nie wychodzi poza zakres sąsiednich wartości,
 * więc wykres nie „wymyśla” wartości spoza danych. Zwraca ścieżkę SVG.
 */
export function monotonePath(p: XY[]): string {
  const n = p.length;
  if (n === 0) return "";
  const f = (v: number) => v.toFixed(2);
  if (n === 1) return `M${f(p[0]![0])},${f(p[0]![1])}`;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(p[i + 1]![0] - p[i]![0]); m.push((p[i + 1]![1] - p[i]![1]) / (dx[i] || 1e-9)); }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2);
  t.push(m[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i]! / m[i]!, b = t[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]!; t[i + 1] = k * b * m[i]!; }
  }
  let d = `M${f(p[0]![0])},${f(p[0]![1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]!;
    d += ` C${f(p[i]![0] + h / 3)},${f(p[i]![1] + (t[i]! * h) / 3)} ${f(p[i + 1]![0] - h / 3)},${f(p[i + 1]![1] - (t[i + 1]! * h) / 3)} ${f(p[i + 1]![0])},${f(p[i + 1]![1])}`;
  }
  return d;
}

/** Podziałki osi pionowej: `count` równych kroków o „okrągłej” wielkości obejmujących [min, max]. */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (!(max > min)) { const c = min || 1; return [c - Math.abs(c) * 0.05, c, c + Math.abs(c) * 0.05]; }
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pow;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Skala czasu: data ISO → [0,1] w oknie [from, to]. */
export function timeFraction(date: string, from: string, to: string): number {
  const a = Date.parse(from), b = Date.parse(to), t = Date.parse(date);
  return b === a ? 0.5 : (t - a) / (b - a);
}
