import { type Mas, formatPace, intervalDistanceM, speedAtPercent } from "./mas";
import { type MesoPhase } from "./library";
import type { Level } from "./types";
import { type CheckIn, strainOf } from "./adapt";

export interface RunBlock {
  label: string;
  /** Liczba powtórzeń (1 = bieg ciągły). */
  reps: number;
  sets: number;
  workS: number;
  restS: number;
  setRestS: number;
  percentMas: number;
  paceText: string;
  distanceM: number;
}

export interface RunSession {
  title: string;
  warmup: string;
  blocks: RunBlock[];
  notes: string[];
  isTest: boolean;
}

const LVL = { beginner: 0, intermediate: 1, advanced: 2 } as const;

function block(
  mas: Mas, label: string, percent: number, workS: number, restS: number,
  reps: number, sets = 1, setRestS = 180,
): RunBlock {
  return {
    label, reps, sets, workS, restS, setRestS,
    percentMas: percent,
    paceText: formatPace(speedAtPercent(mas, percent).paceSecPerKm),
    distanceM: intervalDistanceM(mas, percent, workS),
  };
}

/** Test MAS, gdy zawodnik jeszcze nie ma wyniku. */
export function masTestSession(): RunSession {
  return {
    title: "Test MAS – bieg 5 minut",
    warmup: "10 min spokojnego truchtu, 3 krótkie przyspieszenia",
    blocks: [],
    notes: ["Biegnij 5 minut tak szybko, jak potrafisz utrzymać równe tempo. Zapisz dystans."],
    isTest: true,
  };
}

/**
 * Sesja biegowa z MAS. Objętość: długie interwały, intensywność: 15/15,
 * rozładowanie: spokojny bieg ciągły. Wartości to hipoteza robocza do przeglądu.
 */
export function runSession(mas: Mas, phase: MesoPhase, level: Level, c?: CheckIn): RunSession {
  const l = LVL[level];
  const strain = c ? strainOf(c) : "none";
  const notes: string[] = [];
  let title: string;
  let blocks: RunBlock[];

  if (phase === "deload" || strain === "heavy") {
    const min = [20, 25, 30][l]!;
    title = "Bieg ciągły spokojny";
    blocks = [block(mas, "Bieg ciągły", 65, min * 60, 0, 1)];
    if (strain === "heavy") notes.push("Spokojny bieg zamiast interwałów, bo dziś ciężej.");
  } else if (phase === "volume") {
    title = "Interwały długie";
    const reps = [3, 4, 5][l]!;
    blocks = [block(mas, "3 min pracy", 90, 180, 120, reps)];
    notes.push("Rozbieg 10 min, na koniec 5 min truchtu.");
  } else {
    title = "Interwały 15/15";
    const reps = [8, 10, 12][l]!;
    blocks = [block(mas, "15 s pracy / 15 s trucht", 105, 15, 15, reps, 2)];
  }
  if (strain === "light") {
    blocks = blocks.map((b) => ({
      ...b,
      reps: b.reps > 1 ? Math.max(2, Math.ceil(b.reps * 0.75)) : b.reps,
      workS: b.reps === 1 ? Math.round(b.workS * 0.75) : b.workS,
    }));
    notes.push("Krótsza praca, bo dziś lżej.");
  }
  return {
    title,
    warmup: "10 min truchtu, 3 krótkie przyspieszenia",
    blocks,
    notes,
    isTest: false,
  };
}


