import { describe, expect, it } from "vitest";
import { SCENARIO_RUN_IN_BEHIND as S, compare, evaluate, matePos, offsideLine, snapshotAt } from "./iq";

const at = (t: number) => snapshotAt(S, t, S.player);

describe("IQ: bieg za linię obrony", () => {
  it("napastnik stoi do czasu startu, potem biegnie do celu", () => {
    const a = S.mates[0]!;
    expect(matePos(a, 0)).toEqual(a.start);
    expect(matePos(a, 100).x).toBeCloseTo(a.end.x, 5);
    expect(matePos(a, 2).x).toBeGreaterThan(a.start.x);
  });
  it("linia spalonego to przedostatni obrońca (bramkarz jest ostatni)", () => {
    expect(offsideLine(at(0))).toBe(90);
  });
  it("w oknie biegu (t≈2 s) najlepsze jest podanie do napastnika za linię", () => {
    const top = evaluate(at(2))[0]!;
    expect(top.targetId).toBe("A");
    expect(top.offside).toBe(false);
  });
  it("za późno (t≈3,5 s) napastnik jest na spalonym i podanie jest błędem", () => {
    const o = evaluate(at(3.5)).find((x) => x.targetId === "A")!;
    expect(o.offside).toBe(true);
    const v = compare(at(3.5), { kind: "pass", targetId: "A" });
    expect(v.verdict).toBe("poor");
    expect(v.best.targetId).not.toBe("A");
    expect(v.summary).toContain("spalonym");
  });
  it("strzał z 39 m nie jest najlepszą opcją", () => {
    expect(evaluate(at(2))[0]!.kind).toBe("pass");
    expect(compare(at(2), { kind: "shot" }).verdict).not.toBe("best");
  });
  it("najlepszy wybór dostaje wyróżnienie", () => {
    expect(compare(at(2), { kind: "pass", targetId: "A" }).verdict).toBe("best");
  });
});
