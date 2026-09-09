/**
 * FuelWise — warstwa prezentacji (czysta, deterministyczna).
 * Nie zmienia reguł z `engine.ts`; tylko przekłada dane wejściowe
 * na sygnał paliwa, wskaźniki, proporcje talerza i gotowe propozycje.
 */

import { requiredLeadMinutes } from "./engine";
import { parseMeal } from "./mealParser";
import type {
  FuelSessionInput,
  ParsedFoodItem,
  ParsedMeal,
  Portion,
  Verdict,
} from "./types";

export type Demand = "lekkie" | "umiarkowane" | "wysokie";

export interface FuelSignal {
  demand: Demand;
  label: string;
  sessionLine: string;
  advice: string;
}

/** Zapotrzebowanie wynika z typu, intensywności i długości jednostki. */
export function fuelSignal(session: FuelSessionInput, minutes: number | null): FuelSignal {
  const dur = session.durationMin ?? 0;
  const high =
    session.kind === "match" ||
    session.intensity === "wysoka" ||
    (session.kind === "endurance" && dur >= 60);
  const low =
    session.kind === "recovery" ||
    (session.intensity === "niska" && dur <= 45) ||
    session.kind === "none";

  const demand: Demand = high ? "wysokie" : low ? "lekkie" : "umiarkowane";

  const sessionLine = [
    kindLabel(session.kind),
    session.intensity ? `intensywność ${session.intensity}` : null,
    dur ? `${dur} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const advice =
    demand === "wysokie"
      ? minutes != null && minutes < 60
        ? "Postaw na szybkie węglowodany: banan lub izotonik, bez tłuszczu."
        : "Zjedz porcję węglowodanów złożonych z małym dodatkiem białka."
      : demand === "umiarkowane"
        ? minutes != null && minutes < 60
          ? "Wystarczy mały, lekki przekąskowy posiłek węglowodanowy."
          : "Normalna porcja węglowodanów i białka, mało tłuszczu i błonnika."
        : "Zwykły posiłek w porządku — nie musisz doładowywać energii.";

  return { demand, label: `${demand} zapotrzebowanie`, sessionLine, advice };
}

function kindLabel(kind: FuelSessionInput["kind"]): string {
  switch (kind) {
    case "match":
      return "Mecz";
    case "speed":
      return "Szybkość";
    case "strength":
      return "Siła";
    case "endurance":
      return "Wytrzymałość";
    case "recovery":
      return "Regeneracja";
    case "football":
      return "Trening piłkarski";
    default:
      return "Brak jednostki";
  }
}

export type IndicatorState = "low" | "ok" | "high";

export interface Indicator {
  key: "energia" | "trawienie" | "nawodnienie";
  label: string;
  state: IndicatorState;
  value: string;
  why: string;
}

export function indicators(
  meal: ParsedMeal,
  portion: Portion,
  session: FuelSessionInput,
  minutes: number | null,
  demand: Demand,
): Indicator[] {
  const need = requiredLeadMinutes(meal, portion);
  const carbs = meal.carbFast.length + meal.carbSlow.length;

  const energyState: IndicatorState =
    carbs === 0 ? (demand === "lekkie" ? "ok" : "low") : demand === "wysokie" && carbs < 2 ? "low" : "ok";

  const digestion: IndicatorState =
    minutes == null ? "ok" : need > minutes * 1.4 ? "low" : need > minutes ? "high" : "ok";

  const hydration: IndicatorState = meal.drinks.length ? "ok" : "low";

  return [
    {
      key: "energia",
      label: "Energia",
      state: energyState,
      value: energyState === "ok" ? "Wystarczająca" : "Za mało paliwa",
      why:
        carbs === 0
          ? `W posiłku nie ma źródła węglowodanów, a ${kindLabel(session.kind).toLowerCase()} daje ${demand} zapotrzebowanie.`
          : `Węglowodany są obecne (${carbs} źródł${carbs === 1 ? "o" : "a"}) i pokrywają ${demand} zapotrzebowanie.`,
    },
    {
      key: "trawienie",
      label: "Lekkość",
      state: digestion,
      value: digestion === "ok" ? "Lekki" : digestion === "high" ? "Na granicy" : "Za ciężki",
      why:
        minutes == null
          ? "Wybierz okno czasowe, żeby ocenić trawienie."
          : `Ten zestaw potrzebuje ok. ${need} min na strawienie, a do startu jest ${minutes} min.`,
    },
    {
      key: "nawodnienie",
      label: "Nawodnienie",
      state: hydration,
      value: hydration === "ok" ? "Zadbane" : "Dodaj płyn",
      why: meal.drinks.length
        ? "Masz w zestawie płyn — pij małymi łykami do startu."
        : "Brak płynu w zestawie. Dolej 300–400 ml wody lub izotoniku.",
    },
  ];
}

export interface PlateShare {
  carb: number;
  protein: number;
  fat: number;
  fluid: number;
}

/** Proporcje talerza zależne od okna czasowego i zapotrzebowania. */
export function plateShares(minutes: number | null, demand: Demand): PlateShare {
  const m = minutes ?? 180;
  if (m < 60) {
    return demand === "wysokie"
      ? { carb: 62, protein: 8, fat: 2, fluid: 28 }
      : { carb: 52, protein: 12, fat: 6, fluid: 30 };
  }
  if (m < 120) {
    return demand === "wysokie"
      ? { carb: 58, protein: 18, fat: 6, fluid: 18 }
      : { carb: 50, protein: 22, fat: 10, fluid: 18 };
  }
  return demand === "lekkie"
    ? { carb: 40, protein: 28, fat: 17, fluid: 15 }
    : { carb: 48, protein: 25, fat: 12, fluid: 15 };
}

/* ---------- Tryb „Zbuduj posiłek” ---------- */

export interface BuildOption {
  id: string;
  label: string;
  text: string;
}

export interface BuildGroup {
  id: string;
  label: string;
  options: BuildOption[];
}

export const BUILD_GROUPS: BuildGroup[] = [
  {
    id: "base",
    label: "Podstawa",
    options: [
      { id: "bread", label: "Pieczywo", text: "chleb" },
      { id: "rice", label: "Ryż", text: "ryż" },
      { id: "pasta", label: "Makaron", text: "makaron" },
      { id: "cereal", label: "Płatki", text: "płatki owsiane" },
    ],
  },
  {
    id: "protein",
    label: "Białko",
    options: [
      { id: "meat", label: "Kurczak", text: "kurczak" },
      { id: "eggs", label: "Jajka", text: "jajka" },
      { id: "dairy", label: "Jogurt", text: "jogurt" },
      { id: "shake", label: "Odżywka", text: "odżywka białkowa" },
    ],
  },
  {
    id: "fruit",
    label: "Owoc",
    options: [
      { id: "banana", label: "Banan", text: "banan" },
      { id: "apple", label: "Jabłko", text: "jabłko" },
      { id: "honey", label: "Miód / dżem", text: "miód" },
    ],
  },
  {
    id: "fat",
    label: "Tłusty dodatek",
    options: [
      { id: "cheese", label: "Ser", text: "ser" },
      { id: "nuts", label: "Orzechy", text: "orzechy" },
      { id: "sauce", label: "Tłusty sos", text: "majonez" },
    ],
  },
  {
    id: "drink",
    label: "Napój",
    options: [
      { id: "water", label: "Woda", text: "woda" },
      { id: "isotonic", label: "Izotonik", text: "izotonik" },
      { id: "coffee", label: "Kawa", text: "kawa" },
    ],
  },
];

export const BUILD_OPTIONS: Record<string, BuildOption> = Object.fromEntries(
  BUILD_GROUPS.flatMap((g) => g.options).map((o) => [o.id, o]),
);

/* ---------- Szybki wybór ---------- */

export interface QuickPick {
  id: string;
  group: "najszybciej" | "normalny" | "bez gotowania";
  title: string;
  text: string;
  portion: Portion;
}

export const QUICK_PICKS: QuickPick[] = [
  { id: "q1", group: "najszybciej", title: "Banan + izotonik", text: "banan, izotonik", portion: "mala" },
  { id: "q2", group: "najszybciej", title: "Żel + woda", text: "żel energetyczny, woda", portion: "mala" },
  { id: "q3", group: "najszybciej", title: "Chleb z miodem", text: "chleb z miodem, woda", portion: "mala" },
  { id: "q4", group: "normalny", title: "Ryż z kurczakiem", text: "ryż, kurczak, woda", portion: "normalna" },
  { id: "q5", group: "normalny", title: "Makaron z indykiem", text: "makaron, indyk, woda", portion: "normalna" },
  { id: "q6", group: "normalny", title: "Owsianka z owocami", text: "płatki owsiane, banan, woda", portion: "normalna" },
  { id: "q7", group: "bez gotowania", title: "Kanapki z szynką", text: "chleb, szynka, woda", portion: "normalna" },
  { id: "q8", group: "bez gotowania", title: "Jogurt z owocem", text: "jogurt, banan, woda", portion: "mala" },
  { id: "q9", group: "bez gotowania", title: "Wrap z kurczakiem", text: "tortilla, kurczak, woda", portion: "normalna" },
];

/* ---------- Korekty jednym dotknięciem ---------- */

export type FixId = "add_banana" | "smaller_portion" | "add_water" | "drop_heavy";

export interface Fix {
  id: FixId;
  label: string;
}

export function availableFixes(meal: ParsedMeal, portion: Portion): Fix[] {
  const fixes: Fix[] = [];
  if (!meal.carbFast.length) fixes.push({ id: "add_banana", label: "Dodaj banana" });
  if (portion !== "mala") fixes.push({ id: "smaller_portion", label: "Zmniejsz porcję" });
  if (!meal.drinks.length) fixes.push({ id: "add_water", label: "Dodaj wodę" });
  if (meal.items.some((i) => i.heaviness >= 3))
    fixes.push({ id: "drop_heavy", label: "Usuń ciężki dodatek" });
  return fixes;
}

export function smallerPortion(portion: Portion): Portion {
  return portion === "duza" ? "normalna" : "mala";
}

/** Usuwa najcięższe pozycje i przelicza pochodne pola posiłku. */
export function withoutHeavy(meal: ParsedMeal): ParsedMeal {
  const kept = meal.items.filter((i) => i.heaviness < 3);
  return rebuild(meal.raw, kept, meal.unrecognized);
}

export function withExtras(meal: ParsedMeal, extras: string[]): ParsedMeal {
  if (!extras.length) return meal;
  const extra = parseMeal(extras.join(", "));
  const map = new Map<string, ParsedFoodItem>();
  for (const i of meal.items.concat(extra.items)) map.set(i.key, i);
  return rebuild(
    `${meal.raw}, ${extras.join(", ")}`,
    Array.from(map.values()),
    meal.unrecognized,
  );
}

function rebuild(raw: string, items: ParsedFoodItem[], unrecognized: string[]): ParsedMeal {
  const by = (role: string) => items.filter((i) => i.roles.includes(role as never));
  const carbFast = by("carb_fast");
  const carbSlow = by("carb_slow");
  return {
    raw,
    items,
    unrecognized,
    carbFast,
    carbSlow,
    protein: by("protein"),
    fatHeavy: by("fat"),
    fiber: by("fiber"),
    drinks: by("drink"),
    caffeine: by("caffeine"),
    sweets: by("sweets"),
    heaviness: Math.min(
      10,
      items.reduce((s, i) => s + i.heaviness, 0),
    ),
    hasCarbs: carbFast.length + carbSlow.length > 0,
    recognized: items.length > 0,
  };
}

/* ---------- Werdykt → karta wyniku ---------- */

export type ResultTone = "fit" | "tweak" | "heavy" | "empty";

export function resultTone(verdict: Verdict, ruleId: string): ResultTone {
  if (verdict === "PASUJE") return "fit";
  if (verdict === "ZOSTAW_NA_POZNIEJ") return "heavy";
  if (ruleId.startsWith("CARBS")) return "empty";
  return "tweak";
}

export const TONE_LABEL: Record<ResultTone, string> = {
  fit: "Dobrze dopasowany",
  tweak: "Mała korekta",
  heavy: "Za ciężki",
  empty: "Za mało paliwa",
};
