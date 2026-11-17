import type { PainLocation, Readiness } from "./types";

export const PAIN_LOCATION_OPTIONS: { value: PainLocation; label: string }[] = [
  { value: "knee", label: "Kolano" },
  { value: "ankle", label: "Kostka / stopa" },
  { value: "hamstring", label: "Tył uda" },
  { value: "groin", label: "Pachwina" },
  { value: "hip", label: "Biodro" },
  { value: "back", label: "Plecy" },
  { value: "shoulder", label: "Bark" },
  { value: "other", label: "Inny obszar" },
];

/** Values accepted by the readiness RPC; symptoms are independent of joint pain. */
export const READINESS_RED_FLAG_OPTIONS = [
  { value: "chest_pain", label: "Ból w klatce piersiowej" },
  { value: "fainting", label: "Omdlenie" },
  { value: "breathlessness", label: "Duszność w spoczynku" },
  { value: "head_injury", label: "Uraz głowy" },
  {
    value: "deformity_or_no_weight",
    label: "Nie mogę obciążyć kończyny lub widzę zniekształcenie",
  },
] as const;

export interface ShortReadinessInput {
  sleep: number;
  /** Legacy caller compatibility; no longer collected in the main check-in. */
  energy?: number;
  fatigue: number;
  soreness?: number;
  stress?: number;
  jointPain: number;
  painLocation?: PainLocation | null;
  painOnset?: "today" | "1_7_days" | "over_7_days" | null;
  altersMovement?: boolean;
  redFlags?: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Answers that only make sense while joint pain is reported. A form may keep
 * them in memory after the pain was set back to 0; they must be dropped before
 * any score is calculated, otherwise a hidden "alters movement" answer would
 * silently force overall=1 on a record that stores no pain.
 */
export function normalizePainAnswers<
  T extends Pick<
    ShortReadinessInput,
    "jointPain" | "painLocation" | "painOnset" | "altersMovement"
  >,
>(input: T): T {
  if (input.jointPain > 0) return input;
  return { ...input, painLocation: null, painOnset: null, altersMovement: false };
}

export function calculateOverallReadiness(rawInput: ShortReadinessInput): number {
  const input = normalizePainAnswers(rawInput);
  const recoveryFromFatigue = 11 - clamp(input.fatigue, 1, 10);
  const recoveryFromSoreness = 11 - clamp(input.soreness ?? input.fatigue, 1, 10);
  const movementComfort = 10 - clamp(input.jointPain, 0, 10);
  // Internal scheduling score, not a validated clinical readiness measure.
  // Missing optional answers cannot be interpreted as positive observations.
  const observations = [
    clamp(input.sleep, 1, 10),
    recoveryFromFatigue,
    recoveryFromSoreness,
    movementComfort,
  ];
  if (input.stress !== undefined) observations.push(11 - clamp(input.stress, 1, 10));
  const mean = clamp(
    observations.reduce((sum, value) => sum + value, 0) / observations.length,
    1,
    10,
  );
  if (input.redFlags?.length || input.altersMovement) return 1;
  // A single severe response must not disappear inside a favourable mean.
  if (
    input.sleep <= 2 ||
    input.fatigue >= 9 ||
    (input.soreness ?? input.fatigue) >= 9 ||
    input.jointPain >= 7
  ) {
    return Math.min(mean, 3);
  }
  return mean;
}

export function buildReadiness(date: string, rawInput: ShortReadinessInput): Readiness {
  const input = normalizePainAnswers(rawInput);
  return {
    date,
    sleep: clamp(input.sleep, 1, 10),
    // Pola legacy pozostają dla kompatybilności istniejącego silnika i bazy.
    // Zawodnik nie ocenia już energii/motywacji ani wyniku końcowego.
    energy: clamp(11 - input.fatigue, 1, 10),
    fatigue: clamp(input.fatigue, 1, 10),
    soreness: clamp(input.soreness ?? input.fatigue, 1, 10),
    jointPain: clamp(input.jointPain, 0, 10),
    painLocation: input.jointPain > 0 ? (input.painLocation ?? "other") : null,
    // Neutral legacy placeholders; stress/motivation are not inferred as good.
    stress: clamp(input.stress ?? NEUTRAL_STRESS, 1, 10),
    motivation: clamp(11 - (input.stress ?? NEUTRAL_STRESS), 1, 10),
    overall: calculateOverallReadiness(input),
    painOnset: input.jointPain > 0 ? (input.painOnset ?? null) : null,
    altersMovement: input.jointPain > 0 ? Boolean(input.altersMovement) : false,
    // Chest symptoms/fainting can occur without any joint pain.
    redFlags: input.redFlags ?? [],
  };
}

/** Stored placeholder for the stress answer the check-in form does not collect. */
const NEUTRAL_STRESS = 5;

/**
 * The single reader of a stored check-in. It recomputes from the answers the
 * form really collects (sleep, fatigue, soreness, pain, symptoms) and never
 * from the stored stress/motivation placeholders, so the value a player saw at
 * save time equals the one the planner and progression use later. The stored
 * `overall` can only lower the result (a cached aggregate never raises it), and
 * thresholds are untouched. Returns undefined for corrupt records.
 */
export function readinessScore(readiness: Readiness | undefined): number | undefined {
  if (!readiness) return undefined;
  if (
    ![readiness.sleep, readiness.fatigue, readiness.soreness, readiness.overall].every(
      (n) => Number.isFinite(n) && n >= 1 && n <= 10,
    ) ||
    !Number.isFinite(readiness.jointPain)
  )
    return undefined;
  const recomputed = calculateOverallReadiness({
    sleep: readiness.sleep,
    fatigue: readiness.fatigue,
    soreness: readiness.soreness,
    jointPain: readiness.jointPain,
    painLocation: readiness.painLocation,
    painOnset: readiness.painOnset,
    altersMovement: readiness.altersMovement,
    redFlags: readiness.redFlags,
  });
  return Math.min(readiness.overall, recomputed);
}

export function hasMedicalRedFlag(input: Pick<ShortReadinessInput, "redFlags">): boolean {
  return (input.redFlags?.length ?? 0) > 0;
}
