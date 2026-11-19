/**
 * Automatyczne wykrycie lotu w CMJ z pozycji stóp w kolejnych klatkach.
 * footY: pionowa pozycja stóp (0 = góra kadru, 1 = dół), null gdy stopy niewidoczne.
 * Metoda czasu lotu nie zależy od odległości telefonu – liczy się tylko, czy stopy są nad podłożem.
 */
export interface FlightDetection {
  /** Pierwsza klatka w powietrzu i pierwsza klatka z powrotem na podłożu. */
  takeoff: number;
  landing: number;
  flightS: number;
  /** 0–1: jak bardzo ufamy wynikowi (braki klatek, wiarygodność czasu lotu). */
  confidence: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

export function detectFlight(footY: Array<number | null>, fps: number): FlightDetection | null {
  const valid = footY.filter((y): y is number => y !== null);
  if (valid.length < fps * 0.8 || !(fps > 0)) return null;
  // większość nagrania to stopy na ziemi, więc mediana = poziom podłoża
  const ground = median(valid);
  const noise = median(valid.map((y) => Math.abs(y - ground))) * 1.4826; // MAD -> odchylenie
  const peak = Math.max(...valid.map((y) => ground - y));
  if (peak < 0.02) return null; // brak wyraźnego skoku
  const thr = Math.max(4 * noise, 0.006, 0.04 * peak);

  // najdłuższy ciągły odcinek „w powietrzu” (pojedyncze brakujące klatki są dopuszczalne)
  let best: [number, number] | null = null;
  let start = -1, gap = 0;
  for (let i = 0; i <= footY.length; i++) {
    const y = footY[i];
    const air = y !== null && y !== undefined && ground - y > thr;
    if (air) { if (start < 0) start = i; gap = 0; continue; }
    if (start >= 0 && (y === null) && gap < 1 && i < footY.length) { gap++; continue; }
    if (start >= 0) {
      const end = i - gap; // pierwsza klatka po locie
      if (!best || end - start > best[1] - best[0]) best = [start, end];
      start = -1; gap = 0;
    }
  }
  if (!best) return null;
  const [takeoff, landing] = best;
  // dokładniej niż próg: parabola lotu przecięta z poziomem podłoża (ułamki klatek)
  const fitted = parabolaCrossings(footY, takeoff, landing, ground);
  const flightS = fitted ? (fitted[1] - fitted[0]) / fps : (landing - takeoff) / fps;
  // wiarygodny CMJ: czas lotu ok. 0,25–0,9 s (wysokość ok. 8–100 cm)
  const plausible = flightS >= 0.25 && flightS <= 0.9 ? 1 : 0.3;
  const missing = footY.slice(Math.max(0, takeoff - 5), landing + 5).filter((y) => y === null).length;
  const confidence = Math.max(0, Math.min(1, plausible * (1 - missing / 10)));
  return { takeoff, landing, flightS, confidence };
}

/** Dopasowanie y = a·t² + b·t + c do klatek lotu i przecięcia z y = ground. */
function parabolaCrossings(footY: Array<number | null>, from: number, to: number, ground: number): [number, number] | null {
  const pts: Array<[number, number]> = [];
  for (let i = from; i < to; i++) { const y = footY[i]; if (y !== null && y !== undefined) pts.push([i, y]); }
  if (pts.length < 5) return null;
  // równania normalne dla wielomianu 2. stopnia (t przesunięte dla stabilności)
  const t0 = pts[0]![0];
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (const [ti, y] of pts) {
    const t = ti - t0;
    s0 += 1; s1 += t; s2 += t * t; s3 += t ** 3; s4 += t ** 4; y0 += y; y1 += t * y; y2 += t * t * y;
  }
  const det = (m: number[][]) =>
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
    m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
    m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const M = [[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]];
  const D = det(M);
  if (Math.abs(D) < 1e-12) return null;
  const a = det([[y2, s3, s2], [y1, s2, s1], [y0, s1, s0]]) / D;
  const b = det([[s4, y2, s2], [s3, y1, s1], [s2, y0, s0]]) / D;
  const c = det([[s4, s3, y2], [s3, s2, y1], [s2, s1, y0]]) / D;
  if (!(a > 0)) return null; // w obrazie y rośnie w dół: lot to parabola otwarta „w górę”
  const disc = b * b - 4 * a * (c - ground);
  if (disc <= 0) return null;
  const r1 = (-b - Math.sqrt(disc)) / (2 * a) + t0, r2 = (-b + Math.sqrt(disc)) / (2 * a) + t0;
  // przecięcia muszą leżeć blisko wykrytego odcinka
  if (r1 < from - 3 || r2 > to + 3) return null;
  return [r1, r2];
}

/** Niepewność wysokości (cm) wynikająca z jednej klatki na odbiciu lub lądowaniu: dh ≈ g·t/4·Δt. */
export function heightErrorCm(flightS: number, fps: number): number {
  return ((9.81 * flightS) / 4) * (1 / fps) * 100;
}
