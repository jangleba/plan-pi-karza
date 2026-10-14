import type { FuelLoadBand, FuelMoment } from "./assistant";
import { validProductBarcode } from "./barcode";
import { FOOD_BY_ID, foodAllowed, parsePantry } from "./catalog";
import type { FuelPreferences } from "./experience";
import { fuelRequest } from "./request";

export interface StoreProduct {
  barcode?: string;
  name: string;
  brand?: string | null;
  ingredientsText?: string | null;
  categories?: string[];
  imageUrl?: string | null;
  source?: "openfoodfacts" | "label" | "name";
  nutritionUnit?: "g" | "ml";
  allergens?: string[];
  nutriments?: {
    carbohydrates100g?: number | null;
    protein100g?: number | null;
    fat100g?: number | null;
    fiber100g?: number | null;
    energyKcal100g?: number | null;
  };
}

export type StoreVerdict = "good" | "add" | "swap" | "unknown";

export interface StoreEvaluation {
  verdict: StoreVerdict;
  label: string;
  reason: string;
  addition: string | null;
  replacement: string | null;
  confidence: "good" | "orientational";
}

interface OpenFoodFactsResponse {
  status?: number;
  product?: {
    product_name_pl?: string;
    product_name?: string;
    generic_name_pl?: string;
    brands?: string;
    ingredients_text_pl?: string;
    ingredients_text?: string;
    categories_tags?: string[];
    allergens_tags?: string[];
    image_front_small_url?: string;
    image_front_url?: string;
    nutriments?: Record<string, number | string | undefined>;
  };
}

