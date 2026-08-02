/**
 * Fuel Engine — jedyne miejsce z regułami i obliczeniami Fuel Check.
 *
 * Zasady:
 * - funkcje są czyste i deterministyczne (brak Date.now(), Math.random(), AI),
 * - każdy wynik liczbowy ma `ruleId` i wynika z danych wejściowych,
 * - brakujące dane nie są zgadywane — komponent zwraca `points: null`
 *   i trafia na listę `missingData`.
 */

import type {
  FuelAssessment,
  FuelBand,
  FuelComparison,
  FuelComponent,
  FuelCorrection,
  FuelInput,
  FuelProblem,
  FuelTargets,
  MealSize,
} from "./types";

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const round = (v: number) => Math.round(v);

/** Mnożnik węglowodanów g/kg wg intensywności i typu jednostki. */
function carbFactor(input: FuelInput): number | null {
  const { session } = input;
  if (session.kind === "none") return null;
  if (session.kind === "recovery") return 0.25;
  const intensity = session.intensity;
  if (!intensity) return null;
  let f = intensity === "wysoka" ? 1.0 : intensity === "umiarkowana" ? 0.6 : 0.3;
  if (session.kind === "match") f += 0.2;
  if (session.durationMin != null) {
    if (session.durationMin >= 90) f *= 1.2;
    else if (session.durationMin <= 45) f *= 0.8;
  }
  if (session.minutesToStart != null) {
    if (session.minutesToStart < 30) f *= 0.35;
    else if (session.minutesToStart < 60) f *= 0.5;
  }
  return f;
}

/** Wymagany odstęp posiłek → wysiłek (minuty). */
export function requiredLead(
  mealSize: MealSize,
  fatFiberHeavy: boolean | null,
  gutIssues: boolean | null,
): number {
  const base: Record<MealSize, number> = {
    none: 0,
    liquid: 30,
    small: 60,
    medium: 120,
    large: 180,
  };
  let lead = base[mealSize];
  const solid = mealSize === "small" || mealSize === "medium" || mealSize === "large";
  if (fatFiberHeavy && mealSize !== "none") lead += 30;
  if (gutIssues && solid) lead += 30;
  return lead;
}

export function computeTargets(input: FuelInput): FuelTargets {
  const mass = input.athlete.bodyMassKg;
  const f = carbFactor(input);
  const carbTargetG = mass != null && f != null ? round(mass * f) : null;

  let fluidTargetMl: number | null = null;
  if (mass != null) {
    const daily = mass * 35;
    const hours = (input.session.durationMin ?? 0) / 60;
    const perHour =
      input.session.intensity === "wysoka" || input.session.kind === "match"
        ? 500
        : input.session.intensity === "umiarkowana"
          ? 350
          : 200;
    fluidTargetMl = round(daily + hours * perHour);
  }

  const mealSize = input.intake.mealSize;
  const requiredLeadMinutes =
    mealSize == null
      ? null
      : requiredLead(mealSize, input.intake.fatFiberHeavy, input.intake.gutIssues);

  return {
    carbTargetG,
    carbRuleId: "CARB_TARGET_V1",
    fluidTargetMl,
    fluidRuleId: "FLUID_TARGET_V1",
    requiredLeadMinutes,
    leadRuleId: "LEAD_TIME_V1",
  };
}

function carbComponent(input: FuelInput, t: FuelTargets): FuelComponent {
  const missing: string[] = [];
  if (input.athlete.bodyMassKg == null) missing.push("masa ciała");
  if (input.session.kind === "none") missing.push("najbliższa jednostka");
  else if (input.session.intensity == null) missing.push("intensywność jednostki");
  if (input.intake.plannedCarbsG == null) missing.push("węglowodany w posiłku");

  if (t.carbTargetG == null || input.intake.plannedCarbsG == null) {
    return {
      id: "carbs",
      label: "Węglowodany",
      points: null,
      maxPoints: 25,
      ruleId: "CARB_ADEQUACY_V1",
      detail: "Brak danych do policzenia zapotrzebowania.",
      missing,
    };
  }

  const ratio = t.carbTargetG === 0 ? 1 : input.intake.plannedCarbsG / t.carbTargetG;
  let points: number;
  if (ratio >= 0.9 && ratio <= 1.4) points = 25;
  else if (ratio < 0.9) points = 25 * (ratio / 0.9);
  else points = 25 - Math.min(12, (ratio - 1.4) * 20);

  return {
    id: "carbs",
    label: "Węglowodany",
    points: clamp(round(points), 0, 25),
    maxPoints: 25,
    ruleId: "CARB_ADEQUACY_V1",
    detail: `${input.intake.plannedCarbsG} g wobec celu ${t.carbTargetG} g (${Math.round(ratio * 100)}%).`,
    missing,
  };
}

