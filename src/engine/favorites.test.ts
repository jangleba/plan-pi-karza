import { describe, expect, it } from "vitest";
import { EMPTY_FAVS, favoriteIdeas, ideasWithFavorites, matchFood, mealToIdea, parseSpoken, topSources } from "./favorites";
import { buildDayPlan } from "./mealplan";

describe("rozpoznawanie tekstu", () => {
  it("odmiana: bananem → banan, kurczakiem → kurczak, łososiem → łosoś, ryżem → ryż (ugotowany)", () => {
    expect(matchFood("z bananem")?.id).toBe("banana");
    expect(matchFood("kurczakiem")?.id).toBe("chicken");
    expect(matchFood("łososiem")?.id).toBe("salmon");
    expect(matchFood("ryżem")?.id).toBe("rice-cooked");
    expect(matchFood("makaronem")?.id).toBe("pasta-cooked");
    expect(matchFood("kaszą gryczaną")?.id).toBe("buckwheat-cooked");
    expect(matchFood("coś zupełnie innego")).toBeNull();
  });

  it("lista z ilościami: gramy, sztuki słownie i cyframi, domyślna porcja", () => {
    const { items, unknown } = parseSpoken("ryż 150 g, dwa jajka, 3 banany, kurczak, pół jabłka");
    const by = Object.fromEntries(items.map((i) => [i.food.id, i.g]));
    expect(by["rice-cooked"]).toBe(150);
    expect(by["egg"]).toBe(100); // 2 × 50 g
    expect(by["banana"]).toBe(360); // 3 × 120 g
    expect(by["chicken"]).toBe(150); // bez ilości, produkt bez jednostki → typowa porcja
    expect(by["apple"]).toBe(90); // pół × 180 g
    expect(unknown).toEqual([]);
  });

  it("opis posiłku: „owsianka z bananem i jogurtem” dzieli się na produkty; nierozpoznane trafiają osobno", () => {
    const { items, unknown } = parseSpoken("owsianka z bananem i jogurtem, 200 g wuzetka");
    expect(items.map((i) => i.food.id)).toEqual(["oats", "banana", "yogurt"]);
    expect(unknown).toEqual(["200 g wuzetka"]);
  });

  it("domyślne porcje suchych produktów nie są 100 g", () => {
    const by = Object.fromEntries(parseSpoken("owsianka, ryż, kasza").items.map((i) => [i.food.id, i.g]));
    expect(by["oats"]).toBe(50);
    expect(by["rice-cooked"]).toBe(150);
    expect(by["buckwheat-cooked"]).toBe(150);
  });

  it("kilogramy i przecinek dziesiętny", () => {
    const { items } = parseSpoken("0,5 kg ziemniaków");
    expect(items[0]!.food.id).toBe("potato");
    expect(items[0]!.g).toBe(500);
  });

  it("pusty tekst → nic", () => expect(parseSpoken("  ")).toEqual({ items: [], unknown: [] }));
});

describe("ulubione w planie", () => {
  const plan = buildDayPlan({ day: "light", weightKg: 75, goal: "maintain", activities: [] });
  const slot = (id: string) => plan.slots.find((s) => s.id === id)!;

  it("obiad z ulubionych produktów: baza + białko + warzywa, z nazwą z ich nazw", () => {
    const ideas = favoriteIdeas("main", ["pasta-dry", "turkey"], 0);
    expect(ideas[0]!.name).toBe("Makaron, indyk, warzywa");
    expect(ideas[0]!.items.map((i) => i.food)).toEqual(["pasta-dry", "turkey", "veg-mix"]);
  });

  it("bez kompletu (np. tylko białko) nie tworzy obiadu; śniadanie z samej bazy – tak", () => {
    expect(favoriteIdeas("main", ["chicken"], 0)).toEqual([]);
    expect(favoriteIdeas("breakfast", ["oats"], 0)[0]!.name).toBe("Płatki");
    expect(favoriteIdeas("during", ["oats", "chicken"], 0)).toEqual([]);
  });

  it("ideasWithFavorites: najpierw ulubiony posiłek, potem z ulubionych produktów (gramy dobrane do celu), potem standardowe", () => {
    const meal = { id: "m1", name: "Moja owsianka", pool: "breakfast" as const, items: [{ food: "oats", g: 60 }, { food: "banana", g: 120 }] };
    const ideas = ideasWithFavorites(slot("breakfast"), 0, { foods: ["bread-rye", "egg"], meals: [meal] });
    expect(ideas[0]).toMatchObject({ id: "m1", name: "Moja owsianka", fav: "meal" });
    expect(ideas[1]!.fav).toBe("products");
    expect(ideas[1]!.lines.map((l) => l.food.id)).toContain("bread-rye");
    expect(ideas.slice(2).every((i) => !i.fav)).toBe(true);
    expect(ideas.length).toBeGreaterThan(4);
  });

  it("bez ulubionych wynik jak dotąd; ulubiony posiłek innego rodzaju nie wchodzi", () => {
    const base = ideasWithFavorites(slot("lunch"), 0, EMPTY_FAVS);
    expect(base.every((i) => !i.fav)).toBe(true);
    const other = { id: "m2", name: "x", pool: "post" as const, items: [{ food: "banana", g: 120 }] };
    expect(ideasWithFavorites(slot("lunch"), 0, { foods: [], meals: [other] })).toHaveLength(base.length);
  });

  it("ulubiony posiłek: makro z gramów, ilości tekstem", () => {
    const i = mealToIdea({ id: "m", name: "Jajka", pool: "breakfast", items: [{ food: "egg", g: 100 }, { food: "bread-rye", g: 70 }] });
    expect(i.lines.map((l) => l.text)).toEqual(["2 szt.", "2 kromki"]);
    expect(i.protein).toBe(Math.round(12.56 * 1 + 8.5 * 0.7));
    expect(i.fat).toBeGreaterThan(10);
  });
});

describe("źródła makroskładników", () => {
  it("białko: najwyżej łatwe do sprawdzenia produkty z wysokim białkiem, posortowane; porcja z jednostką", () => {
    const s = topSources("protein", 8);
    expect(s.length).toBe(8);
    for (let i = 1; i < s.length; i++) expect(s[i - 1]!.per100).toBeGreaterThanOrEqual(s[i]!.per100);
    expect(s[0]!.per100).toBeGreaterThanOrEqual(20);
    const egg = topSources("protein", 30).find((x) => x.food.id === "egg")!;
    expect(egg.perUnit).toBe(6.3);
    expect(egg.unitText).toBe("1 szt.");
  });
  it("tłuszcze: oliwa na czele, bez napojów; węglowodany: bez izotoniku i żelu", () => {
    expect(topSources("fat", 5)[0]!.food.id).toBe("olive-oil");
    expect(topSources("carb", 40).some((s) => ["iso", "gel", "oj"].includes(s.food.id))).toBe(false);
  });
});
