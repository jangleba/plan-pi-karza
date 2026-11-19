import type { Food } from "../engine/foods";

/**
 * Wyszukiwarka produktów ze sklepów: Open Food Facts (otwarta baza, licencja ODbL – wymagane podanie źródła).
 * Dane wpisują użytkownicy, więc bywają niepełne lub błędne; odrzucamy wpisy bez węglowodanów/białka na 100 g.
 */
const URL_BASE = "https://search.openfoodfacts.org/search";

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Zamienia odpowiedź API na produkty Fuel; wpisy nie do użycia są pomijane. */
export function parseOff(json: unknown): Food[] {
  const hits = (json as { hits?: unknown[] } | null)?.hits;
  if (!Array.isArray(hits)) return [];
  const out: Food[] = [];
  const seen = new Set<string>();
  for (const h of hits as Array<Record<string, unknown>>) {
    const name = typeof h["product_name"] === "string" ? h["product_name"].trim() : "";
    const nutr = (h["nutriments"] ?? {}) as Record<string, unknown>;
    const carb = num(nutr["carbohydrates_100g"]);
    const protein = num(nutr["proteins_100g"]);
    const code = typeof h["code"] === "string" || typeof h["code"] === "number" ? String(h["code"]) : "";
    if (!name || name.length > 80 || !code || carb === null || protein === null) continue;
    if (carb < 0 || protein < 0 || carb + protein > 100.5) continue;
    const brands = h["brands"];
    const brand = (Array.isArray(brands) ? brands[0] : typeof brands === "string" ? brands.split(",")[0] : "")?.toString().trim() || undefined;
    const key = `${name.toLowerCase()}|${(brand ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const serving = num(h["serving_quantity"]);
    out.push({
      id: `off:${code}`, name, brand, carb100: Math.round(carb * 10) / 10, protein100: Math.round(protein * 10) / 10,
      group: "other", source: "off",
      unit: serving !== null && serving >= 5 && serving <= 1000 ? { g: serving, one: "porcja", few: "porcje", many: "porcji" } : undefined,
    });
  }
  return out;
}

/** Zapytanie do Open Food Facts – wykonywane po stronie serwera (API nie wysyła nagłówków CORS dla przeglądarki). */
export async function fetchOffFoods(query: string, signal?: AbortSignal): Promise<Food[]> {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, page_size: "20", fields: "code,product_name,brands,nutriments,serving_quantity" });
  const res = await fetch(`${URL_BASE}?${params}`, { signal, headers: { "User-Agent": "Ballwise-app", Accept: "application/json" } });
  if (!res.ok) throw new Error(`Open Food Facts: ${res.status}`);
  return parseOff(await res.json());
}

/** Wyszukiwanie z przeglądarki: przez adres aplikacji `/api/foods` (serwer pośredniczy w zapytaniu). */
export async function searchOff(query: string, signal?: AbortSignal): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`/api/foods?${new URLSearchParams({ q })}`, { signal });
  if (!res.ok) throw new Error(`Wyszukiwarka: ${res.status}`);
  const json = (await res.json()) as { foods?: Food[] };
  return Array.isArray(json.foods) ? json.foods : [];
}
