/**
 * Plan dnia dla Fuel: sloty posiłków wokół dzisiejszego treningu/meczu, przykładowe posiłki w gramach,
 * nawodnienie i lista zakupów. Liczby UEFA (Collins i in., BJSM 2020) są oznaczone `uefa: true`;
 * reszta to podział orientacyjny (docs/ZRODLA-FUEL.md).
 */
import { FOOD_BY_ID, amountText, macrosOf, type Food, type FoodGroup } from "./foods";
import { dailyTargets, type DayKind, type Goal } from "./fuel";

export interface Activity { kind: "match" | "session"; /** HH:MM */ time: string }

export type PoolKind = "breakfast" | "main" | "small" | "post" | "during";
export interface Slot {
  id: string;
  /** Minuty od północy. */
  at: number;
  title: string;
  pool: PoolKind;
  /** Cel węglowodanów i białka w g dla tego posiłku. */
  carb: number;
  protein: number;
  /** Cel tłuszczu w g (wokół wysiłku mało tłuszczu). */
  fat: number;
  uefa: boolean;
  /** Który z kolei posiłek tego rodzaju w dniu (0, 1, 2…) – żeby pomysły się nie powtarzały. */
  variant: number;
}

export interface DayPlanOut {
  slots: Slot[];
  carbTotal: number;
  proteinTotal: number;
  fatTotal: number;
  /** Ile treningów jest dziś (do celów dziennych). */
  sessions: number;
  hydrationMl: number;
}

