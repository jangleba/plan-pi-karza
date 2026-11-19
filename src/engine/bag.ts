/**
 * Torba meczowa: lista rzeczy do spakowania. Jedzenie i picie wynikają z planu dnia (posiłki wokół meczu),
 * reszta to ogólna lista kontrolna (nie z badań) – do uzupełnienia przez zawodnika/klub.
 */
import { ideasFor, type DayPlanOut, type Slot } from "./mealplan";

export interface BagItem { id: string; label: string; note?: string }
export interface BagGroup { title: string; items: BagItem[] }

/** Produkty, które da się zabrać w torbie (bez gotowania i lodówki na miejscu). */
const PORTABLE = new Set(["banana", "apple", "orange", "roll", "bread-white", "bread-rye", "raisins", "iso", "gel", "oj", "ham", "cheese"]);

function foodItems(slot: Slot | undefined, dayIndex: number, prefix: string): BagItem[] {
  if (!slot) return [];
  const idea = ideasFor(slot, dayIndex).find((i) => i.lines.some((l) => PORTABLE.has(l.food.id) && l.food.group !== "fat"));
  if (!idea) return [];
  return idea.lines.filter((l) => PORTABLE.has(l.food.id)).map((l) => ({ id: `${prefix}-${l.food.id}`, label: l.food.name.replace(/ \(.*\)/, ""), note: l.text }));
}

/** Zimą (listopad–marzec) dochodzą ciepłe rzeczy. */
export const isColdSeason = (iso: string): boolean => { const m = Number(iso.slice(5, 7)); return m >= 11 || m <= 3; };

export function matchBag(plan: DayPlanOut, date: string, dayIndex = 0): BagGroup[] {
  const slot = (id: string) => plan.slots.find((s) => s.id === id);
  const during = foodItems(slot("during"), dayIndex, "during");
  const pre = foodItems(slot("pre-snack"), dayIndex, "pre");
  const post = slot("post");
  const postItems = foodItems(post, dayIndex, "post");
  const water = Math.round((plan.hydrationMl * 0.3) / 100) / 10; // ok. 30% dziennej puli na samo wydarzenie

  const food: BagItem[] = [
    { id: "water", label: "Woda", note: `ok. ${String(water).replace(".", ",")} l` },
    ...(during.length ? during : [{ id: "during-carb", label: "Węglowodany na przerwę", note: "napój izotoniczny, żel lub banan (ok. 45 g)" }]),
    ...pre.filter((p) => !during.some((d) => d.label === p.label)),
    ...(postItems.length ? postItems : [{ id: "post-snack", label: "Przekąska po meczu", note: post ? `węglowodany i białko, ok. ${post.carb} g węgli` : "węglowodany i białko" }]),
  ];

  const gear: BagItem[] = [
    { id: "boots", label: "Buty piłkarskie" },
    { id: "kit", label: "Strój meczowy", note: "koszulka, spodenki, getry" },
    { id: "shin", label: "Ochraniacze" },
    { id: "towel", label: "Ręcznik" },
    { id: "flipflops", label: "Klapki pod prysznic" },
    { id: "clean", label: "Czysta odzież na po meczu" },
    { id: "doc", label: "Legitymacja / dokument", note: "jeśli klub lub liga wymaga" },
  ];
  const small: BagItem[] = [
    { id: "tape", label: "Plastry / tejp", note: "jeśli używasz" },
    { id: "meds", label: "Własne leki", note: "jeśli stosujesz" },
    ...(isColdSeason(date)
      ? [{ id: "warm", label: "Ciepła bluza i czapka", note: "na rozgrzewkę i po meczu" }]
      : [{ id: "sun", label: "Krem z filtrem", note: "mecze w ciągu dnia" }]),
  ];
  return [
    { title: "Sprzęt", items: gear },
    { title: "Jedzenie i picie", items: food },
    { title: "Drobiazgi", items: small },
  ];
}
