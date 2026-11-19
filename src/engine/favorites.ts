/**
 * Ulubione produkty i posiłki: rozpoznawanie wypowiedzi/tekstu (lokalnie, bez AI), pomysły z ulubionych produktów,
 * zamiana ulubionego posiłku na pomysł w planie i zestawienie źródeł makroskładników.
 */
import { FOODS, FOOD_BY_ID, amountText, macrosOf, norm, searchLocal, type Food } from "./foods";
import { ideasFor, scaleIdea, type Idea, type PoolKind, type ScaledIdea, type Slot } from "./mealplan";

export interface FavMeal { id: string; name: string; pool: PoolKind; items: Array<{ food: string; g: number }> }
export interface Favorites { foods: string[]; meals: FavMeal[] }
export const EMPTY_FAVS: Favorites = { foods: [], meals: [] };

/* ------------------------------ rozpoznawanie tekstu ------------------------------ */

const NUMBERS: Record<string, number> = {
  pol: 0.5, pół: 0.5, jeden: 1, jedna: 1, jedno: 1, dwa: 2, dwie: 2, dwoch: 2, trzy: 3, cztery: 4, piec: 5, szesc: 6, siedem: 7, osiem: 8, dziewiec: 9, dziesiec: 10,
};

export interface Parsed { food: Food; g: number; text: string }

/** Typowa porcja, gdy nie podano ilości, a produkt nie ma jednostki (sucha baza – nie 100 g). */
const DEFAULT_G: Record<string, number> = { oats: 50, "rice-dry": 80, "pasta-dry": 80, "buckwheat-dry": 70, cornflakes: 40, "rice-cooked": 150, "pasta-cooked": 180, "buckwheat-cooked": 150, potato: 250, chicken: 150, turkey: 150, salmon: 150, cod: 150, mackerel: 150, tuna: 80, "beef-mince": 150, "veg-mix": 150, tofu: 100, "olive-oil": 13.5 };

function stems(token: string): string[] {
  const out = [token];
  for (let cut = 1; cut <= 4 && token.length - cut >= 3; cut++) out.push(token.slice(0, -cut));
  return out;
}

/** Najlepsze dopasowanie fragmentu do produktu (z odmianą: „bananem” → banan); przy wyborze ryż/makaron/kasza woli wersję ugotowaną. */
export function matchFood(fragment: string): Food | null {
  const words = norm(fragment).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  for (const w of words) {
    for (const st of stems(w)) {
      const r = searchLocal(st, 6);
      if (r.length) return r.find((f) => /ugotowan/.test(f.name)) ?? r[0]!;
    }
  }
  return null;
}

/**
 * Dzieli wypowiedź („owsianka z bananem i jogurtem, dwa jajka, ryż 150 g”) na produkty z ilościami.
 * Ilość: „150 g”, „2 szt.”, „dwa jajka”, „pół banana”; bez ilości – jedna sztuka lub 100 g. Nierozpoznane fragmenty zwraca osobno.
 */
export function parseSpoken(text: string): { items: Parsed[]; unknown: string[] } {
  const items: Parsed[] = [], unknown: string[] = [];
  const parts = text.split(/(?<!\d),(?!\d)|[;\n+]| i | oraz | z | ze | plus | a także /i).map((x) => x.trim()).filter(Boolean);
  for (const part of parts) {
    const n = norm(part);
    let grams: number | null = null, count: number | null = null;
    let rest = n;
    const gm = n.match(/(\d+[.,]?\d*)\s*(kg|g|gram\w*|ml)\b/);
    if (gm) { const v = Number(gm[1]!.replace(",", ".")); grams = gm[2] === "kg" ? v * 1000 : v; rest = rest.replace(gm[0], " "); }
    else {
      const cm = n.match(/\b(\d+[.,]?\d*)\b/) ?? n.match(new RegExp(`\\b(${Object.keys(NUMBERS).join("|")})\\b`));
      if (cm) { count = NUMBERS[cm[1]!] ?? Number(cm[1]!.replace(",", ".")); rest = rest.replace(cm[0], " "); }
    }
    const food = matchFood(rest);
    if (!food) { unknown.push(part); continue; }
    const unit = food.unit && food.unit.g > 0 ? food.unit.g : 0;
    const g = grams ?? (count !== null ? count * (unit || DEFAULT_G[food.id] || 100) : unit || DEFAULT_G[food.id] || 100);
    items.push({ food, g: Math.round(g * 10) / 10, text: part });
  }
  return { items, unknown };
}

