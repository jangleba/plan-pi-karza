import { describe, expect, it } from "vitest";
import { BOOTS, BUILDS, DEFAULT_LOOK, HAIR_COLORS, HAIR_STYLES, HEIGHTS, SKINS, TEAM_COLORS, opponentKit, sanitizeLook } from "./look";

describe("wygląd własnego zawodnika", () => {
  it("brak lub uszkodzone dane dają wygląd domyślny", () => {
    for (const bad of [null, undefined, 5, "x", [], {}]) expect(sanitizeLook(bad), String(bad)).toEqual(DEFAULT_LOOK);
  });
  it("poprawne dane wracają bez zmian", () => {
    const l = { skin: 4, hairStyle: 5, hairColor: 6, build: 2, height: 0, number: 27, teamColor: 3, boots: 5 };
    expect(sanitizeLook(l)).toEqual(l);
  });
  it("błędne pola wracają do domyślnych, reszta zostaje", () => {
    const r = sanitizeLook({ skin: 99, hairStyle: -1, hairColor: 1.5, build: "x", height: 2, number: 100, teamColor: 4, boots: null });
    expect(r).toEqual({ ...DEFAULT_LOOK, height: 2, teamColor: 4 });
    expect(sanitizeLook({ number: 0 }).number).toBe(8);
    expect(sanitizeLook({ number: 99 }).number).toBe(99);
    expect(sanitizeLook({ number: 12.5 }).number).toBe(8);
  });
  it("palety mają sensowne rozmiary, a domyślne indeksy istnieją", () => {
    expect(SKINS.length).toBeGreaterThanOrEqual(6);
    expect(HAIR_STYLES.length).toBe(6);
    expect(BUILDS.length).toBe(3);
    expect(HEIGHTS.length).toBe(3);
    for (const [k, n] of [["skin", SKINS.length], ["hairColor", HAIR_COLORS.length], ["boots", BOOTS.length], ["teamColor", TEAM_COLORS.length]] as const) expect(DEFAULT_LOOK[k]).toBeLessThan(n);
    for (const [, f] of [...BUILDS, ...HEIGHTS]) expect(f).toBeGreaterThan(0.9);
  });
  it("strój rywali zawsze różni się od naszego", () => {
    TEAM_COLORS.forEach((t, i) => expect(opponentKit(i).jersey, t.name).not.toBe(t.jersey));
  });
});
