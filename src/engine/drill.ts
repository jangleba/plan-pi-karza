import type { Position } from "./profile";

/** Model ćwiczenia z diagramem boiska (współrzędne w metrach). */
/** Rodzaje strzałek: bieg bez piłki, prowadzenie, podanie po ziemi, podanie górą (łuk), pierwszy kontakt, strzał. */
export type ArrowStyle = "run" | "dribble" | "pass" | "lob" | "touch" | "shot";
export type Tone = "green" | "yellow" | "red" | "blue";

export interface Point { x: number; y: number }
export interface Cone extends Point { color?: Tone; label?: string }
export interface Arrow {
  style: ArrowStyle;
  /** Punkty ścieżki: pierwszy = start, ostatni = grot. */
  points: Point[];
  /** Kolejność w serii (1, 2, 3…). */
  step?: number;
  /** Krótki opis kroku pokazywany podczas animacji (bez niego: nazwa strzałki). */
  note?: string;
}

/** Grupy ćwiczeń z piłką w sesji techniki. */
export type DrillGroup = "dribble" | "touch" | "finish";
export const DRILL_GROUPS: Array<[DrillGroup, string]> = [["dribble", "Prowadzenie i zwody"], ["touch", "Pierwszy kontakt i podania"], ["finish", "Wykończenie i strzały"]];

export interface Drill {
  id: string;
  title: string;
  group: DrillGroup;
  /** Zakres rysowanego fragmentu boiska w metrach. */
  field: { width: number; height: number; kind: "full" | "half" | "patch" };
  cones: Cone[];
  arrows: Arrow[];
  goals?: Array<Point & { width: number }>;
  /** Rebounder (ścianka z siatką); kąt w stopniach: 0 = ustawiony poziomo, 90 = pionowo. */
  rebounders?: Rebounder[];
  /** Opisane odległości na rysunku (np. „8 m” między stożkami). */
  distances?: Distance[];
  /** Miejsce startu (domyślnie początek pierwszej strzałki) i numer zawodnika na znaczniku. */
  start?: Point;
  playerNumber?: number;
  /** Jedno zdanie pod rysunkiem. */
  tip?: string;
  /** Krótki, konkretny opis ustawienia sprzętu z odległościami (przycisk „Sprzęt”). */
  setup?: string;
  /** Warianty ćwiczenia (A to główne, B nadpisuje strzałki, stożki i sprzęt); `titleA` to nazwa głównego wariantu. */
  variants?: DrillVariant[];
  titleA?: string;
  /** Cele, serie i wskazówki – krótko. */
  goal: string;
  dose: string;
  points: string[];
  /** Pozycje, dla których ćwiczenie jest szczególnie ważne (puste = dla wszystkich). */
  positions?: Position[];
  /** Źródło treści (uzupełniane po researchu). */
  source: string;
}

export interface Rebounder extends Point { angle?: number; width?: number }
export interface Distance { from: Point; to: Point; label: string }
export interface DrillVariant {
  id: "A" | "B";
  title: string;
  arrows: Arrow[];
  cones?: Cone[];
  rebounders?: Rebounder[];
  distances?: Distance[];
  tip?: string;
  setup?: string;
}

/** Konwencja strzałek (skrót): niebieska przerywana = podanie po ziemi, niebieska łukowa = podanie górą, pomarańczowa falowana = prowadzenie, turkusowa kropkowana = ruch bez piłki, fioletowa krótka = pierwszy kontakt, czerwona gruba = strzał. */
export const ARROW_LEGEND: Record<ArrowStyle, string> = {
  pass: "Podanie",
  lob: "Górą",
  dribble: "Prowadzenie",
  run: "Bieg",
  touch: "Kontakt",
  shot: "Strzał",
};

