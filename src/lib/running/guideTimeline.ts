import type { RunningIntervalProtocol, RunningIntervalStep } from "./types";

/**
 * Oś czasu prowadzenia biegu. Gdy wszystkie kroki są czasowe (receptura),
 * bieżący krok wynika wyłącznie z czasu aktywnego biegu. Dzięki temu po
 * wygaszeniu ekranu, przejściu aplikacji w tło lub zawieszeniu JS licznik
 * wraca dokładnie tam, gdzie jest bieg — bez zgadywania i bez „gubienia” przerw.
 */

export interface GuidePosition {
  index: number;
  step: RunningIntervalStep | null;
  /** Sekundy od początku bieżącego kroku. */
  stepElapsedSec: number;
  /** Sekundy do końca bieżącego kroku. */
  stepRemainingSec: number;
  /** Ile kroków jest za nami (łącznie z tymi przekroczonymi w tle). */
  completedSteps: number;
  done: boolean;
}

export function isTimedProtocol(protocol: RunningIntervalProtocol | null | undefined): boolean {
  return Boolean(
    protocol?.steps.length &&
    protocol.steps.every(
      (step) =>
        step.target.mode === "time" &&
        step.target.autoAdvance &&
        typeof step.target.value === "number" &&
        step.target.value > 0,
    ),
  );
}

/** Początki kroków (w sekundach aktywnego biegu) i łączna długość. */
export function stepBoundaries(protocol: RunningIntervalProtocol): {
  starts: number[];
  totalSec: number;
} {
  const starts: number[] = [];
  let at = 0;
  for (const step of protocol.steps) {
    starts.push(at);
    at += step.target.value ?? 0;
  }
  return { starts, totalSec: at };
}

export function positionAt(protocol: RunningIntervalProtocol, elapsedSec: number): GuidePosition {
  const { starts, totalSec } = stepBoundaries(protocol);
  const elapsed = Math.max(0, elapsedSec);
  if (elapsed >= totalSec || !protocol.steps.length)
    return {
      index: protocol.steps.length,
      step: null,
      stepElapsedSec: 0,
      stepRemainingSec: 0,
      completedSteps: protocol.steps.length,
      done: true,
    };
  let index = 0;
  while (index + 1 < starts.length && starts[index + 1] <= elapsed) index += 1;
  const step = protocol.steps[index];
  const stepElapsedSec = elapsed - starts[index];
  return {
    index,
    step,
    stepElapsedSec,
    stepRemainingSec: Math.max(0, (step.target.value ?? 0) - stepElapsedSec),
    completedSteps: index,
    done: false,
  };
}

/** Kroki, których koniec przypada w przedziale (from, to] — do sygnałów i zapisu. */
export function crossedSteps(
  protocol: RunningIntervalProtocol,
  fromSec: number,
  toSec: number,
): Array<{ index: number; step: RunningIntervalStep; startSec: number; endSec: number }> {
  if (toSec <= fromSec) return [];
  const { starts } = stepBoundaries(protocol);
  return protocol.steps.flatMap((step, index) => {
    const endSec = starts[index] + (step.target.value ?? 0);
    return endSec > fromSec && endSec <= toSec
      ? [{ index, step, startSec: starts[index], endSec }]
      : [];
  });
}

/** Etykieta etapu w liczniku: Rozgrzewka / Bieg / Przerwa / Schłodzenie. */
export function stageLabel(step: RunningIntervalStep | null): string {
  if (!step) return "Koniec";
  if (step.phase === "warmup") return "Rozgrzewka";
  if (step.phase === "cooldown") return "Schłodzenie";
  return step.kind === "work" ? (step.label === "Sprint" ? "Sprint" : "Bieg") : "Przerwa";
}

/** „Odcinek 3/10 · Seria 1/2” albo null dla rozgrzewki i schłodzenia. */
export function repLabel(step: RunningIntervalStep | null): string | null {
  if (!step || step.phase === "warmup" || step.phase === "cooldown") return null;
  if (step.repeatTotal <= 1 && !step.setTotal) return null;
  const rep =
    step.kind === "work"
      ? `Odcinek ${step.repeatIndex}/${step.repeatTotal}`
      : `po odcinku ${step.repeatIndex}/${step.repeatTotal}`;
  return step.setTotal && step.setTotal > 1
    ? `${rep} · Seria ${step.setIndex}/${step.setTotal}`
    : rep;
}

/** Cel kroku: tempo z testu albo odczuwany wysiłek. */
export function targetLabel(step: RunningIntervalStep | null): string | null {
  if (!step) return null;
  if (step.target.paceTarget) return `Tempo ${step.target.paceTarget.label}`;
  if (step.effort) return step.effort.label;
  return null;
}

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds - 1e-6));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}
