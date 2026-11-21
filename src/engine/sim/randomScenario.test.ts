import { describe, expect, it } from "vitest";
import { FIELD_H, FIELD_W } from "./types";
import { freshSeed, randomScenario, VARIANTS, type Variant } from "./scenario";
import { classify, record, setUser, startRecording, step } from "./index";

const layout = (seed: number, avoid?: Variant) => JSON.stringify(randomScenario(seed, avoid).world.agents.map((a) => [a.id, +a.pos.x.toFixed(3), +a.pos.y.toFixed(3)]));

describe("losowe sytuacje IQ", () => {
  it("to samo ziarno daje tę samą sytuację (Jeszcze raz), inne ziarno inną", () => {
    expect(layout(12345)).toBe(layout(12345));
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    expect(new Set(seeds.map((s) => layout(s))).size).toBe(seeds.length);
  });

  it("wariant nigdy nie powtarza się dwa razy z rzędu i wszystkie trzy występują", () => {
    const seen = new Set<Variant>();
    let prev: Variant | undefined;
    for (let s = 1; s <= 300; s++) {
      const r = randomScenario(s * 7919, prev);
      if (prev !== undefined) expect(r.variant).not.toBe(prev);
      expect(VARIANTS[r.variant]).toBeDefined();
      seen.add(r.variant); prev = r.variant;
    }
    expect(seen.size).toBe(3);
  });

  it("każda sytuacja jest uczciwa: zawodnik z piłką, wszyscy na boisku, rywale nie stoją na piłce, jest komu podać", () => {
    for (let s = 1; s <= 400; s++) {
      const { world } = randomScenario(s * 104729);
      const P = world.agents.find((a) => a.id === "P")!;
      expect(world.ball.owner).toBe("P");
      expect(world.agents).toHaveLength(17);
      for (const a of world.agents) {
        expect(a.pos.x, `${s} ${a.id} x`).toBeGreaterThanOrEqual(0);
        expect(a.pos.x).toBeLessThanOrEqual(FIELD_W);
        expect(a.pos.y).toBeGreaterThanOrEqual(0);
        expect(a.pos.y).toBeLessThanOrEqual(FIELD_H);
      }
      const foes = world.agents.filter((a) => a.team === "them" && a.role !== "GK");
      expect(Math.min(...foes.map((a) => Math.hypot(a.pos.x - P.pos.x, a.pos.y - P.pos.y))), `${s} odległość rywala`).toBeGreaterThan(4);
      const mates = world.agents.filter((a) => a.team === "us" && a.id !== "P" && a.role !== "GK");
      expect(mates.length).toBeGreaterThanOrEqual(5);
      expect(P.pos.x).toBeGreaterThan(36);
      expect(P.pos.x).toBeLessThan(48);
    }
  });

  it("symulacja każdej losowej sytuacji działa do końca bez błędów (wartości skończone, jest rozstrzygnięcie)", () => {
    for (let s = 1; s <= 40; s++) {
      const { world } = randomScenario(s * 31337);
      const rec = startRecording(world);
      for (let i = 0; i < (world.limit + 8) * 30 && !world.outcome; i++) { setUser(world, world.agents[0]!.pos, 0, 0); step(world, 1 / 30); record(rec, world); }
      for (const a of world.agents) expect(Number.isFinite(a.pos.x + a.pos.y), `${s} ${a.id}`).toBe(true);
      expect(world.outcome, `sytuacja ${s} powinna się rozstrzygnąć w limicie czasu`).not.toBeNull();
      expect(classify(world)).toBeTruthy();
    }
  });

  it("freshSeed daje różne dodatnie ziarna", () => {
    const set = new Set(Array.from({ length: 50 }, () => freshSeed()));
    expect(set.size).toBeGreaterThan(40);
    for (const v of set) expect(v).toBeGreaterThan(0);
  });
});

import { agent, pass } from "./world";
import { rateOptions } from "./coach";
import type { World } from "./types";

/** Cała akcja: po Twoim podaniu do najlepszego wolnego kolegi (jeśli jest) wybiegasz do przodu, a drużyna gra sama. */
function play(seed: number, runForward: boolean): World | null {
  const { world: w } = randomScenario(seed);
  const best = rateOptions(w).find((r) => r.kept);
  if (!best) return null;
  const P = agent(w, "P");
  let passed = false, x = P.pos.x;
  while (!w.outcome) {
    if (passed && runForward) x += 5 / 30;
    setUser(w, passed && runForward ? { x, y: P.pos.y } : P.pos, 0, passed && runForward ? 5 : 0);
    if (!passed && w.t >= 0.4) { passed = true; pass(w, "P", best.id); }
    step(w, 1 / 30);
  }
  return w;
}

describe("przebieg akcji po Twoim podaniu", () => {
  it("styl ataku jest losowany z ziarna (wszystkie style występują), a ta sama sytuacja zawsze ma ten sam styl", () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 60; s++) seen.add(randomScenario(s * 977).world.style ?? "");
    for (const st of ["wall", "switch", "dribble", "direct", "mixed"]) expect(seen.has(st), st).toBe(true);
    expect(randomScenario(123).world.style).toBe(randomScenario(123).world.style);
  });
  it("akcja rzadko wygasa: w 24 s kończy się strzałem, stratą lub odbiorem (poniżej 3% „czas minął”, gdy piłki nie trzymasz Ty)", { timeout: 120000 }, () => {
    let n = 0, timeouts = 0;
    for (let s = 1; s <= 150; s++) {
      const w = play(s * 7919, true);
      if (!w) continue;
      n++;
      if (w.outcome!.kind === "timeout" && w.ball.owner !== "P") timeouts++; // gdy piłkę ma użytkownik, to on decyduje (w teście stoi)
    }
    expect(n).toBeGreaterThan(100);
    expect(timeouts / n).toBeLessThan(0.03);
  });
  it("koledzy oddają Ci piłkę („ściana”), próbują zmiany strony i dryblingu 1 na 1 w różnych sytuacjach", { timeout: 120000 }, () => {
    let toP = 0, switches = 0, dribbles = 0, wonDribbles = 0;
    for (let s = 1; s <= 200; s++) {
      const w = play(s * 104729, true);
      if (!w) continue;
      if (w.events.some((e) => e.type === "pass" && e.to === "P" && e.by !== "P")) toP++;
      const tm = (id?: string) => w.agents.find((a) => a.id === id);
      if (w.events.some((e) => e.type === "pass" && tm(e.by)?.team === "us" && tm(e.to) && Math.abs(tm(e.to)!.pos.y - (tm(e.by)!.pos.y)) > 0 && e.by !== "P" && (e.info?.dist as number) > 24)) switches++;
      for (const e of w.events) if (e.type === "dribble") { dribbles++; if (e.info?.won) wonDribbles++; }
    }
    expect(toP).toBeGreaterThan(14); // wcześniej: ok. 5 na 200 prób
    expect(dribbles).toBeGreaterThan(10);
    expect(wonDribbles).toBeGreaterThan(0);
    expect(wonDribbles).toBeLessThan(dribbles); // zdarza się też strata w dryblingu
    expect(switches).toBeGreaterThan(5);
  });
});

