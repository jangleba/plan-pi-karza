/**
 * Alergeny i ograniczenia żywieniowe w Fuel – wyłącznie informacja pomocnicza, NIE ocena bezpieczeństwa.
 *
 *  – Dane dotyczą ogólnych produktów z wbudowanej bazy (nie konkretnej marki, partii ani przepisu). Skład realnego produktu
 *    może się różnić: zawsze należy sprawdzić etykietę.
 *  – Produkt bez wpisu w tej mapie (np. z Open Food Facts, własny, ulubiony) to „brak danych”, a NIE „bezpieczny”.
 *  – „Brak znanych alergenów” w naszej bazie również nie oznacza, że produkt jest bezpieczny dla osoby uczulonej.
 *  – Wybór alergenów/diety i własne słowa wykluczeń zostają na urządzeniu.
 */
import { FOODS, FOOD_BY_ID, norm } from "./foods";
import type { ScaledIdea } from "./mealplan";

export type Allergen = "gluten" | "milk" | "egg" | "nuts" | "fish" | "soy" | "sesame";
export type Diet = "none" | "vegetarian" | "vegan";
type Animal = "meat" | "fish" | "dairy" | "egg" | "honey";

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  gluten: "gluten (pszenica, żyto, jęczmień)", milk: "mleko i laktoza", egg: "jajka", nuts: "orzechy i orzeszki ziemne", fish: "ryby", soy: "soja", sesame: "sezam",
};
export const ALLERGENS = Object.keys(ALLERGEN_LABEL) as Allergen[];

interface Tag { contains?: Allergen[]; may?: Allergen[]; animal?: Animal }

/** Wpisy dla WSZYSTKICH produktów wbudowanej bazy (test pilnuje kompletności: nowy produkt wymaga decyzji o alergenach). */
const NONE: Tag = {};
export const FOOD_TAGS: Record<string, Tag> = {
  "rice-dry": NONE, "rice-cooked": NONE, potato: NONE,
  "pasta-dry": { contains: ["gluten"] }, "pasta-cooked": { contains: ["gluten"] },
  oats: { may: ["gluten"] }, cornflakes: { contains: ["gluten"] },
  "bread-white": { contains: ["gluten"] }, "bread-rye": { contains: ["gluten"] }, roll: { contains: ["gluten"], may: ["milk", "egg", "soy", "sesame"] },
  "buckwheat-dry": { may: ["gluten"] }, "buckwheat-cooked": { may: ["gluten"] },
  jam: NONE, honey: { animal: "honey" }, raisins: NONE,
  banana: NONE, apple: NONE, orange: NONE, "fruit-mix": NONE,
  yogurt: { contains: ["milk"], animal: "dairy" }, skyr: { contains: ["milk"], animal: "dairy" }, "cottage-semi": { contains: ["milk"], animal: "dairy" },
  "cottage-soft": { contains: ["milk"], animal: "dairy" }, milk: { contains: ["milk"], animal: "dairy" }, kefir: { contains: ["milk"], animal: "dairy" }, cheese: { contains: ["milk"], animal: "dairy" },
  chicken: { animal: "meat" }, turkey: { animal: "meat" }, "beef-mince": { animal: "meat" },
  salmon: { contains: ["fish"], animal: "fish" }, mackerel: { contains: ["fish"], animal: "fish" }, cod: { contains: ["fish"], animal: "fish" }, tuna: { contains: ["fish"], animal: "fish" },
  egg: { contains: ["egg"], animal: "egg" }, ham: { animal: "meat", may: ["milk", "soy", "gluten"] },
  tofu: { contains: ["soy"] }, beans: NONE, lentils: NONE, hummus: { contains: ["sesame"] },
  "veg-mix": NONE, "olive-oil": NONE, avocado: NONE,
  almonds: { contains: ["nuts"] }, walnuts: { contains: ["nuts"] }, "peanut-butter": { contains: ["nuts"] },
  oj: NONE, iso: NONE, gel: NONE,
};

export interface DietPrefs { allergens: Allergen[]; diet: Diet; /** Własne słowa, np. „kiwi” (dopasowanie po nazwie, bez polskich znaków i wielkości liter). */ custom: string[] }
export const NO_DIET: DietPrefs = { allergens: [], diet: "none", custom: [] };
export const hasDietPrefs = (p: DietPrefs) => p.allergens.length > 0 || p.diet !== "none" || p.custom.length > 0;

