import type { Profile, TrainingExercise } from "./types";
import type { SetLog } from "./setLogs";

export type StrengthProgressionMode = "increase" | "repeat" | "reduce";

export interface StrengthProgressionContext {
  age?: number | null;
  level?: Profile["level"] | null;
  goal?: Profile["goal"] | null;
  gymExperienceLevel?: Profile["gymExperienceLevel"];
  strengthTrainingMonths?: number;
  movementCompetence?: Profile["movementCompetence"];
  supervisionLevel?: Profile["supervisionLevel"];
  blockPhaseLabel?: string | null;
  mdLabel?: string | null;
  smallestIncrementKg?: number;
  exercise?: Pick<
    TrainingExercise,
    "name" | "purpose" | "loadTarget" | "progression" | "ageSafetyLevel"
  >;
}

export interface StrengthProgressionRecommendation {
  mode: StrengthProgressionMode;
  title: string;
  currentWeightKg: number | null;
  weightKg: number | null;
  reason: string;
  confidence: "low" | "medium" | "high";
}

export interface StrengthProgressionDecision {
  sessionId: string;
  exerciseKey: string;
  decision: "accepted" | "repeat";
  currentWeightKg: number;
  proposedWeightKg: number;
  decidedAt: string;
}

function numbers(value: string | undefined): number[] {
  return (
    String(value ?? "")
      .match(/\d+(?:[.,]\d+)?/g)
      ?.map((item) => Number(item.replace(",", "."))) ?? []
  );
}

function targetRange(value: string | undefined): { low: number; high: number } {
  const parsed = numbers(value);
  if (parsed.length === 0) return { low: 1, high: 99 };
  return { low: Math.min(...parsed), high: Math.max(...parsed) };
}