export const toMin = (hhmm: string): number => { const [h, m] = hhmm.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
export const fmtTime = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const r5 = (x: number) => Math.max(0, Math.round(x / 5) * 5);

interface Draft { id: string; at: number; title: string; pool: PoolKind; carbFixed: number; share: number; protW: number; uefa: boolean }
interface Base { id: string; at: number; title: string; pool: PoolKind; share: number; protW: number; main: boolean }

/** Nawodnienie: 30 ml/kg + dodatek na trening/mecz (orientacyjnie, nie z badań UEFA). */
export function hydrationMl(weightKg: number, day: DayKind): number {
  const add = day === "match" ? 750 : day === "training" ? 500 : day === "pre-match" ? 250 : 0;
  return Math.round((weightKg * 30 + add) / 100) * 100;
}

const B = (id: string, h: number, m: number, title: string, pool: PoolKind, share: number, protW: number, main: boolean): Base => ({ id, at: h * 60 + m, title, pool, share, protW, main });

function baseMeals(day: DayKind): Base[] {
  if (day === "pre-match") {
    return [B("breakfast", 8, 0, "Śniadanie", "breakfast", 0.25, 1, true), B("snack-am", 10, 30, "Przekąska", "small", 0.1, 0.4, false), B("lunch", 13, 0, "Obiad", "main", 0.27, 1, true), B("snack", 16, 30, "Przekąska", "small", 0.13, 0.4, false), B("dinner", 19, 30, "Kolacja", "main", 0.25, 1, true)];
  }
  const light = day === "light";
  return [B("breakfast", 8, 0, "Śniadanie", "breakfast", light ? 0.28 : 0.3, 1, true), B("lunch", 13, 0, "Obiad", "main", light ? 0.32 : 0.35, 1, true), B("snack", 16, 30, "Przekąska", "small", 0.12, 0.4, false), B("dinner", 19, 30, "Kolacja", "main", light ? 0.28 : 0.35, 1, true)];
}

const FAT_W: Record<string, number> = { breakfast: 1, lunch: 1.2, dinner: 1.2, snack: 0.8, "snack-am": 0.6, "pre-main": 0.4, "pre-snack": 0.1, during: 0, post: 0.3 };
const fatWeight = (id: string) => FAT_W[id.replace(/-\d$/, "")] ?? 0.5;
/** Posiłki wokół wysiłku – mało tłuszczu (wolniejsze trawienie). */
export const isLowFat = (id: string) => /^(pre-main|pre-snack|during|post)/.test(id);

export function buildDayPlan(i: { day: DayKind; weightKg: number; goal: Goal; activities: Activity[] }): DayPlanOut {
  const { day, weightKg: kg, goal } = i;
  const acts = [...i.activities].sort((a, b) => toMin(a.time) - toMin(b.time));
  const sessions = acts.filter((a) => a.kind === "session").length;
  const t = dailyTargets(kg, day, goal, sessions);
  const carbT = Math.round((t.carbG[0] + t.carbG[1]) / 2);
  const protT = Math.round((t.proteinG[0] + t.proteinG[1]) / 2);
  const fatT = Math.round((t.fatG[0] + t.fatG[1]) / 2);

  const fixed: Draft[] = [];
  acts.forEach((activity, k) => {
    const sfx = k === 0 ? "" : `-${k + 1}`;
    const fx = (id: string, at: number, title: string, pool: PoolKind, carbFixed: number, protW: number, uefa: boolean) => fixed.push({ id: id + sfx, at, title, pool, carbFixed, share: 0, protW, uefa });
    const A = toMin(activity.time);
    if (activity.kind === "match") {
      fx("pre-main", Math.max(6 * 60 + 30, A - 210), "Duży posiłek przed meczem", "main", 2 * kg, 0.8, true);
      fx("pre-snack", A - 60, "Lekka przekąska", "small", 0.5 * kg, 0.2, false);
      fx("during", A + 45, "W trakcie meczu", "during", 45, 0, true);
      fx("post", A + 120, "Po meczu", "post", 1 * kg, 1, true);
    } else {
      fx("pre-main", Math.max(6 * 60 + 30, A - 180), "Posiłek przed treningiem", "main", 1.5 * kg, 0.8, false);
      fx("pre-snack", A - 60, "Lekka przekąska", "small", 0.5 * kg, 0.2, false);
      fx("post", A + 105, "Po treningu", "post", 1 * kg, 1, false);
    }
  });
  // dwa wysiłki blisko siebie: posiłek po pierwszym służy też jako przed drugim
  const mergeSecond = (sfx: string) => {
    const post = fixed.find((d) => d.id === "post"), pre = fixed.find((d) => d.id === `pre-main${sfx}`);
    if (post && pre && pre.at - post.at < 150) {
      post.carbFixed = Math.max(post.carbFixed, pre.carbFixed);
      post.title = "Po treningu i przed kolejnym";
      fixed.splice(fixed.indexOf(pre), 1);
      for (const id of [`pre-snack${sfx}`]) { const x = fixed.find((d) => d.id === id); if (x && x.at - post.at < 75) fixed.splice(fixed.indexOf(x), 1); }
    }
  };
  if (acts.length >= 2) mergeSecond("-2");

  // zwykłe posiłki: przesuwane tak, by nie nakładały się na posiłki wokół wysiłku; gdy się nie da – wchłania je posiłek
  // przed/po wysiłku (dostaje jego udział), a przekąski są pomijane
  const placed: Array<{ at: number; pool: PoolKind }> = fixed.map((f) => ({ at: f.at, pool: f.pool }));
  const kept: Draft[] = [];
  const extraShare = new Map<string, number>();
  const extraProt = new Map<string, number>();
  const bases = baseMeals(day);
  const order = ["lunch", "breakfast", "dinner"];
  const mains = bases.filter((b) => b.main).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const gapTo = (p: { pool: PoolKind }) => (p.pool === "small" || p.pool === "during" ? 75 : 150);
  for (const b of mains) {
    const t0 = [0, -30, -60, -90, 30, 60, 90].map((d) => b.at + d).find((tt) => tt >= 6 * 60 && tt <= 21 * 60 + 30 && placed.every((p) => Math.abs(p.at - tt) >= gapTo(p)));
    if (t0 !== undefined) { kept.push({ ...b, at: t0, carbFixed: 0, uefa: false }); placed.push({ at: t0, pool: b.pool }); continue; }
    const near = fixed.filter((f) => f.pool === "main" || f.pool === "post").sort((x, y) => Math.abs(x.at - b.at) - Math.abs(y.at - b.at))[0];
    if (near && Math.abs(near.at - b.at) < 200) {
      extraShare.set(near.id, (extraShare.get(near.id) ?? 0) + b.share);
      extraProt.set(near.id, (extraProt.get(near.id) ?? 0) + b.protW);
    }
  }
  for (const b of bases.filter((x) => !x.main)) {
    if (placed.every((p) => Math.abs(p.at - b.at) >= (p.pool === "small" || p.pool === "during" ? 75 : 150))) { kept.push({ ...b, carbFixed: 0, uefa: false }); placed.push({ at: b.at, pool: b.pool }); }
  }

  const drafts = [...fixed, ...kept].sort((a, b) => a.at - b.at);
  const shareOf = (d: Draft) => d.share + (extraShare.get(d.id) ?? 0);
  const shareSum = drafts.reduce((s, d) => s + shareOf(d), 0) || 1;
  const pool = Math.max(0, carbT - fixed.reduce((s, d) => s + d.carbFixed, 0));
  const protOf = (d: Draft) => d.protW + (extraProt.get(d.id) ?? 0);
  const protSum = drafts.reduce((s, d) => s + protOf(d), 0) || 1;
  const seen: Record<string, number> = {};
  const fatSum = drafts.reduce((s, d) => s + fatWeight(d.id), 0) || 1;
  const slots: Slot[] = drafts.map((d) => ({
    id: d.id, at: d.at, title: d.title, pool: d.pool, uefa: d.uefa, variant: (seen[d.pool] = (seen[d.pool] ?? -1) + 1),
    carb: r5(Math.max(d.share > 0 ? 20 : 0, d.carbFixed + (pool * shareOf(d)) / shareSum)),
    protein: r5((protT * protOf(d)) / protSum),
    fat: r5((fatT * fatWeight(d.id)) / fatSum),
  }));
  return { slots, carbTotal: slots.reduce((s, x) => s + x.carb, 0), proteinTotal: slots.reduce((s, x) => s + x.protein, 0), fatTotal: slots.reduce((s, x) => s + x.fat, 0), sessions, hydrationMl: hydrationMl(kg, day) };
}

/* ------------------------------ przykładowe posiłki ------------------------------ */

type Role = "carb" | "protein" | "fixed";
interface IdeaItem { food: string; role: Role; /** Stała ilość (g) dla „fixed”; dla pozostałych – domyślna/minimalna. */ g?: number; min?: number; max?: number; share?: number }
export interface Idea { id: string; name: string; items: IdeaItem[] }

const c = (food: string, extra: Partial<IdeaItem> = {}): IdeaItem => ({ food, role: "carb", ...extra });
const p = (food: string, extra: Partial<IdeaItem> = {}): IdeaItem => ({ food, role: "protein", ...extra });
const x = (food: string, g: number): IdeaItem => ({ food, role: "fixed", g });

export const IDEAS: Record<PoolKind, Idea[]> = {
  breakfast: [
    { id: "b-oats", name: "Owsianka z bananem", items: [c("oats", { min: 40, max: 120 }), x("banana", 120), p("yogurt", { min: 100, max: 300 }), x("honey", 10)] },
    { id: "b-eggs", name: "Jajka z pieczywem", items: [c("bread-rye", { min: 60, max: 200 }), p("egg", { min: 55, max: 220 }), x("veg-mix", 100)] },
    { id: "b-cottage", name: "Twaróg z pieczywem i owocem", items: [c("bread-white", { min: 60, max: 200 }), p("cottage-semi", { min: 100, max: 250 }), x("apple", 180)] },
    { id: "b-oats-milk", name: "Płatki owsiane z mlekiem i bananem", items: [c("oats", { min: 40, max: 120 }), x("milk", 250), x("banana", 120), p("skyr", { min: 0, max: 200 })] },
  ],
  main: [
    { id: "m-rice-chicken", name: "Ryż z kurczakiem i warzywami", items: [c("rice-dry", { min: 40, max: 160 }), p("chicken", { min: 80, max: 260 }), x("veg-mix", 150)] },
    { id: "m-pasta-turkey", name: "Makaron z indykiem i warzywami", items: [c("pasta-dry", { min: 40, max: 160 }), p("turkey", { min: 80, max: 260 }), x("veg-mix", 150)] },
    { id: "m-potato-fish", name: "Ziemniaki z rybą i surówką", items: [c("potato", { min: 200, max: 450 }), p("cod", { min: 100, max: 300 }), x("veg-mix", 150)] },
    { id: "m-buckwheat-egg", name: "Kasza gryczana z jajkami i warzywami", items: [c("buckwheat-dry", { min: 40, max: 150 }), p("egg", { min: 110, max: 275 }), x("veg-mix", 150)] },
    { id: "m-rice-beans", name: "Ryż z fasolą i tuńczykiem", items: [c("rice-dry", { min: 40, max: 160 }), x("beans", 80), p("tuna", { min: 60, max: 200 }), x("veg-mix", 100)] },
  ],
  small: [
    { id: "s-banana", name: "Banan z miodem", items: [c("banana", { min: 120, max: 360 }), x("honey", 10)] },
    { id: "s-banana-roll", name: "Banan i bułka z dżemem", items: [c("banana", { share: 1, min: 120, max: 240 }), c("roll", { share: 1, min: 50, max: 100 }), x("jam", 20)] },
    { id: "s-roll-honey", name: "Bułka z miodem", items: [c("roll", { min: 50, max: 150 }), x("honey", 20)] },
    { id: "s-yogurt-oats", name: "Jogurt z płatkami i owocem", items: [p("yogurt", { min: 100, max: 300 }), c("cornflakes", { min: 20, max: 80 }), x("apple", 180)] },
    { id: "s-cottage", name: "Twaróg z owocem i pieczywem", items: [p("cottage-semi", { min: 80, max: 200 }), c("bread-white", { min: 30, max: 120 }), x("fruit-mix", 100)] },
  ],
  post: [
    { id: "p-yogurt-fruit", name: "Jogurt z owocami i płatkami", items: [p("yogurt", { min: 150, max: 350 }), c("oats", { min: 30, max: 90 }), x("banana", 120), x("honey", 10)] },
    { id: "p-roll-ham", name: "Kanapki z szynką i mleko", items: [c("roll", { min: 50, max: 200 }), p("ham", { min: 30, max: 150 }), x("milk", 250)] },
    { id: "p-rice-egg", name: "Ryż z jajkiem i warzywami", items: [c("rice-dry", { min: 40, max: 140 }), p("egg", { min: 55, max: 220 }), x("veg-mix", 120)] },
  ],
  during: [
    { id: "d-iso", name: "Napój izotoniczny", items: [c("iso", { min: 250, max: 1000 })] },
    { id: "d-gel", name: "Żel węglowodanowy", items: [c("gel", { min: 40, max: 120 })] },
    { id: "d-banana", name: "Banan", items: [c("banana", { min: 120, max: 240 })] },
  ],
};

export interface IdeaLine { food: Food; g: number; text: string }
export interface ScaledIdea { id: string; name: string; lines: IdeaLine[]; carb: number; protein: number; fat: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function roundFor(food: Food, g: number): number {
  if (food.unit && food.unit.g > 0) return Math.max(1, Math.round(g / food.unit.g)) * food.unit.g;
  return g > 200 ? Math.round(g / 10) * 10 : Math.round(g / 5) * 5;
}

/** Dobiera gramy tak, by posiłek trafił w cel węglowodanów (główne źródło) i białka (źródło białka). */
export interface ScaleOpts {
  /** Dokładaj bułkę, gdy źródło węglowodanów osiągnęło limit porcji (domyślnie tak). */
  topUp?: boolean;
  /** Cel tłuszczu w g; gdy posiłek ma go za mało, dokładane jest źródło tłuszczu (oliwa, awokado, orzechy…). */
  fat?: number;
  /** Który ze źródeł tłuszczu wybrać (obrót). */
  pick?: number;
  /** Rodzaj posiłku (dobiera źródła tłuszczu). */
  pool?: PoolKind;
}

/** Źródła tłuszczu dokładane do posiłków poza okolicą wysiłku – dopasowane do rodzaju posiłku (oliwa do obiadu, orzechy do śniadania). */
export const FAT_SOURCES: Record<PoolKind, string[]> = {
  breakfast: ["peanut-butter", "almonds", "walnuts"],
  main: ["olive-oil", "avocado"],
  small: ["almonds", "walnuts", "peanut-butter"],
  post: [],
  during: [],
};

export function scaleIdea(idea: Idea, carbTarget: number, proteinTarget: number, opts: ScaleOpts = {}): ScaledIdea {
  const topUp = opts.topUp ?? true;
  const food = (id: string) => FOOD_BY_ID[id]!;
  const grams = new Map<IdeaItem, number>();
  for (const it of idea.items) if (it.role === "fixed") grams.set(it, roundFor(food(it.food), it.g ?? 0));
  const carbFrom = () => [...grams].reduce((s, [it, g]) => s + macrosOf(food(it.food), g).carb, 0);
  const protFrom = () => [...grams].reduce((s, [it, g]) => s + macrosOf(food(it.food), g).protein, 0);

  const carbItems = idea.items.filter((it) => it.role === "carb");
  if (carbItems.length) {
    const need = Math.max(0, carbTarget - carbFrom());
    const share = carbItems.reduce((s, it) => s + (it.share ?? 1), 0);
    for (const it of carbItems) {
      const f = food(it.food);
      const raw = f.carb100 > 0 ? ((need * (it.share ?? 1)) / share / f.carb100) * 100 : it.min ?? 50;
      grams.set(it, roundFor(f, clamp(raw, it.min ?? 20, it.max ?? 400)));
    }
  }
  const protItems = idea.items.filter((it) => it.role === "protein");
  if (protItems.length) {
    const need = Math.max(0, proteinTarget - protFrom());
    const share = protItems.reduce((s, it) => s + (it.share ?? 1), 0);
    for (const it of protItems) {
      const f = food(it.food);
      const raw = f.protein100 > 0 ? ((need * (it.share ?? 1)) / share / f.protein100) * 100 : it.min ?? 50;
      grams.set(it, roundFor(f, clamp(raw, it.min ?? 40, it.max ?? 300)));
    }
  }
  // duży posiłek, a źródło węglowodanów osiągnęło limit porcji: dokładamy bułki (po ok. 27 g węglowodanów)
  const deficit = carbTarget - carbFrom();
  let extra: IdeaLine | null = null;
  if (topUp && deficit >= 25) {
    const roll = food("roll");
    const n = clamp(Math.round(deficit / macrosOf(roll, roll.unit!.g).carb), 1, 4);
    extra = { food: roll, g: n * roll.unit!.g, text: amountText(roll, n * roll.unit!.g) };
  }
  const lines: IdeaLine[] = idea.items.map((it) => ({ food: food(it.food), g: grams.get(it) ?? 0, text: amountText(food(it.food), grams.get(it) ?? 0) }));
  if (extra) lines.push(extra);
  let total = lines.reduce((m, l) => { const x = macrosOf(l.food, l.g); return { carb: m.carb + x.carb, protein: m.protein + x.protein, fat: m.fat + x.fat }; }, { carb: 0, protein: 0, fat: 0 });
  // za mało tłuszczu w posiłku, który może go mieć: dokładamy jedno źródło (do 2 porcji)
  const fatTarget = opts.fat ?? 0;
  const sources = FAT_SOURCES[opts.pool ?? "main"];
  if (fatTarget > 0 && fatTarget - total.fat >= 8 && sources.length > 0) {
    const src = food(sources[Math.abs(opts.pick ?? 0) % sources.length]!);
    const deficit = fatTarget - total.fat;
    const unit = src.unit && src.unit.g > 0 ? src.unit.g : 10;
    const n = clamp(Math.round(((deficit / src.fat100) * 100) / unit), 1, 2);
    const line: IdeaLine = { food: src, g: n * unit, text: amountText(src, n * unit) };
    lines.push(line);
    const x = macrosOf(src, line.g);
    total = { carb: total.carb + x.carb, protein: total.protein + x.protein, fat: total.fat + x.fat };
  }
  return { id: idea.id, name: idea.name, lines, carb: Math.round(total.carb), protein: Math.round(total.protein), fat: Math.round(total.fat) };
}

/** Pomysły na dany posiłek; kolejność obracana wg dnia (żeby dni się różniły, ale plan był powtarzalny). */
export function ideasFor(slot: Slot, dayIndex = 0): ScaledIdea[] {
  const pool = IDEAS[slot.pool];
  const k = (((dayIndex + slot.variant * 2) % pool.length) + pool.length) % pool.length;
  return [...pool.slice(k), ...pool.slice(0, k)].map((idea, n) =>
    scaleIdea(idea, slot.carb, slot.protein, { topUp: slot.pool !== "during", fat: isLowFat(slot.id) ? 0 : slot.fat, pick: dayIndex + slot.variant + n, pool: slot.pool }));
}

/* ------------------------------ lista zakupów ------------------------------ */

export interface ShopLine { foodId: string; name: string; group: FoodGroup; grams: number; text: string }

/** Składniki z pierwszych pomysłów każdego posiłku, zsumowane po dniach i po produkcie. */
export function shoppingList(plans: DayPlanOut[]): ShopLine[] {
  const sum = new Map<string, number>();
  plans.forEach((plan, di) => {
    for (const slot of plan.slots) {
      const first = ideasFor(slot, di)[0];
      if (!first) continue;
      for (const l of first.lines) sum.set(l.food.id, (sum.get(l.food.id) ?? 0) + l.g);
    }
  });
  const order: FoodGroup[] = ["carb", "protein", "dairy", "fat", "fruit", "veg", "other"];
  return [...sum]
    .map(([id, g]): ShopLine => {
      const food = FOOD_BY_ID[id]!;
      const step = food.unit && food.unit.g > 0 && food.unit.g >= 50 ? food.unit.g : 50;
      const grams = Math.ceil(g / step) * step;
      return { foodId: id, name: food.name.replace(/ \(ugotowane\)$/, ""), group: food.group, grams, text: shopText(food, grams) };
    })
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name, "pl"));
}

