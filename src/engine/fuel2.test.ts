import { describe, expect, it } from "vitest";
import { FOODS, FOOD_BY_ID, amountText, macrosOf, norm, plural, searchLocal } from "./foods";
import { IDEAS, buildDayPlan, fmtTime, hydrationMl, ideasFor, scaleIdea, shoppingList, toMin } from "./mealplan";
import { dailyTargets } from "./fuel";

describe("baza produktów", () => {
  it("identyfikatory są unikalne, wartości sensowne", () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      expect(f.carb100, f.id).toBeGreaterThanOrEqual(0);
      expect(f.protein100, f.id).toBeGreaterThanOrEqual(0);
      expect(f.carb100 + f.protein100, f.id).toBeLessThanOrEqual(100);
      if (f.unit) expect(f.unit.g, f.id).toBeGreaterThan(0);
    }
  });

  it("wyszukiwanie ignoruje polskie znaki i znajduje po synonimach", () => {
    expect(norm("Łosoś Żółć")).toBe("losos zolc");
    expect(searchLocal("ryz")[0]!.id).toMatch(/^rice/);
    expect(searchLocal("kurczak")[0]!.id).toBe("chicken");
    expect(searchLocal("jaja")[0]!.id).toBe("egg");
    expect(searchLocal("losos")[0]!.id).toBe("salmon");
    expect(searchLocal("xyzxyz")).toEqual([]);
    expect(searchLocal("")).toEqual([]);
  });

  it("makroskładniki z gramów i ilość tekstem", () => {
    expect(macrosOf(FOOD_BY_ID["egg"]!, 110)).toEqual({ carb: 0.8, protein: 13.8 });
    expect(amountText(FOOD_BY_ID["egg"]!, 110)).toBe("2 szt.");
    expect(amountText(FOOD_BY_ID["rice-dry"]!, 90)).toBe("90 g");
    expect(amountText(FOOD_BY_ID["milk"]!, 250)).toBe("1 szklanka");
    expect(amountText(FOOD_BY_ID["milk"]!, 120)).toBe("120 ml");
  });

  it("polska odmiana liczebników", () => {
    const k = FOOD_BY_ID["bread-rye"]!.unit!;
    expect([1, 2, 4, 5, 12, 22, 25].map((n) => plural(n, k))).toEqual(["kromka", "kromki", "kromki", "kromek", "kromek", "kromki", "kromek"]);
  });
});

