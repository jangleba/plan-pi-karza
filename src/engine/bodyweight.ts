import { type Block, type MesoPhase, type SessionTemplate } from "./library";
import type { Level } from "./types";

/**
 * Siła bez siłowni: drabinki trudności zamiast ciężaru.
 * Kolejność ćwiczeń w drabince od najłatwiejszego; szczebel zależy od poziomu
 * i fazy mezocyklu. Dobór szczebli to standardowe progresje kalisteniczne
 * (wiedza ogólna, do przeglądu trenera – docs/BEZ-SILOWNI.md).
 */
export const LADDERS = {
  squat: ["bw-squat", "split-squat", "bulgarian-split-squat", "assisted-pistol", "pistol-squat"],
  hinge: ["glute-bridge", "sl-glute-bridge", "sl-rdl-bw", "nordic-assisted", "nordic-curl"],
  push: ["incline-push-up", "push-up", "feet-elevated-push-up", "archer-push-up"],
  pull: ["inverted-row", "feet-elevated-row", "archer-row"],
  jump: ["pogo-jumps", "squat-jump", "bounding", "sl-hop"],
} as const;

export type LadderKey = keyof typeof LADDERS;

const BASE_RUNG: Record<Level, number> = { beginner: 0, intermediate: 2, advanced: 3 };

export function rung(key: LadderKey, level: Level, phase: MesoPhase): string {
  const ladder = LADDERS[key];
  let i = BASE_RUNG[level] + (phase === "intensity" ? 1 : 0) - (phase === "deload" ? 1 : 0);
  i = Math.max(0, Math.min(ladder.length - 1, i));
  return ladder[i]!;
}

const UNI = new Set(["split-squat", "bulgarian-split-squat", "assisted-pistol", "pistol-squat", "sl-glute-bridge", "sl-rdl-bw", "sl-hop", "sl-calf-raise", "copenhagen"]);

export function bodyweightTemplate(level: Level, phase: MesoPhase): SessionTemplate {
  const reps = (id: string, volume: number, intensity: number) => {
    const n = phase === "intensity" ? intensity : volume;
    return UNI.has(id) ? `${n} / nogę` : String(n);
  };
  const item = (id: string, sets: number, volume: number, intensity: number) => ({
    exerciseId: id,
    sets,
    reps: id === "side-plank" ? `${phase === "intensity" ? intensity : volume} s / stronę` : reps(id, volume, intensity),
  });
  const squat = rung("squat", level, phase);
  const hinge = rung("hinge", level, phase);
  const push = rung("push", level, phase);
  const pull = rung("pull", level, phase);
  const jump = rung("jump", level, phase);
  const blocks: Block[] = [
    { title: "Aktywacja", items: [{ exerciseId: "knee-iso-push", sets: 3, reps: "5 × 1 s / nogę" }, item(jump, 3, 6, 4)] },
    { title: "Siła nóg", items: [item(squat, 4, 8, 5)] },
    { title: "Góra", items: [item(push, 3, 10, 6), item(pull, 3, 10, 6)] },
    { title: "Tył uda i łydki", items: [item(hinge, 3, 8, 5), item("sl-calf-raise", 3, 12, 12)] },
    { title: "Core", items: [item("side-plank", 3, 30, 40), item("copenhagen", 3, 6, 8)] },
  ];
  return {
    id: `strength-bodyweight-${phase}`,
    name: "Siła bez siłowni",
    module: "strength",
    phase: phase === "intensity" ? "intensity" : "volume",
    blocks,
  };
}
