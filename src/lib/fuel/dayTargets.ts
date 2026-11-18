import type { SessionCompletion, SessionDay } from "../loadwise/types";
import type { FuelLoadBand } from "./assistant";
import { planFuelContexts, type FuelContext } from "./experience";

/**
 * Orientational daily intake ranges for a footballer, version "fuel-targets-1".
 *
 * Basis: UEFA expert group statement on nutrition in elite football (Collins et al., BJSM 2021):
 * carbohydrate periodised to the day's demands (≈3–8 g/kg; 6–8 g/kg on MD-1, match day and the
 * day after), protein ≈1.6–2.2 g/kg spread over the day, fat as the remainder of energy. IOC REDs
 * consensus (Mountjoy et al., BJSM 2023): avoid low energy availability; never prescribe deficits
 * to growing athletes. Elite values are not applied mechanically: the ranges are wide, labelled as
 * orientational, and the day type below is a product rule, not a measurement.
 *
 * Energy is derived from the macronutrient ranges — never from RPE, minutes × RPE or watch
 * calories, which do not measure expenditure.
 */
export const FUEL_TARGETS_VERSION = "fuel-targets-1";

export type FuelDayType =
  "rest" | "light" | "moderate" | "heavy" | "match_prep" | "match" | "match_recovery";
type NonTrainingActivity = "low" | "moderate" | "high";

export interface FuelActivity {
  /** Session identity: a duplicate import of the same session counts once. */
  key: string;
  kind: FuelContext["kind"];
  durationMin: number | null;
  load: FuelLoadBand;
  status: "planned" | "completed" | "cancelled";
  /** Match only: minutes actually played (0 = stayed on the bench). */
  playedMinutes?: number | null;
}

interface FuelTargetInput {
  age: number;
  /** Only with the Fuel Precision consent; otherwise the guidance stays in portions. */
  weightKg: number | null;
  /** Everyday activity outside training (job, school, commuting); null = not answered. */
  nonTrainingActivity: NonTrainingActivity | null;
  activities: FuelActivity[];
  /** The previous day: its heaviest load and whether it was a match. */
  previous: { load: FuelLoadBand | null; match: boolean } | null;
  matchToday: boolean;
  matchTomorrow: boolean;
}

export interface Range {
  min: number;
  max: number;
}
export interface FuelDayTargets {
  version: typeof FUEL_TARGETS_VERSION;
  dayType: FuelDayType;
  label: string;
  reason: string;
  /** "grams" with a body mass; "portions" without it (limited precision). */
  precision: "grams" | "portions";
  carbsGPerKg: Range;
  proteinGPerKg: Range;
  carbsG: Range | null;
  proteinG: Range | null;
  fatG: Range | null;
  kcal: Range | null;
  portions: string;
  /** Growing athletes: no deficit and no weight-loss target, ever. */
  youth: boolean;
  /** What would sharpen the estimate if the athlete chose to add it. */
  missing: Array<"weight" | "nonTrainingActivity">;
  trainingMinutes: number;
}

const CARBS: Record<FuelDayType, Range> = {
  rest: { min: 3, max: 4 },
  light: { min: 3, max: 5 },
  moderate: { min: 4, max: 6 },
  heavy: { min: 6, max: 8 },
  match_prep: { min: 6, max: 8 },
  match: { min: 6, max: 8 },
  match_recovery: { min: 6, max: 8 },
};
const PROTEIN: Range = { min: 1.6, max: 2.2 };
const PROTEIN_YOUTH: Range = { min: 1.6, max: 2.0 };
/** Fat share of energy used to close the range (25–30 %). */
const FAT_SHARE: Range = { min: 0.25, max: 0.3 };

