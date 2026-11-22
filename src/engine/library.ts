import type { Position } from "./profile";
import type { Level, Season, SeasonGoal } from "./types";
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
    ex("sl-hip-thrust-iso", "Izometria hip thrust jednonóż", "iso", false, 1, "hip", ["knee-iso-push"]),
    ex("sl-box-jump", "Skok na skrzynię jednonóż", "jump", false, 2, "knee", ["box-jump", "pogo-jumps"]),
    ex("box-jump", "Skok na skrzynię", "jump", false, 2, "knee", ["pogo-jumps"]),
    ex("pogo-jumps", "Pogo jumps", "jump", false, 1, "ankle"),
    ex("hang-power-clean", "Hang power clean", "power", true, 3, "back", ["kb-swing", "mb-overhead-throw", "box-jump"]),
    ex("kb-swing", "Swing z kettlebell", "power", true, 2, "hip", ["mb-overhead-throw", "squat-jump", "pogo-jumps"]),
    ex("back-squat", "Back squat", "squat", true, 3, "knee", ["goblet-squat", "bulgarian-split-squat", "step-up", "split-squat"]),
    ex("goblet-squat", "Goblet squat", "squat", true, 2, "knee", ["step-up", "split-squat", "bw-squat"]),
    ex("step-up", "Step up", "squat", true, 2, "knee", ["goblet-squat", "split-squat"]),
    ex("depth-jump-hurdle", "Depth jump nad płotek", "jump", false, 3, "knee", ["depth-box-jump", "box-jump"]),
    ex("depth-box-jump", "Depth box jump", "jump", false, 3, "knee", ["box-jump", "pogo-jumps"]),
    ex("bench-press", "Wyciskanie na ławce", "push", true, 3, "shoulder", ["db-bench-press", "push-up", "incline-push-up"]),
    ex("db-bench-press", "Wyciskanie hantli", "push", true, 2, "shoulder", ["push-up", "incline-push-up"]),
    ex("push-up", "Pompki", "push", false, 1, "shoulder", ["incline-push-up"]),
    ex("facepull", "Facepull", "pull", true, 1, "shoulder", ["inverted-row"]),
    ex("bb-row", "Wiosłowanie sztangą", "pull", true, 2, "back", ["db-row", "inverted-row", "feet-elevated-row"]),
    ex("db-row", "Wiosłowanie hantlem", "pull", true, 2, "back", ["inverted-row", "feet-elevated-row"]),
    ex("inverted-row", "Podciąganie poziome", "pull", false, 1, "back", ["db-row"]),
    ex("sl-straight-leg-ht", "Hip thrust jednonóż (prosta noga)", "hinge", true, 2, "hip", ["glute-bridge"]),
    ex("glute-bridge", "Glute bridge", "hinge", false, 1, "hip", ["sl-glute-bridge"]),
    ex("slider-leg-curl", "Slider leg curl", "hinge", false, 2, "knee", ["glute-bridge", "sl-glute-bridge"]),
    ex("seated-sl-calf", "Łydki siedząc jednonóż", "calf", true, 1, "ankle", ["sl-calf-raise"]),
    ex("banded-hip-flexion", "Zginanie biodra z gumą", "hipflexor", false, 1, "hip"),
    // dół ciała i moc (dodane z sesji trenera; opisy bez animacji)
    ex("trap-bar-deadlift", "Trap bar deadlift", "hinge", true, 3, "back", ["db-rdl", "sl-rdl-bw", "glute-bridge"]),
    ex("db-rdl", "Martwy ciąg rumuński z hantlami", "hinge", true, 2, "hip", ["sl-rdl-bw", "glute-bridge"]),
    ex("mb-shotput", "Pchnięcie piłki lekarskiej", "power", false, 2, "shoulder", ["mb-overhead-throw", "kb-swing", "squat-jump", "skater-jump", "pogo-jumps"]),
    ex("mb-overhead-throw", "Rzut piłki lekarskiej znad głowy", "power", false, 2, "back", ["mb-shotput", "kb-swing", "squat-jump", "skater-jump", "pogo-jumps"]),
    ex("broad-jump-ex", "Skok w dal z miejsca", "jump", false, 2, "knee", ["squat-jump", "box-jump", "pogo-jumps"]),
    ex("skater-jump", "Skok boczny (skater)", "jump", false, 2, "knee", ["bounding", "pogo-jumps"]),
    ex("sl-assisted-cmj", "Skok jednonóż z asystą gumy", "jump", false, 2, "knee", ["sl-box-jump", "squat-jump", "pogo-jumps"]),
    ex("weighted-step-up-jump", "Step up z wyskokiem i ciężarem", "jump", true, 2, "knee", ["sl-box-jump", "sl-assisted-cmj", "pogo-jumps"]),
    // maszyny (początkujący: hipertrofia dołu)
    ex("leg-press", "Leg press", "squat", true, 1, "knee", ["goblet-squat", "split-squat"]),
    ex("leg-extension", "Prostowanie nóg na maszynie", "squat", true, 1, "knee", ["split-squat", "bw-squat"]),
    ex("leg-curl-machine", "Uginanie nóg na maszynie", "hinge", true, 1, "knee", ["slider-leg-curl", "glute-bridge"]),
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
export interface Block {
  /** Nazwa bloku pokazywana zawodnikowi (np. „Aktywacja”). Ćwiczenia w bloku robi się na zmianę: a → b → c. */
  title?: string;
  items: Item[];
}
export interface SessionTemplate {
  id: string;
  name: string;
  module: "strength" | "sprint";
  /** Faza mezocyklu, do której pasuje szablon. */
  phase: "volume" | "intensity" | "sprint";
  /** Sesja tylko na górę ciała (dzień po meczu, bez obciążania nóg). */
  upper?: boolean;
  /** Sesja początkującego: w tygodniu rozładowania zostają te same serie (lżejszy ciężar), bo budujemy objętość. */
  beginner?: boolean;
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
      { title: "Aktywacja", items: [it("knee-iso-push", 3, "5 × 1 s / nogę"), it("sl-box-jump", 3, "3 / nogę")] },
      { title: "Moc", items: [it("hang-power-clean", 3, "3")] },
      { title: "Siła nóg + skok", items: [it("back-squat", 4, "2", { note: "tempo 4-1-x" }), it("depth-jump-hurdle", 4, "2")] },
      { title: "Góra", items: [it("bench-press", 4, "2", { pctRM: [90, 95] }), it("facepull", 3, "8")] },
      { title: "Plecy i biodra", items: [it("bb-row", 3, "3"), it("sl-straight-leg-ht", 3, "3 / nogę")] },
      { title: "Dodatki", items: [it("slider-leg-curl", 3, "4", { note: "tempo 3-1-x" }), it("seated-sl-calf", 3, "12 / nogę"), it("banded-hip-flexion", 3, "5 / nogę")] },
    ],
  },
  {
    id: "strength-volume",
    name: "Siła – objętościowa",
    module: "strength",
    phase: "volume",
    blocks: [
      { title: "Aktywacja", items: [it("knee-iso-push", 3, "5 × 1 s / nogę"), it("sl-box-jump", 3, "3 / nogę")] },
      { title: "Moc", items: [it("hang-power-clean", 4, "3")] },
      { title: "Siła nóg + skok", items: [it("back-squat", 5, "3", { note: "tempo 4-1-x" }), it("depth-jump-hurdle", 4, "3")] },
      { title: "Góra", items: [it("bench-press", 5, "4", { pctRM: [80, 85] }), it("facepull", 3, "10")] },
      { title: "Plecy i biodra", items: [it("bb-row", 3, "5"), it("sl-straight-leg-ht", 3, "5 / nogę")] },
      { title: "Dodatki", items: [it("slider-leg-curl", 3, "6", { note: "tempo 3-1-x" }), it("seated-sl-calf", 3, "12 / nogę"), it("banded-hip-flexion", 3, "8 / nogę")] },
    ],
  },
  {
    id: "strength-upper-volume",
    name: "Góra ciała – objętościowa",
    module: "strength",
    phase: "volume",
    upper: true,
    blocks: [
      { title: "Aktywacja barków", items: [it("facepull", 2, "12"), it("push-up", 2, "8")] },
      { title: "Pchanie i ciągnięcie", items: [it("db-bench-press", 4, "8"), it("db-row", 4, "8 / rękę")] },
      { title: "Plecy", items: [it("inverted-row", 3, "10"), it("facepull", 3, "12")] },
      { title: "Core", items: [it("side-plank", 3, "30 s / stronę"), it("copenhagen", 3, "6 / stronę")] },
    ],
  },
  {
    id: "strength-upper-intensity",
    name: "Góra ciała – intensywna",
    module: "strength",
    phase: "intensity",
    upper: true,
    blocks: [
      { title: "Aktywacja barków", items: [it("facepull", 2, "12"), it("push-up", 2, "8")] },
      { title: "Pchanie i ciągnięcie", items: [it("bench-press", 4, "4", { pctRM: [80, 85] }), it("bb-row", 4, "4")] },
      { title: "Plecy", items: [it("inverted-row", 3, "6"), it("facepull", 3, "10")] },
      { title: "Core", items: [it("side-plank", 3, "40 s / stronę"), it("copenhagen", 3, "8 / stronę")] },
    ],
  },
  {
    id: "sprint-a",
    name: "Sprint – przyspieszenie i COD",
    module: "sprint",
    phase: "sprint",
    blocks: [
      { title: "Skipy – przejścia", items: [it("skip-przejscia", 2, "30 m")] },
      { title: "Drille", items: [it("skip-a-b-d", 2, "30 m")] },
      { title: "Przyspieszenie", items: [it("resisted-first-step", 2, "3 / stronę"), it("resisted-sprint", 2, "20 m"), it("sprint-30", 3, "30 m")] },
      { title: "Zmiana kierunku", items: [it("cod-turnover", 3, "10 m / stronę", { note: "80–90% prędkości, uwaga na mechanikę" }), it("deceleration", 3, "10 m rozbiegu")] },
      { title: "Skoki", items: [it("sl-jumps-llrr", 2, "LL-RR-LL-RR"), it("heiden-jumps", 2, "5 / stronę")] },
    ],
  },
  {
    id: "sprint-b",
    name: "Sprint – prędkość i łuk",
    module: "sprint",
    phase: "sprint",
    blocks: [
      { title: "Przejścia i ankling", items: [it("skip-przejscia", 1, "30 m"), it("ankling", 1, "30 m")] },
      { title: "Drille", items: [it("skip-a-b-d", 1, "30 m")] },
      { title: "Skoki", items: [it("pogo-jumps", 3, "6"), it("sl-jumps-llrr", 2, "LL-RR-LL-RR")] },
      { title: "Przyspieszenie z oporem", items: [it("resisted-sprint", 4, "15 m")] },
      { title: "Sprint 30 m", items: [it("sprint-30", 5, "30 m")] },
      { title: "Łuk", items: [it("curve-run", 4, "dłuższy łuk / stronę")] },
    ],
  },
];