export async function lookupStoreProduct(
  barcode: string,
  signal?: AbortSignal,
): Promise<StoreProduct | null> {
  const clean = barcode.replace(/\D/g, "");
  if (!validProductBarcode(clean)) return null;
  const fields = [
    "product_name_pl",
    "product_name",
    "generic_name_pl",
    "brands",
    "ingredients_text_pl",
    "ingredients_text",
    "categories_tags",
    "allergens_tags",
    "image_front_small_url",
    "image_front_url",
    "nutriments",
  ].join(",");
  const data = await fuelRequest(
    async (requestSignal) => {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${fields}`,
        { signal: requestSignal, headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("Nie udało się sprawdzić bazy produktów.");
      return (await response.json()) as OpenFoodFactsResponse | null;
    },
    12_000,
    "Baza produktów odpowiada zbyt długo. Wpisz nazwę produktu lub dane z etykiety.",
    signal,
  );
  if (data?.status !== 1 || !data.product) return null;
  const product = data.product;
  const name =
    stringValue(product.product_name_pl) ??
    stringValue(product.product_name) ??
    stringValue(product.generic_name_pl);
  if (!name) return null;
  const nutrients = product.nutriments ?? {};
  return {
    barcode: clean,
    source: "openfoodfacts",
    allergens: stringArray(product.allergens_tags),
    name,
    brand: stringValue(product.brands),
    ingredientsText:
      stringValue(product.ingredients_text_pl) ?? stringValue(product.ingredients_text),
    categories: stringArray(product.categories_tags),
    imageUrl: stringValue(product.image_front_small_url) ?? stringValue(product.image_front_url),
    nutriments: {
      carbohydrates100g: asNumber(nutrients["carbohydrates_100g"]),
      protein100g: asNumber(nutrients["proteins_100g"]),
      fat100g: asNumber(nutrients["fat_100g"]),
      fiber100g: asNumber(nutrients["fiber_100g"]),
      energyKcal100g: asNumber(nutrients["energy-kcal_100g"], 1000),
    },
  };
}

export function productFromName(name: string): StoreProduct {
  return { name: name.trim(), source: "name" };
}

interface StoreEvaluationInput {
  product: StoreProduct;
  moment: FuelMoment;
  load: FuelLoadBand;
  minutesToStart?: number | null;
  restrictions?: string[];
  diet?: FuelPreferences["diet"];
  portion?: number | null;
  unit?: "g" | "ml";
}
export function evaluateStoreProduct(input: StoreEvaluationInput): StoreEvaluation {
  const evaluation = evaluateStoreProductCore(input);
  const result: StoreEvaluation = {
    ...evaluation,
    confidence: input.product.source === "name" ? "orientational" : evaluation.confidence,
  };
  if (!input.restrictions?.length && (!input.diet || input.diet === "all")) return result;
  const restrictions = input.restrictions ?? [],
    diet = input.diet ?? "all";
  const allowed = (id: string) => foodAllowed(FOOD_BY_ID[id], restrictions, diet);
  const carbs = ["banana", "bread", "ricecakes", "juice"]
    .filter(allowed)
    .map((id) => FOOD_BY_ID[id].label);
  const protein = ["skyr", "yogurt", "tofu", "tuna", "chickpeas", "eggs"]
    .filter(allowed)
    .map((id) => FOOD_BY_ID[id].label);
  const allergyFoods: Record<string, string> = {
    milk: "milk",
    eggs: "eggs",
    nuts: "nuts",
    peanuts: "peanut_butter",
    soybeans: "tofu",
    fish: "tuna",
    gluten: "bread",
    wheat: "bread",
  };
  const ids = [
    ...parsePantry([input.product.name, input.product.ingredientsText].filter(Boolean).join(" "))
      .ids,
    ...(input.product.allergens ?? [])
      .map((tag) => allergyFoods[tag.split(":").at(-1) ?? ""])
      .filter(Boolean),
  ];
  if (ids.some((id) => !allowed(id)))
    return {
      verdict: "swap",
      label: "Sprawdź ograniczenia",
      confidence: "orientational",
      reason:
        "Rozpoznany rodzaj lub skład produktu może kolidować z Twoimi ustawieniami. Sprawdź etykietę przed wyborem.",
      addition: null,
      replacement: carbs.length && protein.length ? `${carbs[0]} + ${protein[0]}` : null,
    };
  return {
    ...result,
    addition: result.addition
      ? (input.moment === "before" ||
        (input.product.nutriments?.protein100g ?? 0) >= 8 ||
        /skyr|kefir|jogurt|tofu|tuncz|kurcz|jaj|serek/.test(normalize(input.product.name))
          ? carbs.slice(0, 3).join(", ")
          : protein.slice(0, 3).join(", ")) || null
      : null,
    replacement: result.replacement
      ? carbs.length && protein.length
        ? `${carbs[0]} + ${protein[0]}`
        : null
      : null,
  };
}
function evaluateStoreProductCore(input: StoreEvaluationInput): StoreEvaluation {
  const text = normalize(
    [input.product.name, ...(input.product.categories ?? [])].filter(Boolean).join(" "),
  );
  const nutrients = input.product.nutriments;
  const portion = input.portion ?? 100;
  if (
    !Number.isFinite(portion) ||
    portion <= 0 ||
    portion > 2000 ||
    (input.unit && input.product.nutritionUnit && input.unit !== input.product.nutritionUnit)
  )
    return {
      verdict: "unknown",
      label: "Sprawdź porcję",
      reason: "Podaj ilość i jednostkę zgodną z etykietą produktu.",
      addition: null,
      replacement: null,
      confidence: "orientational",
    };
  const ratio = portion / 100;
  const carb =
    nutrients?.carbohydrates100g != null
      ? nutrients.carbohydrates100g * ratio >= 15
      : contains(text, CARB_WORDS);
  const protein =
    nutrients?.protein100g != null
      ? nutrients.protein100g * ratio >= 10
      : contains(text, PROTEIN_WORDS);
  const fluid = contains(text, FLUID_WORDS);
  const treatOnly = contains(text, TREAT_WORDS) && !protein;
  const heavy =
    nutrients?.fat100g != null
      ? nutrients.fat100g * ratio >= 15 || (nutrients.fiber100g ?? 0) * ratio >= 8
      : contains(text, HEAVY_WORDS);
  const known = carb || protein || fluid || treatOnly || heavy;

  if (!known) {
    return {
      verdict: "unknown",
      label: "Za mało danych",
      reason: "Nie mam dość pewnych informacji, żeby uczciwie ocenić ten produkt.",
      addition: null,
      replacement: null,
      confidence: "orientational",
    };
  }

  if (fluid && !carb && !protein)
    return good("To napój do nawodnienia. Nie zastępuje posiłku ani źródła paliwa.");

  if (
    (treatOnly && !carb) ||
    (input.moment === "before" &&
      heavy &&
      (input.minutesToStart == null || input.minutesToStart <= 90))
  ) {
    return {
      verdict: "swap",
      label: "Lepiej zamień",
      reason:
        input.moment === "before"
          ? "Przed wysiłkiem ten wybór może być ciężki albo dać samo szybkie paliwo bez pełnego posiłku."
          : "Ten produkt sam nie daje dobrego połączenia paliwa i regeneracji.",
      addition: null,
      replacement:
        input.moment === "after"
          ? "kanapka z kurczakiem lub skyr + banan"
          : "lekka kanapka + banan albo skyr + jasna bułka",
      confidence: "good",
    };
  }

  if (input.moment === "after") {
    if (carb && protein) return good("Łączy źródło węglowodanów i białka po sesji.");
    return {
      verdict: "add",
      label: "Bierz + dodaj",
      reason: protein
        ? "Ma źródło białka, ale brakuje wyraźnego źródła węglowodanów."
        : "Daje paliwo, ale po sesji brakuje wyraźnego źródła białka.",
      addition: protein
        ? "banan, sok 100% lub jasna bułka"
        : "skyr, kefir lub kanapka z chudym mięsem",
      replacement: null,
      confidence: "good",
    };
  }

  if (input.moment === "before") {
    if (carb && heavy)
      return {
        ...good(
          "Ma źródło węglowodanów, ale jest cięższym wyborem. Dopasuj porcję do czasu i swojej tolerancji.",
        ),
        confidence: "orientational",
      };
    if (carb)
      return good(
        input.load === "high"
          ? "To praktyczne źródło paliwa przed mocną sesją."
          : "To prosty wybór przed dzisiejszą jednostką.",
      );
    return {
      verdict: "add",
      label: "Bierz + dodaj",
      reason: "Samo w sobie nie daje wyraźnej bazy paliwa przed treningiem.",
      addition: "banan, jasna bułka lub sok 100%",
      replacement: null,
      confidence: "orientational",
    };
  }

  if (carb && protein) return good("To prosty, pełniejszy wybór na zwykły posiłek.");
  return {
    verdict: "add",
    label: "Bierz + dodaj",
    reason: "To może być część posiłku, ale sam produkt jest niepełny.",
    addition: protein ? "pieczywo lub owoc" : "skyr, kefir, jajka albo chude mięso",
    replacement: null,
    confidence: "orientational",
  };
}

function good(reason: string): StoreEvaluation {
  return {
    verdict: "good",
    label: "Dobry wybór",
    reason,
    addition: null,
    replacement: null,
    confidence: "good",
  };
}

const CARB_WORDS = [
  "wrap",
  "tortilla",
  "kanap",
  "bulka",
  "chleb",
  "ryz",
  "makaron",
  "ows",
  "banan",
  "mus owoc",
  "sok 100",
  "smoothie",
];
const PROTEIN_WORDS = [
  "kurcz",
  "indyk",
  "tuncz",
  "jaj",
  "skyr",
  "kefir",
  "jogurt",
  "protein",
  "bialk",
  "twarog",
  "serek wiejski",
  "tofu",
];
const FLUID_WORDS = ["woda", "napoj izotoniczny", "isotonic"];
const TREAT_WORDS = [
  "chips",
  "chrupki",
  "baton",
  "cukierki",
  "donut",
  "paczek",
  "cola",
  "energy drink",
  "napoj energetyczny",
];
const HEAVY_WORDS = ["majonez", "smaz", "fryt", "pizza", "croissant", "burger", "salami"];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
}

function contains(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
function asNumber(value: number | string | undefined, max = 100): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
}