const LABEL: Record<FuelDayType, string> = {
  rest: "Dzień odpoczynku",
  light: "Lekki dzień",
  moderate: "Dzień treningowy",
  heavy: "Mocny dzień treningowy",
  match_prep: "Dzień przed meczem",
  match: "Dzień meczowy",
  match_recovery: "Dzień po meczu",
};
const PORTIONS: Record<FuelDayType, string> = {
  rest: "W głównych posiłkach ok. ¼ talerza węglowodanów (ryż, makaron, ziemniaki, pieczywo), białko w każdym posiłku, warzywa.",
  light:
    "W głównych posiłkach ok. ¼–⅓ talerza węglowodanów, białko w każdym posiłku, owoc jako przekąska.",
  moderate:
    "W głównych posiłkach ok. ⅓ talerza węglowodanów, białko w każdym posiłku, przekąska z węglowodanami przed treningiem.",
  heavy:
    "W głównych posiłkach ok. ½ talerza węglowodanów, białko w każdym posiłku, 1–2 przekąski z węglowodanami.",
  match_prep:
    "Rozłóż więcej węglowodanów na cały dzień: ok. ½ talerza w głównych posiłkach i przekąski (owoce, pieczywo, jogurt z płatkami). Znane produkty, mniej tłuszczu i błonnika wieczorem.",
  match:
    "Przed meczem posiłek z dużą porcją węglowodanów i białkiem, później lekka przekąska; po meczu węglowodany i białko.",
  match_recovery:
    "Węglowodany ok. ½ talerza i białko w każdym posiłku — odbudowa zapasów energii po meczu.",
};

const STEP: FuelDayType[] = ["rest", "light", "moderate", "heavy"];
const rank = (load: FuelLoadBand) => (load === "high" ? 2 : load === "moderate" ? 1 : 0);
const round = (value: number, step: number) => Math.round(value / step) * step;

/** Planned and completed sessions of a day; the same session is counted once, cancelled ones never. */
export function dedupeActivities(activities: readonly FuelActivity[]): FuelActivity[] {
  const byKey = new Map<string, FuelActivity>();
  for (const a of activities) {
    const prior = byKey.get(a.key);
    // Completion wins over plan; a cancellation wins over a plan but never over a completion.
    if (
      !prior ||
      (a.status === "completed" && prior.status !== "completed") ||
      (a.status === "cancelled" && prior.status === "planned")
    )
      byKey.set(a.key, a);
  }
  return [...byKey.values()].filter((a) => a.status !== "cancelled" && a.kind !== "none");
}