const SQUAT_VOL: Record<Level, Item> = {
  beginner: it("goblet-squat", 3, "8"),
  intermediate: it("back-squat", 4, "5", { note: "tempo 4-1-x", pctRM: [70, 75] }),
  advanced: it("back-squat", 5, "5", { note: "tempo 4-1-x", pctRM: [75, 80] }),
};
const SQUAT_INT: Record<Level, Item> = {
  beginner: it("goblet-squat", 3, "6"),
  intermediate: it("back-squat", 2, "3", { note: "tempo 4-1-x", pctRM: [88, 90] }),
  advanced: it("back-squat", 3, "3", { note: "tempo 4-1-x", pctRM: [88, 90] }),
};

const PLYO_POOL: Array<[string, number, string]> = [
  ["sl-box-jump", 3, "3 / nogę"], ["mb-shotput", 3, "5 / stronę"], ["broad-jump-ex", 3, "3"], ["skater-jump", 3, "4 / stronę"],
  ["sl-assisted-cmj", 3, "3 / nogę"], ["pogo-jumps", 3, "6"], ["mb-overhead-throw", 3, "5"], ["box-jump", 3, "3"],
  ["kb-swing", 3, "8"], ["hang-power-clean", 3, "3"],
];
/** Hang power clean wymaga techniki: tylko poziom zaawansowany. */
const ADVANCED_ONLY = new Set(["hang-power-clean"]);

