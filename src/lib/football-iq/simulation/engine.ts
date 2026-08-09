import type {
  SimAction,
  SimBodyAngle,
  SimChoice,
  SimCriterion,
  SimCriterionScore,
  SimResult,
  SimScenario,
  SimTimingWindow,
  SimZone,
} from "./types";

export function actorAt(
  path: { t: number; x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (t <= path[0].t) return { x: path[0].x, y: path[0].y };
  const last = path[path.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (t <= b.t) {
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return { x: last.x, y: last.y };
}

export function findTimingWindow(
  scenario: SimScenario,
  ms: number | null,
): SimTimingWindow | null {
  if (ms == null) return null;
  return (
    scenario.timingWindows.find((w) => ms >= w.fromMs && ms <= w.toMs) ?? null
  );
}

export function findZone(scenario: SimScenario, x: number, y: number): SimZone | null {
  let best: SimZone | null = null;
  let bestD = Infinity;
  for (const z of scenario.zones) {
    const d = Math.hypot(z.x - x, z.y - y);
    if (d <= z.radius && d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

function angleDelta(a: number, b: number) {
  let d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  d = 180 - d;
  return d;
}

export function findAngle(
  scenario: SimScenario,
  deg: number,
): SimBodyAngle | null {
  let best: SimBodyAngle | null = null;
  let bestD = Infinity;
  for (const a of scenario.bodyAngles) {
    const d = angleDelta(a.centerDeg, deg);
    if (d <= a.toleranceDeg && d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export function reactionFor(scenario: SimScenario, zone: SimZone | null) {
  const id = zone?.reaction ?? scenario.defaultReaction;
  return (
    scenario.reactions.find((r) => r.id === id) ?? scenario.reactions[0]
  );
}

function outcomeOf(scenario: SimScenario, action: SimAction | null, reactionId: string) {
  if (!action) return scenario.fallbackOutcome;
  return action.outcomes[reactionId] ?? scenario.fallbackOutcome;
}

export function evaluate(scenario: SimScenario, choice: SimChoice): SimResult {
  const window = findTimingWindow(scenario, choice.timingMs);
  const zone = findZone(scenario, choice.x, choice.y);
  const angle = findAngle(scenario, choice.angleDeg);
  const foot = scenario.feet.find((f) => f.foot === choice.foot);
  const reaction = reactionFor(scenario, zone);
  const action = scenario.actions.find((a) => a.id === choice.actionId) ?? null;
  const outcome = outcomeOf(scenario, action, reaction.id);

  const bodyQuality =
    ((angle?.quality ?? 0.3) * 2 + (foot?.quality ?? 0.4)) / 3;

  const raw: Record<SimCriterion, { q: number; note: string }> = {
    timing: {
      q: window?.quality ?? 0.25,
      note: window?.note ?? scenario.timingMissNote,
    },
    body: {
      q: bodyQuality,
      note: `${angle?.note ?? scenario.bodyMissNote} ${foot?.note ?? ""}`.trim(),
    },
    progression: {
      q: outcome.progression,
      note: outcome.consequence,
    },
    advantage: {
      q: outcome.advantage * (zone ? 0.6 + 0.4 * zone.quality : 0.5),
      note: zone?.note ?? scenario.zoneMissNote,
    },
    risk: {
      q: outcome.risk,
      note: outcome.consequence,
    },
  };

  const weights = scenario.context.weights;
  const sum = (Object.keys(raw) as SimCriterion[]).reduce(
    (acc, k) => acc + (weights[k] ?? 0),
    0,
  );
  const criteria: SimCriterionScore[] = (Object.keys(raw) as SimCriterion[]).map(
    (k) => ({
      criterion: k,
      score: Math.round(Math.max(0, Math.min(1, raw[k].q)) * 100),
      weight: sum > 0 ? (weights[k] ?? 0) / sum : 0,
      note: raw[k].note,
    }),
  );
  const total = Math.round(
    criteria.reduce((acc, c) => acc + c.score * c.weight, 0),
  );

  const altDef = scenario.alternatives[reaction.id];
  const altAction = altDef
    ? scenario.actions.find((a) => a.id === altDef.actionId) ?? null
    : null;
  const altOutcome = altAction ? outcomeOf(scenario, altAction, reaction.id) : null;
  const altBetter =
    altAction && altOutcome && altAction.id !== action?.id
      ? {
          action: altAction,
          outcome: altOutcome,
          changed: altDef!.changed,
        }
      : null;

  return { reaction, criteria, total, action, outcome, alternative: altBetter };
}

export const CRITERION_LABELS: Record<SimCriterion, string> = {
  timing: "Timing ruchu",
  body: "Ustawienie ciała",
  progression: "Progresja gry",
  advantage: "Stworzona przewaga",
  risk: "Kontrola ryzyka",
};
