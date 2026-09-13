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

export function calculateOverallReadiness(input: ShortReadinessInput): number {
  const recoveryFromFatigue = 11 - clamp(input.fatigue, 1, 10);
  const recoveryFromSoreness = 11 - clamp(input.soreness ?? input.fatigue, 1, 10);
  const recoveryFromStress = 11 - clamp(input.stress ?? 3, 1, 10);
  const movementComfort = 11 - clamp(input.jointPain, 0, 10);
  return clamp(
    (input.sleep + recoveryFromFatigue + recoveryFromSoreness + recoveryFromStress + movementComfort) / 5,
    1,
    10,
  );
}

export function buildReadiness(date: string, input: ShortReadinessInput): Readiness {
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
    stress: clamp(input.stress ?? 3, 1, 10),
    motivation: clamp(11 - (input.stress ?? 3), 1, 10),
    overall: calculateOverallReadiness(input),
    painOnset: input.jointPain > 0 ? (input.painOnset ?? null) : null,
    altersMovement: input.jointPain > 0 ? Boolean(input.altersMovement) : false,
    redFlags: input.jointPain > 0 ? (input.redFlags ?? []) : [],
  };
}

export function hasMedicalRedFlag(input: Pick<ShortReadinessInput, "redFlags">): boolean {
  return (input.redFlags?.length ?? 0) > 0;
}