/** Liczba ćwiczeń w bloku mocy/plyo: moment w roku + cel (szybkość dodaje, siła odejmuje). Wartości umowne – do ustalenia przez trenera. */
export function plyoCount(season: Season | undefined, goal: SeasonGoal | undefined): number {
  const base = season === "preseason" ? 4 : season === "offseason" ? 2 : 3;
  const adj = goal === "speed" ? 1 : goal === "strength" ? -1 : 0;
  return Math.min(5, Math.max(2, base + adj));
}

function plyoBlock(phase: "volume" | "intensity", season: Season | undefined, goal: SeasonGoal | undefined, weekInCycle: number, level: Level = "intermediate"): Block {
  const n = plyoCount(season, goal);
  const pool = PLYO_POOL.filter(([id]) => level === "advanced" || !ADVANCED_ONLY.has(id));
  const start = (weekInCycle * 2) % pool.length;
  const picks = Array.from({ length: n }, (_, k) => pool[(start + k) % pool.length]!);
  const items = picks.map(([id, sets, reps]) => it(id, sets, reps));
  if (phase === "intensity") items.unshift(it("depth-jump-hurdle", 3, "3"));
  return { title: "Moc i plyo", items: items.slice(0, n) };
}

/** Dzień B: pełna sesja całego ciała z innym głównym ruchem niż dzień A (zaawansowany: trap bar; średni: jednonóż + martwy ciąg rumuński). */
function dayB(level: Level, phase: "volume" | "intensity", season: Season | undefined, goal: SeasonGoal | undefined, week: number): SessionTemplate {
  const vol = phase === "volume";
  const lower: Block = level === "advanced"
    ? { title: "Siła nóg", items: [it("trap-bar-deadlift", 3, vol ? "5" : "2–3", { pctRM: vol ? [75, 80] : [88, 92] }), it("step-up", 3, vol ? "5 / nogę" : "3 / nogę")] }
    : { title: "Siła nóg", items: [it("step-up", 3, vol ? "5 / nogę" : "4 / nogę"), it("db-rdl", 3, vol ? "8" : "5")] };
  return {
    id: `strength-b-${level}-${phase}`,
    name: level === "advanced" ? "Siła – trap bar" : "Siła – jednonóż",
    module: "strength",
    phase,
    blocks: [
      { title: "Aktywacja", items: [it("knee-iso-push", 3, "5 × 1 s / nogę")] },
      plyoBlock(phase, season, goal, week, level),
      lower,
      { title: "Góra", items: [it("bench-press", vol ? 4 : 3, vol ? "5" : "3", { pctRM: vol ? [75, 80] : [85, 88] }), it("bb-row", 3, vol ? "6" : "4")] },
      { title: "Dodatki", items: [it("slider-leg-curl", 3, vol ? "6" : "4"), it("seated-sl-calf", 3, "12 / nogę")] },
    ],
  };
}

