import type { Profile } from "@/lib/loadwise/types";
import type { FuelSessionInput, Portion, SessionKind } from "./types";

export type MealMoment = "quick" | "regular" | "portable";

export interface MealRecommendation {
  id: string;
  title: string;
  subtitle: string;
  text: string;
  portion: Portion;
  prepMinutes: number;
  moment: MealMoment;
  minLeadMinutes: number;
  maxLeadMinutes: number;
  sessionKinds: SessionKind[];
  highlight: string;
  icon: "bowl" | "sandwich" | "oats" | "drink";
}

const CATALOG: MealRecommendation[] = [
  {
    id: "rice-chicken-mango",
    title: "Ryż jaśminowy, kurczak i mango",
    subtitle: "Lekki bowl z odrobiną sosu sojowego",
    text: "ryż, kurczak, mango, mała ilość sosu sojowego, woda",
    portion: "normalna",
    prepMinutes: 18,
    moment: "regular",
    minLeadMinutes: 90,
    maxLeadMinutes: 300,
    sessionKinds: ["speed", "match", "football", "endurance", "strength"],
    highlight: "wysokie paliwo",
    icon: "bowl",
  },
  {
    id: "pasta-turkey-tomato",
    title: "Pasta pomodoro z indykiem",
    subtitle: "Prosty sos pomidorowy, niewiele tłuszczu",
    text: "makaron, indyk, sos pomidorowy, woda",
    portion: "normalna",
    prepMinutes: 20,
    moment: "regular",
    minLeadMinutes: 120,
    maxLeadMinutes: 360,
    sessionKinds: ["match", "football", "endurance", "strength"],
    highlight: "pełny posiłek",
    icon: "bowl",
  },
  {
    id: "skyr-banana-honey",
    title: "Skyr, banan i miód",
    subtitle: "Chłodna miska bez gotowania",
    text: "skyr, banan, miód, woda",
    portion: "mala",
    prepMinutes: 3,
    moment: "quick",
    minLeadMinutes: 45,
    maxLeadMinutes: 150,
    sessionKinds: ["speed", "football", "strength", "endurance", "match"],
    highlight: "3 min",
    icon: "oats",
  },
  {
    id: "rice-pudding-banana",
    title: "Ryż na mleku z bananem",
    subtitle: "Miękki, lekki i łatwy do zjedzenia",
    text: "ryż, mleko, banan, miód, woda",
    portion: "mala",
    prepMinutes: 5,
    moment: "quick",
    minLeadMinutes: 60,
    maxLeadMinutes: 180,
    sessionKinds: ["speed", "match", "football", "endurance"],
    highlight: "lekki",
    icon: "oats",
  },
  {
    id: "bagel-turkey",
    title: "Bajgiel z indykiem",
    subtitle: "Do torby, z ogórkiem i lekkim serkiem",
    text: "pieczywo, indyk, ogórek, mała ilość serka, woda",
    portion: "normalna",
    prepMinutes: 6,
    moment: "portable",
    minLeadMinutes: 90,
    maxLeadMinutes: 300,
    sessionKinds: ["football", "strength", "speed", "endurance"],
    highlight: "na wynos",
    icon: "sandwich",
  },
  {
    id: "jam-toast-yogurt",
    title: "Tosty z dżemem + jogurt",
    subtitle: "Krótka lista składników, szybkie paliwo",
    text: "tosty, dżem, jogurt, woda",
    portion: "mala",
    prepMinutes: 5,
    moment: "quick",
    minLeadMinutes: 45,
    maxLeadMinutes: 150,
    sessionKinds: ["speed", "match", "football", "endurance"],
    highlight: "szybko",
    icon: "sandwich",
  },
  {
    id: "banana-isotonic",
    title: "Banan i izotonik",
    subtitle: "Kiedy do startu zostało naprawdę mało czasu",
    text: "banan, izotonik",
    portion: "mala",
    prepMinutes: 1,
    moment: "portable",
    minLeadMinutes: 10,
    maxLeadMinutes: 60,
    sessionKinds: ["speed", "match", "football", "endurance", "strength"],
    highlight: "na ostatnią chwilę",
    icon: "drink",
  },
  {
    id: "oats-vanilla-fruit",
    title: "Owsianka banan–wanilia",
    subtitle: "Z jogurtem i miękkimi owocami",
    text: "płatki owsiane, jogurt, banan, owoce, woda",
    portion: "normalna",
    prepMinutes: 8,
    moment: "regular",
    minLeadMinutes: 120,
    maxLeadMinutes: 360,
    sessionKinds: ["strength", "football", "endurance", "recovery"],
    highlight: "spokojna energia",
    icon: "oats",
  },
];

