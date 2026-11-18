import { describe, expect, it } from "vitest";
import { EXERCISES, TEMPLATES, mesoPhase, templateFor } from "./library";
import { adaptSession, strainOf } from "./adapt";

describe("biblioteka", () => {
  it("każdy szablon i zamiennik wskazuje istniejące ćwiczenie", () => {
    for (const t of TEMPLATES)
      for (const b of t.blocks) for (const i of b.items) expect(EXERCISES[i.exerciseId], i.exerciseId).toBeDefined();
    for (const e of Object.values(EXERCISES))
      for (const s of e.substitutes) expect(EXERCISES[s], `${e.id} -> ${s}`).toBeDefined();
  });
  it("zamienniki mają ten sam wzorzec ruchu lub pokrewny (nie wskazują siebie)", () => {
    for (const e of Object.values(EXERCISES)) expect(e.substitutes).not.toContain(e.id);
  });
  it("cykl 5 tygodni: objętość, intensywność, rozładowanie", () => {
    expect([1, 2, 3, 4, 5, 6].map(mesoPhase)).toEqual(["volume", "volume", "intensity", "intensity", "deload", "volume"]);
    expect(templateFor("strength", 3)?.template.id).toBe("strength-intensity");
    expect(templateFor("strength", 1)?.template.id).toBe("strength-volume");
    expect(templateFor("strength", 5)?.deload).toBe(true);
  });
});

describe("check-in", () => {
  const good = { sleep: 3, feeling: 3, less: false } as const;
  it("klasyfikuje obciążenie", () => {
    expect(strainOf(good)).toBe("none");
    expect(strainOf({ ...good, less: true })).toBe("light");
    expect(strainOf({ sleep: 1, feeling: 1, less: false })).toBe("heavy");
  });
  it("dobry check-in nie zmienia sesji", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const a = adaptSession(t, good);
    expect(a.blocks).toEqual(t.blocks);
    expect(a.notes).toEqual([]);
  });
  it("mocne zmęczenie: mniej serii, lżejsze ćwiczenia, krótsza sesja", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const a = adaptSession(t, { sleep: 1, feeling: 1, less: false });
    expect(a.blocks.length).toBeLessThan(t.blocks.length);
    const ids = a.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids).not.toContain("hang-power-clean");
    expect(a.notes.length).toBeGreaterThan(0);
  });
});