describe("plan dnia", () => {
  const kg = 75;
  const total = (p: ReturnType<typeof buildDayPlan>) => p.slots.reduce((s, x) => s + x.carb, 0);
  const mid = (day: Parameters<typeof dailyTargets>[1]) => { const t = dailyTargets(kg, day, "maintain"); return (t.carbG[0] + t.carbG[1]) / 2; };

  it("godziny: konwersja w obie strony", () => {
    expect(toMin("08:30")).toBe(510);
    expect(fmtTime(510)).toBe("08:30");
    expect(fmtTime(-30)).toBe("23:30");
    expect(fmtTime(1470)).toBe("00:30");
  });

  it("nawodnienie rośnie w dniu meczu i treningu", () => {
    expect(hydrationMl(75, "light")).toBe(2300);
    expect(hydrationMl(75, "training")).toBeGreaterThan(hydrationMl(75, "light"));
    expect(hydrationMl(75, "match")).toBeGreaterThan(hydrationMl(75, "training"));
  });

  it("dzień lekki: 4 posiłki w kolejności, suma węglowodanów ≈ cel", () => {
    const p = buildDayPlan({ day: "light", weightKg: kg, goal: "maintain", activity: null });
    expect(p.slots.map((s) => s.id)).toEqual(["breakfast", "lunch", "snack", "dinner"]);
    expect(Math.abs(total(p) - mid("light"))).toBeLessThan(mid("light") * 0.08);
    expect(Math.abs(p.proteinTotal - 135)).toBeLessThan(15);
  });

  it("dzień przed meczem: 5 posiłków, cel 6–8 g/kg", () => {
    const p = buildDayPlan({ day: "pre-match", weightKg: kg, goal: "maintain", activity: null });
    expect(p.slots).toHaveLength(5);
    expect(total(p) / kg).toBeGreaterThanOrEqual(6);
    expect(total(p) / kg).toBeLessThanOrEqual(8);
  });

  it("mecz o 15:00: duży posiłek 3,5 h przed (UEFA, ≥ 2 g/kg), 45 g w trakcie, po meczu ≥ 1 g/kg", () => {
    const p = buildDayPlan({ day: "match", weightKg: kg, goal: "maintain", activity: { kind: "match", time: "15:00" } });
    const by = Object.fromEntries(p.slots.map((s) => [s.id, s]));
    expect(fmtTime(by["pre-main"]!.at)).toBe("11:30");
    expect(by["pre-main"]!.uefa).toBe(true);
    expect(by["pre-main"]!.carb).toBeGreaterThanOrEqual(2 * kg - 3);
    expect(by["during"]!.carb).toBe(45);
    expect(by["post"]!.carb).toBeGreaterThanOrEqual(kg - 3);
    expect(fmtTime(by["post"]!.at)).toBe("17:00");
    // posiłki w kolejności i nie ściśnięte
    const times = p.slots.map((s) => s.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(60);
    expect(total(p) / kg).toBeGreaterThanOrEqual(6);
    expect(total(p) / kg).toBeLessThanOrEqual(8.2);
  });

  it("trening wieczorem: obiad przesunięty przed posiłkiem przedtreningowym, kolacja wchłonięta przez „po treningu”", () => {
    const p = buildDayPlan({ day: "training", weightKg: kg, goal: "maintain", activity: { kind: "session", time: "18:00" } });
    const by = Object.fromEntries(p.slots.map((s) => [s.id, s]));
    expect(by["dinner"]).toBeUndefined();
    expect(by["pre-main"]!.at - by["lunch"]!.at).toBeGreaterThanOrEqual(150);
    expect(by["post"]!.carb).toBeGreaterThan(1.5 * kg);
    expect(by["pre-main"]!.uefa).toBe(false); // dla sesji to podział orientacyjny
  });

  it("trening rano: śniadanie = posiłek przedtreningowy, reszta dnia ma normalne posiłki", () => {
    const p = buildDayPlan({ day: "training", weightKg: kg, goal: "maintain", activity: { kind: "session", time: "10:00" } });
    expect(p.slots[0]!.id).toBe("pre-main");
    expect(p.slots.some((s) => s.id === "breakfast")).toBe(false);
    expect(p.slots.some((s) => s.id === "dinner")).toBe(true);
  });

  it("identyfikatory unikalne, warianty rosną w obrębie rodzaju posiłku", () => {
    for (const [day, activity] of [["training", { kind: "session", time: "18:00" }], ["match", { kind: "match", time: "12:00" }], ["light", null]] as const) {
      const p = buildDayPlan({ day, weightKg: 68, goal: "gain", activity });
      expect(new Set(p.slots.map((s) => s.id)).size).toBe(p.slots.length);
      const byPool: Record<string, number[]> = {};
      for (const s of p.slots) (byPool[s.pool] ??= []).push(s.variant);
      for (const v of Object.values(byPool)) expect(v).toEqual(v.map((_, i) => i));
    }
  });

  it("cel „masa” podnosi cele białka i węglowodanów względem „utrzymania”", () => {
    const a = buildDayPlan({ day: "training", weightKg: kg, goal: "maintain", activity: { kind: "session", time: "17:00" } });
    const b = buildDayPlan({ day: "training", weightKg: kg, goal: "gain", activity: { kind: "session", time: "17:00" } });
    expect(b.proteinTotal).toBeGreaterThanOrEqual(a.proteinTotal);
    expect(b.carbTotal).toBeGreaterThan(a.carbTotal);
  });
});

describe("przykładowe posiłki", () => {
  const slot = { id: "lunch", at: 780, title: "Obiad", pool: "main" as const, carb: 100, protein: 35, uefa: false, variant: 0 };

  it("każdy pomysł trafia w cel węglowodanów (±20%) i białka (±25%), gdy cel mieści się w porcjach", () => {
    for (const idea of IDEAS.main) {
      const s = scaleIdea(idea, 100, 35);
      expect(s.carb, idea.id).toBeGreaterThanOrEqual(80);
      expect(s.carb, idea.id).toBeLessThanOrEqual(120);
      expect(s.protein, idea.id).toBeGreaterThanOrEqual(26);
      expect(s.protein, idea.id).toBeLessThanOrEqual(45);
    }
  });

  it("sztuki są całkowite, gramy dodatnie, suma makro zgadza się z liniami", () => {
    for (const pool of Object.keys(IDEAS) as Array<keyof typeof IDEAS>) {
      for (const idea of IDEAS[pool]) {
        const s = scaleIdea(idea, 80, 25, pool !== "during");
        for (const l of s.lines) {
          expect(l.g, idea.id).toBeGreaterThan(0);
          if (l.food.unit && l.food.unit.g > 0) expect(l.g % l.food.unit.g, `${idea.id}/${l.food.id}`).toBe(0);
        }
        const c = s.lines.reduce((sum, l) => sum + macrosOf(l.food, l.g).carb, 0);
        expect(Math.abs(c - s.carb), idea.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it("duży cel: dokładana bułka; w trakcie meczu nic nie jest dokładane", () => {
    const big = scaleIdea(IDEAS.main[0]!, 225, 50);
    expect(big.lines.at(-1)!.food.id).toBe("roll");
    expect(big.carb).toBeGreaterThan(190);
    const during = scaleIdea(IDEAS.during[0]!, 45, 0, false);
    expect(during.lines).toHaveLength(1);
  });

  it("pomysły obracają się z dniem i między posiłkami tego samego rodzaju", () => {
    const a = ideasFor(slot, 0)[0]!.id, b = ideasFor(slot, 1)[0]!.id;
    expect(a).not.toBe(b);
    expect(ideasFor({ ...slot, variant: 1 }, 0)[0]!.id).not.toBe(a);
    expect(ideasFor(slot, 0)).toHaveLength(IDEAS.main.length);
  });

  it("lista zakupów sumuje składniki dni, grupuje i zaokrągla w górę", () => {
    const day = (d: "light" | "training") => buildDayPlan({ day: d, weightKg: 75, goal: "maintain", activity: d === "training" ? { kind: "session", time: "17:00" } : null });
    const one = shoppingList([day("light")]);
    const three = shoppingList([day("light"), day("training"), day("light")]);
    expect(three.length).toBeGreaterThanOrEqual(one.length);
    const g = (l: ReturnType<typeof shoppingList>, id: string) => l.find((x) => x.foodId === id)?.grams ?? 0;
    expect(g(three, "veg-mix")).toBeGreaterThan(g(one, "veg-mix"));
    for (const l of three) { expect(l.grams).toBeGreaterThan(0); expect(l.text).toBeTruthy(); }
    const order = ["carb", "protein", "dairy", "fruit", "veg", "other"];
    const idx = three.map((l) => order.indexOf(l.group));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});

describe("co teraz", () => {
  const plan = buildDayPlan({ day: "light", weightKg: 75, goal: "maintain", activity: null });
  it("pierwszy niezjedzony posiłek, ewentualnie pominięte", async () => {
    const { nextSlot } = await import("./mealplan");
    expect(nextSlot(plan.slots, new Set(), 7 * 60).next!.id).toBe("breakfast");
    expect(nextSlot(plan.slots, new Set(["breakfast"]), 8 * 60 + 20).next!.id).toBe("lunch");
    const late = nextSlot(plan.slots, new Set(), 14 * 60 + 30);
    expect(late.missed.map((s) => s.id)).toEqual(["breakfast", "lunch"]);
    expect(late.next!.id).toBe("snack");
    expect(nextSlot(plan.slots, new Set(), 23 * 60).next).toBeNull();
    expect(nextSlot(plan.slots, new Set(["breakfast"]), 8 * 60 + 30).missed).toEqual([]);
  });
  it("opis czasu", async () => {
    const { untilText } = await import("./mealplan");
    expect(untilText(80)).toBe("za 1 h 20 min");
    expect(untilText(120)).toBe("za 2 h");
    expect(untilText(5)).toBe("teraz");
    expect(untilText(-30)).toBe("30 min temu");
    expect(untilText(-90)).toBe("1 h 30 min temu");
  });
});
