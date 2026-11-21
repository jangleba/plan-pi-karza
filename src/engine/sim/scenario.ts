import { FIELD_H, FIELD_W } from "./types";
import { ATTACK_STYLES, type Agent, type Situation, type World } from "./types";
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

export interface SituationInfo { id: Situation; title: string; read: string }

/** Rodzaje sytuacji: każda próba losuje inną (nigdy dwa razy ta sama z rzędu). */
export const SITUATIONS: SituationInfo[] = [
  { id: "press", title: "Wyjście spod pressingu", read: "Czytaj, kto jest wolny za plecami presji." },
  { id: "counter", title: "Odbiór i kontra", read: "Rywal jest rozciągnięty: liczy się tempo i wolna strzefa za linią pomocy." },
  { id: "keeper", title: "Rozegranie od bramkarza", read: "Rywal naciska wysoko: znajdź wolnego obrońcę albo kolegę za linią napastników." },
  { id: "two_one", title: "2 na 1 na skrzydle", read: "Masz przewagę przy jednym obrońcy: podaj w bieg, wejdź dryblingiem albo strzelaj." },
];

/** Opis sytuacji w ekranie wstępnym (po polsku, bez rodzaju gramatycznego zawodnika). */
export function introText(situation: Situation, role: string, no: number, defence: string): string {
  switch (situation) {
    case "counter": return `Po odbiorze piłka jest przy Tobie (rola: ${role}, numer ${no}). Rywal jest rozciągnięty: dwóch napastników został za Tobą, a linia pomocy się cofa.`;
    case "keeper": return `Wznawiasz grę spod własnej bramki (rola: ${role}, numer ${no}). Rywale naciskają, a koledzy stoją w różnej odległości.`;
    case "two_one": return `Wchodzisz z piłką na skrzydle (rola: ${role}, numer ${no}). Obok biegnie kolega, a przy piłce jest tylko jeden obrońca.`;
    default: return `Grasz jako ${role}, numer ${no}, z piłką. Naciska Cię dwóch napastników. ${defence}`;
  }
}

type Rn = () => number;
interface Built { world: World; variant: Variant; situation: Situation; role: string }

const baseWorld = (agents: Agent[], seed: number, situation: Situation, role: string, style: World["style"]): World => {
  const P = agents.find((a) => a.id === "P")!;
  return {
    t: 0, agents,
    ball: { pos: { x: P.pos.x + 0.6, y: P.pos.y }, vel: { x: 0, y: 0 }, owner: "P", flight: null, lastTouch: "P" },
    seed: (seed * 2654435761) >>> 0, rn: 0, events: [], outcome: null, contact: {}, immuneUntil: 0, lastDecision: 0, user: "P", limit: 24,
    style, situation, userRole: role,
  };
};

/** Wspólny pomocnik: tworzy zawodnika z rozrzutem, w granicach boiska, z opcjonalnym odbiciem lustrzanym. */
function maker(rn: Rn, mirrored: boolean) {
  const j = (r: number) => (rn() * 2 - 1) * r;
  const my = (y: number) => (mirrored ? FIELD_H - y : y);
  const A = (id: string, name: string, team: "us" | "them", role: Agent["role"], no: number, x: number, y: number, v: number) =>
    makeAgent(id, name, team, role, no, x, my(Math.min(FIELD_H - 2, Math.max(2, y))), Math.max(4.5, v + j(0.25)));
  return { j, A };
}

