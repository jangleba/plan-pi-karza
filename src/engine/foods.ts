/**
 * Podstawowa baza produktów (wartości na 100 g) do dziennika Fuel i przykładowych posiłków.
 * Źródło: USDA FoodData Central, SR Legacy (domena publiczna, CC0) – numer `fdc` wskazuje pozycję; pozycje
 * oznaczone `est` to szacunki bez pozycji w USDA. USDA opisuje produkty amerykańskie, polskie mogą się różnić
 * (patrz etykieta). Nie są to wyniki badań dla piłkarzy (docs/ZRODLA-FUEL.md).
 */
export type FoodGroup = "carb" | "protein" | "dairy" | "fruit" | "veg" | "fat" | "other";

export interface Unit { g: number; one: string; few: string; many: string }
export interface Food {
  id: string;
  name: string;
  /** Węglowodany, białko i tłuszcz w g na 100 g (ml dla napojów). */
  carb100: number;
  protein100: number;
  fat100: number;
  group: FoodGroup;
  unit?: Unit;
  /** Dodatkowe nazwy do wyszukiwania. */
  aka?: string[];
  /** Skąd pochodzą dane (domyślnie baza wbudowana). */
  source?: "local" | "off";
  brand?: string;
  /** Napój (ilość w ml). */
  liquid?: boolean;
  /** Numer pozycji w USDA FoodData Central (SR Legacy). */
  fdc?: number;
  /** Szacunek bez pozycji w USDA. */
  est?: boolean;
  /** Dane z Open Food Facts bez tłuszczu na 100 g. */
  fatUnknown?: boolean;
}

const u = (g: number, one: string, few: string, many: string): Unit => ({ g, one, few, many });
const SZT = u(0, "szt.", "szt.", "szt.");
const szt = (g: number): Unit => ({ ...SZT, g });
const LIQUIDS = new Set(["milk", "kefir", "oj", "iso"]);
const f = (id: string, name: string, c: number, p: number, fat: number, group: FoodGroup, fdc: number | null, unit?: Unit, aka?: string[]): Food =>
  ({ id, name, carb100: c, protein100: p, fat100: fat, group, unit, aka, source: "local", liquid: LIQUIDS.has(id), ...(fdc ? { fdc } : { est: true }) });
const LYZKA = (g: number) => u(g, "łyżka", "łyżki", "łyżek");
const GARSC = (g: number) => u(g, "garść", "garście", "garści");

