/**
 * Bieg z GPS: dystans, tempo, odcinki km i prowadzenie interwałów.
 * Filtrowanie: odrzucamy punkty o słabej dokładności i skoki niemożliwe biegowo.
 */
export interface GeoPoint { lat: number; lon: number; t: number; acc: number }

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const MAX_ACCURACY_M = 25;
export const MAX_SPEED_MS = 11; // szybciej niż sprint = błąd GPS
export const MAX_GAP_S = 30; // dłuższa przerwa bez punktu GPS: dystansu z przerwy nie liczymy

export interface TrackState {
  points: GeoPoint[];
  distanceM: number;
  /** Dystans w chwili t (ms od startu) – do odcinków i MAS. */
  marks: Array<{ t: number; d: number }>;
}

export const emptyTrack = (): TrackState => ({ points: [], distanceM: 0, marks: [{ t: 0, d: 0 }] });

/** Dodaje punkt; t = ms od startu biegu (bez pauz). Zwraca nowy stan (niezmienny). */
export function addPoint(s: TrackState, p: GeoPoint): TrackState {
  if (p.acc > MAX_ACCURACY_M) return s;
  const last = s.points[s.points.length - 1];
  if (!last) return { ...s, points: [p] };
  const d = haversine(last, p);
  const dt = (p.t - last.t) / 1000;
  if (dt <= 0) return s;
  // długa przerwa bez sygnału (ekran zgaszony, tunel): nie wiemy, którędy biegłeś, więc nie dolicza się prostej linii między punktami
  if (dt > MAX_GAP_S) return { ...s, points: [...s.points, p], marks: [...s.marks, { t: p.t, d: s.distanceM }] };
  if (d / dt > MAX_SPEED_MS) return s;
  // drobny szum w miejscu: nie dodawaj, dopóki ruch mniejszy niż dokładność
  if (d < Math.min(3, p.acc / 2)) return s;
  const distanceM = s.distanceM + d;
  return { points: [...s.points, p], distanceM, marks: [...s.marks, { t: p.t, d: distanceM }] };
}

/** Dystans w chwili t (interpolacja liniowa między znacznikami). */
export function distanceAt(s: TrackState, t: number): number {
  const m = s.marks;
  if (t <= 0 || m.length < 2) return 0;
  for (let i = 1; i < m.length; i++) {
    const a = m[i - 1]!, b = m[i]!;
    if (t <= b.t) return a.d + ((b.d - a.d) * (t - a.t)) / (b.t - a.t || 1);
  }
  return m[m.length - 1]!.d;
}

/** Czasy (s) kolejnych pełnych kilometrów. */
export function kmSplits(s: TrackState): number[] {
  const out: number[] = [];
  let prevT = 0;
  for (let km = 1; km * 1000 <= s.distanceM; km++) {
    const target = km * 1000;
    const m = s.marks;
    for (let i = 1; i < m.length; i++) {
      const a = m[i - 1]!, b = m[i]!;
      if (b.d >= target) {
        const t = a.t + ((b.t - a.t) * (target - a.d)) / (b.d - a.d || 1);
        out.push((t - prevT) / 1000);
        prevT = t;
        break;
      }
    }
  }
  return out;
}

/** Tempo (s/km) z ostatnich `windowS` sekund; null, gdy za mało ruchu. */
export function currentPace(s: TrackState, nowT: number, windowS = 20): number | null {
  // na początku biegu okno nie może być dłuższe niż czas biegu
  const w = Math.min(windowS, nowT / 1000);
  if (w <= 0) return null;
  const d = distanceAt(s, nowT) - distanceAt(s, nowT - w * 1000);
  if (d < 10) return null;
  return (w / d) * 1000;
}

export function averagePace(distanceM: number, elapsedMs: number): number | null {
  return distanceM >= 10 ? (elapsedMs / 1000 / distanceM) * 1000 : null;
}

export interface RunPhase { kind: "warmup" | "work" | "rest"; seconds: number; label: string; /** Numer powtórzenia, liczba powtórzeń w serii i numer serii (tylko odcinki pracy). */ rep?: number; reps?: number; set?: number }

/** Oś czasu interwałów: praca/przerwa x powtórzenia x serie (bez rozgrzewki – ta jest osobno). */
export function intervalTimeline(b: { reps: number; sets: number; workS: number; restS: number; setRestS: number }): RunPhase[] {
  const out: RunPhase[] = [];
  for (let s = 1; s <= b.sets; s++) {
    for (let r = 1; r <= b.reps; r++) {
      out.push({ kind: "work", seconds: b.workS, label: `Odcinek ${r}/${b.reps}${b.sets > 1 ? ` · seria ${s}` : ""}`, rep: r, reps: b.reps, set: s });
      const last = r === b.reps;
      if (!last && b.restS > 0) out.push({ kind: "rest", seconds: b.restS, label: "Przerwa" });
    }
    if (s < b.sets) out.push({ kind: "rest", seconds: b.setRestS, label: "Przerwa między seriami" });
  }
  return out;
}

/** Która faza trwa po `elapsedS` sekundach i ile z niej zostało. */
export function phaseAt(tl: RunPhase[], elapsedS: number): { index: number; left: number } | null {
  let acc = 0;
  for (let i = 0; i < tl.length; i++) {
    acc += tl[i]!.seconds;
    if (elapsedS < acc) return { index: i, left: acc - elapsedS };
  }
  return null;
}

/** Wynik jednego zakończonego odcinka pracy. */
export interface PhaseResult { label: string; distanceM: number; paceSPerKm: number | null }

/**
 * Dystans i tempo w każdym ZAKOŃCZONYM odcinku pracy (do porównania powtórzeń po biegu).
 * Odcinek, który nie dobiegł końca (przerwany bieg), nie jest liczony.
 */
export function phaseResults(tl: RunPhase[], s: TrackState, elapsedMs: number): PhaseResult[] {
  const out: PhaseResult[] = [];
  let startS = 0;
  for (const ph of tl) {
    const endS = startS + ph.seconds;
    if (endS * 1000 > elapsedMs + 500) break;
    if (ph.kind === "work") {
      const d = distanceAt(s, endS * 1000) - distanceAt(s, startS * 1000);
      out.push({ label: ph.label, distanceM: Math.max(0, d), paceSPerKm: d >= 10 ? (ph.seconds / d) * 1000 : null });
    }
    startS = endS;
  }
  return out;
}

/** Tempo (s/km) co `stepS` sekund (okno `windowS`) – do wykresu po biegu. Punkty bez wystarczającego ruchu są pomijane. */
export function paceSeries(s: TrackState, elapsedMs: number, stepS = 15, windowS = 30): Array<{ tS: number; pace: number }> {
  const out: Array<{ tS: number; pace: number }> = [];
  for (let t = stepS; t * 1000 <= elapsedMs; t += stepS) {
    const p = currentPace(s, t * 1000, windowS);
    if (p !== null && p < 1200) out.push({ tS: t, pace: p });
  }
  return out;
}
