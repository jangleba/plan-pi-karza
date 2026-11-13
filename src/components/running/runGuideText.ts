import { formatCountdown, targetLabel } from "@/lib/running/guideTimeline";
import type { RunningIntervalProtocol, RunningIntervalStep } from "@/lib/running/types";

/* Teksty ekranu prowadzenia biegu (licznik bez GPS i bieg z GPS): tylko co robić. */

/** Rozgrzewka / Odcinki (albo Bieg) / Schłodzenie — tylko części, które ma receptura. */
export function guidePhases(protocol: RunningIntervalProtocol, workCount: number) {
  const has = (phase: string) => protocol.steps.some((s) => (s.phase ?? "main") === phase);
  return [
    has("warmup") ? { id: "warmup", label: "Rozgrzewka" } : null,
    has("main") ? { id: "main", label: workCount > 1 ? "Odcinki" : "Bieg" } : null,
    has("cooldown") ? { id: "cooldown", label: "Schłodzenie" } : null,
  ].filter((p): p is { id: string; label: string } => p !== null);
}

/** „Odcinek 3 z 6”, „Przerwa po odcinku 3 z 6”, „Rozgrzewka”. */
export function stepTitle(step: RunningIntervalStep | null): string {
  if (!step) return "Koniec";
  const phase = step.phase ?? "main";
  if (phase === "warmup") return "Rozgrzewka";
  if (phase === "cooldown") return "Schłodzenie";
  const series =
    step.setTotal && step.setTotal > 1 ? ` · seria ${step.setIndex} z ${step.setTotal}` : "";
  if (step.kind === "work")
    return step.repeatTotal > 1
      ? `Odcinek ${step.repeatIndex} z ${step.repeatTotal}${series}`
      : step.label;
  return step.repeatTotal > 1
    ? `${step.label} po odcinku ${step.repeatIndex} z ${step.repeatTotal}`
    : step.label;
}

export function untilLabel(step: RunningIntervalStep | null): string {
  if (!step) return "";
  const phase = step.phase ?? "main";
  if (phase === "warmup") return "do końca rozgrzewki";
  if (phase === "cooldown") return "do końca schłodzenia";
  if (step.kind !== "work") return "do końca przerwy";
  return step.repeatTotal > 1 ? "do końca odcinka" : "do końca biegu";
}

/** Krótka nazwa tego, co dalej: przerwy nazwane sposobem odpoczynku. */
export function nextName(step: RunningIntervalStep): string {
  if ((step.phase ?? "main") === "main" && step.kind !== "work") {
    if (/trucht/i.test(step.instruction)) return "Trucht";
    if (/marsz/i.test(step.instruction)) return "Marsz";
    if (/stój/i.test(step.instruction)) return "Odpoczynek";
  }
  return step.kind === "work" && step.repeatTotal > 1 ? `Odcinek ${step.repeatIndex}` : step.label;
}

/** Cel kroku: tempo z testu albo RPE z opisem odczucia. */
export function goalOf(step: RunningIntervalStep | null): { value: string; note?: string } | null {
  if (!step) return null;
  if (step.target.paceTarget) return { value: step.target.paceTarget.label };
  if (step.effort) {
    const [low, high] = step.effort.rpe;
    const note = step.effort.label.replace(/\s*\(RPE[^)]*\)\s*$/, "").trim();
    return {
      value: `RPE ${low === high ? low : `${low}–${high}`}/10`,
      note: note || undefined,
    };
  }
  const label = targetLabel(step);
  return label ? { value: label } : null;
}

/** „1 min”, „30 s”, „1:30”. */
export function durationLabel(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  if (total % 60 === 0) return `${total / 60} min`;
  return formatCountdown(total);
}

/** „0:32” → „00:32”, jak na zegarze. */
export function padClock(value: string): string {
  return /^\d:\d\d$/.test(value) ? `0${value}` : value;
}