function targetRir(value: string | undefined): number {
  return numbers(value)[0] ?? 2;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sessionSummary(sets: SetLog[]) {
  const complete = sets.filter(
    (set) => set.weightKg != null && set.reps != null && set.rir != null,
  );
  if (complete.length === 0) return null;
  return {
    weightKg: Math.max(...complete.map((set) => set.weightKg!)),
    minimumReps: Math.min(...complete.map((set) => set.reps!)),
    averageRir: average(complete.map((set) => set.rir!)),
    allSetsLogged: complete.length === sets.length,
  };
}

function exerciseKind(
  exercise: StrengthProgressionContext["exercise"],
): "power" | "compound" | "accessory" {
  const text =
    `${exercise?.name ?? ""} ${exercise?.purpose ?? ""} ${exercise?.loadTarget ?? ""}`.toLowerCase();
  if (/moc|power|eksplo|dynamic|skok|jump|rzut|throw|clean|swing/.test(text))
    return "power";
  if (
    /przysiad|squat|martwy|deadlift|wyciskan|press|bench|wiosł|row|hip thrust/.test(
      text,
    )
  ) {
    return "compound";
  }
  return "accessory";
}

function nearestAvailableIncrease(
  current: number,
  target: number,
  increment: number,
): number {
  const rounded = Math.round(target / increment) * increment;
  const candidate = rounded > current ? rounded : current + increment;
  return Math.round(candidate * 100) / 100;
}

function repeat(
  currentWeightKg: number | null,
  reason: string,
  confidence: StrengthProgressionRecommendation["confidence"] = "medium",
): StrengthProgressionRecommendation {
  return {
    mode: "repeat",
    title: "Jeszcze jedna sesja tym ciężarem",
    currentWeightKg,
    weightKg: currentWeightKg,
    reason,
    confidence,
  };
}

/**
 * Konserwatywna propozycja na kolejną ekspozycję. Silnik niczego nie zapisuje
 * sam: zawodnik zawsze akceptuje wzrost albo odkłada go o jedną sesję.
 */
export function recommendNextLoad(
  history: SetLog[][] | SetLog[],
  reps: string | undefined,
  rir: string | undefined,
  context: StrengthProgressionContext = {},
): StrengthProgressionRecommendation | null {
  const sessions: SetLog[][] = Array.isArray(history[0])
    ? (history as SetLog[][])
    : [history as SetLog[]];
  const summaries = sessions
    .map(sessionSummary)
    .filter(Boolean)
    .slice(0, 3) as NonNullable<ReturnType<typeof sessionSummary>>[];
  const latest = summaries[0];
  if (!latest) return null;

  const current = latest.weightKg;
  const phase = String(context.blockPhaseLabel ?? "").toLowerCase();
  if (/deload|regener|odciąż|konsolid/.test(phase)) {
    return repeat(
      current,
      "Tydzień odciążenia: utrzymujemy bodziec bez dokładania ciężaru.",
    );
  }
  if (context.mdLabel === "MD" || context.mdLabel === "MD-1") {
    return repeat(
      current,
      "Blisko meczu priorytetem jest świeżość, nie nowy ciężar.",
    );
  }

  const kind = exerciseKind(context.exercise);
  const target = targetRange(reps);
  const plannedRir = targetRir(rir);
  const young = (context.age ?? 99) < 16;
  const novice =
    context.gymExperienceLevel === "none" ||
    context.gymExperienceLevel === "beginner" ||
    (context.strengthTrainingMonths ?? 99) < 12 ||
    context.level === "beginner";

  if (
    young &&
    ((context.age ?? 99) < 13 || context.movementCompetence === "low") &&
    context.supervisionLevel !== "full"
  ) {
    return repeat(
      current,
      "Najpierw powtarzalna technika i nadzór; aplikacja nie zwiększa teraz obciążenia.",
      "high",
    );
  }

  if (summaries.length < 2) {
    return repeat(
      current,
      "Potrzebujemy jeszcze jednej porównywalnej sesji, żeby ocenić trend.",
      "low",
    );
  }

  const recent = summaries.slice(
    0,
    young || novice || kind === "power" ? 2 : 2,
  );
  const failed = recent.some(
    (item) =>
      !item.allSetsLogged ||
      item.minimumReps < target.low ||
      item.averageRir < Math.max(0, plannedRir - 1),
  );
  if (failed) {
    const repeatedFailure = recent.every(
      (item) => item.minimumReps < target.low || item.averageRir <= 0,
    );
    if (repeatedFailure) {
      const increment = Math.max(0.5, context.smallestIncrementKg ?? 2.5);
      const reduced = Math.max(
        increment,
        Math.round((current * 0.95) / increment) * increment,
      );
      return {
        mode: "reduce",
        title: "Spokojna korekta ciężaru",
        currentWeightKg: current,
        weightKg: Math.round(reduced * 100) / 100,
        reason:
          "Dwie ostatnie ekspozycje nie domknęły celu; cofamy mały krok zamiast dokładać zmęczenie.",
        confidence: "medium",
      };
    }
    return repeat(
      current,
      "Ostatnia sesja nie była jeszcze stabilna w zaplanowanym zakresie.",
    );
  }

  const clearlyReady = recent.every(
    (item) =>
      item.minimumReps >= target.high &&
      item.averageRir >= plannedRir + (kind === "power" ? 1 : 0),
  );
  if (!clearlyReady) {
    return repeat(
      current,
      "Wynik jest poprawny, ale nie ma jeszcze dwóch wyraźnych sygnałów do progresji.",
    );
  }

  const footballSpeedPriority =
    context.goal === "power" || context.goal === "speed";
  const percentage =
    kind === "power" || footballSpeedPriority || young || novice
      ? 0.025
      : kind === "compound"
        ? 0.05
        : 0.05;
  const increment = Math.max(0.5, context.smallestIncrementKg ?? 2.5);
  const proposed = nearestAvailableIncrease(
    current,
    current * (1 + percentage),
    increment,
  );
  const actualIncrease = (proposed - current) / current;
  const safeCeiling = young ? 0.05 : kind === "power" ? 0.03 : 0.1;
  if (proposed <= current || actualIncrease > safeCeiling) {
    return repeat(
      current,
      "Najmniejszy dostępny skok ciężaru byłby zbyt duży; zostajemy przy tym obciążeniu.",
    );
  }

  return {
    mode: "increase",
    title: "Następna propozycja",
    currentWeightKg: current,
    weightKg: proposed,
    reason:
      kind === "power" || footballSpeedPriority
        ? "Dwie stabilne ekspozycje z rezerwą; mały krok ma zachować szybkość i jakość ruchu."
        : "Dwie stabilne ekspozycje w celu powtórzeń i RIR; proponujemy najmniejszy bezpieczny krok.",
    confidence: summaries.length >= 3 ? "high" : "medium",
  };
}

export function strengthProgressionDecisionKey(
  userId: string,
  exerciseKey: string,
): string {
  return `ballwise:strength-progression:v1:${userId}:${exerciseKey}`;
}

export function saveStrengthProgressionDecision(
  userId: string,
  decision: StrengthProgressionDecision,
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined"
    ? null
    : window.localStorage,
): void {
  storage?.setItem(
    strengthProgressionDecisionKey(userId, decision.exerciseKey),
    JSON.stringify(decision),
  );
}
