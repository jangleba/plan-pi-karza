import { firstNumber } from "../progress";
import type { Item } from "../library";
import type { ExerciseVariant, RxPhase, Role, Rx } from "./types";

/** Tekst recepty pokazywany zawodnikowi (z pól; `text` ma pierwszeństwo – to pierwotny zapis trenera). */
export function formatRx(rx: Rx): string {
  if (rx.text) return rx.text;
  const side = rx.perSide ? " / nogę" : "";
  switch (rx.type) {
    case "strength": return `${rx.reps}${side}`;
    case "isometric": return `${rx.trials} × ${rx.holdS} s${side}`;
    case "plyometric": return `${rx.trials}${side}`;
    case "sprint": return `${rx.workM} m`;
    case "cod": return `${rx.trials} / stronę`;
    case "conditioning": return `${rx.workS} s pracy, ${rx.restWorkS} s przerwy`;
  }
}

/** Czas pracy z odpoczynkiem (min) – do walidacji czasu sesji. */
export function rxSeconds(rx: Rx): number {
  const rest = rx.restS ?? 60;
  const work = rx.type === "strength" ? rx.reps * 4 : rx.type === "isometric" ? rx.trials * rx.holdS : rx.type === "sprint" ? rx.reps * 8 : rx.type === "conditioning" ? rx.workS * rx.intervals : 20;
  return rx.sets * (work + rest);
}

/** Recepta z wpisu szablonu trenera (zachowuje dosłowny zapis). */
export function rxFromItem(item: Item, v: ExerciseVariant): Rx {
  const base = { sets: item.sets, text: item.reps };
  const perSide = /nog|stron/.test(item.reps);
  switch (v.allowedPrescriptionTypes[0]) {
    case "isometric": return { ...base, type: "isometric", mode: "yielding", position: "pozycja robocza", holdS: 1, trials: firstNumber(item.reps), effort: "max", perSide, restS: 60 };
    case "plyometric": return { ...base, type: "plyometric", trials: firstNumber(item.reps), takeoff: v.laterality === "unilateral" ? "one_leg" : "two_leg", landing: "stick", direction: "vertical", category: "vertical", perSide, restS: 90 };
    case "sprint": return { ...base, type: "sprint", reps: 1, runInM: 0, workM: firstNumber(item.reps), runOutM: 10, intensityBasis: "perceived", restS: 90 };
    case "cod": return { ...base, type: "cod", trials: firstNumber(item.reps), sides: "both", entry: "submax", stopZoneM: 3, restS: 90 };
    case "conditioning": return { ...base, type: "conditioning", workS: 60, restWorkS: 60, intervals: item.sets, intensityBasis: "perceived" };
    default: {
      const m = item.note?.match(/\d-\d-(\d|x)/i);
      return { ...base, type: "strength", reps: firstNumber(item.reps), perSide, load: { convention: v.loadConvention, ...(item.pctRM ? { pctRM: item.pctRM } : {}) }, ...(m ? { tempo: m[0] } : {}), restS: item.pctRM ? 180 : 120 };
    }
  }
}

/**
 * Nowa recepta dla INNEGO wariantu (po zamianie, dodaniu, zmianie): z polityki, nie z poprzedniego zadania.
 * Dawki to wersjonowana polityka produktu (POLICY_VERSION), do przeglądu trenera – nie wynik badań.
 */
export const POLICY_VERSION = 1;
export function prescribe(v: ExerciseVariant, role: Role, phase: RxPhase): Rx {
  const heavy = phase === "intensity";
  const light = phase === "deload";
  const sets = (n: number) => (light ? Math.max(2, n - 1) : n);
  const perSide = v.laterality === "unilateral";
  switch (v.allowedPrescriptionTypes[0]) {
    case "isometric": return { type: "isometric", mode: v.contraction === "overcoming_isometric" ? "overcoming" : "yielding", position: "pozycja robocza", holdS: 20, trials: 1, effort: "submax", sets: sets(3), perSide, restS: 60 };
    case "plyometric": return { type: "plyometric", trials: heavy ? 3 : 5, takeoff: v.laterality === "unilateral" ? "one_leg" : v.laterality === "alternating" ? "alternating" : "two_leg", landing: "stick", direction: "vertical", category: "vertical", sets: sets(3), perSide, restS: 90 };
    case "sprint": return { type: "sprint", reps: 1, runInM: 0, workM: 20, runOutM: 10, intensityBasis: "perceived", sets: sets(3), restS: 120 };
    case "cod": return { type: "cod", trials: 2, sides: "both", entry: "submax", stopZoneM: 3, sets: sets(3), restS: 90 };
    case "conditioning": return { type: "conditioning", workS: 60, restWorkS: 60, intervals: 6, intensityBasis: "perceived", sets: 1 };
    default: {
      const main = role === "main_stimulus";
      const reps = v.movementPatterns[0] === "power" ? 3 : main ? (heavy ? 4 : 6) : heavy ? 8 : 10;
      return { type: "strength", reps, sets: sets(main ? 4 : 3), perSide, load: { convention: v.loadConvention }, restS: main ? 150 : 90 };
    }
  }
}
