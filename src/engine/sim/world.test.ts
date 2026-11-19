import { describe, expect, it } from "vitest";
import { VARIANTS, createScenario } from "./scenario";
import { FIELD_H, FIELD_W } from "./types";
import type { World } from "./types";
import { headline, keyMoments } from "./summary";
import { agent, offsideX, owner, pass, possession, rand, setUser, shoot, step, wouldBeIntercepted } from "./world";

const DT = 1 / 60;

/** Odtwarza przebieg: opcjonalne podanie użytkownika po `at` s; zwraca świat po zakończeniu. */
function run(w: World, opts: { passTo?: string; at?: number; until?: number; chase?: boolean } = {}): World {
  let done = false;
  const until = opts.until ?? w.limit;
  while (w.t < until && !w.outcome) {
    if (opts.passTo && !done && w.t >= (opts.at ?? 0.3)) { pass(w, "P", opts.passTo); done = true; }
    if (opts.chase) chase(w);
    step(w, DT);
  }
  return w;
}

/** Użytkownik biegnie do posiadacza piłki (rywala) z prędkością 6,5 m/s. */
function chase(w: World): void {
  const o = owner(w), p = agent(w, "P");
  if (!o || o.team === "us") return;
  const dx = o.pos.x - p.pos.x, dy = o.pos.y - p.pos.y, d = Math.hypot(dx, dy) || 1;
  const v = Math.min(6.5, d / DT);
  setUser(w, { x: p.pos.x + (dx / d) * v * DT, y: p.pos.y + (dy / d) * v * DT }, Math.atan2(dy, dx), v);
}

const types = (w: World) => w.events.map((e) => e.type);

describe("scenariusz", () => {
  it("ma 7 naszych i 10 rywali, piłka przy użytkowniku, wszyscy na boisku", () => {
    const w = createScenario();
    expect(w.agents.filter((a) => a.team === "us")).toHaveLength(7);
    expect(w.agents.filter((a) => a.team === "them")).toHaveLength(10);
    expect(w.ball.owner).toBe("P");
    expect(w.user).toBe("P");
    for (const a of w.agents) {
      expect(a.pos.x).toBeGreaterThan(0); expect(a.pos.x).toBeLessThan(FIELD_W);
      expect(a.pos.y).toBeGreaterThan(0); expect(a.pos.y).toBeLessThan(FIELD_H);
    }
  });

  it("warianty różnią się ustawieniem rywala", () => {
    const x = (v: 0 | 1 | 2) => agent(createScenario(v), "D2").pos.x;
    expect(VARIANTS).toHaveLength(3);
    expect(x(1)).toBeGreaterThan(x(0));
    expect(x(2)).toBeLessThan(x(0));
  });

  it("linia spalonego to przedostatni rywal (bramkarz liczony)", () => {
    const w = createScenario(0);
    expect(offsideX(w, "us")).toBe(agent(w, "D2").pos.x);
    expect(offsideX(w, "them")).toBeLessThan(40);
  });
});

describe("generator losowy", () => {
  it("jest deterministyczny i mieści się w [0,1)", () => {
    const a = createScenario(0, 7), b = createScenario(0, 7);
    const xs = Array.from({ length: 50 }, () => rand(a));
    const ys = Array.from({ length: 50 }, () => rand(b));
    expect(xs).toEqual(ys);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(new Set(xs).size).toBeGreaterThan(45);
  });
});

describe("pressing i odbiór", () => {
  it("stojący z piłką traci ją po kilku sekundach (napastnik doskakuje)", () => {
    const w = run(createScenario(0));
    const tackle = w.events.find((e) => e.type === "tackle");
    expect(tackle).toBeDefined();
    expect(tackle!.by).toBe("S1");
    expect(tackle!.to).toBe("P");
    expect(tackle!.t).toBeGreaterThan(0.8);
    expect(tackle!.t).toBeLessThan(3);
    expect(types(w)).toContain("counter");
  });

  it("po odbiorze nie można od razu odebrać piłki z powrotem (osłona)", () => {
    const w = createScenario(0);
    run(w, { until: 1.7 });
    const tk = w.events.find((e) => e.type === "turnover")!;
    expect(tk).toBeDefined();
    run(w, { until: tk.t + 0.9, chase: true });
    expect(w.outcome).toBeNull();
    expect(owner(w)?.team).toBe("them");
  });

  it("użytkownik może odebrać piłkę z powrotem, gdy goni (po osłonie)", () => {
    const w = run(createScenario(0), { until: 8, chase: true });
    const lost = w.events.some((e) => e.type === "turnover");
    expect(lost).toBe(true);
    expect(w.events.some((e) => e.type === "tackle" && e.by === "P") || w.events.some((e) => e.type === "regain")).toBe(true);
  });
});