/**
 * Początkujący (też młody): nauka ruchu i hipertrofia dołu zamiast ciężkich serii. Bez %1RM, 3 serie po 10–12, zapas 3 powtórzeń, wolne tempo.
 * Dwie wersje na przemian (A: przysiad i wykrok, B: hinge i jednonóż). Wartości robocze – do ustalenia przez trenera.
 */
const NOTE_B = "technika przed ciężarem, zostaw 3 powtórzenia zapasu";
function beginnerDay(b: boolean, phase: MesoPhase): SessionTemplate {
  // faza objętości: 12 powtórzeń; faza „intensywności”: 10 powtórzeń i nieco więcej ciężaru (hipertrofia, bez pracy w zakresie maksymalnym)
  const r = phase === "intensity" ? "10" : "12";
  const heavier = phase === "intensity" ? " Dołóż ciężar, jeśli zapas > 3 powtórzeń." : "";
  const legs: Block = b
    ? { title: "Dół: hipertrofia", items: [it("db-rdl", 3, r, { note: NOTE_B + heavier }), it("leg-curl-machine", 3, r, { note: "tempo 3-1-x" }), it("step-up", 3, `${r} / nogę`), it("seated-sl-calf", 3, "15 / nogę")] }
    : { title: "Dół: hipertrofia", items: [it("leg-press", 3, r, { note: "tempo 3-1-x, " + NOTE_B + heavier }), it("leg-extension", 3, "12–15", { note: "tempo 3-1-x" }), it("split-squat", 3, `${r} / nogę`), it("glute-bridge", 3, "12"), it("seated-sl-calf", 3, "15 / nogę")] };
  return {
    id: b ? "strength-beginner-b" : "strength-beginner-a",
    name: "Siła – nauka i budowa masy",
    module: "strength",
    phase: "volume",
    beginner: true,
    blocks: [
      { title: "Rozgrzewka i skoki", items: [it("pogo-jumps", 2, "6")] },
      legs,
      { title: "Góra", items: [it("db-bench-press", 3, r), it("db-row", 3, `${r} / rękę`)] },
      { title: "Core", items: [it("side-plank", 3, "30 s / stronę")] },
    ],
  };
}

export type MesoPhase = "volume" | "intensity" | "deload";

/** Cykl 5 tygodni: 2× objętość, 2× intensywność, rozładowanie. */
export function mesoPhase(weekInCycle: number): MesoPhase {
  const w = ((weekInCycle - 1) % 5 + 5) % 5;
  return w < 2 ? "volume" : w < 4 ? "intensity" : "deload";
}

/**
 * Pozycja wpływa tylko na sprint: skrzydłowy i napastnik – więcej prędkości liniowej
 * (sprint-b), pozostali – przyspieszenie i zmiana kierunku (sprint-a); co drugi tydzień drugi wariant (tygodnie 2 i 4 cyklu).
 * Siły (siłownia) pozycja NIE zmienia.
 */
