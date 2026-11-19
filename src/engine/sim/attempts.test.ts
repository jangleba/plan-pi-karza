import { describe, expect, it } from "vitest";
import { attemptStats, mistakeLabel, type Attempt } from "./attempts";

const nm = (id: string) => ({ ST: "Napastnik", CB: "Stoper" }[id] ?? id);
const at = (variant: number, cls: Attempt["cls"], first: Attempt["first"] = null): Attempt => ({ date: "2026-11-19", variant, cls, first, lossAt: cls === "clean" ? null : 1.5 });

describe("statystyki prób", () => {
  it("brak prób → null", () => expect(attemptStats([], nm)).toBeNull());

  it("liczby, procent udanych, ostatnie 5, podział na warianty", () => {
    const all = [at(0, "conceded"), at(0, "conceded"), at(1, "recovered"), at(1, "clean"), at(2, "clean"), at(0, "clean")];
    const s = attemptStats(all, nm)!;
    expect(s).toMatchObject({ total: 6, clean: 3, recovered: 1, conceded: 2, cleanPct: 50 });
    expect(s.lastPct).toBe(60); // ostatnie 5: recovered, clean, clean, clean + conceded? = 3 z 5
    expect(s.byVariant).toEqual([{ variant: 0, total: 3, clean: 1 }, { variant: 1, total: 2, clean: 1 }, { variant: 2, total: 1, clean: 1 }]);
  });

  it("ostatnie 5 dopiero od 3 prób", () => {
    expect(attemptStats([at(0, "clean"), at(0, "clean")], nm)!.lastPct).toBeNull();
  });

  it("najczęstszy błąd dopiero od 2 powtórzeń; opisy pierwszych decyzji", () => {
    const st = { kind: "pass", target: "ST", t: 0.8 } as const;
    const s = attemptStats([at(0, "conceded", st), at(0, "conceded", st), at(0, "conceded", { kind: "lost", t: 1.5, by: "S1" })], nm)!;
    expect(s.mistake).toEqual({ text: "podanie do: Napastnik", count: 2 });
    expect(attemptStats([at(0, "conceded", st), at(0, "conceded", { kind: "lost", t: 1.5, by: "S1" })], nm)!.mistake).toBeNull();
    expect(mistakeLabel(at(0, "conceded"), nm)).toMatch(/brak decyzji/);
    expect(mistakeLabel(at(0, "conceded", { kind: "shot", t: 1 }), nm)).toMatch(/strzał/);
    expect(mistakeLabel(at(0, "conceded", { kind: "lost", t: 1, by: "S1" }), nm)).toMatch(/za długo/);
  });
});