function shopText(food: Food, grams: number): string {
  if (food.unit && food.unit.g >= 50 && food.unit.one === "szt.") return amountText(food, grams);
  const unit = food.liquid ? "ml" : "g";
  return grams >= 1000 ? `${(grams / 1000).toFixed(1).replace(".", ",")} ${unit === "g" ? "kg" : "l"}` : `${grams} ${unit}`;
}

/* ------------------------------ „co teraz” ------------------------------ */

/** Najbliższy niezjedzony posiłek (jeszcze nie starszy niż 45 min) oraz pominięte wcześniejsze. */
export function nextSlot(slots: Slot[], done: Set<string>, nowMin: number): { next: Slot | null; missed: Slot[] } {
  const open = slots.filter((s) => !done.has(s.id));
  return { next: open.find((s) => s.at >= nowMin - 45) ?? null, missed: open.filter((s) => s.at < nowMin - 45) };
}

/** „za 1 h 20 min”, „teraz”, „20 min temu” – z różnicy w minutach (godzina posiłku − teraz). */
export function untilText(deltaMin: number): string {
  const m = Math.round(Math.abs(deltaMin));
  if (Math.abs(deltaMin) < 10) return "teraz";
  const t = m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
  return deltaMin > 0 ? `za ${t}` : `${t} temu`;
}
