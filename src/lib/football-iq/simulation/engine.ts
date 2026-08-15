import type {
  SimAction,
  SimBodyAngle,
  SimChoice,
  SimFeedbackItem,
  SimResult,
  SimScenario,
  SimTimingWindow,
  SimVerdict,
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

/** Kierunek ustawienia z klatek kluczowych (interpolacja najkrótszą drogą). */
export function facingAt(
  path: { t: number; facingAngle?: number }[],
  t: number,
): number | undefined {
  const kf = path.filter((p) => typeof p.facingAngle === "number");
  if (kf.length === 0) return undefined;
  if (kf.length === 1 || t <= kf[0].t) return kf[0].facingAngle;
  const last = kf[kf.length - 1];
  if (t >= last.t) return last.facingAngle;
  for (let i = 1; i < kf.length; i += 1) {
    const a = kf[i - 1];
    const b = kf[i];
    if (t <= b.t) {
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      let d = (((b.facingAngle! - a.facingAngle! + 180) % 360) + 360) % 360 - 180;
      if (d === -180) d = 180;
      return a.facingAngle! + d * k;
    }
  }
  return last.facingAngle;
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

function verdictOf(q: number): SimVerdict {
  if (q >= 0.7) return "good";
  if (q >= 0.45) return "mixed";
  return "poor";
}

export function evaluate(scenario: SimScenario, choice: SimChoice): SimResult {
  const window = findTimingWindow(scenario, choice.timingMs);
  const zone = findZone(scenario, choice.x, choice.y);
  const reaction = reactionFor(scenario, zone);
  const action = scenario.actions.find((a) => a.id === choice.actionId) ?? null;
  const outcome = outcomeOf(scenario, action, reaction.id);

  const timingQ = window?.quality ?? 0.25;
  const spaceQ = zone ? zone.quality : 0.3;
  const consequenceQ =
    (outcome.progression + outcome.advantage + outcome.risk) / 3;

  const feedback: SimFeedbackItem[] = [
    {
      key: "timing",
      label: "Timing",
      verdict: verdictOf(timingQ),
      text: window?.note ?? scenario.timingMissNote,
    },
    {
      key: "space",
      label: "Decyzja przestrzenna",
      verdict: verdictOf(spaceQ),
      text: `${zone?.note ?? scenario.zoneMissNote} ${reaction.description}`.trim(),
    },
    {
      key: "consequence",
      label: "Konsekwencja",
      verdict: verdictOf(consequenceQ),
      text: outcome.consequence,
    },
  ];

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

  return { reaction, feedback, action, outcome, alternative: altBetter };
}

