/**
 * Biblioteka ćwiczeń i szablony sesji z notatek trenera
 * (docs/SESJE-SILOWE-TRENERA.md, docs/SESJE-SPRINT-TRENERA.md).
 * Pola `cns` i `joint` są wewnętrzne – zawodnik ich nie widzi.
 * Zamienniki i oceny obciążenia wymagają przeglądu trenera/literatury.
 */
export type Pattern =
  | "squat" | "hinge" | "push" | "pull" | "jump" | "core"
  | "hipflexor" | "calf" | "iso" | "power" | "drill" | "sprint" | "cod";
export type Joint = "knee" | "hip" | "shoulder" | "back" | "ankle" | "none";

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  /** Czy zawodnik wpisuje kilogramy. */
  loaded: boolean;
  /** Obciążenie układu nerwowego 1–3 (ukryte). */
  cns: 1 | 2 | 3;
  joint: Joint;
  /** Zamienniki od najlepszego; ten sam wzorzec ruchu. */
  substitutes: string[];
}

const ex = (
  id: string, name: string, pattern: Pattern, loaded: boolean,
  cns: 1 | 2 | 3, joint: Joint, substitutes: string[] = [],
): Exercise => ({ id, name, pattern, loaded, cns, joint, substitutes });

export const EXERCISES: Record<string, Exercise> = Object.fromEntries(
  [
    ex("knee-iso-push", "Knee iso push", "iso", false, 1, "knee", ["sl-hip-thrust-iso"]),
    ex("sl-hip-thrust-iso", "Izometria hip thrust jednonóż", "iso", false, 1, "hip"),
    ex("sl-box-jump", "Skok na skrzynię jednonóż", "jump", false, 2, "knee", ["box-jump", "pogo-jumps"]),
    ex("box-jump", "Skok na skrzynię", "jump", false, 2, "knee", ["pogo-jumps"]),
    ex("pogo-jumps", "Pogo jumps", "jump", false, 1, "ankle"),
    ex("hang-power-clean", "Hang power clean", "power", true, 3, "back", ["kb-swing", "box-jump"]),
    ex("kb-swing", "Swing z kettlebell", "power", true, 2, "hip", ["pogo-jumps"]),
    ex("back-squat", "Back squat", "squat", true, 3, "knee", ["goblet-squat", "step-up"]),
    ex("goblet-squat", "Goblet squat", "squat", true, 2, "knee", ["step-up"]),
    ex("step-up", "Step up", "squat", true, 2, "knee", ["goblet-squat"]),
    ex("depth-jump-hurdle", "Depth jump nad płotek", "jump", false, 3, "knee", ["depth-box-jump", "box-jump"]),
    ex("depth-box-jump", "Depth box jump", "jump", false, 3, "knee", ["box-jump", "pogo-jumps"]),
    ex("bench-press", "Wyciskanie na ławce", "push", true, 3, "shoulder", ["db-bench-press", "push-up"]),
    ex("db-bench-press", "Wyciskanie hantli", "push", true, 2, "shoulder", ["push-up"]),
    ex("push-up", "Pompki", "push", false, 1, "shoulder"),
    ex("facepull", "Facepull", "pull", true, 1, "shoulder"),
    ex("bb-row", "Wiosłowanie sztangą", "pull", true, 2, "back", ["db-row", "inverted-row"]),
    ex("db-row", "Wiosłowanie hantlem", "pull", true, 2, "back", ["inverted-row"]),
    ex("inverted-row", "Podciąganie poziome", "pull", false, 1, "back"),
    ex("sl-straight-leg-ht", "Hip thrust jednonóż (prosta noga)", "hinge", true, 2, "hip", ["glute-bridge"]),
    ex("glute-bridge", "Glute bridge", "hinge", false, 1, "hip"),
    ex("slider-leg-curl", "Slider leg curl", "hinge", false, 2, "knee", ["glute-bridge"]),
    ex("seated-sl-calf", "Łydki siedząc jednonóż", "calf", true, 1, "ankle"),
    ex("banded-hip-flexion", "Zginanie biodra z gumą", "hipflexor", false, 1, "hip"),
    // sprint
    ex("skip-przejscia", "Skipy – przejścia", "drill", false, 1, "none"),
    ex("skip-a-b-d", "Drille skip A / B / D", "drill", false, 1, "none"),
    ex("ankling", "Ankling", "drill", false, 1, "ankle"),
    ex("resisted-first-step", "Pierwszy krok z oporem", "sprint", false, 2, "hip"),
    ex("resisted-sprint", "Sprint z oporem (guma)", "sprint", false, 3, "hip", ["sprint-30"]),
    ex("sprint-30", "Sprint 30 m", "sprint", false, 3, "hip"),
    ex("cod-turnover", "COD 180° turnover run", "cod", false, 2, "knee"),
    ex("deceleration", "Hamowanie z biegu (stop w 2–3 krokach)", "cod", false, 2, "knee"),
    ex("sl-jumps-llrr", "Skoki jednonóż LL-RR", "jump", false, 2, "ankle", ["pogo-jumps"]),
    ex("heiden-jumps", "Heiden jumps", "jump", false, 2, "ankle", ["sl-jumps-llrr"]),
    ex("curve-run", "Bieg po łuku", "sprint", false, 2, "hip"),
    // bez siłowni – drabinki trudności (docs/BEZ-SILOWNI.md)
    ex("bw-squat", "Przysiad z masą ciała", "squat", false, 1, "knee", ["split-squat"]),
    ex("split-squat", "Wykrok w miejscu", "squat", false, 1, "knee", ["bw-squat"]),
    ex("bulgarian-split-squat", "Przysiad bułgarski", "squat", false, 2, "knee", ["split-squat"]),
    ex("assisted-pistol", "Przysiad jednonóż z asystą", "squat", false, 2, "knee", ["bulgarian-split-squat"]),
    ex("pistol-squat", "Przysiad jednonóż", "squat", false, 3, "knee", ["assisted-pistol"]),
    ex("sl-glute-bridge", "Glute bridge jednonóż", "hinge", false, 1, "hip", ["glute-bridge"]),
    ex("sl-rdl-bw", "Martwy ciąg jednonóż (masa ciała)", "hinge", false, 2, "back", ["sl-glute-bridge"]),
    ex("nordic-assisted", "Nordic curl z asystą", "hinge", false, 2, "knee", ["slider-leg-curl"]),
    ex("nordic-curl", "Nordic curl", "hinge", false, 3, "knee", ["nordic-assisted"]),
    ex("incline-push-up", "Pompki z podwyższeniem", "push", false, 1, "shoulder", ["push-up"]),
    ex("feet-elevated-push-up", "Pompki z nogami na podwyższeniu", "push", false, 2, "shoulder", ["push-up"]),
    ex("archer-push-up", "Pompki łucznika", "push", false, 2, "shoulder", ["feet-elevated-push-up"]),
    ex("feet-elevated-row", "Podciąganie poziome z nogami wyżej", "pull", false, 2, "back", ["inverted-row"]),
    ex("archer-row", "Podciąganie poziome łucznika", "pull", false, 2, "back", ["feet-elevated-row"]),
    ex("squat-jump", "Wyskok z przysiadu", "jump", false, 2, "knee", ["pogo-jumps"]),
    ex("bounding", "Skoki wykroczne (bounding)", "jump", false, 2, "ankle", ["squat-jump"]),
    ex("sl-hop", "Skoki jednonóż do przodu", "jump", false, 2, "ankle", ["bounding"]),
    ex("sl-calf-raise", "Łydki jednonóż", "calf", false, 1, "ankle", ["seated-sl-calf"]),
    ex("side-plank", "Plank boczny", "core", false, 1, "back"),
    ex("copenhagen", "Copenhagen plank", "core", false, 2, "hip", ["side-plank"]),
  ].map((e) => [e.id, e]),
);

