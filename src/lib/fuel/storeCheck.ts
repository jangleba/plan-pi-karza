import type { FuelLoadBand, FuelMoment } from "./assistant";

export interface StoreProduct {
  barcode?: string;
  name: string;
  brand?: string | null;
  ingredientsText?: string | null;
  categories?: string[];
  imageUrl?: string | null;
  nutriments?: {
    carbohydrates100g?: number | null;
    protein100g?: number | null;
    fat100g?: number | null;
    fiber100g?: number | null;
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
  if (clean.length < 8 || clean.length > 14) return null;
  const fields = [
    "product_name_pl",
    "product_name",
    "generic_name_pl",
    "brands",
    "ingredients_text_pl",
    "ingredients_text",
    "categories_tags",
    "image_front_small_url",
    "image_front_url",
    "nutriments",
  ].join(",");
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${fields}`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error("Nie udało się sprawdzić bazy produktów.");
  const data = (await response.json()) as OpenFoodFactsResponse;
  if (data.status !== 1 || !data.product) return null;
  const product = data.product;
  const name = product.product_name_pl ?? product.product_name ?? product.generic_name_pl;
  if (!name) return null;
  const nutrients = product.nutriments ?? {};
  return {
    barcode: clean,
    name,
    brand: product.brands ?? null,
    ingredientsText: product.ingredients_text_pl ?? product.ingredients_text ?? null,
    categories: product.categories_tags ?? [],
    imageUrl: product.image_front_small_url ?? product.image_front_url ?? null,
    nutriments: {
      carbohydrates100g: asNumber(nutrients["carbohydrates_100g"]),
      protein100g: asNumber(nutrients["proteins_100g"]),
      fat100g: asNumber(nutrients["fat_100g"]),
      fiber100g: asNumber(nutrients["fiber_100g"]),
    },
  };
}

export function productFromName(name: string): StoreProduct {
  return { name: name.trim() };
}

export function evaluateStoreProduct(input: {
  product: StoreProduct;
  moment: FuelMoment;
  load: FuelLoadBand;
}): StoreEvaluation {
  const text = normalize(
    [
      input.product.name,
      input.product.brand,
      input.product.ingredientsText,
      ...(input.product.categories ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  const nutrients = input.product.nutriments;
  const carb = contains(text, CARB_WORDS) || (nutrients?.carbohydrates100g ?? 0) >= 15;
  const protein = contains(text, PROTEIN_WORDS) || (nutrients?.protein100g ?? 0) >= 8;
  const fluid = contains(text, FLUID_WORDS);
  const treatOnly = contains(text, TREAT_WORDS) && !protein;
  const heavy = contains(text, HEAVY_WORDS) || (nutrients?.fat100g ?? 0) >= 18;
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

  if (treatOnly || (input.moment === "before" && heavy)) {
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
    if (carb && !heavy)
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

function asNumber(value: number | string | undefined): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
