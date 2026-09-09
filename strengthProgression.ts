import type { SetLog } from "@/lib/loadwise/setLogs";

export type LoadDecision = "calibrate" | "increase" | "repeat" | "reduce";

export interface LoadRecommendation {
  decision: LoadDecision;
  weightKg: number | null;
  title: string;
  reason: string;
}

function rangeFromText(value: string | undefined, fallback: [number, number]): [number, number] {
  const values = (value?.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((item) => Number(item.replace(",", ".")))
    .filter(Number.isFinite);
  if (values.length === 0) return fallback;
  if (values.length === 1) return [values[0], values[0]];
  return [Math.min(values[0], values[1]), Math.max(values[0], values[1])];
}

function practicalStep(weightKg: number): number {
  if (weightKg < 10) return 0.5;
  if (weightKg < 20) return 1;
  return 2.5;
}

function roundToStep(value: number, step: number): number {
  return Math.max(0, Math.round(value / step) * step);
}

/**
 * Progresja bez 1RM. Decyzja wynika wyłącznie z ostatniej pełnej sesji:
 * wykonanych powtórzeń, RIR i realnego ciężaru zawodnika.
 */
export function recommendNextLoad(
  logs: SetLog[],
  targetReps?: string,
  targetRir?: string,
): LoadRecommendation {
  const valid = logs.filter(
    (log) =>
      log.weightKg !== null &&
      log.weightKg > 0 &&
      log.reps !== null &&
      log.reps > 0 &&
      log.rir !== null &&
      log.rir >= 0,
  );
  if (valid.length === 0) {
    return {
      decision: "calibrate",
      weightKg: null,
      title: "Ustal ciężar startowy",
      reason: "Wybierz ciężar na dolny zakres powtórzeń i zostaw 2–3 powtórzenia w zapasie.",
    };
  }

  const [repMin, repMax] = rangeFromText(targetReps, [valid[0].reps ?? 1, valid[0].reps ?? 1]);
  const [rirMin, rirMax] = rangeFromText(targetRir, [2, 3]);
  const weights = valid.map((log) => log.weightKg as number);
  const baseWeight = Math.max(...weights);
  const step = practicalStep(baseWeight);
  const missedTarget = valid.some(
    (log) => (log.reps as number) < repMin || (log.rir as number) < rirMin,
  );
  const completedTop = valid.every(
    (log) => (log.reps as number) >= repMax && (log.rir as number) >= rirMin,
  );
  const clearlyEasy = valid.every(
    (log) => (log.reps as number) >= repMin && (log.rir as number) > rirMax,
  );

  if (missedTarget) {
    const reduced = roundToStep(baseWeight * 0.95, step);
    return {
      decision: "reduce",
      weightKg: reduced < baseWeight ? reduced : Math.max(0, baseWeight - step),
      title: "Lżej na następną sesję",
      reason: "Ostatnio zabrakło powtórzeń lub zapasu. Cofamy mały krok, żeby odzyskać jakość.",
    };
  }

  if (completedTop || clearlyEasy) {
    return {
      decision: "increase",
      weightKg: baseWeight + step,
      title: "Mały krok w górę",
      reason: "Wszystkie serie spełniły cel z odpowiednim zapasem.",
    };
  }

  return {
    decision: "repeat",
    weightKg: baseWeight,
    title: "Powtórz ciężar",
    reason: "Ciężar był w dobrym zakresie. Najpierw ustabilizuj wszystkie serie.",
  };
}