function timingComponent(input: FuelInput, t: FuelTargets): FuelComponent {
  const missing: string[] = [];
  if (input.intake.mealSize == null) missing.push("wielkość posiłku");
  if (input.session.minutesToStart == null) missing.push("godzina jednostki");

  if (t.requiredLeadMinutes == null || input.session.minutesToStart == null) {
    return {
      id: "timing",
      label: "Timing",
      points: null,
      maxPoints: 25,
      ruleId: "TIMING_GAP_V1",
      detail: "Brak danych do oceny odstępu przed wysiłkiem.",
      missing,
    };
  }

  const gap = input.session.minutesToStart;
  const need = t.requiredLeadMinutes;
  const points = need === 0 ? 25 : 25 * clamp(gap / need, 0, 1);

  return {
    id: "timing",
    label: "Timing",
    points: round(points),
    maxPoints: 25,
    ruleId: "TIMING_GAP_V1",
    detail: `Do startu ${gap} min, wymagany odstęp ${need} min.`,
    missing,
  };
}

function hydrationComponent(input: FuelInput, t: FuelTargets): FuelComponent {
  const missing: string[] = [];
  if (input.athlete.bodyMassKg == null) missing.push("masa ciała");
  if (input.intake.fluidTodayMl == null) missing.push("wypite płyny dziś");

  if (t.fluidTargetMl == null || input.intake.fluidTodayMl == null) {
    return {
      id: "hydration",
      label: "Nawodnienie",
      points: null,
      maxPoints: 25,
      ruleId: "HYDRATION_V1",
      detail: "Brak danych do oceny nawodnienia.",
      missing,
    };
  }

  const ratio = clamp(input.intake.fluidTodayMl / t.fluidTargetMl, 0, 1);
  return {
    id: "hydration",
    label: "Nawodnienie",
    points: round(25 * ratio),
    maxPoints: 25,
    ruleId: "HYDRATION_V1",
    detail: `${input.intake.fluidTodayMl} ml wobec celu ${t.fluidTargetMl} ml (${Math.round(ratio * 100)}%).`,
    missing,
  };
}

function gutComponent(input: FuelInput): FuelComponent {
  const missing: string[] = [];
  if (input.intake.mealSize == null) missing.push("wielkość posiłku");
  if (input.session.minutesToStart == null) missing.push("godzina jednostki");

  const mealSize = input.intake.mealSize;
  const gap = input.session.minutesToStart;
  if (mealSize == null || gap == null) {
    return {
      id: "gut",
      label: "Komfort żołądkowy",
      points: null,
      maxPoints: 25,
      ruleId: "GUT_RISK_V1",
      detail: "Brak danych do oceny ryzyka dyskomfortu.",
      missing,
    };
  }

  const solid = mealSize === "small" || mealSize === "medium" || mealSize === "large";
  const reasons: string[] = [];
  let points = 25;
  if (input.intake.fatFiberHeavy && gap < 120) {
    points -= 10;
    reasons.push("tłuszcz/błonnik blisko wysiłku");
  }
  if (input.intake.gutIssues && solid && gap < 90) {
    points -= 8;
    reasons.push("wrażliwy żołądek i stały posiłek < 90 min");
  }
  if (input.intake.caffeine && gap < 45) {
    points -= 5;
    reasons.push("kofeina < 45 min przed startem");
  }
  if (mealSize === "large" && gap < 150) {
    points -= 5;
    reasons.push("duży posiłek < 150 min");
  }
  if (input.intake.gutIssues && input.intake.fatFiberHeavy) {
    points -= 4;
    reasons.push("wrażliwy żołądek + ciężki posiłek");
  }

  return {
    id: "gut",
    label: "Komfort żołądkowy",
    points: clamp(points, 0, 25),
    maxPoints: 25,
    ruleId: "GUT_RISK_V1",
    detail: reasons.length ? reasons.join(", ") : "Brak czynników ryzyka w tym oknie.",
    missing,
  };
}

function bandOf(score: number | null): FuelBand {
  if (score == null) return "brak_danych";
  if (score >= 85) return "wysoka";
  if (score >= 70) return "dobra";
  if (score >= 50) return "srednia";
  return "niska";
}