/* ------------------------------ ulubione w planie ------------------------------ */

const SHORT: Record<string, string> = { chicken: "kurczak", turkey: "indyk", "beef-mince": "wołowina", tuna: "tuńczyk", ham: "szynka", "pasta-dry": "makaron", "pasta-cooked": "makaron", "buckwheat-dry": "kasza", "buckwheat-cooked": "kasza", "rice-dry": "ryż", "rice-cooked": "ryż", "bread-white": "pieczywo", "bread-rye": "pieczywo", "veg-mix": "warzywa", "cottage-semi": "twaróg", "cottage-soft": "serek wiejski", skyr: "skyr" };
const shortName = (f: Food): string => SHORT[f.id] ?? f.name.split(/[ (/]/)[0]!.toLowerCase();

/** Produkty, które nadają się na bazę węglowodanową posiłku (bez słodzików, dodatków i płynów). */
const BASE = new Set(["rice-dry", "rice-cooked", "pasta-dry", "pasta-cooked", "potato", "buckwheat-dry", "buckwheat-cooked", "oats", "cornflakes", "bread-white", "bread-rye", "roll"]);
const PROTEIN = new Set(["chicken", "turkey", "beef-mince", "salmon", "mackerel", "cod", "tuna", "egg", "ham", "tofu", "beans", "lentils", "cottage-semi", "cottage-soft", "skyr", "yogurt", "cheese"]);
const FRUIT = new Set(["banana", "apple", "orange", "fruit-mix"]);

const ratio = (f: Food) => (/-dry$/.test(f.id) ? { min: 40, max: 160 } : f.id === "potato" ? { min: 150, max: 450 } : /-cooked$/.test(f.id) ? { min: 120, max: 450 } : f.id === "oats" ? { min: 40, max: 120 } : { min: 30, max: 200 });

/** Do 2 pomysłów złożonych z ulubionych produktów (baza + białko + dodatek), dopasowanych do rodzaju posiłku. */
export function favoriteIdeas(pool: PoolKind, favs: string[], pick = 0): Idea[] {
  const foods = favs.map((id) => FOOD_BY_ID[id]).filter((f): f is Food => !!f);
  const base = foods.filter((f) => BASE.has(f.id)), prot = foods.filter((f) => PROTEIN.has(f.id)), fruit = foods.filter((f) => FRUIT.has(f.id));
  const rot = <T,>(a: T[], k: number): T | undefined => (a.length ? a[Math.abs(k) % a.length] : undefined);
  const out: Idea[] = [];
  const addIdea = (i: number) => {
    const b = rot(base, pick + i), p = rot(prot, pick + i), fr = rot(fruit, pick + i);
    const items: Idea["items"] = [];
    const names: string[] = [];
    if (pool === "main" || pool === "post") {
      if (!b || !p) return;
      items.push({ food: b.id, role: "carb", ...ratio(b) }, { food: p.id, role: "protein", min: 60, max: 300 });
      names.push(shortName(b), shortName(p));
      if (pool === "main") { items.push({ food: "veg-mix", role: "fixed", g: 150 }); names.push("warzywa"); }
    } else if (pool === "breakfast") {
      if (!b) return;
      items.push({ food: b.id, role: "carb", ...ratio(b) });
      names.push(shortName(b));
      if (p) { items.push({ food: p.id, role: "protein", min: 60, max: 250 }); names.push(shortName(p)); }
      if (fr) { items.push({ food: fr.id, role: "fixed", g: fr.unit?.g ?? 120 }); names.push(shortName(fr)); }
    } else if (pool === "small") {
      if (!fr && !b) return;
      if (fr) { items.push({ food: fr.id, role: "carb", min: fr.unit?.g ?? 120, max: (fr.unit?.g ?? 120) * 3 }); names.push(shortName(fr)); }
      if (b && fr) { items.push({ food: b.id, role: "carb", min: 30, max: 120 }); names.push(shortName(b)); }
      else if (b) { items.push({ food: b.id, role: "carb", ...ratio(b) }); names.push(shortName(b)); }
      if (!fr && p) { items.push({ food: p.id, role: "protein", min: 60, max: 200 }); names.push(shortName(p)); }
    } else return;
    const name = names.join(", ");
    out.push({ id: `fav-${pool}-${i}`, name: name.charAt(0).toUpperCase() + name.slice(1), items });
  };
  addIdea(0); addIdea(1);
  // bez powtórzeń nazw
  return out.filter((x, i) => out.findIndex((y) => y.name === x.name) === i);
}

/** Ulubiony posiłek (stałe gramy) jako pomysł w planie. */
export function mealToIdea(m: FavMeal): ScaledIdea {
  const lines = m.items.map((it) => ({ food: FOOD_BY_ID[it.food]!, g: it.g })).filter((l) => !!l.food).map((l) => ({ ...l, text: amountText(l.food, l.g) }));
  const sum = lines.reduce((s, l) => { const x = macrosOf(l.food, l.g); return { carb: s.carb + x.carb, protein: s.protein + x.protein, fat: s.fat + x.fat }; }, { carb: 0, protein: 0, fat: 0 });
  return { id: m.id, name: m.name, lines, carb: Math.round(sum.carb), protein: Math.round(sum.protein), fat: Math.round(sum.fat), fav: "meal" };
}

export const POOL_LABEL: Record<Exclude<PoolKind, "during">, string> = { breakfast: "Śniadanie", main: "Obiad / kolacja", small: "Przekąska", post: "Po wysiłku" };

/* ------------------------------ źródła makroskładników ------------------------------ */

export type Macro = "protein" | "carb" | "fat";
export interface Source { food: Food; per100: number; /** g makroskładnika w typowej porcji z jednostką (np. 1 jajko), jeśli jest. */ perUnit: number | null; unitText: string | null }

/** Produkty o największej zawartości makroskładnika na 100 g (z podaniem typowej porcji, jeśli jest). */
export function topSources(macro: Macro, n = 10): Source[] {
  const key = macro === "protein" ? "protein100" : macro === "carb" ? "carb100" : "fat100";
  const skip = new Set(["iso", "gel", "oj"]); // napoje/żele to nie „źródła”
  return FOODS.filter((f) => !skip.has(f.id) && f[key] >= (macro === "fat" ? 8 : macro === "protein" ? 8 : 15))
    .sort((a, b) => b[key] - a[key])
    .slice(0, n)
    .map((f) => ({
      food: f, per100: f[key],
      perUnit: f.unit && f.unit.g > 0 ? Math.round(((f[key] * f.unit.g) / 100) * 10) / 10 : null,
      unitText: f.unit && f.unit.g > 0 ? amountText(f, f.unit.g) : null,
    }));
}


/**
 * Pomysły na posiłek z uwzględnieniem ulubionych: najpierw gotowe ulubione posiłki pasujące do rodzaju posiłku,
 * potem pomysły z ulubionych produktów (dobrane gramy), na końcu standardowe.
 */
export function ideasWithFavorites(slot: Slot, dayIndex: number, favs: Favorites): ScaledIdea[] {
  const base = ideasFor(slot, dayIndex);
  const meals = favs.meals.filter((m) => m.pool === slot.pool).map(mealToIdea);
  const products = favoriteIdeas(slot.pool, favs.foods, dayIndex + slot.variant).map((i): ScaledIdea => ({ ...scaleIdea(i, slot.carb, slot.protein, { topUp: slot.pool !== "during" }), fav: "products" }));
  return [...meals, ...products, ...base];
}
