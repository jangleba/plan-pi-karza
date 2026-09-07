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
  energy: number;
  fatigue: number;
  jointPain: number;
  painLocation?: PainLocation | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function calculateOverallReadiness(input: ShortReadinessInput): number {
  const recoveryFromFatigue = 11 - clamp(input.fatigue, 1, 10);
  const movementComfort = 11 - clamp(input.jointPain, 0, 10);
  return clamp(
    (input.sleep + input.energy + recoveryFromFatigue + movementComfort) / 4,
    1,
    10,
  );
}

export function buildReadiness(date: string, input: ShortReadinessInput): Readiness {
  return {
    date,
    sleep: clamp(input.sleep, 1, 10),
    energy: clamp(input.energy, 1, 10),
    fatigue: clamp(input.fatigue, 1, 10),
    soreness: clamp(input.fatigue, 1, 10),
    jointPain: clamp(input.jointPain, 0, 10),
    painLocation: input.jointPain > 0 ? (input.painLocation ?? "other") : null,
    stress: 3,
    motivation: clamp(input.energy, 1, 10),
    overall: calculateOverallReadiness(input),
  };
}