export function classifyFuelDay(input: Omit<FuelTargetInput, "age" | "weightKg">): {
  dayType: FuelDayType;
  reason: string;
  trainingMinutes: number;
} {
  const activities = dedupeActivities(input.activities).filter((a) => a.kind !== "match");
  const minutes = activities.reduce((sum, a) => sum + (a.durationMin ?? 0), 0);
  if (input.matchToday) return { dayType: "match", reason: "Dziś mecz.", trainingMinutes: minutes };
  // A light session the day before a match does not mean low carbohydrate: preparation counts.
  if (input.matchTomorrow)
    return {
      dayType: "match_prep",
      reason: activities.length
        ? "Jutro mecz: dzisiejszy lżejszy trening nie zmniejsza potrzeby węglowodanów."
        : "Jutro mecz: przygotowanie zaczyna się dziś.",
      trainingMinutes: minutes,
    };
  if (input.previous?.match && !activities.some((a) => a.load === "high"))
    return {
      dayType: "match_recovery",
      reason: "Wczoraj mecz: dziś odbudowa zapasów energii.",
      trainingMinutes: minutes,
    };
  const top = Math.max(-1, ...activities.map((a) => rank(a.load)));
  let index =
    activities.length === 0
      ? 0
      : top >= 2 && minutes >= 60
        ? 3
        : minutes >= 120
          ? 3
          : top >= 1 || minutes >= 45
            ? 2
            : 1;
  const notes: string[] = [];
  if (activities.length > 1) notes.push(`${activities.length} aktywności (${minutes} min razem)`);
  else if (activities.length === 1) notes.push(`${minutes || "?"} min treningu`);
  else notes.push("bez treningu");
  // Everyday activity is asked "outside training", so it is never the same minutes twice.
  if (input.nonTrainingActivity === "high" && index < 3) {
    index += 1;
    notes.push("dużo ruchu poza treningiem");
  }
  // A heavy day or a match the day before keeps a rest day from dropping to the lowest band.
  if (index === 0 && input.previous && (input.previous.load === "high" || input.previous.match)) {
    index = 1;
    notes.push("wczoraj mocny wysiłek");
  }
  const dayType = STEP[index];
  return {
    dayType,
    reason: `${notes.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()),
    trainingMinutes: minutes,
  };
}

export function fuelDayTargets(input: FuelTargetInput): FuelDayTargets {
  const { dayType, reason, trainingMinutes } = classifyFuelDay(input);
  const youth = input.age < 18;
  const carbs = CARBS[dayType];
  const protein = youth ? PROTEIN_YOUTH : PROTEIN;
  const w =
    typeof input.weightKg === "number" && input.weightKg >= 25 && input.weightKg <= 250
      ? input.weightKg
      : null;
  // Growing athletes under 16 get portions only: no numeric calorie target to manage.
  const grams = w !== null && input.age >= 16;
  const g = (r: Range) => ({ min: round(r.min * w!, 5), max: round(r.max * w!, 5) });
  const carbsG = grams ? g(carbs) : null;
  const proteinG = grams ? g(protein) : null;
  const kcal = grams
    ? {
        min: round((4 * (carbsG!.min + proteinG!.min)) / (1 - FAT_SHARE.min), 50),
        max: round((4 * (carbsG!.max + proteinG!.max)) / (1 - FAT_SHARE.max), 50),
      }
    : null;
  const fatG = kcal
    ? {
        min: round((kcal.min * FAT_SHARE.min) / 9, 5),
        max: round((kcal.max * FAT_SHARE.max) / 9, 5),
      }
    : null;
  const missing: FuelDayTargets["missing"] = [];
  if (w === null) missing.push("weight");
  if (input.nonTrainingActivity === null) missing.push("nonTrainingActivity");
  return {
    version: FUEL_TARGETS_VERSION,
    dayType,
    label: LABEL[dayType],
    reason,
    precision: grams ? "grams" : "portions",
    carbsGPerKg: carbs,
    proteinGPerKg: protein,
    carbsG,
    proteinG,
    fatG,
    kcal,
    portions: PORTIONS[dayType],
    youth,
    missing,
    trainingMinutes,
  };
}

/** Session id inside a context key (`date:id:index`); plan rows without an id keep the full key. */
const sessionIdOf = (c: FuelContext) => {
  const id = c.key.split(":")[1];
  return id && id !== "main" ? id : c.key;
};

const toActivity = (
  c: FuelContext,
  completions: Record<string, SessionCompletion>,
): FuelActivity => {
  const id = sessionIdOf(c);
  const done = completions[id];
  return {
    key: id,
    kind: c.kind,
    // The athlete's real duration replaces the plan (or the 90-minute club estimate).
    durationMin: done?.completed && done.durationMin ? done.durationMin : c.durationMin,
    // An unused substitute did not play the match: no post-match recovery day from it.
    load: c.kind === "match" && done?.matchMinutesPlayed === 0 ? "low" : c.load,
    status: done?.status === "missed" ? "cancelled" : c.completed ? "completed" : "planned",
    playedMinutes: c.kind === "match" ? (done?.matchMinutesPlayed ?? null) : undefined,
  };
};

/** Builds the model input from the effective plan, completions and the athlete's profile. */
export function fuelTargetInputFor(input: {
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  date: string;
  age: number;
  weightKg: number | null;
  nonTrainingActivity: NonTrainingActivity | null;
}): FuelTargetInput {
  const shift = (days: number) => {
    const d = new Date(`${input.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const day = (date: string) => planFuelContexts(input.plan, date, input.completions);
  const today = day(input.date);
  const yesterday = dedupeActivities(day(shift(-1)).map((c) => toActivity(c, input.completions)));
  const tomorrow = day(shift(1));
  const isMatch = (items: Array<{ kind: FuelContext["kind"] }>) =>
    items.some((c) => c.kind === "match");
  return {
    age: input.age,
    weightKg: input.weightKg,
    nonTrainingActivity: input.nonTrainingActivity,
    activities: today.map((c) => toActivity(c, input.completions)),
    previous: yesterday.length
      ? {
          load: yesterday.reduce<FuelLoadBand | null>(
            (top, c) => (top === null || rank(c.load) > rank(top) ? c.load : top),
            null,
          ),
          match: yesterday.some((a) => a.kind === "match" && a.playedMinutes !== 0),
        }
      : null,
    matchToday: isMatch(dedupeActivities(today.map((c) => toActivity(c, input.completions)))),
    matchTomorrow: isMatch(tomorrow),
  };
}