/** Pełne nazwy rodzajów strzałek (legenda na pełnym ekranie). */
export const ARROW_NAME: Record<ArrowStyle, string> = {
  pass: "Podanie po ziemi",
  lob: "Podanie górą, dośrodkowanie",
  dribble: "Prowadzenie piłki",
  run: "Ruch bez piłki",
  touch: "Pierwszy kontakt",
  shot: "Strzał",
};

/** Kolory rodzajów strzałek (wspólne dla rysunku, numerków i legendy). */
export const ARROW_COLOR: Record<ArrowStyle, string> = {
  pass: "#2f6fe0",
  lob: "#2f6fe0",
  dribble: "#f08a24",
  run: "#14b8a6",
  touch: "#8b5cf6",
  shot: "#e5432f",
};

/** Odbicie lustrzane w poziomie (lewa/prawa noga): x → szerokość − x we wszystkich punktach. */
export function mirrorDrill(d: Drill): Drill {
  const W = d.field.width;
  const mp = (p: Point): Point => ({ ...p, x: +(W - p.x).toFixed(3) });
  const ma = (a: Arrow): Arrow => ({ ...a, points: a.points.map(mp) });
  return {
    ...d,
    cones: d.cones.map((c) => mp(c) as Cone),
    arrows: d.arrows.map(ma),
    goals: d.goals?.map((g) => mp(g) as Point & { width: number }),
    rebounders: d.rebounders?.map((r) => ({ ...mp(r), ...(r.angle !== undefined ? { angle: -r.angle } : {}) } as Rebounder)),
    distances: d.distances?.map((x) => ({ ...x, from: mp(x.from), to: mp(x.to) })),
    start: d.start ? mp(d.start) : undefined,
    variants: d.variants?.map((v) => ({
      ...v, arrows: v.arrows.map(ma), cones: v.cones?.map((c) => mp(c) as Cone),
      rebounders: v.rebounders?.map((r) => ({ ...mp(r), ...(r.angle !== undefined ? { angle: -r.angle } : {}) } as Rebounder)),
      distances: v.distances?.map((x) => ({ ...x, from: mp(x.from), to: mp(x.to) })),
    })),
  };
}

/** Ćwiczenie w wybranym wariancie (A = główne). Brak wariantu: bez zmian. */
export function withVariant(d: Drill, id: "A" | "B"): Drill {
  const v = id === "A" ? undefined : d.variants?.find((x) => x.id === id);
  if (!v) return d;
  return {
    ...d, arrows: v.arrows, cones: v.cones ?? d.cones, rebounders: v.rebounders ?? d.rebounders, distances: v.distances ?? d.distances,
    tip: v.tip ?? d.tip, setup: v.setup ?? d.setup, start: undefined,
  };
}

/** Strzałki w kolejności kroków. */
export const arrowsInOrder = (d: Drill): Arrow[] => d.arrows.map((a, i) => ({ a, i })).sort((x, y) => (x.a.step ?? x.i + 1) - (y.a.step ?? y.i + 1) || x.i - y.i).map((x) => x.a);

/** Miejsce startu znacznika: jawne albo początek pierwszej strzałki. */
export const drillStart = (d: Drill): Point | null => d.start ?? arrowsInOrder(d)[0]?.points[0] ?? null;

export const TONE_HEX: Record<Tone, string> = {
  green: "#7bc99a",
  yellow: "#f0cf6b",
  red: "#e89494",
  blue: "#8fb3e8",
};

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

/** Sprzęt z rysunku jednym zdaniem, np. „rebounder · 4 stożki · bramka”. */
export function equipmentLine(d: Drill): string {
  const parts: string[] = [];
  const r = d.rebounders?.length ?? 0, c = d.cones.length, g = d.goals?.length ?? 0;
  if (r) parts.push(r === 1 ? "rebounder" : `${r} rebounderów`);
  if (c) parts.push(`${c} ${plural(c, "stożek", "stożki", "stożków")}`);
  if (g) parts.push(g === 1 ? "bramka" : `${g} bramki`);
  parts.push("piłki");
  return parts.join(" · ");
}