/** Wyjście spod pressingu; użytkownik gra jako pomocnik, stoper, boczny albo skrzydłowy (inne ustawienie kolegów i presji). */
function pressScenario(rn: Rn, seed: number, avoid: Variant | undefined, style: World["style"]): Built {
  const between = (a: number, b: number) => a + rn() * (b - a);
  const options = ([0, 1, 2] as Variant[]).filter((x) => x !== avoid);
  const variant = options[Math.floor(rn() * options.length)]!;
  // pasma wariantów: przesunięcie linii pomocników i obrońców oraz odległość napastników od zawodnika z piłką
  const dxl = variant === 1 ? between(4, 10) : variant === 2 ? between(-12, -6) : between(-3, 3);
  const gap = variant === 0 ? between(5.5, 7.5) : between(9, 12.5);
  const { j, A } = maker(rn, rn() < 0.5);
  const roll = rn();
  const role = roll < 0.4 ? "pomocnik" : roll < 0.62 ? "stoper" : roll < 0.82 ? "boczny" : "skrzydłowy";

  const mx = 42 + j(3), my0 = 36 + j(9); // ustawienie „pomocnika”
  const sx = mx - 44, sy = my0 - 36; // przesunięcie względem ustawienia wzorcowego
  const side = rn() < 0.5 ? 1 : -1; // z której strony doskakuje pierwszy napastnik
  // gdzie stoi użytkownik; zawodnik z tej roli (stoper/boczny/skrzydłowy) przechodzi na miejsce „pomocnika”
  const slot = role === "stoper" ? { x: 27 + j(3), y: 30 + j(7) } : role === "boczny" ? { x: 34 + j(3), y: 57 + j(4) } : role === "skrzydłowy" ? { x: Math.min(53, 61 + dxl - 8) + j(2), y: 11 + j(3) } : { x: mx, y: my0 };
  const P = slot;
  const swap = (id: string) => role !== "pomocnik" && ((id === "CB" && role === "stoper") || (id === "FB" && role === "boczny") || (id === "W" && role === "skrzydłowy"));
  const mate = (id: string, name: string, r: Agent["role"], no: number, x: number, y: number, v: number) => (swap(id) ? A(id, "Pomocnik", "us", r, no, mx, my0, v) : A(id, name, "us", r, no, x, y, v));

  const agents: Agent[] = [
    A("P", "Ty", "us", "P", 8, P.x, P.y, 6.6),
    mate("CB", "Stoper", "CB", 4, 30 + sx * 0.6 + j(3), 27 + sy * 0.5 + j(5), 6.4),
    mate("FB", "Boczny", "FB", 2, 37 + sx * 0.6 + j(3), 59 + j(5), 6.6),
    A("DM", "Defensywny", "us", "DM", 6, 36 + sx * 0.6 + j(3), 41 + sy * 0.5 + j(5), 6.5),
    mate("W", "Skrzydłowy", "W", 11, 58 + j(4), 9 + j(4), 7.0),
    A("ST", "Napastnik", "us", "ST", 9, 67 + j(4), 34 + j(8), 7.1),
    A("GKu", "Bramkarz", "us", "GK", 1, 3, 34, 5.5),

    A("S1", "Napastnik 1", "them", "S", 9, P.x + gap + j(0.8), P.y + side * (3 + j(1.2)), 7.0),
    A("S2", "Napastnik 2", "them", "S", 10, P.x + gap + j(0.8), P.y - side * (6 + j(2)), 7.0),
    A("M1", "Pomocnik 1", "them", "M", 8, 61 + dxl + j(2.5), 14 + j(3), 6.6),
    A("M2", "Pomocnik 2", "them", "M", 6, 61 + dxl + j(2.5), 28 + j(3), 6.6),
    A("M3", "Pomocnik 3", "them", "M", 7, 61 + dxl + j(2.5), 41 + j(3), 6.6),
    A("D1", "Obrońca 1", "them", "D", 3, 76 + dxl + j(1.5), 14 + j(2.5), 6.7),
    A("D2", "Obrońca 2", "them", "D", 4, 77 + dxl + j(1.5), 27 + j(2.5), 6.7),
    A("D3", "Obrońca 3", "them", "D", 5, 77 + dxl + j(1.5), 41 + j(2.5), 6.7),
    A("D4", "Obrońca 4", "them", "D", 2, 76 + dxl + j(1.5), 54 + j(2.5), 6.7),
    A("GKt", "Bramkarz rywali", "them", "GK", 1, FIELD_W - 2, 34, 5.5),
  ];
  return { world: baseWorld(agents, seed, "press", role, style), variant, situation: "press", role };
}