export interface Item {
  exerciseId: string;
  sets: number;
  /** Tekst powtórzeń, np. "3", "30 m", "5 / stronę". */
  reps: string;
  note?: string;
  pctRM?: [number, number];
}
export interface Block { items: Item[] }
export interface SessionTemplate {
  id: string;
  name: string;
  module: "strength" | "sprint";
  /** Faza mezocyklu, do której pasuje szablon. */
  phase: "volume" | "intensity" | "sprint";
  blocks: Block[];
}

const it = (exerciseId: string, sets: number, reps: string, extra: Partial<Item> = {}): Item =>
  ({ exerciseId, sets, reps, ...extra });

export const TEMPLATES: SessionTemplate[] = [
  {
    id: "strength-intensity",
    name: "Siła – intensywna",
    module: "strength",
    phase: "intensity",
    blocks: [
      { items: [it("knee-iso-push", 3, "5 × 1 s / nogę"), it("sl-box-jump", 3, "3 / nogę")] },
      { items: [it("hang-power-clean", 3, "3")] },
      { items: [it("back-squat", 4, "2", { note: "tempo 4-1-x" }), it("depth-jump-hurdle", 4, "2")] },
      { items: [it("bench-press", 4, "2", { pctRM: [90, 95] }), it("facepull", 3, "8")] },
      { items: [it("bb-row", 3, "3"), it("sl-straight-leg-ht", 3, "3 / nogę")] },
      { items: [it("slider-leg-curl", 3, "4", { note: "tempo 3-1-x" }), it("seated-sl-calf", 3, "12 / nogę"), it("banded-hip-flexion", 3, "5 / nogę")] },
    ],
  },
  {
    id: "strength-volume",
    name: "Siła – objętościowa",
    module: "strength",
    phase: "volume",
    blocks: [
      { items: [it("knee-iso-push", 3, "5 × 1 s / nogę"), it("sl-box-jump", 3, "3 / nogę")] },
      { items: [it("hang-power-clean", 4, "3")] },
      { items: [it("back-squat", 5, "3", { note: "tempo 4-1-x" }), it("depth-jump-hurdle", 4, "3")] },
      { items: [it("bench-press", 5, "4", { pctRM: [80, 85] }), it("facepull", 3, "10")] },
      { items: [it("bb-row", 3, "5"), it("sl-straight-leg-ht", 3, "5 / nogę")] },
      { items: [it("slider-leg-curl", 3, "6", { note: "tempo 3-1-x" }), it("seated-sl-calf", 3, "12 / nogę"), it("banded-hip-flexion", 3, "8 / nogę")] },
    ],
  },
  {
    id: "sprint-a",
    name: "Sprint – przyspieszenie i COD",
    module: "sprint",
    phase: "sprint",
    blocks: [
      { items: [it("skip-przejscia", 2, "30 m")] },
      { items: [it("skip-a-b-d", 2, "30 m")] },
      { items: [it("resisted-first-step", 2, "3 / stronę"), it("resisted-sprint", 2, "20 m"), it("sprint-30", 3, "30 m")] },
      { items: [it("cod-turnover", 3, "10 m / stronę", { note: "80–90% prędkości, uwaga na mechanikę" }), it("deceleration", 3, "10 m rozbiegu")] },
      { items: [it("sl-jumps-llrr", 2, "LL-RR-LL-RR"), it("heiden-jumps", 2, "5 / stronę")] },
    ],
  },
  {
    id: "sprint-b",
    name: "Sprint – prędkość i łuk",
    module: "sprint",
    phase: "sprint",
    blocks: [
      { items: [it("skip-przejscia", 1, "30 m"), it("ankling", 1, "30 m")] },
      { items: [it("skip-a-b-d", 1, "30 m")] },
      { items: [it("pogo-jumps", 3, "6"), it("sl-jumps-llrr", 2, "LL-RR-LL-RR")] },
      { items: [it("resisted-sprint", 4, "15 m")] },
      { items: [it("sprint-30", 5, "30 m")] },
      { items: [it("curve-run", 4, "dłuższy łuk / stronę")] },
    ],
  },
];