export const FOODS: Food[] = [
  f("rice-dry", "Ryż biały (suchy)", 79.95, 7.13, 0.66, "carb", 168877, undefined, ["ryz"]),
  f("rice-cooked", "Ryż biały (ugotowany)", 28.17, 2.69, 0.28, "carb", 168878, undefined, ["ryz"]),
  f("pasta-dry", "Makaron (suchy)", 74.67, 13.04, 1.51, "carb", 169736, undefined, ["spaghetti", "penne"]),
  f("pasta-cooked", "Makaron (ugotowany)", 30.86, 5.8, 0.93, "carb", 169737, undefined, ["spaghetti", "penne"]),
  f("potato", "Ziemniaki (ugotowane)", 20.01, 1.71, 0.1, "carb", 170440),
  f("oats", "Płatki owsiane (suche)", 67.7, 13.15, 6.52, "carb", 173904, undefined, ["owsianka"]),
  f("cornflakes", "Płatki kukurydziane", 88.01, 5.9, 0.91, "carb", 174648),
  f("bread-white", "Chleb pszenny", 49.42, 8.85, 3.33, "carb", 174924, u(30, "kromka", "kromki", "kromek"), ["pieczywo", "chleb jasny"]),
  f("bread-rye", "Chleb żytni / razowy", 48.3, 8.5, 3.3, "carb", 172684, u(35, "kromka", "kromki", "kromek"), ["pieczywo", "chleb"]),
  f("roll", "Bułka pszenna", 52.7, 9.9, 4.3, "carb", 175031, szt(50), ["bulka", "kajzerka"]),
  f("buckwheat-dry", "Kasza gryczana (sucha)", 74.95, 11.73, 2.71, "carb", 170685, undefined, ["kasza"]),
  f("buckwheat-cooked", "Kasza gryczana (ugotowana)", 19.94, 3.38, 0.62, "carb", 170686, undefined, ["kasza"]),
  f("jam", "Dżem", 68.86, 0.37, 0.07, "carb", 169641, LYZKA(20), ["dzem"]),
  f("honey", "Miód", 82.4, 0.3, 0, "carb", 169640, LYZKA(20), ["miod"]),
  f("raisins", "Rodzynki / suszone owoce", 79.32, 3.3, 0.25, "carb", 168165, GARSC(30), ["daktyle", "morele suszone"]),

  f("banana", "Banan", 22.84, 1.09, 0.33, "fruit", 173944, szt(120)),
  f("apple", "Jabłko", 13.81, 0.26, 0.17, "fruit", 171688, szt(180), ["jablko"]),
  f("orange", "Pomarańcza", 11.75, 0.94, 0.12, "fruit", 169097, szt(180), ["pomarancza"]),
  f("fruit-mix", "Owoce jagodowe (truskawki)", 7.68, 0.67, 0.3, "fruit", 167762, undefined, ["truskawki", "borowki", "winogrona", "owoce"]),

  f("yogurt", "Jogurt naturalny", 7.04, 5.25, 1.55, "dairy", 170886, u(150, "kubek", "kubki", "kubków")),
  f("skyr", "Skyr / jogurt grecki 0%", 3.6, 10.19, 0.39, "dairy", 170894),
  f("cottage-semi", "Twaróg półtłusty", 3.5, 18, 4, "dairy", null, undefined, ["twarog"]),
  f("cottage-soft", "Serek wiejski", 4.76, 10.45, 2.27, "dairy", 172182),
  f("milk", "Mleko 2%", 4.8, 3.3, 1.98, "dairy", 171267, u(250, "szklanka", "szklanki", "szklanek")),
  f("kefir", "Kefir / maślanka", 4.79, 3.31, 1.07, "dairy", 170874, u(250, "szklanka", "szklanki", "szklanek"), ["maslanka"]),
  f("cheese", "Ser żółty (gouda)", 2.22, 24.94, 27.44, "dairy", 171241, u(20, "plasterek", "plasterki", "plasterków"), ["ser"]),

  f("chicken", "Pierś z kurczaka (surowa)", 0, 22.5, 2.62, "protein", 171077, undefined, ["kurczak", "drob"]),
  f("turkey", "Pierś z indyka (surowa)", 0.14, 23.66, 1.48, "protein", 171098, undefined, ["indyk"]),
  f("beef-mince", "Mielone wołowe (surowe)", 0, 20.85, 7, "protein", 173110, undefined, ["wolowina", "mielone"]),
  f("salmon", "Łosoś (surowy)", 0, 20.42, 13.42, "protein", 175167, undefined, ["losos", "ryba"]),
  f("mackerel", "Makrela (surowa)", 0, 18.6, 13.89, "protein", 175119, undefined, ["ryba"]),
  f("cod", "Dorsz (surowy)", 0, 17.81, 0.67, "protein", 171955, undefined, ["ryba"]),
  f("tuna", "Tuńczyk w puszce (odsączony)", 0, 25.51, 0.82, "protein", 171986, undefined, ["tunczyk", "ryba"]),
  f("egg", "Jajko", 0.72, 12.56, 9.51, "protein", 171287, szt(50), ["jajka", "jaja"]),
  f("ham", "Szynka z indyka (wędlina)", 0.93, 19.6, 5.8, "protein", 168092, u(15, "plasterek", "plasterki", "plasterków"), ["wedlina", "szynka"]),
  f("tofu", "Tofu", 2.78, 17.27, 8.72, "protein", 172475),
  f("beans", "Fasola (ugotowana)", 22.8, 8.67, 0.5, "protein", 173740),
  f("lentils", "Soczewica (ugotowana)", 20.13, 9.02, 0.38, "protein", 172421),
  f("hummus", "Hummus", 15, 7.78, 17.82, "protein", 174289),

  f("veg-mix", "Warzywa (surówka)", 4.52, 0.84, 0.2, "veg", 170457, undefined, ["warzywa", "surowka", "salatka", "pomidor", "ogorek", "papryka"]),

  f("olive-oil", "Oliwa z oliwek", 0, 0, 100, "fat", 171413, LYZKA(13.5), ["olej", "oliwa"]),
  f("avocado", "Awokado", 8.53, 2, 14.66, "fat", 171705, u(70, "połówka", "połówki", "połówek")),
  f("almonds", "Migdały", 21.55, 21.15, 49.93, "fat", 170567, GARSC(28), ["orzechy"]),
  f("walnuts", "Orzechy włoskie", 13.71, 15.23, 65.21, "fat", 170187, GARSC(28), ["orzechy"]),
  f("peanut-butter", "Masło orzechowe", 22.31, 22.21, 51.36, "fat", 172470, LYZKA(16), ["orzechy"]),

  f("oj", "Sok pomarańczowy", 10.4, 0.7, 0.2, "other", 169098, u(250, "szklanka", "szklanki", "szklanek"), ["sok"]),
  f("iso", "Napój izotoniczny", 6, 0, 0, "other", null, u(500, "butelka", "butelki", "butelek"), ["izotonik"]),
  f("gel", "Żel węglowodanowy", 60, 0, 0, "other", null, u(40, "saszetka", "saszetki", "saszetek"), ["zel"]),
];

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(FOODS.map((x) => [x.id, x]));

/** Małe litery bez polskich znaków diakrytycznych (do wyszukiwania). */
export function norm(s: string): string {
  return s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export interface Macros { carb: number; protein: number; fat: number }

export function macrosOf(food: Food, grams: number): Macros {
  const r = (x: number) => Math.round(x * 10) / 10;
  return { carb: r((food.carb100 * grams) / 100), protein: r((food.protein100 * grams) / 100), fat: r((food.fat100 * grams) / 100) };
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
