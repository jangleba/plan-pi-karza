/**
 * Czysta matematyka silnika analizy wideo. Bez zależności od DOM, MediaPipe
 * ani losowości. Wszystkie funkcje są deterministyczne i pokryte testami.
 */

export const GRAVITY = 9.81;

/** Zaokrąglenie do zadanej liczby miejsc po przecinku. */
export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/**
 * Wysokość wyskoku z czasu lotu (Flight Time Method).
 * h = g * t^2 / 8  (metry) → cm.
 */
export function flightTimeToHeightCm(flightTimeSeconds: number): number {
  if (flightTimeSeconds <= 0) return 0;
  const meters = (GRAVITY * flightTimeSeconds * flightTimeSeconds) / 8;
  return round(meters * 100, 1);
}

/** Reactive Strength Index: wysokość skoku (m) / czas kontaktu (s). */
export function reactiveStrengthIndex(
  jumpHeightMeters: number,
  groundContactSeconds: number,
): number {
  if (groundContactSeconds <= 0) return 0;
  return round(jumpHeightMeters / groundContactSeconds, 2);
}

/** Prędkość średnia z dystansu i czasu. */
export function averageSpeed(distanceM: number, timeSeconds: number): {
  ms: number;
  kmh: number;
} {
  if (timeSeconds <= 0) return { ms: 0, kmh: 0 };
  const ms = distanceM / timeSeconds;
  return { ms: round(ms, 2), kmh: round(ms * 3.6, 2) };
}

/**
 * Kąt w stawie (w stopniach) wyznaczony z trzech punktów a-b-c,
 * gdzie b to wierzchołek. Używa iloczynu wektorowego i skalarnego —
 * odporny na perspektywę 2D lepiej niż samo odejmowanie współrzędnych.
 */
export function jointAngleDeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const cross = v1.x * v2.y - v1.y * v2.x;
  const dot = v1.x * v2.x + v1.y * v2.y;
  const rad = Math.atan2(Math.abs(cross), dot);
  return round((rad * 180) / Math.PI, 1);
}

/**
 * Liniowa interpolacja momentu przekroczenia progu (np. linii/podłoża)
 * między dwoma próbkami czasowymi. Zwraca dokładny timestamp przecięcia.
 */
export function interpolateCrossingTime(
  t0: number,
  v0: number,
  t1: number,
  v1: number,
  threshold: number,
): number {
  if (v1 === v0) return t0;
  const ratio = (threshold - v0) / (v1 - v0);
  return t0 + ratio * (t1 - t0);
}

/** Sprawdza, czy wartość mieści się w fizycznie możliwym zakresie. */
export function withinPlausibleRange(
  value: number,
  min: number,
  max: number,
): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Fizyczne zakresy sensowności wyników per metryka. */
export const PLAUSIBLE_RANGES: Record<string, { min: number; max: number }> = {
  jump_height_cm: { min: 5, max: 90 },
  flight_time_s: { min: 0.1, max: 1.1 },
  rsi: { min: 0.1, max: 4 },
  ground_contact_s: { min: 0.08, max: 0.6 },
  sprint_speed_ms: { min: 3, max: 12 },
};
