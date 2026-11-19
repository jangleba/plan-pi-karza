import { describe, expect, it } from "vitest";
import { isColdSeason, matchBag } from "./bag";
import { buildDayPlan } from "./mealplan";

const plan = (time = "15:00") => buildDayPlan({ day: "match", weightKg: 75, goal: "maintain", activities: [{ kind: "match", time }] });

describe("torba meczowa", () => {
  it("ma sprzęt, jedzenie i picie oraz drobiazgi; identyfikatory unikalne", () => {
    const g = matchBag(plan(), "2026-06-13");
    expect(g.map((x) => x.title)).toEqual(["Sprzęt", "Jedzenie i picie", "Drobiazgi"]);
    const ids = g.flatMap((x) => x.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["boots", "kit", "shin", "water"]));
  });

  it("jedzenie bierze się z posiłków planu: napój/żel/banan z przerwy i coś po meczu, tylko rzeczy do zabrania", () => {
    const food = matchBag(plan(), "2026-06-13")[1]!.items;
    expect(food.some((i) => i.id.startsWith("during-"))).toBe(true);
    expect(food.some((i) => i.id.startsWith("post"))).toBe(true);
    const notPortable = ["chicken", "rice-dry", "potato", "cod", "oats", "milk"];
    for (const n of notPortable) expect(food.some((i) => i.id.endsWith(`-${n}`))).toBe(false);
    for (const i of food) expect(i.label.length).toBeGreaterThan(2);
  });

  it("woda to ok. 30% dziennej puli", () => {
    const p = plan();
    const w = matchBag(p, "2026-06-13")[1]!.items.find((i) => i.id === "water")!;
    expect(w.note).toBe(`ok. ${String(Math.round(p.hydrationMl * 0.3 / 100) / 10).replace(".", ",")} l`);
  });

  it("zimą ciepłe rzeczy, latem krem z filtrem", () => {
    expect(isColdSeason("2026-11-21")).toBe(true);
    expect(isColdSeason("2026-07-10")).toBe(false);
    const ids = (d: string) => matchBag(plan(), d)[2]!.items.map((i) => i.id);
    expect(ids("2026-12-05")).toContain("warm");
    expect(ids("2026-07-10")).toContain("sun");
    expect(ids("2026-07-10")).not.toContain("warm");
  });

  it("bez posiłków wokół meczu zostają ogólne pozycje zamiast pustej listy", () => {
    const empty = { slots: [], carbTotal: 0, proteinTotal: 0, fatTotal: 0, sessions: 0, hydrationMl: 3000 };
    const food = matchBag(empty, "2026-11-21")[1]!.items.map((i) => i.id);
    expect(food).toEqual(expect.arrayContaining(["water", "during-carb", "post-snack"]));
  });
});
