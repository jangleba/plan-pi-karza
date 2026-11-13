import { crossedSteps, positionAt, stepBoundaries, type GuidePosition } from "./guideTimeline";
import type { RunningIntervalProtocol, RunningIntervalStep } from "./types";

/**
 * Stan licznika bez GPS dla receptury czasowej. Czas liczy się od zegara
 * ściennego (`runningSince`), więc wygaszony ekran, aplikacja w tle albo
 * zamrożony JS nie zatrzymują biegu. Krok wynika z czasu prowadzenia
 * (czas aktywny + pominięte końcówki kroków), a każdy przekroczony krok
 * trafia do wyników dokładnie raz.
 */

export type ObservedKind = "run_clock" | "run_clock_partial" | "run_rest";

export interface ObservedStep {
  /** Numer kroku od 1 (indeks kroku protokołu + 1). */
  number: number;
  seconds: number;
  kind: ObservedKind;
  saved: boolean;
}

export interface GuideDraft {
  v: 2;
  /** Sekundy aktywnego biegu do ostatniej pauzy. */
  activeSec: number;
  /** Zegar ścienny (ms) od wznowienia albo null w pauzie. */
  runningSince: number | null;
  /** Sekundy kroków pominiętych przyciskiem „Pomiń”. */
  skipSec: number;
  /** Czas prowadzenia, do którego kroki są już zapisane w wynikach. */
  recordedSec: number;
  finished: boolean;
  results: ObservedStep[];
}

export const EMPTY_GUIDE_DRAFT: GuideDraft = {
  v: 2,
  activeSec: 0,
  runningSince: null,
  skipSec: 0,
  recordedSec: 0,
  finished: false,
  results: [],
};

const DAY = 86_400;
const KINDS: ObservedKind[] = ["run_clock", "run_clock_partial", "run_rest"];
const finite = (n: unknown, max = DAY): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n < max;

export function parseGuideDraft(value: unknown): GuideDraft | undefined {
  if (!value || typeof value !== "object") return;
  const x = value as GuideDraft;
  if (
    x.v !== 2 ||
    !finite(x.activeSec) ||
    !finite(x.skipSec) ||
    !finite(x.recordedSec) ||
    !(x.runningSince === null || finite(x.runningSince, 9e15)) ||
    typeof x.finished !== "boolean" ||
    !Array.isArray(x.results) ||
    x.results.length > 200 ||
    !x.results.every(
      (r) =>
        Number.isInteger(r?.number) &&
        r.number >= 1 &&
        r.number <= 200 &&
        finite(r.seconds) &&
        r.seconds > 0 &&
        KINDS.includes(r.kind) &&
        typeof r.saved === "boolean",
    )
  )
    return;
  return x;
}

/** Sekundy faktycznego biegu (bez pominiętych końcówek). */
export function activeElapsed(draft: GuideDraft, nowMs: number): number {
  const live = draft.runningSince == null ? 0 : Math.max(0, (nowMs - draft.runningSince) / 1000);
  return Math.min(DAY - 1, draft.activeSec + live);
}

/** Pozycja na osi receptury. */
export function guideElapsed(draft: GuideDraft, nowMs: number): number {
  return activeElapsed(draft, nowMs) + draft.skipSec;
}

export function guidePosition(
  protocol: RunningIntervalProtocol,
  draft: GuideDraft,
  nowMs: number,
): GuidePosition {
  return positionAt(protocol, guideElapsed(draft, nowMs));
}

const kindOf = (step: RunningIntervalStep, partial: boolean): ObservedKind =>
  step.kind === "recovery" ? "run_rest" : partial ? "run_clock_partial" : "run_clock";

const round = (seconds: number) => Math.round(seconds * 10) / 10;

function withResults(draft: GuideDraft, added: ObservedStep[]): ObservedStep[] {
  if (!added.length) return draft.results;
  const numbers = new Set(added.map((r) => r.number));
  return [...draft.results.filter((r) => !numbers.has(r.number)), ...added];
}

export interface GuideAdvance {
  draft: GuideDraft;
  /** Nowe wyniki kroków do zapisania. */
  added: ObservedStep[];
  /** Czy w tym kroku czasu zaczął się nowy krok albo bieg się skończył. */
  changed: boolean;
}