const CORRECTIONS: Record<string, (input: FuelInput) => FuelCorrection | null> = {
  carbs: (input) => {
    const t = computeTargets(input);
    if (t.carbTargetG == null) return null;
    const planned = input.intake.plannedCarbsG ?? 0;
    if (planned < t.carbTargetG) {
      const add = t.carbTargetG - planned;
      return {
        ruleId: "FIX_CARB_UP_V1",
        title: `Dołóż ok. ${add} g węglowodanów`,
        detail:
          "Prosty dodatek: banan (~25 g), 2 kromki chleba (~30 g) lub 500 ml izotoniku (~30 g).",
        apply: (i) => ({
          ...i,
          intake: { ...i.intake, plannedCarbsG: t.carbTargetG },
        }),
      };
    }
    return {
      ruleId: "FIX_CARB_DOWN_V1",
      title: `Zmniejsz porcję węglowodanów do ok. ${t.carbTargetG} g`,
      detail: "Nadmiar przed wysiłkiem nie poprawia wyniku, a obciąża żołądek.",
      apply: (i) => ({
        ...i,
        intake: { ...i.intake, plannedCarbsG: t.carbTargetG },
      }),
    };
  },
  timing: (input) => {
    const gap = input.session.minutesToStart;
    if (gap == null) return null;
    const target: MealSize =
      gap >= 180 ? "large" : gap >= 120 ? "medium" : gap >= 60 ? "small" : "liquid";
    return {
      ruleId: "FIX_MEAL_SIZE_V1",
      title:
        target === "liquid"
          ? "Zamień na wersję płynną / lekką"
          : `Zmniejsz posiłek do wielkości: ${target === "small" ? "mała" : target === "medium" ? "średnia" : "duża"}`,
      detail: `Przy ${gap} min do startu ta wielkość mieści się w wymaganym odstępie.`,
      apply: (i) => ({
        ...i,
        intake: { ...i.intake, mealSize: target, fatFiberHeavy: false },
      }),
    };
  },
  hydration: (input) => {
    const t = computeTargets(input);
    if (t.fluidTargetMl == null) return null;
    const drunk = input.intake.fluidTodayMl ?? 0;
    const add = Math.max(0, t.fluidTargetMl - drunk);
    return {
      ruleId: "FIX_FLUID_V1",
      title: `Dopij ok. ${add} ml płynów`,
      detail: "Rozłóż na porcje 200–300 ml, ostatnia większa porcja do 60 min przed startem.",
      apply: (i) => ({
        ...i,
        intake: { ...i.intake, fluidTodayMl: t.fluidTargetMl },
      }),
    };
  },
  gut: () => ({
    ruleId: "FIX_GUT_V1",
    title: "Zdejmij tłuszcz, sos i błonnik z tego posiłku",
    detail: "Zostaw węglowodany i chude białko — to najczęstsza przyczyna dyskomfortu.",
    apply: (i) => ({
      ...i,
      intake: { ...i.intake, fatFiberHeavy: false, caffeine: false },
    }),
  }),
};

const PROBLEM_TITLES: Record<string, string> = {
  carbs: "Za mało lub za dużo węglowodanów",
  timing: "Zły moment spożycia",
  hydration: "Niedobór płynów",
  gut: "Ryzyko dyskomfortu żołądkowego",
};

/** Główna funkcja oceny — deterministyczna. */
export function evaluateFuel(input: FuelInput): FuelAssessment {
  const targets = computeTargets(input);
  const components: FuelComponent[] = [
    carbComponent(input, targets),
    timingComponent(input, targets),
    hydrationComponent(input, targets),
    gutComponent(input),
  ];

  const available = components.filter((c) => c.points != null);
  const gained = available.reduce((s, c) => s + (c.points ?? 0), 0);
  const max = available.length * 25;
  const score = max > 0 ? round((gained / max) * 100) : null;

  const carbs = components[0];
  const hydration = components[2];
  const gut = components[3];

  const energyParts = [carbs, hydration].filter((c) => c.points != null);
  const energyReadiness = energyParts.length
    ? round(
        (energyParts.reduce((s, c) => s + (c.points ?? 0), 0) /
          (energyParts.length * 25)) *
          100,
      )
    : null;

  const discomfortRisk = gut.points == null ? null : round(100 - (gut.points / 25) * 100);
  const hydrationPct = hydration.points == null ? null : round((hydration.points / 25) * 100);

  // najsłabszy komponent = główny problem
  const weakest = available
    .slice()
    .sort((a, b) => (a.points ?? 0) - (b.points ?? 0))[0];

  let mainProblem: FuelProblem | null = null;
  let correction: FuelCorrection | null = null;
  if (weakest && (weakest.points ?? 25) < 25) {
    mainProblem = {
      ruleId: weakest.ruleId,
      title: PROBLEM_TITLES[weakest.id] ?? weakest.label,
      detail: weakest.detail,
    };
    correction = CORRECTIONS[weakest.id]?.(input) ?? null;
  }

  const missingData = Array.from(
    new Set(components.flatMap((c) => (c.points == null ? c.missing : []))),
  );

  return {
    score,
    band: bandOf(score),
    dataCompleteness: round((available.length / components.length) * 100),
    components,
    targets,
    energyReadiness,
    discomfortRisk,
    hydrationPct,
    eatBeforeStartMin: targets.requiredLeadMinutes,
    eatAtClock: null,
    mainProblem,
    correction,
    missingData,
  };
}

/** Ocena przed i po zastosowaniu rekomendowanej korekty. */
export function compareWithCorrection(input: FuelInput): FuelComparison {
  const before = evaluateFuel(input);
  if (!before.correction) return { before, after: null, deltaScore: null };
  const after = evaluateFuel(before.correction.apply(input));
  const deltaScore =
    before.score != null && after.score != null ? after.score - before.score : null;
  return { before, after, deltaScore };
}

/** Godzina spożycia (HH:MM) na podstawie startu jednostki i wymaganego odstępu. */
export function eatClock(
  startClock: string | null,
  requiredLeadMinutes: number | null,
): string | null {
  if (!startClock || requiredLeadMinutes == null) return null;
  const m = startClock.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) - requiredLeadMinutes;
  const norm = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(norm / 60)).padStart(2, "0");
  const mm = String(norm % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
