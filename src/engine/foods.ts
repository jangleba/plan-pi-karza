/**
 * Podstawowa baza produktów (wartości na 100 g) do dziennika Fuel i przykładowych posiłków.
 * Wartości są ORIENTACYJNE – z tabel składu żywności z pamięci, nie z konkretnych pomiarów; produkty ze sklepu
 * mogą się różnić (patrz etykieta). Nie są to wyniki badań (docs/ZRODLA-FUEL.md).
 */
export type FoodGroup = "carb" | "protein" | "dairy" | "fruit" | "veg" | "other";

export interface Unit { g: number; one: string; few: string; many: string }
export interface Food {
  id: string;
  name: string;
  /** Węglowodany i białko w g na 100 g (ml dla napojów). */
  carb100: number;
  protein100: number;
  group: FoodGroup;
  unit?: Unit;
  /** Dodatkowe nazwy do wyszukiwania. */
  aka?: string[];
  /** Skąd pochodzą dane (domyślnie baza wbudowana). */
  source?: "local" | "off";
  brand?: string;
  /** Napój (ilość w ml). */
  liquid?: boolean;
}

const u = (g: number, one: string, few: string, many: string): Unit => ({ g, one, few, many });
const SZT = u(0, "szt.", "szt.", "szt.");
const szt = (g: number): Unit => ({ ...SZT, g });
const LIQUIDS = new Set(["milk", "kefir", "oj", "iso"]);
const f = (id: string, name: string, carb100: number, protein100: number, group: FoodGroup, unit?: Unit, aka?: string[]): Food =>
  ({ id, name, carb100, protein100, group, unit, aka, source: "local", liquid: LIQUIDS.has(id) });

export const FOODS: Food[] = [
  f("rice-dry", "Ryż biały (suchy)", 80, 7, "carb", undefined, ["ryz"]),
  f("rice-cooked", "Ryż biały (ugotowany)", 28, 2.7, "carb", undefined, ["ryz"]),
  f("pasta-dry", "Makaron (suchy)", 74, 12, "carb", undefined, ["spaghetti", "penne"]),
  f("pasta-cooked", "Makaron (ugotowany)", 31, 5, "carb", undefined, ["spaghetti", "penne"]),
  f("potato", "Ziemniaki (ugotowane)", 17, 2, "carb"),
  f("oats", "Płatki owsiane (suche)", 62, 12, "carb", undefined, ["owsianka"]),
  f("muesli", "Musli (bez cukru)", 64, 10, "carb"),
  f("cornflakes", "Płatki kukurydziane", 84, 7, "carb"),
  f("bread-white", "Chleb pszenny", 50, 9, "carb", u(30, "kromka", "kromki", "kromek"), ["pieczywo", "chleb jasny"]),
  f("bread-rye", "Chleb razowy", 42, 8, "carb", u(35, "kromka", "kromki", "kromek"), ["pieczywo", "chleb"]),
  f("roll", "Bułka pszenna", 54, 9, "carb", szt(50), ["bulka", "kajzerka"]),
  f("buckwheat-dry", "Kasza gryczana (sucha)", 68, 12, "carb", undefined, ["kasza"]),
  f("jam", "Dżem", 58, 0.5, "carb", u(20, "łyżka", "łyżki", "łyżek"), ["dzem"]),
  f("honey", "Miód", 80, 0.4, "carb", u(20, "łyżka", "łyżki", "łyżek"), ["miod"]),
  f("raisins", "Rodzynki / suszone owoce", 72, 3, "carb", u(30, "garść", "garście", "garści"), ["daktyle", "morele suszone"]),

  f("banana", "Banan", 23, 1.1, "fruit", szt(120)),
  f("apple", "Jabłko", 13, 0.3, "fruit", szt(180), ["jablko"]),
  f("orange", "Pomarańcza", 11, 0.9, "fruit", szt(180), ["pomarancza"]),
  f("fruit-mix", "Owoce sezonowe", 12, 0.7, "fruit", undefined, ["truskawki", "borowki", "winogrona"]),

  f("yogurt", "Jogurt naturalny", 5, 4.5, "dairy", u(150, "kubek", "kubki", "kubków")),
  f("skyr", "Skyr", 4, 11, "dairy"),
  f("cottage-semi", "Twaróg półtłusty", 3.5, 18, "dairy", undefined, ["twarog"]),
  f("cottage-soft", "Serek wiejski", 3, 12, "dairy"),
  f("milk", "Mleko 2%", 4.8, 3.4, "dairy", u(250, "szklanka", "szklanki", "szklanek")),
  f("kefir", "Kefir", 4, 3.4, "dairy", u(250, "szklanka", "szklanki", "szklanek")),
  f("cheese", "Ser żółty", 0.5, 25, "dairy", u(20, "plasterek", "plasterki", "plasterków"), ["ser"]),

  f("chicken", "Pierś z kurczaka (surowa)", 0, 22.5, "protein", undefined, ["kurczak", "drob"]),
  f("turkey", "Pierś z indyka (surowa)", 0, 23, "protein", undefined, ["indyk"]),
  f("beef-mince", "Mielone wołowe (surowe)", 0, 19, "protein", undefined, ["wolowina", "mielone"]),
  f("salmon", "Łosoś (surowy)", 0, 20, "protein", undefined, ["losos", "ryba"]),
  f("cod", "Dorsz (surowy)", 0, 17.5, "protein", undefined, ["ryba"]),
  f("tuna", "Tuńczyk w puszce (odsączony)", 0, 24, "protein", undefined, ["tunczyk", "ryba"]),
  f("egg", "Jajko", 0.7, 12.5, "protein", szt(55), ["jajka", "jaja"]),
  f("ham", "Szynka drobiowa", 1.5, 17, "protein", u(15, "plasterek", "plasterki", "plasterków"), ["wedlina"]),
  f("tofu", "Tofu", 2, 8, "protein"),
  f("beans", "Fasola (ugotowana)", 18, 8, "protein"),
  f("lentils", "Soczewica (ugotowana)", 20, 9, "protein"),
  f("hummus", "Hummus", 14, 8, "protein"),

  f("veg-mix", "Warzywa (mieszane)", 5, 2, "veg", undefined, ["warzywa", "surowka", "salatka"]),

  f("oj", "Sok pomarańczowy", 10, 0.7, "other", u(250, "szklanka", "szklanki", "szklanek"), ["sok"]),
  f("iso", "Napój izotoniczny", 6, 0, "other", u(500, "butelka", "butelki", "butelek"), ["izotonik"]),
  f("gel", "Żel węglowodanowy", 60, 0, "other", u(40, "saszetka", "saszetki", "saszetek"), ["zel"]),
];

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(FOODS.map((x) => [x.id, x]));

