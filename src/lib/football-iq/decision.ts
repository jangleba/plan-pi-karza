// Czyste funkcje decyzji Football IQ — bez UI, bez heurystyk tekstowych.
// Wynik zależy wyłącznie od momentu zatrzymania, punktu i jawnie wybranej akcji.

import { findZone } from "./simulation/engine";
import type {
  SimActionOutcome,
  SimChoice,
  SimResult,
  SimScenario,
  SimTopic,
} from "./simulation/types";
import type { IQPositionGroup } from "./types";
import {
  toolMovesActor,
  type IQPlanAction,
  type IQPlannerPoint,
  type IQPlannerTool,
} from "./planner";

/** Narzędzia planera dopasowane do tematu sceny. Bramkarz nie dostaje palety. */
const TOPIC_TOOLS: Record<SimTopic, IQPlannerTool[]> = {
  press_manipulation: [
    "position",
    "pass",
    "lofted_pass",
    "switch_play",
    "run",
    "decoy_run",
    "scan",
  ],
  third_man: ["position", "pass", "one_two", "third_man", "run", "diagonal_run", "scan"],
  overload_isolate: [
    "position",
    "pass",
    "switch_play",
    "overlap",
    "underlap",
    "hold_width",
    "overload",
    "isolate",
  ],
  positional_rotation: ["position", "pass", "run", "decoy_run", "underlap", "hold_width", "scan"],
  between_lines: ["position", "pass", "through_ball", "third_man", "run", "diagonal_run", "scan"],
  weak_side_exit: ["position", "pass", "switch_play", "lofted_pass", "hold_width", "run", "scan"],
  press_trap: ["position", "press", "cover", "block_lane", "press_trap", "offside_line"],
  rest_defence: ["position", "cover", "block_lane", "offside_line", "counterpress", "scan"],
  counterpress: ["position", "counterpress", "press", "cover", "block_lane", "press_trap"],
  transition: [
    "position",
    "pass",
    "through_ball",
    "cross",
    "cutback",
    "run",
    "diagonal_run",
    "counterpress",
  ],
};

export function toolsForScenario(topic: SimTopic, group: IQPositionGroup): IQPlannerTool[] {
  if (group === "goalkeeper") return [];
  return [...TOPIC_TOOLS[topic]];
}

/** Moment decyzji z realnego zatrzymania (t = 0..1). */
export function freezeTiming(t: number, observationMs: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return { t: clamped, timingMs: Math.round(clamped * observationMs) };
}

/**
 * Punkt użytkownika: a) ostatni ruch „self” z planu, b) dotknięcie boiska przez GK,
 * c) realna pozycja „self” w klatce zatrzymania.
 */
export function userDecisionPoint(input: {
  plan: IQPlanAction[];
  selfId: string | undefined;
  goalkeeperPoint: IQPlannerPoint | null;
  freezeSelf: IQPlannerPoint;
}): IQPlannerPoint {
  const { plan, selfId, goalkeeperPoint, freezeSelf } = input;
  if (selfId) {
    const lastSelfMove = [...plan]
      .reverse()
      .find((action) => action.actorId === selfId && toolMovesActor(action.tool));
    if (lastSelfMove) return { ...lastSelfMove.to };
  }
  if (goalkeeperPoint) return { ...goalkeeperPoint };
  return { ...freezeSelf };
}

/** Wybór do silnika: dokładne actionId, bez kąta ciała i nogi, jeśli ich nie wybrano. */
export function buildChoice(input: {
  timingMs: number;
  point: IQPlannerPoint;
  actionId: string;
}): SimChoice {
  return {
    timingMs: input.timingMs,
    x: input.point.x,
    y: input.point.y,
    actionId: input.actionId,
  };
}

export function canPlayDecision(input: {
  group: IQPositionGroup;
  selectedActionId: string | null;
  goalkeeperPoint: IQPlannerPoint | null;
  timingMs: number | null;
}) {
  if (!input.selectedActionId || input.timingMs == null) return false;
  if (input.group === "goalkeeper") return Boolean(input.goalkeeperPoint);
  return true;
}

function firstSentence(text: string | undefined) {
  if (!text) return "";
  const trimmed = text.trim();
  const match = trimmed.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

export type DecisionLesson = {
  key: "signal" | "decision" | "effect" | "field";
  label: string;
  text: string;
};

/** Cztery krótkie wnioski wyłącznie z danych sceny i wyniku. */
export function decisionLessons(
  scenario: SimScenario,
  result: SimResult,
  choice: SimChoice,
): DecisionLesson[] {
  const window = scenario.timingWindows.find(
    (w) => choice.timingMs != null && choice.timingMs >= w.fromMs && choice.timingMs <= w.toMs,
  );
  const zone = findZone(scenario, choice.x, choice.y);
  const actionLabel = result.action?.label ?? "Brak akcji";
  return [
    {
      key: "signal",
      label: "Sygnał",
      text: firstSentence(window?.note ?? scenario.timingMissNote),
    },
    {
      key: "decision",
      label: "Twoja decyzja",
      text: `${actionLabel}: ${firstSentence(zone?.note ?? scenario.zoneMissNote)}`,
    },
    { key: "effect", label: "Skutek", text: firstSentence(result.outcome.consequence) },
    {
      key: "field",
      label: "Na boisko",
      text: firstSentence(result.alternative?.changed ?? result.reaction.description),
    },
  ];
}

export type ReplayVariant = "user" | "alt";

export type ReplayView = {
  variant: ReplayVariant;
  label: string;
  outcome: SimActionOutcome;
  path?: { x: number; y: number }[];
  changed?: string;
};

/** Widok replayu dla przełącznika „Twój wybór” / „Lepsza odpowiedź”. */
export function replayView(result: SimResult, variant: ReplayVariant): ReplayView {
  if (variant === "alt" && result.alternative) {
    return {
      variant: "alt",
      label: result.alternative.action.label,
      outcome: result.alternative.outcome,
      path: result.alternative.outcome.path,
      changed: result.alternative.changed,
    };
  }
  return {
    variant: "user",
    label: result.action?.label ?? "Brak akcji",
    outcome: result.outcome,
    path: result.outcome.path,
  };
}

/** Punkt na łamanej przy postępie 0..1 (do animacji piłki w replayu). */
export function pointAlongPath(points: { x: number; y: number }[], progress: number) {
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  const p = Math.min(1, Math.max(0, progress));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(d);
    total += d;
  }
  let target = p * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] ? Math.min(1, target / lengths[i]) : 1;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * k,
        y: points[i].y + (points[i + 1].y - points[i].y) * k,
      };
    }
    target -= lengths[i];
  }
  return points[points.length - 1];
}
