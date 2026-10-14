import { normalizeFuelText } from "./assistant";
import type { FuelContext, FuelPreferences, FuelTiming, MealLine } from "./experience";
import { minutesToFuelStart } from "./experience";
import { FOOD_NUTRIENTS } from "./foodNutrients";

export type FoodRole = "carb" | "protein" | "fruit" | "vegetable" | "fat" | "fluid";
export interface FuelFood {
  id: string;
  label: string;
  aliases: string[];
  role: FoodRole;
  state: string;
  unitGrams: number;
  unitLabel: string;
  allergens: string[];
  vegetarian: boolean;
  vegan: boolean;
}
function food(
  id: string,
  label: string,
  role: FoodRole,
  state: string,
  unitGrams: number,
  unitLabel: string,
  aliases: string[] = [],
  allergens: string[] = [],
  vegetarian = true,
  vegan = true,
): FuelFood {
  return {
    id,
    label,
    role,
    state,
    unitGrams,
    unitLabel,
    aliases: [label, ...aliases],
    allergens,
    vegetarian,
    vegan,
  };
}
export const FOODS: FuelFood[] = [
  food("rice", "Ryż", "carb", "ugotowany", 150, "miseczki", ["ryzu", "ryz"]),
  food(
    "pasta",
    "Makaron",
    "carb",
    "ugotowany",
    150,
    "miseczki",
    ["makaronu"],
    ["gluten", "pszenica"],
  ),
  food(
    "bread",
    "Jasne pieczywo",
    "carb",
    "gotowe",
    30,
    "kromki",
    ["chleb", "pieczywo", "bulka", "tosty"],
    ["gluten", "pszenica"],
  ),
  food(
    "wrap",
    "Tortilla pszenna",
    "carb",
    "gotowa",
    60,
    "szt.",
    ["wrap", "tortilla", "tortille"],
    ["gluten", "pszenica"],
  ),
  food(
    "oats",
    "Płatki owsiane",
    "carb",
    "suche",
    10,
    "łyżki",
    ["platki", "owsianka", "owsiane"],
    ["owies", "gluten"],
  ),
  food("potato", "Ziemniaki", "carb", "ugotowane", 100, "szt.", ["ziemniak", "ziemniakow"]),
  food("ricecakes", "Wafle ryżowe", "carb", "gotowe", 9, "szt.", ["wafle", "wafli"]),
  food(
    "eggs",
    "Jajka",
    "protein",
    "ugotowane, bez skorupek",
    50,
    "szt.",
    ["jajko", "jajek", "jaja", "jajkami"],
    ["jaja"],
    true,
    false,
  ),
  food(
    "chicken",
    "Pierś z kurczaka",
    "protein",
    "po obróbce, bez skóry",
    100,
    "porcji",
    ["kurczak", "kurczaka", "kurczakiem"],
    [],
    false,
    false,
  ),
  food(
    "turkey",
    "Pierś z indyka",
    "protein",
    "po obróbce, bez skóry",
    100,
    "porcji",
    ["indyk", "indyka", "indykiem"],
    [],
    false,
    false,
  ),
  food(
    "tuna",
    "Tuńczyk w wodzie",
    "protein",
    "odsączony",
    120,
    "puszki",
    ["tunczyk", "tunczyka", "tunczykiem"],
    ["ryby"],
    false,
    false,
  ),
  food(
    "skyr",
    "Skyr naturalny",
    "protein",
    "wzorzec: Piątnica naturalny",
    150,
    "opakowania 150 g",
    ["skyra", "skyr"],
    ["mleko", "laktoza"],
    true,
    false,
  ),
  food(
    "yogurt",
    "Jogurt grecki 0%",
    "protein",
    "naturalny, wzorzec USDA",
    150,
    "opakowania 150 g",
    ["jogurt", "jogurtu"],
    ["mleko", "laktoza"],
    true,
    false,
  ),
  food(
    "kefir",
    "Kefir naturalny",
    "protein",
    "gotowy",
    250,
    "szklanki",
    ["kefiru"],
    ["mleko", "laktoza"],
    true,
    false,
  ),
  food(
    "milk",
    "Mleko 2%",
    "protein",
    "gotowe",
    250,
    "szklanki",
    ["mleko", "mleka"],
    ["mleko", "laktoza"],
    true,
    false,
  ),
  food(
    "cottage",
    "Serek wiejski 2%",
    "protein",
    "wzorzec USDA",
    200,
    "opakowania 200 g",
    ["serek", "twarog"],
    ["mleko", "laktoza"],
    true,
    false,
  ),
  food("tofu", "Tofu naturalne", "protein", "twarde, gotowe", 100, "porcji", ["tofu"], ["soja"]),
  food("chickpeas", "Ciecierzyca", "protein", "ugotowana, wzorzec USDA", 100, "porcji", [
    "ciecierzyce",
    "ciecierzycy",
  ]),
  food("banana", "Banan", "fruit", "bez skórki", 118, "szt.", ["banana", "banany"]),
  food("apple", "Jabłko", "fruit", "surowe ze skórką", 180, "szt.", ["jablka", "jablko"]),
  food("berries", "Truskawki", "fruit", "bez szypułek", 100, "garści", ["truskawek", "truskawki"]),
  food("tomato", "Pomidor", "vegetable", "surowy", 150, "szt.", ["pomidora", "pomidory"]),
  food("cucumber", "Ogórek", "vegetable", "surowy", 100, "porcji", ["ogorek", "ogorka"]),
  food("lettuce", "Sałata", "vegetable", "surowa", 20, "garści", ["salata", "salaty"]),
  food("juice", "Sok pomarańczowy", "fluid", "100%, wzorzec USDA", 200, "szklanki", [
    "sok",
    "soku",
  ]),
  food(
    "nuts",
    "Migdały",
    "fat",
    "gotowe",
    20,
    "małej garści",
    ["migdaly", "orzechy", "orzechow"],
    ["orzechy", "migdaly"],
  ),
  food(
    "peanut_butter",
    "Masło orzechowe",
    "fat",
    "gładkie",
    15,
    "łyżki",
    [],
    ["orzechy", "orzeszki ziemne"],
  ),
  food("avocado", "Awokado", "fat", "bez skórki i pestki", 70, "połówki", ["awokado"]),
  food("honey", "Miód", "carb", "gotowy", 7, "łyżeczki", ["miod", "miodu"], [], true, false),
  food("jam", "Dżem", "carb", "gotowy", 20, "łyżki", ["dzem", "dzemu"]),
];
export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f])) as Record<
  string,
  FuelFood
