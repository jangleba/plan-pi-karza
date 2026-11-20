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
      for (let i = 0; i < 17 * 30 && !world.outcome; i++) { setUser(world, world.agents[0]!.pos, 0, 0); step(world, 1 / 30); record(rec, world); }
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
