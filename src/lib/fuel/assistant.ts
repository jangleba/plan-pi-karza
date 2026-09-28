export type FuelMoment = "before" | "after" | "ordinary";
export type FuelLoadBand = "low" | "moderate" | "high";

export type IngredientRole = "carb" | "protein" | "fruit" | "vegetable" | "fluid" | "fat";

export interface FuelIngredient {
  id: string;
  label: string;
  aliases: string[];
  roles: IngredientRole[];
  light?: boolean;
  heavy?: boolean;
}

export interface ParsedFuelIngredients {
  items: FuelIngredient[];
  unknown: string[];
}

export interface FuelMealSuggestion {
  id: string;
  title: string;
  why: string;
  add: string | null;
  ingredients: FuelIngredient[];
  confidence: "good" | "orientational";
}

const INGREDIENTS: FuelIngredient[] = [
  ingredient("rice", "ryż", ["ryz", "ryzu"], ["carb"], true),
  ingredient("pasta", "makaron", ["makaronu", "pasta"], ["carb"]),
  ingredient("bread", "pieczywo", ["chleb", "bulka", "bulke", "pieczywo", "tosty"], ["carb"], true),
  ingredient("wrap", "tortilla", ["wrap", "tortille", "tortilla"], ["carb"], true),
  ingredient("oats", "płatki owsiane", ["platki", "owsiane", "owsianka"], ["carb"]),
  ingredient("cereal", "płatki", ["musli", "granola", "platki kukurydziane"], ["carb"]),
  ingredient("potato", "ziemniaki", ["ziemniak", "ziemniakow"], ["carb"]),
  ingredient("eggs", "jajka", ["jajko", "jajek", "jaja"], ["protein", "fat"]),
  ingredient("chicken", "kurczak", ["kurczaka", "piers z kurczaka"], ["protein"], true),
  ingredient("turkey", "indyk", ["indyka"], ["protein"], true),
  ingredient("tuna", "tuńczyk", ["tunczyk", "tunczyka"], ["protein"], true),
  ingredient("skyr", "skyr", ["skyra"], ["protein"], true),
  ingredient("yogurt", "jogurt", ["jogurt naturalny", "jogurtu"], ["protein"], true),
  ingredient("kefir", "kefir", ["kefiru"], ["protein", "fluid"], true),
  ingredient("milk", "mleko", ["mleka"], ["protein", "fluid"], true),
  ingredient("cottage", "serek wiejski", ["serek", "serka wiejskiego", "twarog"], ["protein"]),
  ingredient("tofu", "tofu", [], ["protein"]),
  ingredient("banana", "banan", ["banana", "banany"], ["carb", "fruit"], true),
  ingredient("apple", "jabłko", ["jablko", "jablka"], ["fruit"], true),
  ingredient("berries", "owoce jagodowe", ["borowki", "maliny", "truskawki"], ["fruit"], true),
  ingredient("mango", "mango", [], ["carb", "fruit"], true),
  ingredient("tomato", "pomidor", ["pomidora", "pomidory"], ["vegetable"]),
  ingredient("cucumber", "ogórek", ["ogorek", "ogorka"], ["vegetable"]),
  ingredient("lettuce", "sałata", ["salata", "salate"], ["vegetable"]),
  ingredient("water", "woda", ["wode", "wody"], ["fluid"], true),
  ingredient("juice", "sok", ["soku", "sok 100"], ["carb", "fluid"], true),
  ingredient("nuts", "orzechy", ["orzechow"], ["fat"], false, true),
  ingredient("peanut_butter", "masło orzechowe", ["maslo orzechowe"], ["fat"], false, true),
  ingredient("avocado", "awokado", [], ["fat"], false, true),
];

function ingredient(
  id: string,
  label: string,
  aliases: string[],
  roles: IngredientRole[],
  light = false,
  heavy = false,
): FuelIngredient {
  return { id, label, aliases: [label, ...aliases], roles, light, heavy };
}