/** Odbiór i kontra: rywal rozciągnięty, jego napastnicy za Tobą, linia pomocy cofa się; masz biegaczy na skrzydle i w polu. */
function counterScenario(rn: Rn, seed: number, style: World["style"]): Built {
  const { j, A } = maker(rn, rn() < 0.5);
  const px = 46 + j(4), py = 34 + j(14), side = rn() < 0.5 ? 1 : -1;
  const agents: Agent[] = [
    A("P", "Ty", "us", "P", 8, px, py, 6.7),
    A("CB", "Stoper", "us", "CB", 4, 28 + j(3), 28 + j(5), 6.4),
    A("FB", "Boczny", "us", "FB", 2, px - 10 + j(3), 58 + j(5), 6.6),
    A("DM", "Defensywny", "us", "DM", 6, px - 9 + j(3), py + side * (8 + j(3)), 6.5),
    A("W", "Skrzydłowy", "us", "W", 11, px + 14 + j(3), 10 + j(4), 7.1),
    A("ST", "Napastnik", "us", "ST", 9, px + 22 + j(3), 34 + j(9), 7.2),
    A("GKu", "Bramkarz", "us", "GK", 1, 3, 34, 5.5),

    A("S1", "Napastnik 1", "them", "S", 9, px - 8 + j(1.2), py + side * (5.5 + j(1)), 7.0),
    A("S2", "Napastnik 2", "them", "S", 10, px - 11 + j(1.5), py - side * (8 + j(1.5)), 7.0),
    A("M1", "Pomocnik 1", "them", "M", 8, px + 12 + j(2), 17 + j(5), 6.6),
    A("M2", "Pomocnik 2", "them", "M", 6, px + 11 + j(2), 34 + j(6), 6.6),
    A("M3", "Pomocnik 3", "them", "M", 7, px + 13 + j(2), 51 + j(5), 6.6),
    A("D1", "Obrońca 1", "them", "D", 3, 77 + j(2), 14 + j(3), 6.7),
    A("D2", "Obrońca 2", "them", "D", 4, 78 + j(2), 27 + j(3), 6.7),
    A("D3", "Obrońca 3", "them", "D", 5, 78 + j(2), 41 + j(3), 6.7),
    A("D4", "Obrońca 4", "them", "D", 2, 77 + j(2), 54 + j(3), 6.7),
    A("GKt", "Bramkarz rywali", "them", "GK", 1, FIELD_W - 2, 34, 5.5),
  ];
  return { world: baseWorld(agents, seed, "counter", "pomocnik", style), variant: 0, situation: "counter", role: "pomocnik" };
}

/** Rozegranie od bramkarza: użytkownik jest bramkarzem (poza Twoją drużyną nie ma drugiego), rywale naciskają wysoko albo w środkowym bloku. */
function keeperScenario(rn: Rn, seed: number, style: World["style"]): Built {
  const { j, A } = maker(rn, rn() < 0.5);
  const high = rn() < 0.6;
  const sx = high ? 23 + j(3) : 38 + j(3);
  const agents: Agent[] = [
    A("P", "Ty (bramkarz)", "us", "P", 1, 6 + j(0.8), 34 + j(5), 6.0),
    A("CB", "Stoper", "us", "CB", 4, 15 + j(2), 22 + j(4), 6.4),
    A("DM", "Defensywny", "us", "DM", 6, 28 + j(3), 34 + j(6), 6.5),
    A("FB", "Boczny", "us", "FB", 2, 18 + j(3), 58 + j(4), 6.6),
    A("W", "Skrzydłowy", "us", "W", 11, 46 + j(3), 9 + j(4), 7.0),
    A("ST", "Napastnik", "us", "ST", 9, 58 + j(4), 34 + j(8), 7.1),

    A("S1", "Napastnik 1", "them", "S", 9, sx, 28 + j(2), 7.0),
    A("S2", "Napastnik 2", "them", "S", 10, sx, 40 + j(2), 7.0),
    A("M1", "Pomocnik 1", "them", "M", 8, (high ? 40 : 52) + j(3), 14 + j(3), 6.6),
    A("M2", "Pomocnik 2", "them", "M", 6, (high ? 40 : 52) + j(3), 30 + j(3), 6.6),
    A("M3", "Pomocnik 3", "them", "M", 7, (high ? 40 : 52) + j(3), 46 + j(3), 6.6),
    A("D1", "Obrońca 1", "them", "D", 3, (high ? 63 : 70) + j(2), 13 + j(3), 6.7),
    A("D2", "Obrońca 2", "them", "D", 4, (high ? 64 : 71) + j(2), 27 + j(3), 6.7),
    A("D3", "Obrońca 3", "them", "D", 5, (high ? 64 : 71) + j(2), 41 + j(3), 6.7),
    A("D4", "Obrońca 4", "them", "D", 2, (high ? 63 : 70) + j(2), 55 + j(3), 6.7),
    A("GKt", "Bramkarz rywali", "them", "GK", 1, FIELD_W - 2, 34, 5.5),
  ];
  return { world: baseWorld(agents, seed, "keeper", "bramkarz", style), variant: 0, situation: "keeper", role: "bramkarz" };
}

