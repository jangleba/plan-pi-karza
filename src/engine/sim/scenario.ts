import { FIELD_H, FIELD_W } from "./types";
import type { Agent, World } from "./types";
import { makeAgent } from "./world";

export type Variant = 0 | 1 | 2;

export interface VariantInfo { id: Variant; title: string; defence: string }

/** Warianty ustawienia rywala – kolejne próby uczą czytać różne pressingi. */
export const VARIANTS: VariantInfo[] = [
  { id: 0, title: "Pressing 2 napastników", defence: "Dwóch napastników doskakuje, pomocnicy za nimi." },
  { id: 1, title: "Wysoki blok", defence: "Cała drużyna wysoko, mało miejsca na środku." },
  { id: 2, title: "Niski blok", defence: "Rywal cofnięty, dużo miejsca przed linią." },
];

/**
 * Scenariusz: „Wyjście spod pressingu + kontratak”. Gramy w stronę x = 105.
 * Użytkownik: pomocnik #8 (P) z piłką na własnej połowie, naciska go dwóch napastników.
 */
export function createScenario(variant: Variant = 0, seed = 1): World {
  const v = variant;
  // przesunięcia ustawienia rywala względem wariantu 0
  const dx = v === 1 ? 7 : v === 2 ? -9 : 0;
  const pressX = v === 1 ? 55 : v === 2 ? 56 : 50;
  const agents: Agent[] = [
    makeAgent("P", "Ty", "us", "P", 8, 44, 36, 6.6),
    makeAgent("CB", "Stoper", "us", "CB", 4, 30, 27, 6.4),
    makeAgent("FB", "Boczny", "us", "FB", 2, 37, 59, 6.6),
    makeAgent("DM", "Defensywny", "us", "DM", 6, 36, 41, 6.5),
    makeAgent("W", "Skrzydłowy", "us", "W", 11, 58, 9, 7.0),
    makeAgent("ST", "Napastnik", "us", "ST", 9, 67, 34, 7.1),
    makeAgent("GKu", "Bramkarz", "us", "GK", 1, 3, 34, 5.5),

    makeAgent("S1", "Napastnik 1", "them", "S", 9, pressX, 33, 7.0),
    makeAgent("S2", "Napastnik 2", "them", "S", 10, pressX, 42, 7.0),
    makeAgent("M1", "Pomocnik 1", "them", "M", 8, 61 + dx, 14, 6.6),
    makeAgent("M2", "Pomocnik 2", "them", "M", 6, 61 + dx, 28, 6.6),
    makeAgent("M3", "Pomocnik 3", "them", "M", 7, 61 + dx, 41, 6.6),
    makeAgent("D1", "Obrońca 1", "them", "D", 3, 76 + dx, 14, 6.7),
    makeAgent("D2", "Obrońca 2", "them", "D", 4, 77 + dx, 27, 6.7),
    makeAgent("D3", "Obrońca 3", "them", "D", 5, 77 + dx, 41, 6.7),
    makeAgent("D4", "Obrońca 4", "them", "D", 2, 76 + dx, 54, 6.7),
    makeAgent("GKt", "Bramkarz rywali", "them", "GK", 1, FIELD_W - 2, 34, 5.5),
  ];
  const P = agents[0]!;
  return {
    t: 0,
    agents,
    ball: { pos: { x: P.pos.x + 0.6, y: P.pos.y }, vel: { x: 0, y: 0 }, owner: "P", flight: null, lastTouch: "P" },
    seed: (seed * 2654435761) >>> 0,
    rn: 0,
    events: [],
    outcome: null,
    contact: {},
    immuneUntil: 0,
    lastDecision: 0,
    user: "P",
    limit: 16,
  };
}

export { FIELD_H, FIELD_W };
