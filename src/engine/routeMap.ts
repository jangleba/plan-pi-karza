import { haversine, type GeoPoint } from "./track";

/** Punkt trasy: współrzędne i (opcjonalnie) czas w sekundach od startu biegu. */
export interface RoutePoint { lat: number; lon: number; t?: number }

/** Zapisany bieg (lokalnie, klucz `runs`). Trasa: [lat, lon, t(s)] – starsze zapisy mają tylko [lat, lon]. */
export interface SavedRun { date: string; distanceM: number; elapsedMs: number; splits: number[]; route: RoutePoint[] }

const MAX_SAVED_POINTS = 500;

/** Trasa do zapisu: równomiernie przerzedzona do ~500 punktów z zachowaniem pierwszego i ostatniego; zawiera czas (s). */
export function compactRoute(points: GeoPoint[], max = MAX_SAVED_POINTS): Array<[number, number, number]> {
  const n = points.length;
  const pick = (p: GeoPoint): [number, number, number] => [Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5)), Math.round(p.t / 1000)];
  if (n <= max) return points.map(pick);
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < max; i++) out.push(pick(points[Math.round((i * (n - 1)) / (max - 1))]!));
  return out;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Poprawne biegi z dowolnych danych (uszkodzone wpisy i punkty są pomijane). */
export function sanitizeRuns(raw: unknown): SavedRun[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedRun[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    if (typeof x.date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(x.date) || !finite(x.distanceM) || !finite(x.elapsedMs) || x.distanceM < 0 || x.elapsedMs < 0) continue;
    const route: RoutePoint[] = [];
    if (Array.isArray(x.route)) {
      for (const p of x.route) {
        if (!Array.isArray(p) || !finite(p[0]) || !finite(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) continue;
        route.push(finite(p[2]) ? { lat: p[0], lon: p[1], t: p[2] } : { lat: p[0], lon: p[1] });
      }
    }
    out.push({ date: x.date.slice(0, 10), distanceM: x.distanceM, elapsedMs: x.elapsedMs, splits: Array.isArray(x.splits) ? x.splits.filter(finite) : [], route });
  }
  return out;
}

/** Długość trasy (m) narastająco dla każdego punktu. */
function cumulative(points: RoutePoint[]): number[] {
  const d = [0];
  for (let i = 1; i < points.length; i++) d.push(d[i - 1]! + haversine(points[i - 1]!, points[i]!));
  return d;
}

/**
 * Tempo (s/km) każdego odcinka trasy (i → i+1), liczone z okna czasu wokół odcinka (domyślnie ok. 20 s),
 * żeby szum GPS nie dawał skoków. null, gdy brak czasu albo za mało ruchu.
 */
export function segmentPaces(points: RoutePoint[], windowS = 20): Array<number | null> {
  const n = points.length;
  const out: Array<number | null> = [];
  if (n < 2) return out;
  const D = cumulative(points);
  for (let i = 0; i < n - 1; i++) {
    const ti = points[i]!.t, tn = points[i + 1]!.t;
    if (!finite(ti) || !finite(tn)) { out.push(null); continue; }
    let j = i, k = i + 1;
    while (j > 0 && finite(points[j - 1]!.t) && ti - points[j - 1]!.t! <= windowS / 2) j--;
    while (k < n - 1 && finite(points[k + 1]!.t) && points[k + 1]!.t! - tn <= windowS / 2) k++;
    const dt = points[k]!.t! - points[j]!.t!, dm = D[k]! - D[j]!;
    out.push(dm >= 8 && dt > 0 ? (dt / dm) * 1000 : null);
  }
  return out;
}

export interface PaceRange { lo: number; hi: number }

/** Zakres kolorowania: od 10. do 90. percentyla temp (odporny na pojedyncze skoki), z minimalną rozpiętością. */
export function paceRange(paces: Array<number | null>): PaceRange | null {
  const v = paces.filter((p): p is number => p !== null && p > 0 && p < 1500).sort((a, b) => a - b);
  if (v.length < 2) return null;
  const q = (f: number) => v[Math.min(v.length - 1, Math.floor(f * (v.length - 1)))]!;
  let lo = q(0.1), hi = q(0.9);
  if (hi - lo < 20) { const mid = (lo + hi) / 2; lo = mid - 10; hi = mid + 10; }
  return { lo, hi };
}

const STOPS = [[0x2e, 0x9e, 0x62], [0xf0, 0xb4, 0x29], [0xe0, 0x55, 0x4f]] as const; // szybko → średnio → wolno
const NEUTRAL = "#8a94a6";
const hex = (c: readonly number[]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;

/** Kolor odcinka: zielony (szybko) → żółty → czerwony (wolno); szary, gdy tempa nie znamy. */
export function paceColor(pace: number | null, range: PaceRange | null): string {
  if (pace === null || !range) return NEUTRAL;
  const t = Math.min(1, Math.max(0, (pace - range.lo) / (range.hi - range.lo)));
  const [a, b, f] = t < 0.5 ? [STOPS[0], STOPS[1], t * 2] : [STOPS[1], STOPS[2], (t - 0.5) * 2];
  return hex(a.map((x, i) => x + (b[i]! - x) * f));
}

/** Kierunek (stopnie od północy, 0–360) z punktu a do b. */
export function bearing(a: RoutePoint, b: RoutePoint): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(r(b.lon - a.lon)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Kierunek biegu z ostatnich punktów (pomija drobne drgania poniżej `minM`); null, gdy bieg stoi. */
export function headingOf(points: RoutePoint[], minM = 4): number | null {
  const n = points.length;
  if (n < 2) return null;
  const end = points[n - 1]!;
  for (let i = n - 2; i >= Math.max(0, n - 12); i--) if (haversine(points[i]!, end) >= minM) return bearing(points[i]!, end);
  return null;
}

export interface Bounds { south: number; west: number; north: number; east: number }
export function routeBounds(points: RoutePoint[]): Bounds | null {
  if (!points.length) return null;
  let south = 90, north = -90, west = 180, east = -180;
  for (const p of points) { south = Math.min(south, p.lat); north = Math.max(north, p.lat); west = Math.min(west, p.lon); east = Math.max(east, p.lon); }
  return { south, west, north, east };
}

/** Przerzedzenie do `max` punktów do rysowania (pierwszy i ostatni zostają). */
export function decimate<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  return Array.from({ length: max }, (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))]!);
}

/** Kolorowe odcinki do narysowania: kolejne odcinki w tym samym przedziale koloru łączone w jedną łamaną (mało obiektów na mapie). */
export function coloredRuns(points: RoutePoint[], buckets = 8): Array<{ color: string; line: Array<[number, number]> }> {
  const paces = segmentPaces(points);
  const range = paceRange(paces);
  const colorOf = (p: number | null) => {
    if (p === null || !range) return NEUTRAL;
    const t = Math.min(1, Math.max(0, (p - range.lo) / (range.hi - range.lo)));
    return paceColor(range.lo + (Math.round(t * (buckets - 1)) / (buckets - 1)) * (range.hi - range.lo), range);
  };
  const out: Array<{ color: string; line: Array<[number, number]> }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const c = colorOf(paces[i] ?? null), a = points[i]!, b = points[i + 1]!;
    const last = out[out.length - 1];
    if (last && last.color === c) last.line.push([b.lat, b.lon]);
    else out.push({ color: c, line: [[a.lat, a.lon], [b.lat, b.lon]] });
  }
  return out;
}
