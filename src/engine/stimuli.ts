/**
 * Bodźce do treningu reakcji i decyzji: losowa sekwencja strzałek, kolorów, liczb lub ich połączeń.
 * Deterministyczne z ziarna (testy). Nie ma tu oceny zawodnika – trener/zawodnik widzi bodziec i reaguje ruchem.
 */
export type StimKind = "arrow" | "color" | "number" | "combo";
export type Dir = "left" | "up" | "right" | "down";

export const DIRS4: Dir[] = ["left", "up", "right", "down"];
export const DIR_LABEL: Record<Dir, string> = { left: "w lewo", up: "do przodu", right: "w prawo", down: "do tyłu" };

export interface Color { id: string; name: string; hex: string }
export const COLORS: Color[] = [
  { id: "red", name: "Czerwony", hex: "#d9534f" },
  { id: "green", name: "Zielony", hex: "#3f9a6b" },
  { id: "blue", name: "Niebieski", hex: "#2f6fb3" },
  { id: "yellow", name: "Żółty", hex: "#e0b23a" },
];

export interface StimOpts {
  kinds: StimKind[];
  /** Ile kierunków: 2 (lewo/prawo) albo 4. */
  dirs: 2 | 4;
  /** Ile kolorów (2–4). */
  colors: 2 | 3 | 4;
  /** Liczby od 1 do `maxNumber`. */
  maxNumber: number;
  /** Odstęp między bodźcami (s), losowany z zakresu. */
  minGap: number;
  maxGap: number;
  durationS: number;
}

export interface Stimulus { at: number; kind: StimKind; dir?: Dir; color?: Color; number?: number }

export const PACES = { slow: { label: "Wolno", minGap: 3, maxGap: 4 }, medium: { label: "Średnio", minGap: 2, maxGap: 3 }, fast: { label: "Szybko", minGap: 1, maxGap: 2 } } as const;
export type Pace = keyof typeof PACES;

export const DEFAULT_OPTS: StimOpts = { kinds: ["arrow", "color"], dirs: 4, colors: 4, maxNumber: 4, minGap: 2, maxGap: 3, durationS: 60 };

/** Prosty deterministyczny generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (s: Stimulus) => `${s.kind}|${s.dir ?? ""}|${s.color?.id ?? ""}|${s.number ?? ""}`;

function one(o: StimOpts, r: () => number): Omit<Stimulus, "at"> {
  const kind = o.kinds[Math.floor(r() * o.kinds.length)]!;
  const dirs = o.dirs === 2 ? (["left", "right"] as Dir[]) : DIRS4;
  const colors = COLORS.slice(0, o.colors);
  const dir = () => dirs[Math.floor(r() * dirs.length)]!;
  const color = () => colors[Math.floor(r() * colors.length)]!;
  if (kind === "arrow") return { kind, dir: dir() };
  if (kind === "color") return { kind, color: color() };
  if (kind === "number") return { kind, number: 1 + Math.floor(r() * Math.max(2, o.maxNumber)) };
  return { kind, dir: dir(), color: color() };
}

/** Sekwencja bodźców na `durationS` sekund; kolejny bodziec nigdy nie jest identyczny z poprzednim. */
export function makeSequence(o: StimOpts, seed: number): Stimulus[] {
  const kinds = o.kinds.length ? o.kinds : DEFAULT_OPTS.kinds;
  const opts = { ...o, kinds };
  const r = rng(seed);
  const out: Stimulus[] = [];
  let t = 0;
  while (Math.round(t * 10) / 10 < o.durationS) {
    let s: Stimulus;
    let guard = 0;
    do { s = { at: Math.round(t * 10) / 10, ...one(opts, r) }; } while (out.length && key(s) === key(out[out.length - 1]!) && ++guard < 20);
    out.push(s);
    t += o.minGap + r() * (o.maxGap - o.minGap);
  }
  return out;
}

/* ------------------------------ losowanie ------------------------------ */

export type DrawKind = "color" | "number" | "side" | "dir";
export interface Drawn { kind: DrawKind; label: string; color?: Color; dir?: Dir; number?: number }

/** Jedno losowanie (kolor / numer 1…n / strona / kierunek); nie powtarza poprzedniego wyniku, jeśli jest z czego wybierać. */
export function drawOne(kind: DrawKind, n: number, prev: Drawn | null, r: () => number): Drawn {
  const pool: Drawn[] =
    kind === "color" ? COLORS.slice(0, Math.max(2, Math.min(4, n))).map((c) => ({ kind, label: c.name, color: c }))
    : kind === "number" ? Array.from({ length: Math.max(2, n) }, (_, i) => ({ kind, label: String(i + 1), number: i + 1 }))
    : kind === "side" ? [{ kind, label: "Lewa", dir: "left" as Dir }, { kind, label: "Prawa", dir: "right" as Dir }]
    : (n <= 2 ? (["left", "right"] as Dir[]) : DIRS4).map((d) => ({ kind, label: DIR_LABEL[d], dir: d }));
  const rest = prev ? pool.filter((p) => p.label !== prev.label) : pool;
  const from = rest.length ? rest : pool;
  return from[Math.floor(r() * from.length)]!;
}