export function sprintTemplateFor(position: Position | undefined, weekInCycle: number): SessionTemplate | undefined {
  const a = TEMPLATES.find((x) => x.id === "sprint-a");
  const b = TEMPLATES.find((x) => x.id === "sprint-b");
  const speedFirst = position === "skrzydlowy" || position === "napastnik";
  const primary = speedFirst ? b : a;
  const other = speedFirst ? a : b;
  return weekInCycle % 2 === 0 ? other : primary;
}

export interface TemplateOpts {
  /** Wariant sesji z planu tygodnia: „upper” = tylko góra ciała (dzień po meczu). */
  variant?: "full" | "upper" | "light";
  age?: number;
  level?: Level;
  /** Numer sesji siłowej w tygodniu (0 = pierwsza) i ich liczba. Przy dwóch pełnych sesjach druga ma inny główny ruch (dzień B). */
  slot?: number;
  count?: number;
  season?: Season;
  goal?: SeasonGoal;
}

/** Zawodnik poniżej 18 lat: umiarkowanie lżej – max 85% 1RM, max 4 serie, ćwiczenia o największym obciążeniu układu nerwowego zastępowane lżejszymi. */
export function forYoungAthlete(t: SessionTemplate): SessionTemplate {
  const alt = (id: string): string => {
    const e = EXERCISES[id];
    if (!e || e.cns < 3) return id;
    return e.substitutes.find((x) => (EXERCISES[x]?.cns ?? 3) < 3) ?? id;
  };
  return {
    ...t,
    blocks: t.blocks.map((b) => ({
      ...b,
      items: b.items.map((i) => {
        const id = alt(i.exerciseId);
        const swapped = id !== i.exerciseId;
        const pct = i.pctRM && !swapped ? ([Math.min(i.pctRM[0], 85), Math.min(i.pctRM[1], 85)] as [number, number]) : undefined;
        const { pctRM: _drop, ...rest } = i;
        return { ...rest, exerciseId: id, sets: Math.min(i.sets, 4), ...(pct ? { pctRM: pct } : {}) };
      }),
    })),
  };
}

export function templateFor(
  module: "strength" | "sprint",
  weekInCycle: number,
  position?: Position,
  opts: TemplateOpts = {},
): { template: SessionTemplate; deload: boolean } | null {
  const phase = mesoPhase(weekInCycle);
  const young = opts.age !== undefined && opts.age < 18;
  if (module === "strength") {
    const want = phase === "intensity" ? "intensity" : "volume";
    const upper = opts.variant === "upper";
    const level = opts.level ?? "intermediate";
    const phase2 = want as "volume" | "intensity";
    let t: SessionTemplate | undefined;
    if (upper) t = TEMPLATES.find((x) => x.module === "strength" && x.phase === want && x.upper);
    else if (level === "beginner") t = beginnerDay(opts.count !== undefined && opts.count > 1 ? opts.slot === 1 : weekInCycle % 2 === 0, phase);
    else {
      // dzień A (przysiad) vs B: dwie sesje w tygodniu = A i B; jedna = rotacja co tydzień
      const useB = opts.count !== undefined && opts.count > 1 ? opts.slot === 1 : weekInCycle % 2 === 0;
      if (useB) t = dayB(level, phase2, opts.season, opts.goal, weekInCycle);
      else {
        const a = TEMPLATES.find((x) => x.module === "strength" && x.phase === want && !x.upper);
        if (a) {
          const squat = (phase2 === "volume" ? SQUAT_VOL : SQUAT_INT)[level];
          // dzień A: przysiad jako ruch główny, a blok mocy i plyo zmienny wg okresu i celu (zamiast stałych „Moc” i „Siła nóg + skok”)
          const blocks: Block[] = [];
          for (const b of a.blocks) {
            if (b.title === "Moc") blocks.push(plyoBlock(phase2, opts.season, opts.goal, weekInCycle, level));
            else if (b.title === "Siła nóg + skok") blocks.push({ title: "Siła nóg", items: [squat] });
            else blocks.push(b.title === "Aktywacja" ? { ...b, items: b.items.filter((i) => i.exerciseId === "knee-iso-push") } : b);
          }
          t = { ...a, blocks };
        }
      }
    }
    if (!t) return null;
    if (young) t = forYoungAthlete(t);
    return { template: t, deload: phase === "deload" };
  }
  const t = sprintTemplateFor(position, weekInCycle);
  return t ? { template: t, deload: phase === "deload" } : null;
}
