import type { SessionDay } from "@/lib/loadwise/types";
import type {
  RunningIntervalProtocol,
  RunningIntervalResult,
  RunningIntervalStep,
  RunningIntervalTarget,
  RunningIntervalTargetMode,
} from "./types";

type ExerciseLike = {
  name: string;
  prescription: string;
  rest?: string;
  cue?: string;
};

const INTERVAL_WORDS = /bieg|trucht|sprint|tempo|interwa|rsa|odcink/i;
const BALL_BLOCK = /z piłk|piłką|gra na|podani|prowadzenie piłki/i;
const REP_PATTERN =
  /(\d+)(?:\s*[–—-]\s*\d+)?\s*[×x]\s*(\d+(?:[.,]\d+)?)(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s*(min(?:\.|ut(?:y|ę|a)?)?|sek(?:\.|und(?:y|ę|a)?)?|s|m)\b/i;
const TARGET_PATTERN =
  /(\d+(?:[.,]\d+)?)(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s*(min(?:\.|ut(?:y|ę|a)?)?|sek(?:\.|und(?:y|ę|a)?)?|s|m)\b/i;
const PACE_PATTERN = /(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})\s*\/\s*km/i;

function numberOf(value: string): number {
  return Number(value.replace(",", "."));
}

function targetFromMatch(match: RegExpMatchArray): RunningIntervalTarget | null {
  const amount = numberOf(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit.startsWith("min")) {
    const seconds = Math.round(amount * 60);
    return {
      mode: "time",
      value: seconds,
      label: formatTarget("time", seconds),
      autoAdvance: true,
    };
  }
  if (unit === "m") {
    const meters = Math.round(amount);
    return {
      mode: "distance",
      value: meters,
      label: `${meters} m`,
      autoAdvance: meters >= 80,
    };
  }
  const seconds = Math.round(amount);
  return { mode: "time", value: seconds, label: formatTarget("time", seconds), autoAdvance: true };
}

function formatTarget(mode: "time" | "distance", value: number): string {
  if (mode === "distance") return `${Math.round(value)} m`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds} s`;
}

function firstTarget(text: string): RunningIntervalTarget | null {
  const match = text.match(TARGET_PATTERN);
  return match ? targetFromMatch(match) : null;
}

function paceTargetFromText(text: string): RunningIntervalTarget["paceTarget"] | undefined {
  const match = text.match(PACE_PATTERN);
  if (!match) return undefined;
  const first = Number(match[1]) * 60 + Number(match[2]);
  const second = Number(match[3]) * 60 + Number(match[4]);
  if (![first, second].every((value) => Number.isFinite(value) && value >= 120 && value <= 1_200)) {
    return undefined;
  }
  const fastestSecPerKm = Math.min(first, second);
  const slowestSecPerKm = Math.max(first, second);
  return {
    fastestSecPerKm,
    slowestSecPerKm,
    label: `${Math.floor(fastestSecPerKm / 60)}:${String(fastestSecPerKm % 60).padStart(2, "0")}–${Math.floor(slowestSecPerKm / 60)}:${String(slowestSecPerKm % 60).padStart(2, "0")}/km`,
  };
}

function recoveryTarget(exercise: ExerciseLike, tail: string): RunningIntervalTarget {
  const slash = tail.match(/\/\s*(.*)$/)?.[1];
  const afterBreak = tail.match(/przerw(?:a|y|ę|ie)?\s*[:—–-]?\s*(.*)$/i)?.[1];
  const explicit =
    firstTarget(slash ?? "") ?? firstTarget(afterBreak ?? "") ?? firstTarget(exercise.rest ?? "");
  if (explicit) return explicit;
  const label = /trucht/i.test(`${tail} ${exercise.rest ?? ""}`) ? "trucht powrót" : "odpoczynek";
  return { mode: "manual", value: null, label, autoAdvance: false };
}

function uniqueMainExercises(session: SessionDay): ExerciseLike[] {
  const source =
    session.sections.main.length > 0 ? session.sections.main : (session.exercises ?? []);
  const seen = new Set<string>();
  return source.flatMap((exercise) => {
    const key = `${exercise.name}|${exercise.prescription}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        name: exercise.name,
        prescription: exercise.prescription,
        rest: exercise.rest,
        cue: exercise.cue,
      },
    ];
  });
}