export function normalizeFuelText(value: string): string {
  return value
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9%\s,.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFuelIngredients(raw: string): ParsedFuelIngredients {
  const text = ` ${normalizeFuelText(raw)} `;
  const found = INGREDIENTS.filter((item) =>
    item.aliases.some((alias) => {
      const normalized = normalizeFuelText(alias);
      return (
        text.includes(` ${normalized} `) ||
        text.includes(` ${normalized},`) ||
        text.includes(`,${normalized} `)
      );
    }),
  );

  const pieces = normalizeFuelText(raw)
    .replace(/\b(mam|jeszcze|oraz|plus|do tego|w lodowce|pod reka)\b/g, " ")
    .split(/,|\bi\b/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const unknown = pieces.filter(
    (piece) =>
      !found.some((item) => item.aliases.some((alias) => piece.includes(normalizeFuelText(alias)))),
  );
  return { items: found, unknown };
}

export function recommendFuelMeals(input: {
  ingredients: FuelIngredient[];
  moment: FuelMoment;
  load: FuelLoadBand;
}): FuelMealSuggestion[] {
  const { ingredients, moment, load } = input;
  if (ingredients.length === 0) return [];

  const byId = new Map(ingredients.map((item) => [item.id, item]));
  const carb = firstWithRole(ingredients, "carb");
  const protein = firstWithRole(ingredients, "protein");
  const fruit = firstWithRole(ingredients, "fruit");
  const vegetable = firstWithRole(ingredients, "vegetable");
  const results: FuelMealSuggestion[] = [];

  const add = (id: string, title: string, ids: string[]) => {
    const used = ids.map((key) => byId.get(key)).filter(Boolean) as FuelIngredient[];
    if (used.length < 2 || results.some((result) => result.id === id)) return;
    results.push(buildSuggestion(id, title, used, moment, load));
  };

  if (byId.has("oats") && (byId.has("skyr") || byId.has("yogurt") || byId.has("milk"))) {
    const dairy = byId.has("skyr") ? "skyr" : byId.has("yogurt") ? "yogurt" : "milk";
    add("oat-bowl", "Płatki z nabiałem i owocem", ["oats", dairy, fruit?.id ?? "banana"]);
  }
  if (byId.has("rice") && (byId.has("chicken") || byId.has("eggs") || byId.has("tuna"))) {
    const mainProtein = byId.has("chicken") ? "chicken" : byId.has("eggs") ? "eggs" : "tuna";
    add("rice-bowl", `Ryż z ${labelInInstrumental(byId.get(mainProtein)!)}`, [
      "rice",
      mainProtein,
      vegetable?.id ?? fruit?.id ?? "",
    ]);
  }
  if (byId.has("bread") && protein) {
    add("sandwich", `Kanapki z ${labelInInstrumental(protein)}`, [
      "bread",
      protein.id,
      vegetable?.id ?? fruit?.id ?? "",
    ]);
  }
  if (byId.has("wrap") && protein) {
    add("wrap", `Wrap z ${labelInInstrumental(protein)}`, [
      "wrap",
      protein.id,
      vegetable?.id ?? fruit?.id ?? "",
    ]);
  }
  if (byId.has("pasta") && protein) {
    add("pasta", `Makaron z ${labelInInstrumental(protein)}`, [
      "pasta",
      protein.id,
      vegetable?.id ?? "",
    ]);
  }

  if (results.length === 0 && carb && protein) {
    const used = [carb, protein, fruit ?? vegetable].filter(Boolean) as FuelIngredient[];
    results.push(buildSuggestion("simple-combo", joinLabels(used), used, moment, load));
  }
  if (results.length === 0) {
    const used = ingredients.slice(0, 3);
    const missing = carb ? "wyraźne źródło białka" : "proste źródło węglowodanów";
    results.push({
      id: "needs-one-item",
      title: joinLabels(used),
      why: momentReason(moment, load, Boolean(carb), Boolean(protein)),
      add: missing,
      ingredients: used,
      confidence: "orientational",
    });
  }

  return results.slice(0, 3);
}

function buildSuggestion(
  id: string,
  title: string,
  ingredients: FuelIngredient[],
  moment: FuelMoment,
  load: FuelLoadBand,
): FuelMealSuggestion {
  const hasCarb = ingredients.some((item) => item.roles.includes("carb"));
  const hasProtein = ingredients.some((item) => item.roles.includes("protein"));
  const heavy = ingredients.some((item) => item.heavy);
  let add: string | null = null;
  if (!hasCarb) add = "banan, jasne pieczywo albo ryż";
  if (moment === "after" && !hasProtein) add = "skyr, kefir, jajka albo chude mięso";
  if (!ingredients.some((item) => item.roles.includes("fluid")))
    add = add ? `${add} + woda` : "woda";
  return {
    id,
    title,
    why:
      heavy && moment === "before"
        ? "To może być cięższe przed wysiłkiem. Wybierz mniejszą porcję i pomiń tłuste dodatki."
        : momentReason(moment, load, hasCarb, hasProtein),
    add,
    ingredients,
    confidence: hasCarb && (moment !== "after" || hasProtein) ? "good" : "orientational",
  };
}

function momentReason(
  moment: FuelMoment,
  load: FuelLoadBand,
  hasCarb: boolean,
  hasProtein: boolean,
): string {
  if (moment === "before") {
    return load === "high"
      ? "Daje prostą bazę paliwa przed mocną jednostką bez liczenia kalorii."
      : "To prosty wybór przed dzisiejszą jednostką.";
  }
  if (moment === "after") {
    return hasCarb && hasProtein
      ? "Łączy źródło węglowodanów i białka po dzisiejszej sesji."
      : "Po sesji warto połączyć źródło węglowodanów z wyraźnym źródłem białka.";
  }
  return hasCarb && hasProtein
    ? "To prosty, zbilansowany posiłek niezależnie od treningu."
    : "To możliwa baza posiłku, ale brakuje jednego ważnego elementu.";
}

function firstWithRole(items: FuelIngredient[], role: IngredientRole): FuelIngredient | undefined {
  return items.find((item) => item.roles.includes(role));
}

function joinLabels(items: FuelIngredient[]): string {
  const labels = items.map((item) => item.label);
  if (labels.length < 2) return labels[0] ?? "Prosty posiłek";
  return `${labels.slice(0, -1).join(", ")} i ${labels.at(-1)}`;
}

function labelInInstrumental(item: FuelIngredient): string {
  const forms: Record<string, string> = {
    chicken: "kurczakiem",
    eggs: "jajkami",
    tuna: "tuńczykiem",
    turkey: "indykiem",
    skyr: "skyrem",
    yogurt: "jogurtem",
    tofu: "tofu",
    cottage: "serkiem wiejskim",
  };
  return forms[item.id] ?? item.label;
}

export function removeIngredient(items: FuelIngredient[], id: string): FuelIngredient[] {
  return items.filter((item) => item.id !== id);
}