export type FoodVerdict =
  | { kind: "conflict"; reasons: string[] }   // znany konflikt z wyborem użytkownika
  | { kind: "unknown" }                       // brak danych o produkcie – NIE znaczy, że jest bezpieczny
  | { kind: "no_known" };                     // w naszej bazie nie ma znanego konfliktu – nadal sprawdź etykietę

const ANIMAL_BLOCKED: Record<Diet, Animal[]> = { none: [], vegetarian: ["meat", "fish"], vegan: ["meat", "fish", "dairy", "egg", "honey"] };
const ANIMAL_LABEL: Record<Animal, string> = { meat: "mięso", fish: "ryby", dairy: "nabiał", egg: "jajka", honey: "miód" };

export function assessFood(foodId: string, name: string, p: DietPrefs): FoodVerdict {
  const reasons: string[] = [];
  const n = norm(name);
  for (const w of p.custom.map(norm).filter((x) => x.length >= 2)) if (n.includes(w)) reasons.push(`zawiera „${w}” (Twoja lista)`);
  const tag = FOOD_TAGS[foodId];
  if (!tag || !FOOD_BY_ID[foodId]) return reasons.length ? { kind: "conflict", reasons } : { kind: "unknown" };
  for (const a of p.allergens) {
    if (tag.contains?.includes(a)) reasons.push(`zawiera: ${ALLERGEN_LABEL[a]}`);
    else if (tag.may?.includes(a)) reasons.push(`może zawierać: ${ALLERGEN_LABEL[a]}`);
  }
  if (tag.animal && ANIMAL_BLOCKED[p.diet].includes(tag.animal)) reasons.push(`nie pasuje do diety (${ANIMAL_LABEL[tag.animal]})`);
  return reasons.length ? { kind: "conflict", reasons } : { kind: "no_known" };
}

export interface IdeaVerdict { conflict: string[]; unknownFoods: string[] }
export function assessIdea(idea: ScaledIdea, p: DietPrefs): IdeaVerdict {
  const conflict: string[] = [], unknownFoods: string[] = [];
  for (const l of idea.lines) {
    const v = assessFood(l.food.id, l.food.name, p);
    if (v.kind === "conflict") conflict.push(...v.reasons.map((r) => `${l.food.name}: ${r}`));
    else if (v.kind === "unknown") unknownFoods.push(l.food.name);
  }
  return { conflict, unknownFoods };
}

/** Podział pomysłów: te bez znanego konfliktu (z oznaczeniem braku danych) i ukryte ze względu na wybory użytkownika. */
export function filterIdeas(ideas: ScaledIdea[], p: DietPrefs): { shown: Array<{ idea: ScaledIdea; unknownFoods: string[] }>; hidden: Array<{ idea: ScaledIdea; conflict: string[] }> } {
  if (!hasDietPrefs(p)) return { shown: ideas.map((idea) => ({ idea, unknownFoods: [] })), hidden: [] };
  const shown: Array<{ idea: ScaledIdea; unknownFoods: string[] }> = [], hidden: Array<{ idea: ScaledIdea; conflict: string[] }> = [];
  for (const idea of ideas) {
    const v = assessIdea(idea, p);
    if (v.conflict.length) hidden.push({ idea, conflict: v.conflict }); else shown.push({ idea, unknownFoods: v.unknownFoods });
  }
  return { shown, hidden };
}

/** Lista wbudowanych produktów bez wpisu (do testu kompletności). */
export const foodsWithoutTags = (): string[] => FOODS.filter((f) => !(f.id in FOOD_TAGS)).map((f) => f.id);

/** Predykat „nie dokładaj automatycznie” dla produktów z wbudowanej bazy (znany konflikt z wyborami użytkownika). */
export const avoidFor = (p: DietPrefs): ((foodId: string) => boolean) | undefined =>
  hasDietPrefs(p) ? (id) => { const f = FOOD_BY_ID[id]; return !!f && assessFood(id, f.name, p).kind === "conflict"; } : undefined;
