import { FIELD_H, FIELD_W } from "./types";
import { ATTACK_STYLES, type Agent, type World } from "./types";
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
    limit: 24,
    style: "mixed",
  };
}

/** Generator liczb pseudolosowych z ziarna (mulberry32): ta sama sytuacja po ponownym użyciu ziarna. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nowe ziarno sytuacji (losowe przy każdym wejściu i każdej kolejnej próbie). */
export function freshSeed(): number {
  return ((((Math.random() * 0x7fffffff) | 0) ^ (Date.now() & 0xffff)) >>> 0) || 1;
}

/**
 * Losowa sytuacja: ten sam motyw („wyjście spod pressingu”), ale za każdym razem inne ustawienie obu drużyn.
 * Zmienia się: wariant obrony (pressing / wysoki blok / niski blok, nigdy ten sam dwa razy z rzędu – `avoid`), miejsce zawodnika
 * z piłką, odległość i strona napastników doskakujących, wysokość linii pomocników i obrońców, rozrzut wszystkich zawodników
 * i lustrzane odbicie boiska. Wynik zależy tylko od `seed`, więc „Jeszcze raz” odtwarza dokładnie tę samą sytuację.
 */
export function randomScenario(seed: number, avoid?: Variant): { world: World; variant: Variant; seed: number } {
  const rn = seeded(seed);
  const j = (r: number) => (rn() * 2 - 1) * r;
  const between = (a: number, b: number) => a + rn() * (b - a);
  const options = ([0, 1, 2] as Variant[]).filter((x) => x !== avoid);
  const variant = options[Math.floor(rn() * options.length)]!;
  // pasma wariantów: przesunięcie linii pomocników i obrońców oraz odległość napastników od zawodnika z piłką
  const dx = variant === 1 ? between(4, 10) : variant === 2 ? between(-12, -6) : between(-3, 3);
  const gap = variant === 0 ? between(5.5, 7.5) : between(9, 12.5);
  const mirror = rn() < 0.5;

  const px = 42 + j(3), py = 36 + j(9);
  const sx = px - 44, sy = py - 36; // przesunięcie względem ustawienia wzorcowego
  const side = rn() < 0.5 ? 1 : -1; // z której strony doskakuje pierwszy napastnik
  const my = (y: number) => (mirror ? FIELD_H - y : y);
  const A = (id: string, name: string, team: "us" | "them", role: Agent["role"], no: number, x: number, y: number, v: number) =>
    makeAgent(id, name, team, role, no, x, my(Math.min(FIELD_H - 2, Math.max(2, y))), Math.max(4.5, v + j(0.25)));

  const agents: Agent[] = [
    A("P", "Ty", "us", "P", 8, px, py, 6.6),
    A("CB", "Stoper", "us", "CB", 4, 30 + sx * 0.6 + j(3), 27 + sy * 0.5 + j(5), 6.4),
    A("FB", "Boczny", "us", "FB", 2, 37 + sx * 0.6 + j(3), 59 + j(5), 6.6),
    A("DM", "Defensywny", "us", "DM", 6, 36 + sx * 0.6 + j(3), 41 + sy * 0.5 + j(5), 6.5),
    A("W", "Skrzydłowy", "us", "W", 11, 58 + j(4), 9 + j(4), 7.0),
    A("ST", "Napastnik", "us", "ST", 9, 67 + j(4), 34 + j(8), 7.1),
    A("GKu", "Bramkarz", "us", "GK", 1, 3, 34, 5.5),

    A("S1", "Napastnik 1", "them", "S", 9, px + gap + j(0.8), py + side * (3 + j(1.2)), 7.0),
    A("S2", "Napastnik 2", "them", "S", 10, px + gap + j(0.8), py - side * (6 + j(2)), 7.0),
    A("M1", "Pomocnik 1", "them", "M", 8, 61 + dx + j(2.5), 14 + j(3), 6.6),
    A("M2", "Pomocnik 2", "them", "M", 6, 61 + dx + j(2.5), 28 + j(3), 6.6),
    A("M3", "Pomocnik 3", "them", "M", 7, 61 + dx + j(2.5), 41 + j(3), 6.6),
    A("D1", "Obrońca 1", "them", "D", 3, 76 + dx + j(1.5), 14 + j(2.5), 6.7),
    A("D2", "Obrońca 2", "them", "D", 4, 77 + dx + j(1.5), 27 + j(2.5), 6.7),
    A("D3", "Obrońca 3", "them", "D", 5, 77 + dx + j(1.5), 41 + j(2.5), 6.7),
    A("D4", "Obrońca 4", "them", "D", 2, 76 + dx + j(1.5), 54 + j(2.5), 6.7),
    A("GKt", "Bramkarz rywali", "them", "GK", 1, FIELD_W - 2, 34, 5.5),
  ];
  const P = agents[0]!;
  const world: World = {
    t: 0, agents,
    ball: { pos: { x: P.pos.x + 0.6, y: P.pos.y }, vel: { x: 0, y: 0 }, owner: "P", flight: null, lastTouch: "P" },
    seed: (seed * 2654435761) >>> 0, rn: 0, events: [], outcome: null, contact: {}, immuneUntil: 0, lastDecision: 0, user: "P", limit: 24,
    style: ATTACK_STYLES[Math.floor(rn() * ATTACK_STYLES.length)],
  };
  return { world, variant, seed };
}

export { FIELD_H, FIELD_W };