/** Zamienia zapis sesji (np. 8 × 1 min / 1 min) na kroki prowadzenia w kieszeni. */
export function deriveRunningIntervalProtocol(session: SessionDay): RunningIntervalProtocol | null {
  const steps: RunningIntervalStep[] = [];
  const summaries: string[] = [];

  for (const exercise of uniqueMainExercises(session)) {
    const text = `${exercise.name} ${exercise.prescription} ${exercise.rest ?? ""}`;
    if (!INTERVAL_WORDS.test(text) || BALL_BLOCK.test(exercise.name)) continue;
    const match = exercise.prescription.match(REP_PATTERN);
    if (!match || match.index == null) continue;

    const repeats = Math.min(30, Math.max(1, Number(match[1])));
    const work = targetFromMatch([match[0], match[2], match[3]] as RegExpMatchArray);
    if (!work) continue;
    work.paceTarget = paceTargetFromText(exercise.prescription);
    const tail = exercise.prescription.slice(match.index + match[0].length);
    const recovery = recoveryTarget(exercise, tail);
    summaries.push(`${repeats} × ${work.label} / ${recovery.label}`);

    for (let repeatIndex = 1; repeatIndex <= repeats && steps.length < 80; repeatIndex += 1) {
      steps.push({
        id: `${steps.length + 1}-work-${repeatIndex}`,
        kind: "work",
        label: "Odcinek",
        instruction: exercise.cue ?? exercise.name,
        repeatIndex,
        repeatTotal: repeats,
        target: work,
      });
      if (repeatIndex < repeats) {
        steps.push({
          id: `${steps.length + 1}-recovery-${repeatIndex}`,
          kind: "recovery",
          label: "Przerwa",
          instruction: recovery.label,
          repeatIndex,
          repeatTotal: repeats,
          target: recovery,
        });
      }
    }
  }

  if (steps.length === 0) return null;
  return { title: session.title, summary: summaries.join(" · "), steps };
}

export function intervalStepProgress(
  step: RunningIntervalStep,
  elapsedSec: number,
  distanceM: number,
): number {
  if (!step.target.value || step.target.mode === "manual") return 0;
  const current = step.target.mode === "time" ? elapsedSec : distanceM;
  return Math.max(0, Math.min(1, current / step.target.value));
}

export function intervalRemainingLabel(
  step: RunningIntervalStep,
  elapsedSec: number,
  distanceM: number,
): string {
  if (!step.target.value || step.target.mode === "manual") return step.target.label;
  const current = step.target.mode === "time" ? elapsedSec : distanceM;
  const remaining = Math.max(0, step.target.value - current);
  return formatTarget(step.target.mode, remaining);
}

export function buildIntervalResult(input: {
  step: RunningIntervalStep;
  durationSec: number;
  distanceM: number;
  completed: boolean;
}): RunningIntervalResult {
  const durationSec = Math.max(0, Math.round(input.durationSec * 10) / 10);
  const distanceM = Math.max(0, Math.round(input.distanceM * 10) / 10);
  return {
    stepId: input.step.id,
    kind: input.step.kind,
    label: input.step.label,
    repeatIndex: input.step.repeatIndex,
    repeatTotal: input.step.repeatTotal,
    targetMode: input.step.target.mode,
    targetValue: input.step.target.value,
    targetLabel: input.step.target.label,
    durationSec,
    distanceM,
    paceSecPerKm: distanceM >= 50 && durationSec > 0 ? durationSec / (distanceM / 1_000) : null,
    targetPaceFastestSecPerKm: input.step.target.paceTarget?.fastestSecPerKm ?? null,
    targetPaceSlowestSecPerKm: input.step.target.paceTarget?.slowestSecPerKm ?? null,
    completed: input.completed,
  };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function sanitizeIntervalResults(input: unknown): RunningIntervalResult[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 200).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const mode = row.targetMode as RunningIntervalTargetMode;
    const kind = row.kind;
    const targetValue = row.targetValue == null ? null : Number(row.targetValue);
    if (
      typeof row.stepId !== "string" ||
      (kind !== "work" && kind !== "recovery") ||
      (mode !== "time" && mode !== "distance" && mode !== "manual") ||
      !finite(Number(row.durationSec)) ||
      !finite(Number(row.distanceM)) ||
      (targetValue != null && !finite(targetValue))
    )
      return [];
    const durationSec = Math.max(0, Math.min(86_400, Number(row.durationSec)));
    const distanceM = Math.max(0, Math.min(500_000, Number(row.distanceM)));
    const pace = row.paceSecPerKm == null ? null : Number(row.paceSecPerKm);
    const targetFast = row.targetPaceFastestSecPerKm == null ? null : Number(row.targetPaceFastestSecPerKm);
    const targetSlow = row.targetPaceSlowestSecPerKm == null ? null : Number(row.targetPaceSlowestSecPerKm);
    return [
      {
        stepId: row.stepId.slice(0, 100),
        kind,
        label:
          typeof row.label === "string"
            ? row.label.slice(0, 80)
            : kind === "work"
              ? "Odcinek"
              : "Przerwa",
        repeatIndex: Math.max(1, Math.round(Number(row.repeatIndex) || 1)),
        repeatTotal: Math.max(1, Math.round(Number(row.repeatTotal) || 1)),
        targetMode: mode,
        targetValue,
        targetLabel: typeof row.targetLabel === "string" ? row.targetLabel.slice(0, 40) : "—",
        durationSec,
        distanceM,
        paceSecPerKm: pace != null && finite(pace) && pace > 0 ? pace : null,
        targetPaceFastestSecPerKm:
          targetFast != null && finite(targetFast) && targetFast > 0 ? targetFast : null,
        targetPaceSlowestSecPerKm:
          targetSlow != null && finite(targetSlow) && targetSlow > 0 ? targetSlow : null,
        completed: Boolean(row.completed),
      },
    ];
  });
}
