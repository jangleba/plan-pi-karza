import { describe, expect, it } from "vitest";
import { ALLERGENS, FOOD_TAGS, NO_DIET, assessFood, assessIdea, avoidFor, filterIdeas, foodsWithoutTags, hasDietPrefs, type DietPrefs } from "./allergens";
import { FOODS } from "./foods";
import { IDEAS, ideasFor, buildDayPlan } from "./mealplan";
import type { ScaledIdea } from "./mealplan";

const prefs = (over: Partial<DietPrefs>): DietPrefs => ({ ...NO_DIET, ...over });

describe("alergeny i ograniczenia: kompletność danych", () => {
  it("każdy produkt wbudowanej bazy ma wpis o alergenach (nowy produkt wymaga świadomej decyzji)", () => {
    expect(foodsWithoutTags()).toEqual([]);
    expect(Object.keys(FOOD_TAGS).every((id) => FOODS.some((f) => f.id === id))).toBe(true);
  });
  it("wszystkie wymienione alergeny są znane", () => {
    for (const t of Object.values(FOOD_TAGS)) for (const a of [...(t.contains ?? []), ...(t.may ?? [])]) expect(ALLERGENS).toContain(a);
  });
});

describe("ocena produktu: brak danych ≠ bezpieczny", () => {
  it("znany konflikt: alergen, „może zawierać”, dieta, własne słowo", () => {
    expect(assessFood("pasta-dry", "Makaron", prefs({ allergens: ["gluten"] }))).toMatchObject({ kind: "conflict" });
    expect(assessFood("oats", "Płatki owsiane", prefs({ allergens: ["gluten"] }))).toMatchObject({ kind: "conflict", reasons: [expect.stringMatching(/może zawierać/)] });
    expect(assessFood("chicken", "Pierś z kurczaka", prefs({ diet: "vegetarian" }))).toMatchObject({ kind: "conflict" });
    expect(assessFood("yogurt", "Jogurt", prefs({ diet: "vegetarian" })).kind).toBe("no_known");
    expect(assessFood("yogurt", "Jogurt", prefs({ diet: "vegan" })).kind).toBe("conflict");
    expect(assessFood("honey", "Miód", prefs({ diet: "vegan" })).kind).toBe("conflict");
    expect(assessFood("banana", "Banan", prefs({ custom: ["BANAN"] }))).toMatchObject({ kind: "conflict" });
    expect(assessFood("apple", "Jabłko", prefs({ custom: ["jablko"] })).kind).toBe("conflict"); // bez polskich znaków
  });
  it("produkt spoza naszej bazy (np. z Open Food Facts, własny) to „brak danych”, a nie „bezpieczny”", () => {
    expect(assessFood("off-123", "Batonik zbożowy", prefs({ allergens: ["nuts"] })).kind).toBe("unknown");
    expect(assessFood("off-123", "Batonik z orzechami", prefs({ custom: ["orzech"] })).kind).toBe("conflict"); // własne słowo wciąż działa po nazwie
  });
  it("produkt bez znanych alergenów to nadal tylko „brak znanego konfliktu” – nigdy „bezpieczny”", () => {
    expect(assessFood("rice-dry", "Ryż", prefs({ allergens: ["gluten", "milk"] })).kind).toBe("no_known");
  });
  it("hasDietPrefs: brak wyborów = bez filtrowania", () => {
    expect(hasDietPrefs(NO_DIET)).toBe(false);
    expect(hasDietPrefs(prefs({ diet: "vegan" }))).toBe(true);
  });
});

describe("pomysły na posiłki z uwzględnieniem wyborów", () => {
  const plan = buildDayPlan({ day: "training", weightKg: 70, goal: "maintain", activities: [{ kind: "session", time: "17:00" }] });
  const all = plan.slots.flatMap((s) => ideasFor(s, 0).map((i) => ({ slot: s.id, idea: i })));

  it("bez wyborów nic nie jest ukrywane", () => {
    const r = filterIdeas(all.map((x) => x.idea), NO_DIET);
    expect(r.hidden).toHaveLength(0);
  });
  it("przy alergii na mleko żaden pokazany pomysł nie zawiera produktu z mlekiem, a ukryte mają powód", () => {
    const p = prefs({ allergens: ["milk"] });
    const r = filterIdeas(all.map((x) => x.idea), p);
    expect(r.hidden.length).toBeGreaterThan(0);
    for (const h of r.hidden) expect(h.conflict.length).toBeGreaterThan(0);
    for (const s of r.shown) expect(assessIdea(s.idea, p).conflict).toEqual([]);
    for (const s of r.shown) for (const l of s.idea.lines) expect(FOOD_TAGS[l.food.id]?.contains ?? []).not.toContain("milk");
  });
  it("w każdym rodzaju posiłku zostaje przynajmniej jeden pomysł dla każdej z pojedynczych diet/alergii (inaczej użytkownik zostałby bez propozycji)", () => {
    const cases: DietPrefs[] = [...ALLERGENS.map((a) => prefs({ allergens: [a] })), prefs({ diet: "vegetarian" }), prefs({ diet: "vegan" })];
    for (const p of cases) {
      for (const pool of Object.keys(IDEAS) as Array<keyof typeof IDEAS>) {
        const slot = plan.slots.find((s) => s.pool === pool);
        if (!slot || pool === "during") continue; // „w trakcie” (żel/izotonik) nie zawiera alergenów z listy
        const shown = filterIdeas(ideasFor(slot, 0, avoidFor(p)), p).shown;
        expect(shown.length, `${pool} / ${JSON.stringify(p)}`).toBeGreaterThan(0);
      }
    }
  });
  it("automatyczne dopełnienia (bułka, źródło tłuszczu) nie dokładają produktów, których użytkownik unika", () => {
    const nuts = prefs({ allergens: ["nuts"] }), gluten = prefs({ allergens: ["gluten"] });
    for (const s of plan.slots) {
      for (const i of ideasFor(s, 0, avoidFor(nuts))) expect(i.lines.every((l) => !(FOOD_TAGS[l.food.id]?.contains ?? []).includes("nuts"))).toBe(true);
      for (const i of ideasFor(s, 0, avoidFor(gluten))) expect(i.lines.every((l) => l.food.id !== "roll" || i.id.includes("roll"))).toBe(true);
    }
    expect(avoidFor(NO_DIET)).toBeUndefined();
  });
  it("pomysł z produktem spoza bazy jest pokazany, ale z listą produktów bez danych o alergenach", () => {
    const idea: ScaledIdea = { id: "x", name: "Mój posiłek", carb: 50, protein: 10, fat: 5, lines: [{ food: { id: "off-9", name: "Baton", carb100: 50, protein100: 5, fat100: 10, group: "other" }, g: 40, text: "40 g" }] };
    const r = filterIdeas([idea], prefs({ allergens: ["nuts"] }));
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0]!.unknownFoods).toEqual(["Baton"]);
  });
});