describe("podania", () => {
  it("cofnięcie do stopera dochodzi i stoper przyjmuje piłkę", () => {
    const w = run(createScenario(0), { passTo: "CB", until: 2 });
    expect(types(w).slice(0, 2)).toEqual(["pass", "control"]);
    expect(w.events[1]!.by).toBe("CB");
    expect(possession(w)).toBe("us");
  });

  it("zagranie pionowe przez pressing do napastnika jest przechwycone przez obrońcę", () => {
    const w = run(createScenario(0), { passTo: "ST", until: 3 });
    const ic = w.events.find((e) => e.type === "intercept");
    expect(ic).toBeDefined();
    expect(agent(w, ic!.by!).team).toBe("them");
    expect(types(w)).toContain("counter");
  });

  it("model przechwytu: obrońca na torze → przechwyt, wolny tor → nie", () => {
    const w = createScenario(0);
    const p = agent(w, "P").pos, st = agent(w, "ST").pos;
    expect(wouldBeIntercepted(w, p, agent(w, "CB"), "us")).toBe(false);
    agent(w, "M2").pos = { x: (p.x + st.x) / 2, y: (p.y + st.y) / 2 }; // obrońca stoi na torze
    expect(wouldBeIntercepted(w, p, agent(w, "ST"), "us")).toBe(true);
  });

  it("podanie jest możliwe tylko dla posiadacza", () => {
    const w = createScenario(0);
    expect(pass(w, "CB", "P")).toBe(false);
    expect(pass(w, "P", "CB")).toBe(true);
    expect(pass(w, "P", "DM")).toBe(false); // piłka już w locie
  });
});

describe("strzał", () => {
  it("kończy akcję wynikiem zależnym od ziarna (gol / obrona / pudło)", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = createScenario(0, seed);
      const P = agent(w, "P");
      P.pos = { x: 96, y: 34 };
      w.ball.pos = { x: 96.6, y: 34 };
      expect(shoot(w, "P")).toBe(true);
      run(w);
      expect(w.outcome).not.toBeNull();
      kinds.add(w.outcome!.kind);
    }
    expect([...kinds].every((k) => ["goal_for", "saved_for", "miss_for"].includes(k))).toBe(true);
    expect(kinds.has("goal_for")).toBe(true);
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("ten sam seed daje ten sam wynik", () => {
    const go = (seed: number) => {
      const w = createScenario(0, seed);
      agent(w, "P").pos = { x: 96, y: 34 };
      shoot(w, "P");
      return run(w).outcome!.kind;
    };
    expect(go(5)).toBe(go(5));
  });
});

describe("kontratak", () => {
  it("po stracie rywale kończą akcję strzałem lub czas się kończy; wynik zawsze jest", () => {
    const w = run(createScenario(0));
    expect(w.outcome).not.toBeNull();
    expect(["goal_against", "saved_against", "miss_against", "regain", "timeout"]).toContain(w.outcome!.kind);
  });

  it("symulacja jest deterministyczna i nie wychodzi poza boisko", () => {
    const a = run(createScenario(1, 3), { passTo: "ST" });
    const b = run(createScenario(1, 3), { passTo: "ST" });
    expect(a.events).toEqual(b.events);
    expect(a.outcome).toEqual(b.outcome);
    for (const ag of a.agents) {
      expect(Number.isFinite(ag.pos.x) && Number.isFinite(ag.pos.y)).toBe(true);
      expect(ag.pos.x).toBeGreaterThanOrEqual(0); expect(ag.pos.x).toBeLessThanOrEqual(FIELD_W);
      expect(ag.pos.y).toBeGreaterThanOrEqual(0); expect(ag.pos.y).toBeLessThanOrEqual(FIELD_H);
    }
  });

  it("prędkość zawodników nie przekracza ich limitu", () => {
    const w = createScenario(0);
    let max = 0;
    while (w.t < 8 && !w.outcome) {
      step(w, DT);
      for (const a of w.agents) if (a.id !== "P") max = Math.max(max, Math.hypot(a.vel.x, a.vel.y) / a.vmax);
    }
    expect(max).toBeLessThan(1.02);
  });
});

describe("podsumowanie akcji", () => {
  it("nagłówki mają odpowiedni ton", () => {
    expect(headline("goal_for").tone).toBe("good");
    expect(headline("regain").tone).toBe("good");
    expect(headline("goal_against").tone).toBe("bad");
    expect(headline("timeout").tone).toBe("neutral");
  });

  it("momenty: strata → kontra, w kolejności czasu, nie więcej niż 5", () => {
    const w = run(createScenario(0));
    const m = keyMoments(w);
    expect(m.length).toBeGreaterThan(1);
    expect(m.length).toBeLessThanOrEqual(5);
    expect(m[0]).toMatch(/odbiera piłkę/);
    expect(m.join("\n")).toMatch(/Kontratak rywala/);
    const times = m.map((l) => parseFloat(l.replace(",", ".")));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("podanie użytkownika opisane jako „Podanie do: …”", () => {
    const w = run(createScenario(0), { passTo: "CB", until: 2 });
    expect(keyMoments(w)[0]).toBe("0,3 s – Podanie do: Stoper");
  });
});