/** Przesuwa licznik do chwili `nowMs` i zapisuje kroki przekroczone po drodze. */
export function advanceGuide(
  protocol: RunningIntervalProtocol,
  draft: GuideDraft,
  nowMs: number,
): GuideAdvance {
  if (draft.finished) return { draft, added: [], changed: false };
  const { totalSec } = stepBoundaries(protocol);
  const at = guideElapsed(draft, nowMs);
  const crossed = crossedSteps(protocol, draft.recordedSec, at);
  if (!crossed.length) return { draft, added: [], changed: false };
  const added = crossed.map(({ index, step, startSec, endSec }) => ({
    number: index + 1,
    seconds: round(endSec - startSec),
    kind: kindOf(step, false),
    saved: false,
  }));
  const finished = at >= totalSec;
  return {
    draft: {
      ...draft,
      activeSec: finished ? Math.max(0, totalSec - draft.skipSec) : draft.activeSec,
      runningSince: finished ? null : draft.runningSince,
      recordedSec: crossed[crossed.length - 1].endSec,
      finished,
      results: withResults(draft, added),
    },
    added,
    changed: true,
  };
}

export function startGuide(draft: GuideDraft, nowMs: number): GuideDraft {
  if (draft.finished || draft.runningSince != null) return draft;
  return { ...draft, runningSince: nowMs };
}

export function pauseGuide(draft: GuideDraft, nowMs: number): GuideDraft {
  if (draft.runningSince == null) return draft;
  return { ...draft, activeSec: activeElapsed(draft, nowMs), runningSince: null };
}

/** Kończy bieżący krok przed czasem; licznik od razu przechodzi do następnego. */
export function skipGuideStep(
  protocol: RunningIntervalProtocol,
  draft: GuideDraft,
  nowMs: number,
): GuideAdvance {
  const settled = advanceGuide(protocol, draft, nowMs);
  const base = settled.draft;
  if (base.finished) return settled;
  const position = guidePosition(protocol, base, nowMs);
  if (!position.step) return settled;
  const done = position.stepElapsedSec >= 0.5;
  const result: ObservedStep[] = done
    ? [
        {
          number: position.index + 1,
          seconds: round(position.stepElapsedSec),
          kind: kindOf(position.step, true),
          saved: false,
        },
      ]
    : [];
  const skipped: GuideDraft = {
    ...base,
    skipSec: base.skipSec + position.stepRemainingSec,
    recordedSec: guideElapsed(base, nowMs) + position.stepRemainingSec,
    results: withResults(base, result),
  };
  const { totalSec } = stepBoundaries(protocol);
  const finished = guideElapsed(skipped, nowMs) >= totalSec - 1e-6;
  const draftOut = finished
    ? { ...skipped, activeSec: activeElapsed(skipped, nowMs), runningSince: null, finished }
    : skipped;
  return { draft: draftOut, added: [...settled.added, ...result], changed: true };
}

/** Zakończenie biegu: bieżący krok zapisuje się jako częściowy. */
export function finishGuide(
  protocol: RunningIntervalProtocol,
  draft: GuideDraft,
  nowMs: number,
): GuideAdvance {
  const settled = advanceGuide(protocol, draft, nowMs);
  const base = settled.draft;
  if (base.finished) return settled;
  const position = guidePosition(protocol, base, nowMs);
  const result: ObservedStep[] =
    position.step && position.stepElapsedSec >= 0.5
      ? [
          {
            number: position.index + 1,
            seconds: round(position.stepElapsedSec),
            kind: kindOf(position.step, true),
            saved: false,
          },
        ]
      : [];
  return {
    draft: {
      ...base,
      activeSec: activeElapsed(base, nowMs),
      runningSince: null,
      finished: true,
      results: withResults(base, result),
    },
    added: [...settled.added, ...result],
    changed: true,
  };
}

/** Ostatnie sekundy przerwy przed odcinkiem: odliczanie 3-2-1. */
export function countdownSecond(protocol: RunningIntervalProtocol, position: GuidePosition) {
  const step = position.step;
  if (!step || position.done) return null;
  const next = protocol.steps[position.index + 1];
  const length = step.target.value ?? 0;
  if (step.kind === "work" || !next || next.kind !== "work" || length < 8) return null;
  const left = Math.ceil(position.stepRemainingSec - 1e-6);
  return left >= 1 && left <= 3 ? left : null;
}