function normalizedRestrictions(profile: Profile | null): string[] {
  return [
    ...(profile?.foodAllergies ?? []),
    ...(profile?.foodIntolerances ?? []),
    ...(profile?.foodExclusions ?? []),
  ]
    .map((item) => item.trim().toLocaleLowerCase("pl"))
    .filter(Boolean);
}

function isExcluded(meal: MealRecommendation, restrictions: string[]): boolean {
  const haystack = `${meal.title} ${meal.subtitle} ${meal.text}`.toLocaleLowerCase("pl");
  return restrictions.some((item) => {
    if (haystack.includes(item)) return true;
    const family = RESTRICTION_FAMILIES.find(({ declaration }) => declaration.test(item));
    return Boolean(family?.ingredients.test(haystack));
  });
}

const RESTRICTION_FAMILIES = [
  { declaration: /mlek|nabiał|laktoz/, ingredients: /mlek|jogurt|skyr|kefir|twar|ser|śmietan|masł/ },
  { declaration: /gluten|pszen|żyto|jęczmień/, ingredients: /chleb|pieczyw|tost|bułk|bajgl|makaron|płatk|owsiank|tortill|wrap/ },
  { declaration: /orzech|migdał|arachid/, ingredients: /orzech|migdał|arachid/ },
  { declaration: /jaj/, ingredients: /jaj|omlet|majonez/ },
  { declaration: /soj/, ingredients: /soj|tofu/ },
];

function mealScore(
  meal: MealRecommendation,
  session: FuelSessionInput,
  minutes: number,
): number {
  let score = 0;
  if (meal.sessionKinds.includes(session.kind)) score += 8;
  if (minutes >= meal.minLeadMinutes && minutes <= meal.maxLeadMinutes) score += 12;
  else score -= Math.min(12, Math.abs(minutes - Math.max(meal.minLeadMinutes, Math.min(minutes, meal.maxLeadMinutes))) / 15);
  if (minutes < 75 && meal.moment === "quick") score += 5;
  if (minutes >= 75 && meal.moment === "regular") score += 3;
  if (session.kind === "match" || session.kind === "speed") {
    if (/ryż|banan|dżem|izotonik|makaron/.test(meal.text)) score += 3;
  }
  score -= meal.prepMinutes / 20;
  return score;
}

export function recommendMeals({
  session,
  minutes,
  profile,
  limit = 5,
}: {
  session: FuelSessionInput;
  minutes: number | null;
  profile: Profile | null;
  limit?: number;
}): MealRecommendation[] {
  const lead = minutes ?? 180;
  const restrictions = normalizedRestrictions(profile);
  return CATALOG.filter((meal) => !isExcluded(meal, restrictions))
    .map((meal, index) => ({ meal, index, score: mealScore(meal, session, lead) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ meal }) => meal);
}

export interface FuelTargetRange {
  carbMinG: number;
  carbMaxG: number;
  fluidMinMl: number;
  fluidMaxMl: number;
  precise: boolean;
  label: string;
}

function roundToFive(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

/**
 * Orientacyjny cel przed jednostką. Masa jest używana tylko po osobnej zgodzie.
 * Bez niej Fuel pokazuje zakres oparty na porcji, bez pozornej precyzji.
 */
export function fuelTargetRange({
  session,
  minutes,
  profile,
}: {
  session: FuelSessionInput;
  minutes: number | null;
  profile: Profile | null;
}): FuelTargetRange {
  const lead = minutes ?? 180;
  const highDemand =
    session.kind === "match" ||
    session.kind === "speed" ||
    session.intensity === "wysoka" ||
    (session.durationMin ?? 0) >= 75;
  const weight = profile?.fuelPrecisionEnabled ? profile.weightKg ?? null : null;

  if (weight) {
    const factors =
      lead < 60
        ? highDemand
          ? [0.35, 0.6]
          : [0.25, 0.45]
        : lead < 120
          ? highDemand
            ? [0.6, 1]
            : [0.45, 0.8]
          : highDemand
            ? [1, 1.5]
            : [0.75, 1.2];
    return {
      carbMinG: roundToFive(weight * factors[0]),
      carbMaxG: roundToFive(weight * factors[1]),
      fluidMinMl: lead < 60 ? 250 : 350,
      fluidMaxMl: lead < 60 ? 450 : 600,
      precise: true,
      label: "Zakres z wieku, masy i planu",
    };
  }

  return {
    carbMinG: lead < 60 ? 20 : highDemand ? 45 : 35,
    carbMaxG: lead < 60 ? 40 : highDemand ? 75 : 60,
    fluidMinMl: lead < 60 ? 250 : 350,
    fluidMaxMl: lead < 60 ? 450 : 600,
    precise: false,
    label: "Bez danych o masie · zakres ogólny",
  };
}

export { CATALOG as FUEL_MEAL_CATALOG };