import type { Position } from "./profile";

export type MesoPhase = "volume" | "intensity" | "deload";

/** Cykl 5 tygodni: 2× objętość, 2× intensywność, rozładowanie. */
export function mesoPhase(weekInCycle: number): MesoPhase {
  const w = ((weekInCycle - 1) % 5 + 5) % 5;
  return w < 2 ? "volume" : w < 4 ? "intensity" : "deload";
}

/**
 * Pozycja wpływa tylko na sprint: skrzydłowy i napastnik – więcej prędkości liniowej
 * (sprint-b), pozostali – przyspieszenie i zmiana kierunku (sprint-a); co trzeci tydzień drugi wariant.
 * Siły (siłownia) pozycja NIE zmienia.
 */
export function sprintTemplateFor(position: Position | undefined, weekInCycle: number): SessionTemplate | undefined {
  const a = TEMPLATES.find((x) => x.id === "sprint-a");
  const b = TEMPLATES.find((x) => x.id === "sprint-b");
  const speedFirst = position === "skrzydlowy" || position === "napastnik";
  const primary = speedFirst ? b : a;
  const other = speedFirst ? a : b;
  return weekInCycle % 3 === 0 ? other : primary;
}

export function templateFor(
  module: "strength" | "sprint",
  weekInCycle: number,
  position?: Position,
): { template: SessionTemplate; deload: boolean } | null {
  const phase = mesoPhase(weekInCycle);
  if (module === "strength") {
    const want = phase === "intensity" ? "intensity" : "volume";
    const t = TEMPLATES.find((x) => x.module === "strength" && x.phase === want);
    return t ? { template: t, deload: phase === "deload" } : null;
  }
  const t = sprintTemplateFor(position, weekInCycle);
  return t ? { template: t, deload: phase === "deload" } : null;
}
