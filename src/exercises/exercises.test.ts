import { describe, expect, it } from "vitest";
import { EXERCISES } from "../engine";
import { ANIMS, type Anim } from "./anims";
import { viewFor } from "./draw";
import { LEN, REACH_ARM, REACH_LEG, ik, solve, type Pose } from "./figure";
import { INFO, tempoParts } from "./info";
import { jointsAt, loopLength, poseAt } from "./player";

const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("opisy ćwiczeń", () => {
  it("każde ćwiczenie z biblioteki ma animację i 3 krótkie wskazówki", () => {
    for (const id of Object.keys(EXERCISES)) {
      const info = INFO[id];
      expect(info, `brak opisu: ${id}`).toBeDefined();
      if (info!.anim) expect(ANIMS[info!.anim], `brak animacji ${info!.anim} (${id})`).toBeDefined();
      expect(info!.cues).toHaveLength(3);
      for (const c of info!.cues) { expect(c.length).toBeGreaterThan(5); expect(c.length).toBeLessThanOrEqual(60); }
    }
  });

  it("nie ma opisów dla nieistniejących ćwiczeń", () => {
    for (const id of Object.keys(INFO)) expect(EXERCISES[id], id).toBeDefined();
  });

  it("tempo „4-1-x” jest wyjaśnione, brak tempa → null", () => {
    expect(tempoParts("tempo 4-1-x")).toEqual({ raw: "4-1-x", parts: ["4 s w dół", "1 s pauza", "w górę szybko"] });
    expect(tempoParts("tempo 3-1-x")!.parts[0]).toBe("3 s w dół");
    expect(tempoParts("tempo 2-0-2")!.parts).toEqual(["2 s w dół", "bez pauzy", "2 s w górę"]);
    expect(tempoParts("80–90% prędkości, uwaga na mechanikę")).toBeNull();
    expect(tempoParts(undefined)).toBeNull();
  });
});

describe("sylwetka z kresek", () => {
  it("kinematyka odwrotna zachowuje długości członów i stronę ugięcia", () => {
    const r = ik([0, 50], [20, 10], 25, 25, 1);
    expect(d([0, 50], r.mid)).toBeCloseTo(25, 5);
    expect(d(r.mid, r.end)).toBeCloseTo(25, 5);
    expect(r.mid[0]).toBeGreaterThan(10); // kolano do przodu
    expect(ik([0, 50], [20, 10], 25, 25, -1).mid[0]).toBeLessThan(10);
  });

  it("cel poza zasięgiem jest ścięty (kończyna nie rozciąga się)", () => {
    const r = ik([0, 0], [100, 0], 25, 25, 1);
    expect(d([0, 0], r.end)).toBeLessThan(50);
  });

  it("poza stojąca: nogi i tułów mają właściwe długości", () => {
    const j = solve({ hip: [0, 55], trunk: 0, ankA: [0, 6] });
    expect(d(j.hip, j.kneeA)).toBeCloseTo(LEN.thigh, 4);
    expect(d(j.kneeA, j.ankleA)).toBeCloseTo(LEN.shank, 4);
    expect(d(j.hip, j.shoulder)).toBeCloseTo(LEN.trunk, 4);
    expect(j.head[1]).toBeGreaterThan(j.shoulder[1]);
  });

  const all: Array<[string, Pose]> = Object.entries(ANIMS).flatMap(([k, a]) => (a as Anim).frames.map((f, i): [string, Pose] => [`${k}#${i}`, f[0]]));

  it("w żadnej pozie żaden staw nie wchodzi pod podłoże (± 3 jednostki)", () => {
    for (const [name, p] of all) {
      const j = solve(p);
      for (const pt of [j.kneeA, j.ankleA, j.toeA, j.kneeB, j.ankleB, j.toeB, j.hip, j.shoulder, j.head, j.wristA, j.wristB, j.elbowA, j.elbowB]) {
        expect(Number.isFinite(pt[0]) && Number.isFinite(pt[1]), name).toBe(true);
        expect(pt[1], `${name} pod podłożem`).toBeGreaterThan(-3);
      }
    }
  });

  it("nogi i ręce w każdej pozie są w zasięgu (cel nie jest ścinany o więcej niż 1,5)", () => {
    for (const [name, p] of all) {
      const j = solve(p);
      expect(d(p.hip, p.ankA), `${name} noga A`).toBeLessThanOrEqual(REACH_LEG + 1.5);
      expect(d(p.hip, p.ankB ?? p.ankA), `${name} noga B`).toBeLessThanOrEqual(REACH_LEG + 1.5);
      for (const abs of [p.absA, p.absB]) if (abs) expect(d(j.shoulder, abs), `${name} ręka`).toBeLessThanOrEqual(REACH_ARM + 1.5);
    }
  });
});

describe("pętla animacji", () => {
  it("czas pętli jest dodatni, poza w t=0 i po pełnej pętli jest ta sama", () => {
    for (const [k, a] of Object.entries(ANIMS)) {
      const T = loopLength(a as Anim);
      expect(T, k).toBeGreaterThan(0.3);
      const p0 = jointsAt(a as Anim, 0.001).j, p1 = jointsAt(a as Anim, T + 0.001).j;
      expect(d(p0.hip, p1.hip), k).toBeLessThan(0.1);
    }
  });

  it("pętla „cycle” jest ciągła (brak skoku między ostatnią a pierwszą pozą)", () => {
    for (const [k, a] of Object.entries(ANIMS)) {
      if ((a as Anim).loop !== "cycle") continue;
      const T = loopLength(a as Anim);
      const x = jointsAt(a as Anim, T - 0.01).j, y = jointsAt(a as Anim, T + 0.01).j;
      expect(d(x.hip, y.hip), k).toBeLessThan(3);
    }
  });

  it("pętla „fade” znika i wraca (przezroczystość spada do 0 i rośnie do 1)", () => {
    for (const [k, a] of Object.entries(ANIMS)) {
      if ((a as Anim).loop !== "fade") continue;
      const T = loopLength(a as Anim);
      const alphas = Array.from({ length: 200 }, (_, i) => poseAt(a as Anim, (T * i) / 200).alpha);
      expect(Math.min(...alphas), k).toBeLessThan(0.15);
      expect(Math.max(...alphas), k).toBe(1);
    }
  });

  it("kadr ma proporcje 4:3 i obejmuje całą głowę w każdej pozie", () => {
    for (const [k, a] of Object.entries(ANIMS)) {
      const v = viewFor(a as Anim);
      expect(v.box[2] / v.box[3], k).toBeCloseTo(4 / 3, 5);
      for (const f of (a as Anim).frames) {
        const j = solve(f[0]);
        expect(-j.head[1] - LEN.head, k).toBeGreaterThanOrEqual(v.box[1] - 0.01);
        expect(j.head[0], k).toBeGreaterThan(v.box[0]);
        expect(j.head[0], k).toBeLessThan(v.box[0] + v.box[2]);
      }
    }
  });
});