/** 2 na 1 na skrzydle: Ty z piłką przy linii bocznej, kolega wbiega do środka, przy Tobie jeden obrońca, reszta rywali z tyłu. */
function twoOneScenario(rn: Rn, seed: number, style: World["style"]): Built {
  const { j, A } = maker(rn, rn() < 0.5);
  const px = 69 + j(3), py = 11 + j(3);
  const agents: Agent[] = [
    A("P", "Ty", "us", "P", 11, px, py, 7.0),
    A("ST", "Napastnik", "us", "ST", 9, px + 7 + j(2), 25 + j(3), 7.2),
    A("DM", "Defensywny", "us", "DM", 6, px - 10 + j(3), 30 + j(5), 6.5),
    A("W", "Drugi skrzydłowy", "us", "W", 7, px - 3 + j(3), 56 + j(4), 7.0),
    A("CB", "Stoper", "us", "CB", 4, 36 + j(3), 28 + j(4), 6.4),
    A("FB", "Boczny", "us", "FB", 2, 42 + j(3), 54 + j(4), 6.6),
    A("GKu", "Bramkarz", "us", "GK", 1, 3, 34, 5.5),

    A("D1", "Obrońca 1", "them", "D", 3, px + 11 + j(1.5), py + 7 + j(2), 6.7),
    A("D2", "Obrońca 2", "them", "D", 4, px + 19 + j(1.5), 31 + j(3), 6.7),
    A("D3", "Obrońca 3", "them", "D", 5, px + 19 + j(1.5), 44 + j(3), 6.7),
    A("D4", "Obrońca 4", "them", "D", 2, px + 17 + j(1.5), 56 + j(3), 6.7),
    A("M1", "Pomocnik 1", "them", "M", 8, px - 12 + j(3), 16 + j(4), 6.6),
    A("M2", "Pomocnik 2", "them", "M", 6, px - 14 + j(3), 32 + j(4), 6.6),
    A("M3", "Pomocnik 3", "them", "M", 7, px - 12 + j(3), 46 + j(4), 6.6),
    A("S1", "Napastnik 1", "them", "S", 9, px - 24 + j(3), 22 + j(4), 7.0),
    A("S2", "Napastnik 2", "them", "S", 10, px - 24 + j(3), 40 + j(4), 7.0),
    A("GKt", "Bramkarz rywali", "them", "GK", 1, FIELD_W - 2, 34, 5.5),
  ];
  return { world: baseWorld(agents, seed, "two_one", "skrzydłowy", style), variant: 0, situation: "two_one", role: "skrzydłowy" };
}

/**
 * Losowa sytuacja: rodzaj (wyjście spod pressingu, odbiór i kontra, rozegranie od bramkarza, 2 na 1 na skrzydle; nigdy ten sam dwa razy
 * z rzędu – `avoidSituation`), rola zawodnika, ustawienie obu drużyn, rozrzut zawodników, lustrzane odbicie boiska i styl ataku drużyny
 * (ściana, zmiana strony, drybling, bezpośrednio, mieszany). W wyjściu spod pressingu dodatkowo wariant obrony (`avoid`).
 * Wynik zależy tylko od `seed`, więc „Jeszcze raz” odtwarza dokładnie tę samą sytuację.
 */
export function randomScenario(seed: number, avoid?: Variant, avoidSituation?: Situation): Built & { seed: number } {
  const rn = seeded(seed);
  const style = ATTACK_STYLES[Math.floor(rn() * ATTACK_STYLES.length)];
  // wagi: wyjście spod pressingu najczęściej, pozostałe po równo
  const pool: Situation[] = ["press", "press", "counter", "keeper", "two_one"];
  const choices = pool.filter((s) => s !== avoidSituation);
  const situation = choices[Math.floor(rn() * choices.length)]!;
  const built = situation === "counter" ? counterScenario(rn, seed, style) : situation === "keeper" ? keeperScenario(rn, seed, style) : situation === "two_one" ? twoOneScenario(rn, seed, style) : pressScenario(rn, seed, avoid, style);
  return { ...built, seed };
}

export { FIELD_H, FIELD_W };