/** Małe litery bez polskich znaków diakrytycznych (do wyszukiwania). */
export function norm(s: string): string {
  return s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export interface Macros { carb: number; protein: number }

export function macrosOf(food: Food, grams: number): Macros {
  const r = (x: number) => Math.round(x * 10) / 10;
  return { carb: r((food.carb100 * grams) / 100), protein: r((food.protein100 * grams) / 100) };
}

/** Wyszukiwanie w bazie wbudowanej: początek słowa > fragment > synonim. */
export function searchLocal(query: string, limit = 12): Food[] {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const scored: Array<[number, Food]> = [];
  for (const food of FOODS) {
    const name = norm(food.name);
    const aka = (food.aka ?? []).map(norm);
    let score = 0;
    for (const t of tokens) {
      const words = name.split(/[^a-z0-9]+/);
      if (words.some((w) => w.startsWith(t))) score += 3;
      else if (name.includes(t)) score += 2;
      else if (aka.some((a) => a.startsWith(t) || a.includes(t))) score += 1;
      else { score = 0; break; }
    }
    if (score > 0) scored.push([score, food]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length).slice(0, limit).map((x) => x[1]);
}

export const plural = (n: number, unit: Unit): string => (n === 1 ? unit.one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? unit.few : unit.many);

/** Ilość do pokazania: „2 szt.” / „1 kromka” dla produktów sztukowych, inaczej „90 g”. */
export function amountText(food: Food, grams: number): string {
  if (food.unit && food.unit.g > 0) {
    const n = Math.round(grams / food.unit.g);
    if (n >= 1 && Math.abs(n * food.unit.g - grams) < 1) return `${n} ${plural(n, food.unit)}`;
  }
  return `${Math.round(grams)} ${food.liquid ? "ml" : "g"}`;
}
