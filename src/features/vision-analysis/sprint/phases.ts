/**
 * Fazy sprintu — wyznaczane wyłącznie z realnego przebiegu prędkości tułowia.
 *
 * Nie wymyślamy brakujących faz: jeśli nagranie zaczyna się w pełnym biegu
 * (odcinek lotny) albo zawiera zbyt mało klatek, dana faza po prostu nie
 * powstaje. Prędkość liczymy w pikselach znormalizowanych, ponieważ służy
 * WYŁĄCZNIE do podziału na fazy — nigdy do raportowania prędkości.
 */

import type { FramePose } from "../types";
import { POSE } from "../types";
import { round } from "../physics";
import type { SprintPhase, SprintPhaseId } from "./types";
import { SPRINT_PHASE_LABELS } from "./types";

/** Minimalna liczba klatek, by faza była w ogóle raportowana. */
export const MIN_PHASE_FRAMES = 3;

interface Sample {
  frameIndex: number;
  timeS: number;
  x: number;
  visibility: number;
}

function torsoSamples(poses: FramePose[]): Sample[] {
  const out: Sample[] = [];
  for (const p of poses) {
    const lm = p.landmarks;
    if (!lm) continue;
    const ids = [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER, POSE.LEFT_HIP, POSE.RIGHT_HIP];
    const pts = ids.map((i) => lm[i]);
    if (pts.some((pt) => !pt)) continue;
    const visibility = pts.reduce((a, pt) => a + (pt!.visibility ?? 0), 0) / pts.length;
    const ts =
      typeof p.sourceTimestampUs === "number"
        ? p.sourceTimestampUs / 1_000_000
        : typeof p.sourceTimestampMs === "number"
          ? p.sourceTimestampMs / 1000
          : p.mediaTime;
    if (!Number.isFinite(ts)) continue;
    out.push({
      frameIndex: p.frameIndex,
      timeS: ts,
      x: pts.reduce((a, pt) => a + pt!.x, 0) / pts.length,
      visibility,
    });
  }
  return out.sort((a, b) => a.timeS - b.timeS);
}

/** Prędkość pozioma tułowia (jednostki znormalizowane / s) — tylko do faz. */
function speedSeries(samples: Sample[]): number[] {
  const speeds: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].timeS - samples[i - 1].timeS;
    speeds.push(dt > 0 ? Math.abs(samples[i].x - samples[i - 1].x) / dt : 0);
  }
  return speeds;
}

function smooth(values: number[], window = 5): number[] {
  if (values.length === 0) return values;
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j];
      n++;
    }
    return sum / n;
  });
}

function makePhase(
  id: SprintPhaseId,
  from: Sample,
  to: Sample,
  frames: number,
  visibility: number,
): SprintPhase {
  return {
    id,
    label: SPRINT_PHASE_LABELS[id],
    startTimeS: round(from.timeS, 3),
    endTimeS: round(to.timeS, 3),
    frameStart: from.frameIndex,
    frameEnd: to.frameIndex,
    confidence: round(Math.min(1, (frames / 10) * Math.min(1, visibility / 0.6)), 2),
  };
}

/**
 * Dzieli próbę na fazy tylko wtedy, gdy dane na to pozwalają.
 * Progi są względne do maksymalnej zaobserwowanej prędkości tułowia:
 *  start        — prędkość < 15% max (postawa startowa),
 *  first_steps  — 15-45% max,
 *  acceleration — 45-90% max,
 *  high_speed   — >= 90% max.
 */
export function detectSprintPhases(poses: FramePose[]): SprintPhase[] {
  const samples = torsoSamples(poses);
  if (samples.length < MIN_PHASE_FRAMES + 1) return [];
  const speeds = smooth(speedSeries(samples));
  const max = Math.max(...speeds);
  if (!(max > 0)) return [];

  const classify = (v: number): SprintPhaseId => {
    const r = v / max;
    if (r < 0.15) return "start";
    if (r < 0.45) return "first_steps";
    if (r < 0.9) return "acceleration";
    return "high_speed";
  };

  // Etykieta per próbka (pierwsza próbka dziedziczy z pierwszego odcinka).
  const labels: SprintPhaseId[] = [classify(speeds[0])];
  for (const s of speeds) labels.push(classify(s));

  // Fazy muszą występować w kolejności rosnącej — cofnięcia scalamy do bieżącej.
  const ORDER: SprintPhaseId[] = ["start", "first_steps", "acceleration", "high_speed"];
  let currentRank = ORDER.indexOf(labels[0]);
  const monotone: SprintPhaseId[] = [];
  for (const l of labels) {
    const rank = ORDER.indexOf(l);
    if (rank > currentRank) currentRank = rank;
    monotone.push(ORDER[currentRank]);
  }

  const phases: SprintPhase[] = [];
  let startIdx = 0;
  for (let i = 1; i <= monotone.length; i++) {
    if (i === monotone.length || monotone[i] !== monotone[startIdx]) {
      const frames = i - startIdx;
      if (frames >= MIN_PHASE_FRAMES) {
        const seg = samples.slice(startIdx, i);
        const vis = seg.reduce((a, s) => a + s.visibility, 0) / seg.length;
        phases.push(makePhase(monotone[startIdx], seg[0], seg[seg.length - 1], frames, vis));
      }
      startIdx = i;
    }
  }
  return phases;
}

/** Faza obowiązująca w danej klatce (lub null, gdy poza wyznaczonymi fazami). */
export function phaseForFrame(phases: SprintPhase[], frameIndex: number): SprintPhaseId | null {
  for (const p of phases) {
    if (frameIndex >= p.frameStart && frameIndex <= p.frameEnd) return p.id;
  }
  return null;
}
