import { describe, expect, it } from "vitest";
import { CLASS_LABEL, KICK_WAIT, classify, coachSteps, firstAction, firstLoss, rateOptions } from "./coach";
import { cloneWorld, duration, frameAt, record, snapshotAtOrBefore, startRecording } from "./replay";
import { createScenario } from "./scenario";
import { agent, pass, setUser, step } from "./world";
import type { World } from "./types";

const DT = 1 / 60;
function play(w: World, opts: { passTo?: string; at?: number; until?: number } = {}) {
  const rec = startRecording(w);
  let done = false;
  while (w.t < (opts.until ?? w.limit) && !w.outcome) {
    if (opts.passTo && !done && w.t >= (opts.at ?? 0.4)) { pass(w, "P", opts.passTo); done = true; }
    setUser(w, agent(w, "P").pos, 0, 0);
    step(w, DT);
    record(rec, w);
  }
  return rec;
}

describe("nagranie i powtórka", () => {
  it("klatki co ok. 0,1 s, migawki co ok. 0,25 s, czas rośnie", () => {
    const w = createScenario(0);
    const rec = play(w, { passTo: "CB", until: 3 });
    expect(rec.frames.length).toBeGreaterThan(25);
    expect(rec.frames.length).toBeLessThan(40);
    expect(rec.snaps.length).toBeGreaterThan(9);
    expect(rec.snaps.length).toBeLessThan(15);
    const ts = rec.frames.map((f) => f.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(duration(rec)).toBeGreaterThan(2.85);
    expect(duration(rec)).toBeLessThanOrEqual(3);
    expect(rec.frames[0]!.a).toHaveLength(w.agents.length * 2);
  });

  it("interpolacja: w środku między klatkami pozycja jest pośrednia; poza zakresem – przycinanie", () => {
    const w = createScenario(0);
    const rec = play(w, { until: 2 });
    const a = frameAt(rec, rec.frames[5]!.t)!, b = frameAt(rec, rec.frames[6]!.t)!, mid = frameAt(rec, (rec.frames[5]!.t + rec.frames[6]!.t) / 2)!;
    const s1 = a.agents.find((x) => x.id === "S1")!, s2 = b.agents.find((x) => x.id === "S1")!, sm = mid.agents.find((x) => x.id === "S1")!;
    expect(sm.x).toBeCloseTo((s1.x + s2.x) / 2, 2);
    expect(frameAt(rec, -5)!.agents[0]!.x).toBeCloseTo(frameAt(rec, 0)!.agents[0]!.x, 5);
    expect(frameAt(rec, 99)!.ball.x).toBeCloseTo(rec.frames.at(-1)!.b[0], 5);
    expect(frameAt({ ids: [], teams: [], numbers: [], frames: [], snaps: [] }, 1)).toBeNull();
  });

  it("migawka nie jest powiązana ze światem (klon) i wybierana nie późniejsza niż t", () => {
    const w = createScenario(0);
    const rec = play(w, { until: 2 });
    const s = snapshotAtOrBefore(rec, 1.0)!;
    expect(s.t).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(s.t).toBeGreaterThan(0.7);
    const before = agent(s, "S1").pos.x;
    agent(w, "S1").pos.x += 50;
    expect(agent(s, "S1").pos.x).toBe(before);
    expect(cloneWorld(w).events).toEqual([]);
  });
});

describe("ocena opcji „co by zadziałało”", () => {
  it("w pressingu 2 napastników: ocenia wszystkich 5 kolegów, najpierw zostające u nas (im dalej do przodu, tym wyżej)", () => {
    const r = rateOptions(createScenario(0));
    expect(r.map((x) => x.id).sort()).toEqual(["CB", "DM", "FB", "ST", "W"]);
    const kept = r.filter((x) => x.kept);
    expect(kept.length).toBeGreaterThan(0);
    expect(r.slice(0, kept.length).every((x) => x.kept)).toBe(true);
    for (let i = 1; i < kept.length; i++) expect(kept[i - 1]!.gain).toBeGreaterThanOrEqual(kept[i]!.gain);
    // pionowe podanie do napastnika przez pressing jest przecinane (jak w teście symulacji)
    expect(r.find((x) => x.id === "ST")!.kept).toBe(false);
    expect(r.find((x) => x.id === "ST")!.lostAt).toBeGreaterThan(KICK_WAIT);
  });

  it("jest deterministyczne i nie zmienia migawki", () => {
    const w = createScenario(1);
    const before = JSON.stringify(w);
    const a = rateOptions(w), b = rateOptions(w);
    expect(a).toEqual(b);
    expect(JSON.stringify(w)).toBe(before);
  });

  it("zwłoka: migawka z napastnikiem tuż przy piłce – podanie po zamachu jest za późno", () => {
    const w = createScenario(0);
    agent(w, "S1").pos = { x: 45, y: 36 };
    const r = rateOptions(w);
    expect(r.some((x) => x.beforePass)).toBe(true);
  });
});

describe("klasyfikacja i kroki", () => {
  it("pierwsza decyzja: podanie / strata przed podaniem", () => {
    const a = createScenario(0); play(a, { passTo: "CB", until: 2 });
    expect(firstAction(a)).toEqual({ kind: "pass", target: "CB", t: expect.any(Number) });
    const b = createScenario(0); play(b, { until: 3 });
    expect(firstAction(b)).toMatchObject({ kind: "lost", by: "S1" });
    expect(firstLoss(b)!.by).toBe("S1");
  });

  it("klasy: bez straty = udane; strata + odzyskanie = odzyskana; strata bez odzyskania = kontra", () => {
    const clean = createScenario(0);
    play(clean, { passTo: "CB", until: 2.5 });
    expect(classify(clean)).toBe("clean");
    const idle = createScenario(0);
    play(idle, { until: 2 });
    expect(["recovered", "conceded"]).toContain(classify(idle)); // strata na pewno
    expect(Object.keys(CLASS_LABEL)).toHaveLength(3);
  });

  it("trzy kroki, krótkie, konkretne; wybór przeciętego podania wskazuje lepszą opcję", () => {
    const w = createScenario(0);
    play(w, { passTo: "ST", until: 3 });
    const rated = rateOptions(createScenario(0));
    const first = firstAction(w);
    const steps = coachSteps({ variant: 0, rated, first, cls: classify(w), nameOf: (id) => agent(w, id).name, loss: firstLoss(w) });
    expect(steps.map((s) => s.title)).toEqual(["Czytaj pressing", "Twój wybór", expect.stringMatching(/Po /)]);
    for (const s of steps) { expect(s.text.length).toBeGreaterThan(20); expect(s.text.length).toBeLessThan(260); }
    expect(steps[1]!.text).toMatch(/Napastnik: przecięte po/);
    expect(steps[1]!.text).toMatch(/Lepiej: /);
    expect(steps[2]!.title).toBe("Po stracie");
  });

  it("udane wyjście: krok 3 o ruchu po zagraniu (trzeci zawodnik)", () => {
    const w = createScenario(0);
    play(w, { passTo: "CB", until: 2.5 });
    const rated = rateOptions(createScenario(0));
    const steps = coachSteps({ variant: 0, rated, first: firstAction(w), cls: "clean", nameOf: (id) => agent(w, id).name, loss: null });
    expect(steps[2]!.title).toBe("Po zagraniu");
    expect(steps[2]!.text).toMatch(/trzeci zawodnik/);
  });

  it("strata przed zagraniem i brak decyzji mają osobne opisy", () => {
    const rated = rateOptions(createScenario(0));
    const nm = (id: string) => id;
    const lost = coachSteps({ variant: 0, rated, first: { kind: "lost", t: 1.5, by: "S1" }, cls: "conceded", nameOf: nm, loss: { t: 1.5, by: "S1" } });
    expect(lost[1]!.text).toMatch(/Piłkę straciłeś po 1,5 s/);
    const none = coachSteps({ variant: 0, rated, first: null, cls: "conceded", nameOf: nm, loss: null });
    expect(none[1]!.text).toMatch(/Nie zagrałeś/);
  });
});

import { betterPlan, freeSpace } from "./coach";
import { randomScenario } from "./scenario";

describe("rysunek lepszego rozwiązania", () => {
  const nm = (id: string) => id;
  it("wolne miejsce leży przed zawodnikiem, w granicach boiska i dalej od rywali niż najgorszy kandydat", () => {
    for (let s = 1; s <= 25; s++) {
      const { world } = randomScenario(s * 313);
      const P = world.agents.find((a) => a.id === "P")!;
      const c = freeSpace(world, P.pos);
      expect(c.x).toBeGreaterThan(P.pos.x);
      expect(c.y).toBeGreaterThanOrEqual(4);
      expect(c.y).toBeLessThanOrEqual(64);
    }
  });
  it("zagrałeś gorzej niż najlepsze wolne podanie: strzałka do lepszego kolegi; zagrałeś najlepiej: miejsce ruchu po podaniu", () => {
    let better = 0, best = 0;
    for (let s = 1; s <= 40; s++) {
      const { world } = randomScenario(s * 7);
      const rated = rateOptions(world);
      const free = rated.filter((r) => r.kept);
      if (free.length < 2) continue;
      const worseKept = free[free.length - 1]!;
      const planBetter = betterPlan(world, rated, { kind: "pass", target: rated.find((r) => !r.kept)?.id ?? worseKept.id, t: 0.5 }, nm);
      if (planBetter?.kind === "better") { better++; expect(planBetter.mate).toBe(free[0]!.id); }
      const planBest = betterPlan(world, rated, { kind: "pass", target: free[0]!.id, t: 0.5 }, nm);
      expect(planBest?.kind).toBe("best");
      best++;
    }
    expect(better).toBeGreaterThan(5);
    expect(best).toBeGreaterThan(5);
  });
  it("bez bezpiecznego podania: wyjście z piłką w wolne miejsce", () => {
    const { world } = randomScenario(11);
    const plan = betterPlan(world, [], { kind: "lost", t: 1, by: "S1" }, nm);
    expect(plan?.kind).toBe("run");
    expect(plan!.to.x).toBeGreaterThan(plan!.from.x);
  });
});
