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
  const good = { recovery: 3, feeling: 3, less: false } as const;
  it("klasyfikuje obciążenie", () => {
    expect(strainOf(good)).toBe("none");
    expect(strainOf({ ...good, less: true })).toBe("light");
    expect(strainOf({ recovery: 1, feeling: 1, less: false })).toBe("heavy");
  });
  it("dobry check-in nie zmienia sesji", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const a = adaptSession(t, good);
    expect(a.blocks).toEqual(t.blocks);
    expect(a.notes).toEqual([]);
  });
  it("mocne zmęczenie: mniej serii, lżejsze ćwiczenia, krótsza sesja", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const a = adaptSession(t, { recovery: 1, feeling: 1, less: false });
    expect(a.blocks.length).toBeLessThan(t.blocks.length);
    const ids = a.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids).not.toContain("hang-power-clean");
    expect(a.notes.length).toBeGreaterThan(0);
  });
});

import { readinessScore } from "./adapt";
describe("gotowość", () => {
  it("od 40 do 100, „dziś mniej” −10", () => {
    expect(readinessScore({ recovery: 3, feeling: 3, less: false })).toBe(100);
    expect(readinessScore({ recovery: 1, feeling: 1, less: false })).toBe(40);
    expect(readinessScore({ recovery: 2, feeling: 3, less: true })).toBe(75);
  });
});

import { DEFAULT_CHECK_IN, normalizeCheckIn, restSuggested } from "./adapt";
describe("check-in: normalizacja i propozycja regeneracji", () => {
  it("zapis uszkodzony lub dawny (sleep) nie daje NaN", () => {
    expect(normalizeCheckIn(null)).toEqual(DEFAULT_CHECK_IN);
    expect(normalizeCheckIn("x")).toEqual(DEFAULT_CHECK_IN);
    expect(normalizeCheckIn({ sleep: 2, feeling: 1, less: true })).toEqual({ recovery: 2, feeling: 1, less: true });
    expect(normalizeCheckIn({ recovery: 7, feeling: "a" })).toEqual(DEFAULT_CHECK_IN);
    expect(Number.isNaN(readinessScore(normalizeCheckIn({ sleep: 4, feeling: 0 })))).toBe(false);
  });
  it("regeneracja zamiast sesji tylko przy „wyraźnie lżej” i słabej regeneracji po wczoraj", () => {
    expect(restSuggested({ recovery: 1, feeling: 1, less: false })).toBe(true);
    expect(restSuggested({ recovery: 1, feeling: 2, less: false })).toBe(true);
    expect(restSuggested({ recovery: 2, feeling: 1, less: false })).toBe(false); // wyraźnie lżej, ale regeneracja nie jest słaba
    expect(restSuggested({ recovery: 1, feeling: 3, less: false })).toBe(false); // tylko trochę lżej
    expect(restSuggested({ recovery: 3, feeling: 3, less: true })).toBe(false); // „dziś mniej” (brak czasu) nigdy nie odwołuje sesji
  });
  it("notatka o zmianie nie zakłada płci zawodnika", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const n = adaptSession(t, { recovery: 1, feeling: 1, less: false }).notes.join(" ");
    expect(n).not.toMatch(/spałeś|czujesz|zmęczony/);
    expect(n).toMatch(/słaba regeneracja/);
  });
});

import { RECOVERY, RECOVERY_LIGHT } from "./technique";
describe("regeneracja na słaby dzień", () => {
  it("krótka, bez odwołań do meczu, z ruchem, rozciąganiem i jedzeniem", () => {
    const text = [...RECOVERY_LIGHT.foundation, ...RECOVERY_LIGHT.optional].join(" ");
    expect(text).not.toMatch(/mecz/i);
    expect(text).toMatch(/spacer/);
    expect(text).toMatch(/rozciąganie/i);
    expect(text).toMatch(/posiłek/);
    expect(RECOVERY_LIGHT.minutes).toBeGreaterThan(0);
    expect(RECOVERY_LIGHT.title).not.toBe(RECOVERY.title);
  });
});

