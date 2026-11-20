import { describe, expect, it } from "vitest";
import { loadSaved } from "./Stimuli";
import { loadDraw } from "./Draw";
import { DEFAULT_OPTS } from "../engine/stimuli";

describe("zapamiętane ustawienia Bodźców", () => {
  it("brak lub uszkodzony zapis daje ustawienia domyślne", () => {
    for (const bad of [null, "", "{", "null", "5", "[]"]) expect(loadSaved(bad).opts, String(bad)).toEqual(DEFAULT_OPTS);
  });
  it("poprawny zapis wraca bez zmian", () => {
    const r = loadSaved(JSON.stringify({ opts: { ...DEFAULT_OPTS, kinds: ["number"], maxNumber: 5, durationS: 120, dirs: 4, colors: 3 }, pace: "fast", sound: false, vibe: false }));
    expect(r).toMatchObject({ opts: { kinds: ["number"], maxNumber: 5, durationS: 120, dirs: 4, colors: 3 }, pace: "fast", sound: false, vibe: false });
  });
  it("błędne pola wracają do domyślnych, reszta zostaje", () => {
    const r = loadSaved(JSON.stringify({ opts: { kinds: ["ufo"], maxNumber: 99, durationS: 7, dirs: 3, colors: "x" }, pace: "warp", sound: "tak" }));
    expect(r.opts).toEqual(DEFAULT_OPTS);
    expect(r.pace).toBe("medium");
    expect(r.sound).toBe(true);
    expect(loadSaved(JSON.stringify({ opts: { kinds: ["arrow", "ufo"], durationS: 300 } })).opts).toMatchObject({ kinds: ["arrow"], durationS: 300 });
  });
});

describe("zapamiętane Losowanie", () => {
  it("wraca ostatni rodzaj i liczba, błędne dane dają domyślne", () => {
    expect(loadDraw(JSON.stringify({ kind: "number", n: 5 }))).toEqual({ kind: "number", n: 5 });
    expect(loadDraw(JSON.stringify({ kind: "dir", n: 4 }))).toEqual({ kind: "dir", n: 4 });
    expect(loadDraw(JSON.stringify({ kind: "ufo", n: 9 }))).toEqual({ kind: "color", n: 4 });
    expect(loadDraw(JSON.stringify({ kind: "number", n: 99 }))).toEqual({ kind: "number", n: 6 });
    expect(loadDraw(null)).toEqual({ kind: "color", n: 4 });
    expect(loadDraw("{")).toEqual({ kind: "color", n: 4 });
  });
});
