import { beforeEach, describe, expect, it } from "vitest";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;

import { loadMatchWeeks, matchDatesAround, matchWeekdaysFor, matchWord, nextWeekReady, parseMatchWeeks, saveMatchWeek, weekToAsk } from "./matchweek";
import { planForProfile } from "./profile";
import { setScope } from "../lib/store";
import type { Profile } from "./profile";

beforeEach(() => { mem.clear(); setScope({ kind: "guest" }); });

describe("terminy meczów na tydzień", () => {
  it("odczyt odrzuca śmieci: nie-poniedziałki, dni spoza 0–6, powtórzenia i więcej niż dwa", () => {
    expect(parseMatchWeeks(null)).toEqual({});
    expect(parseMatchWeeks({ "2026-11-23": [5, 5, 2, 9, -1, 1.5, 6], "2026-11-24": [1], x: [1] })).toEqual({ "2026-11-23": [2, 5] });
    expect(parseMatchWeeks({ "2026-11-23": "x" })).toEqual({});
  });
  it("zapis i odczyt; pusta tablica to „nie mam” (odblokowuje kolejny tydzień)", () => {
    expect(nextWeekReady(loadMatchWeeks(), "2026-11-22")).toBe(false); // niedziela
    saveMatchWeek("2026-11-23", []);
    expect(loadMatchWeeks()).toEqual({ "2026-11-23": [] });
    expect(nextWeekReady(loadMatchWeeks(), "2026-11-22")).toBe(true);
    saveMatchWeek("2026-11-23", [4, 6]);
    expect(loadMatchWeeks()["2026-11-23"]).toEqual([4, 6]);
  });
  it("tydzień z wpisem ma własne dni, bez wpisu obowiązują stałe dni z profilu", () => {
    expect(matchWeekdaysFor({ "2026-11-23": [3] }, [5], "2026-11-23")).toEqual([3]);
    expect(matchWeekdaysFor({ "2026-11-23": [] }, [5], "2026-11-23")).toEqual([]);
    expect(matchWeekdaysFor({}, [5], "2026-11-23")).toEqual([5]);
    expect(matchDatesAround("2026-11-23", [5], { "2026-11-23": [2], "2026-11-30": [] })).toEqual(["2026-11-21", "2026-11-25"]);
  });
  it("etykieta: mecz w sezonie, sparing poza sezonem", () => {
    expect(matchWord("inseason")).toBe("mecz");
    expect(matchWord(undefined)).toBe("mecz");
    expect(matchWord("preseason")).toBe("sparing");
    expect(matchWord("offseason")).toBe("sparing");
  });
});

describe("kiedy pytamy o kolejny tydzień", () => {
  it("w niedzielę o kolejny tydzień; po odpowiedzi już nie", () => {
    expect(weekToAsk("2026-11-22", "2026-11-02", {})).toEqual({ weekStart: "2026-11-23", kind: "next" });
    expect(weekToAsk("2026-11-22", "2026-11-02", { "2026-11-23": [4], "2026-11-16": [4] })).toBeNull();
  });
  it("drugi tydzień planu bez wpisu: pytanie o bieżący; po odpowiedzi („nie mam” też) już nie", () => {
    expect(weekToAsk("2026-11-25", "2026-11-18", {})).toEqual({ weekStart: "2026-11-23", kind: "current" });
    expect(weekToAsk("2026-11-25", "2026-11-18", { "2026-11-23": [] })).toBeNull();
  });
  it("pierwszy tydzień planu (dni z onboardingu) nie wymaga pytania", () => {
    expect(weekToAsk("2026-11-18", "2026-11-18", {})).toBeNull();
  });
});

describe("plan używa terminu wpisanego na tydzień", () => {
  const profile = { age: 18, strengthYears: 2, weightKg: 75, position: "pomocnik", season: "inseason", equipment: ["gym"], clubWeekdays: [], matchWeekdays: [5], offWeekdays: [], limitedGymAccess: false, startDate: "2026-09-01" } as unknown as Profile;
  it("mecz w dniu z wpisu, a nie ze stałych dni; „nie mam” usuwa mecz z tygodnia", () => {
    const adj = { skippedDays: [], matchWeeks: { "2026-11-23": [2] } };
    const days = planForProfile(profile, "2026-11-23", adj).days;
    expect(days.find((d) => d.isMatch)?.date).toBe("2026-11-25");
    expect(planForProfile(profile, "2026-11-23", { skippedDays: [], matchWeeks: { "2026-11-23": [] } }).days.some((d) => d.isMatch)).toBe(false);
    expect(planForProfile(profile, "2026-11-23", { skippedDays: [] }).days.find((d) => d.isMatch)?.date).toBe("2026-11-28"); // bez wpisu: stały dzień 5 (sobota)
  });
});