>;

export interface FuelRecipe {
  id: string;
  title: string;
  subtitle: string;
  icon: "bowl" | "sandwich" | "fruit" | "wrap";
  lines: MealLine[];
  steps: string[];
  prepMin: number;
  noCook: boolean;
  portable: boolean;
  affordable: boolean;
  snack: boolean;
  storage: string;
}
function recipe(
  id: string,
  title: string,
  subtitle: string,
  icon: FuelRecipe["icon"],
  lines: Array<[string, number]>,
  steps: string[],
  prepMin: number,
  noCook = false,
  portable = true,
  affordable = true,
  snack = false,
): FuelRecipe {
  return {
    id,
    title,
    subtitle,
    icon,
    lines: lines.map(([foodId, grams]) => ({ foodId, grams })),
    steps,
    prepMin,
    noCook,
    portable,
    affordable,
    snack,
    storage: lines.some(([id]) =>
      [
        "rice",
        "pasta",
        "chicken",
        "turkey",
        "tuna",
        "eggs",
        "skyr",
        "yogurt",
        "milk",
        "kefir",
        "cottage",
        "tofu",
        "chickpeas",
      ].includes(id),
    )
      ? "Jeśli zabierasz posiłek, użyj torby chłodzącej. Gotowane składniki szybko schłodź i przechowuj w lodówce; kieruj się etykietą produktu."
      : "Spakuj do czystego, zamkniętego pojemnika. Porcje owoców podano bez niejadalnych części.",
  };
}
export const RECIPES: FuelRecipe[] = [
  recipe(
    "skyr-banana",
    "Skyr, banan i wafle",
    "Prosty zestaw bez gotowania",
    "bowl",
    [
      ["skyr", 150],
      ["banana", 118],
      ["ricecakes", 27],
    ],
    ["Otwórz skyr i obierz banana.", "Zjedz z waflami lub pokrusz je do miseczki."],
    3,
    true,
  ),
  recipe(
    "oats-skyr",
    "Owsianka ze skyrem",
    "Płatki, owoc i białko",
    "bowl",
    [
      ["oats", 50],
      ["skyr", 150],
      ["banana", 118],
    ],
    [
      "Zalej płatki gorącą wodą i zostaw do zmięknięcia.",
      "Po przestudzeniu dodaj skyr i pokrojonego banana.",
    ],
    10,
  ),
  recipe(
    "rice-chicken",
    "Ryż z kurczakiem",
    "Ciepły posiłek z trzech składników",
    "bowl",
    [
      ["rice", 200],
      ["chicken", 100],
      ["tomato", 150],
    ],
    [
      "Ugotuj ryż. Kurczaka przygotuj do pełnego ugotowania lub upieczenia.",
      "Odmierz składniki po obróbce i dodaj pomidora.",
    ],
    25,
  ),
  recipe(
    "pasta-tuna",
    "Makaron z tuńczykiem",
    "Szybki posiłek po sesji",
    "bowl",
    [
      ["pasta", 200],
      ["tuna", 100],
      ["tomato", 150],
    ],
    [
      "Ugotuj makaron i odsącz tuńczyka.",
      "Odmierz ugotowany makaron, wymieszaj z rybą i pomidorem.",
    ],
    15,
  ),
  recipe(
    "egg-sandwich",
    "Kanapki z jajkiem",
    "Znany, prosty zestaw",
    "sandwich",
    [
      ["bread", 90],
      ["eggs", 100],
      ["tomato", 100],
    ],
    ["Ugotuj jajka na twardo i obierz.", "Ułóż na pieczywie z pokrojonym pomidorem."],
    12,
  ),
  recipe(
    "tuna-sandwich",
    "Kanapki z tuńczykiem",
    "Gotowe bez kuchenki",
    "sandwich",
    [
      ["bread", 90],
      ["tuna", 100],
      ["cucumber", 100],
    ],
    ["Odsącz tuńczyka i pokrój ogórka.", "Nałóż na pieczywo i spakuj."],
    5,
    true,
  ),
  recipe(
    "turkey-wrap",
    "Wrap z indykiem",
    "Posiłek do zabrania",
    "wrap",
    [
      ["wrap", 120],
      ["turkey", 100],
      ["cucumber", 100],
    ],
    [
      "Przygotuj indyka do pełnego ugotowania lub upieczenia.",
      "Odmierz gotowe mięso i zawiń z ogórkiem w tortille.",
    ],
    25,
  ),
  recipe(
    "rice-tofu",
    "Ryż z tofu",
    "Roślinny zestaw",
    "bowl",
    [
      ["rice", 200],
      ["tofu", 120],
      ["tomato", 150],
    ],
    [
      "Ugotuj ryż i przygotuj tofu zgodnie z opakowaniem.",
      "Odmierz ugotowany ryż i dodaj tofu oraz pomidora.",
    ],
    20,
  ),
  recipe(
    "chickpea-wrap",
    "Wrap z ciecierzycą",
    "Roślinny, bez gotowania",
    "wrap",
    [
      ["wrap", 120],
      ["chickpeas", 120],
      ["tomato", 100],
    ],
    ["Odsącz gotową ciecierzycę i lekko ją rozgnieć.", "Dodaj pomidora i zawiń w tortille."],
    5,
    true,
  ),
  recipe(
    "banana-plain-ricecakes",
    "Banan i wafle ryżowe",
    "Prosta przekąska bez gotowania",
    "fruit",
    [
      ["banana", 118],
      ["ricecakes", 18],
    ],
    ["Obierz banana i odmierz wafle.", "Spakuj osobno lub zjedz razem."],
    2,
    true,
    true,
    true,
    true,
  ),
  recipe(
    "banana-ricecakes",
    "Banan i wafle z miodem",
    "Mała przekąska",
    "fruit",
    [
      ["banana", 118],
      ["ricecakes", 18],
      ["honey", 7],
    ],
    ["Obierz banana.", "Posmaruj wafle cienko miodem."],
    2,
    true,
    true,
    true,
    true,
  ),
  recipe(
    "jam-toast",
    "Pieczywo z dżemem",
    "Prosta przekąska",
    "sandwich",
    [
      ["bread", 60],
      ["jam", 30],
    ],
    ["Posmaruj pieczywo dżemem.", "Jeśli wolisz, zrób tosty."],
    2,
    true,
    true,
    true,
    true,
  ),
  recipe(
    "yogurt-fruit",
    "Jogurt, banan i płatki",
    "Miseczka bez gotowania",
    "bowl",
    [
      ["yogurt", 200],
      ["banana", 118],
      ["oats", 30],
    ],
    ["Wsyp płatki do jogurtu.", "Dodaj banana; jeśli płatki są twarde, zostaw do namoczenia."],
    5,
    true,
  ),
  recipe(
    "potato-eggs",
    "Ziemniaki z jajkami",
    "Domowy posiłek",
    "bowl",
    [
      ["potato", 250],
      ["eggs", 100],
      ["cucumber", 100],
    ],
    ["Ugotuj ziemniaki i jajka.", "Odmierz po obraniu i podaj z ogórkiem."],
    25,
    false,
    false,
  ),
  recipe(
    "milk-oats",
    "Owsianka na mleku",
    "Ciepły, prosty zestaw",
    "bowl",
    [
      ["oats", 60],
      ["milk", 250],
      ["banana", 118],
    ],
    ["Gotuj płatki na mleku do zmięknięcia.", "Dodaj banana po zdjęciu z ognia."],
    10,
  ),
  recipe(
    "peanut-banana",
    "Kanapki z bananem",
    "Pieczywo i masło orzechowe",
    "sandwich",
    [
      ["bread", 90],
      ["peanut_butter", 20],
      ["banana", 118],
    ],
    ["Posmaruj pieczywo masłem orzechowym.", "Dodaj plasterki banana."],
    4,
    true,
  ),
  recipe(
    "cottage-sandwich",
    "Pieczywo z serkiem",
    "Szybki zestaw na co dzień",
    "sandwich",
    [
      ["bread", 90],
      ["cottage", 200],
      ["tomato", 150],
    ],
    ["Nałóż serek na pieczywo.", "Dodaj pokrojonego pomidora."],
    4,
    true,
  ),
  recipe(
    "pasta-tofu",
    "Makaron z tofu",
    "Roślinny posiłek po sesji",
    "bowl",
    [
      ["pasta", 200],
      ["tofu", 120],
      ["tomato", 150],
    ],
    [
      "Ugotuj makaron i przygotuj tofu zgodnie z etykietą.",
      "Odmierz gotowe składniki i połącz z pomidorem.",
    ],
    15,
  ),
  recipe(
    "rice-turkey",
    "Ryż z indykiem",
    "Prosty posiłek na mocniejszy dzień",
    "bowl",
    [
      ["rice", 200],
      ["turkey", 100],
      ["cucumber", 100],
    ],
    [
      "Ugotuj ryż i przygotuj indyka do pełnego ugotowania lub upieczenia.",
      "Odmierz składniki po obróbce i podaj z ogórkiem.",
    ],
    25,
  ),
];
export function findRecipe(id: string): FuelRecipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
export function parsePantry(text: string): { ids: string[]; unknown: string[] } {
  const normalized = normalizeFuelText(text);
  const matched = new Set<string>();
  let remaining = normalized;
  const aliases = FOODS.flatMap((f) =>
    f.aliases.map((alias) => ({ id: f.id, alias: normalizeFuelText(alias) })),
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const { id, alias } of aliases) {
    const pattern = new RegExp(
      `(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z])`,
      "g",
    );
    if (pattern.test(remaining)) {
      matched.add(id);
      remaining = remaining.replace(pattern, " ");
    }
  }
  const unknown = remaining
    .replace(
      /\b(mam|zjadlem|zjadlam|jem|oraz|plus|jeszcze|i|z|w|lodowce|pod|reka|g|gram|gramow|ml|szt|sztuki|sztuk|gotowany|ugotowany|ugotowanego|suchego|suchy|gotowe)\b/g,
      " ",
    )
    .replace(/[\d.,-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return { ids: [...matched], unknown: [...new Set(unknown)] };
}
export function foodAllowed(
  food: FuelFood,
  restrictions: string[],
  diet: FuelPreferences["diet"],
): boolean {
  if ((diet === "vegan" && !food.vegan) || (diet === "vegetarian" && !food.vegetarian))
    return false;
  const terms = [food.label, ...food.aliases, ...food.allergens].map(normalizeFuelText);
  return !restrictions.some((raw) => {
    const r = normalizeFuelText(raw);
    if (!r) return false;
    const aliases = /nabial|bialko mleka|mlecz|dairy|milk/.test(r)
      ? [r, "mleko"]
      : /jaj|egg/.test(r)
        ? [r, "jaja"]
        : /orzech|nut|peanut/.test(r)
          ? [r, "orzechy"]
          : /gluten|celiak|pszen|wheat/.test(r)
            ? [r, "gluten", "pszenica"]
            : /soj|soy/.test(r)
              ? [r, "soja"]
              : /ryb|fish/.test(r)
                ? [r, "ryby"]
                : [r];
    return aliases.some((a) => terms.some((t) => t.includes(a) || a.includes(t)));
  });
}
export function mealNutrition(
  lines: MealLine[],
): { carbs: number; protein: number; fat: number; kcal: number; fiber: number } | null {
  const sum = { carbs: 0, protein: 0, fat: 0, kcal: 0, fiber: 0 };
  for (const line of lines) {
    const n = FOOD_NUTRIENTS[line.foodId];
    if (!n || !Number.isFinite(line.grams) || line.grams <= 0) return null;
    const factor = line.grams / 100;
    for (const key of Object.keys(sum) as Array<keyof typeof sum>) sum[key] += n[key] * factor;
  }
  return sum;
}
export function portionLabel(line: MealLine): string {
  const f = FOOD_BY_ID[line.foodId];
  if (!f) return `${Math.round(line.grams)} g`;
  const units = line.grams / f.unitGrams;
  const rounded = Math.round(units * 2) / 2;
  return `${Math.round(line.grams)} g · około ${rounded.toLocaleString("pl-PL")} ${f.unitLabel}`;
}
export function equivalentSwap(line: MealLine, newFoodId: string): MealLine | null {
  const old = FOOD_BY_ID[line.foodId],
    next = FOOD_BY_ID[newFoodId];
  const a = FOOD_NUTRIENTS[line.foodId],
    b = FOOD_NUTRIENTS[newFoodId];
  if (!old || !next || !a || !b || old.role !== next.role) return null;
  const nutrient = old.role === "protein" ? "protein" : old.role === "fat" ? "fat" : "carbs";
  if (b[nutrient] < 1 || a[nutrient] < 1) return null;
  const grams = Math.round((line.grams * a[nutrient]) / b[nutrient] / 5) * 5;
  return grams >= 5 && grams <= 700 ? { foodId: newFoodId, grams } : null;
}
export function suggestRecipes(input: {
  context: FuelContext;
  timing: FuelTiming;
  now: number;
  preferences: FuelPreferences;
  restrictions: string[];
  pantry?: string[];
  heavyRecipeIds?: string[];
}): FuelRecipe[] {
  const { preferences: p, pantry = [], restrictions } = input;
  const minutes = minutesToFuelStart(input.timing, input.now);
  const close = minutes !== null && minutes <= 60 && input.timing.phase === "before";
  return RECIPES.filter(
    (r) =>
      !p.hidden.includes(r.id) &&
      (!p.noCook || r.noCook) &&
      (!p.quick || r.prepMin <= 5) &&
      (!p.portable || r.portable) &&
      (!p.affordable || r.affordable) &&
      !r.lines.some((line) => p.excludedFoodIds.includes(line.foodId)) &&
      r.lines.every((line) => foodAllowed(FOOD_BY_ID[line.foodId], restrictions, p.diet)) &&
      (!close || r.snack) &&
      (pantry.length === 0 || r.lines.some((line) => pantry.includes(line.foodId))),
  )
    .map((r) => ({
      r,
      score:
        (p.favorites.includes(r.id) ? 4 : 0) -
        (input.heavyRecipeIds?.includes(r.id) ? 5 : 0) +
        (pantry.length
          ? r.lines.filter((l) => pantry.includes(l.foodId)).length * 3 -
            r.lines.filter((l) => !pantry.includes(l.foodId)).length * 2
          : 0) +
        (input.timing.phase === "after" && !r.snack ? 3 : 0) +
        (close && r.snack ? 5 : 0) +
        (input.context.load === "high" && !close && !r.snack ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ r }) => r);
}
export function assessMeal(
  lines: MealLine[],
  context: FuelContext,
  timing: FuelTiming,
  now: number,
): { title: string; details: string[] } {
  const hasCarb = lines.some((l) => ["carb", "fruit"].includes(FOOD_BY_ID[l.foodId]?.role));
  const hasProtein = lines.some((l) => FOOD_BY_ID[l.foodId]?.role === "protein");
  const minutes = minutesToFuelStart(timing, now);
  const n = mealNutrition(lines);
  const details: string[] = [];
  if (!hasCarb)
    details.push(
      "W rozpoznanych składnikach nie ma wyraźnego źródła węglowodanów. Możesz dodać pieczywo, ryż lub owoc, jeśli pasuje do Twoich ograniczeń.",
    );
  if ((timing.phase === "after" || timing.phase === "ordinary") && !hasProtein)
    details.push(
      "Możesz uzupełnić posiłek o tolerowane źródło białka, np. tofu, nabiał lub jajka.",
    );
  if (minutes !== null && minutes <= 60 && n && (n.fat > 15 || n.fiber > 8))
    details.push(
      "Do treningu zostało niewiele czasu. Ten zestaw może być cięższy — rozważ mniejszą porcję lub zostaw część na później, zgodnie ze swoją tolerancją.",
    );
  if (context.load === "high" && hasCarb)
    details.push(
      "Masz źródło węglowodanów. Sama lista produktów nie pozwala ocenić, czy pokryłeś potrzeby całego dnia.",
    );
  if (!details.length)
    details.push(
      "Możesz wykorzystać ten zestaw. Dopasuj porcję do apetytu, czasu i wcześniejszego jedzenia.",
    );
  return {
    title:
      hasCarb && (timing.phase === "before" || hasProtein)
        ? "Masz dobrą bazę posiłku"
        : "Możesz uzupełnić ten zestaw",
    details,
  };
}
