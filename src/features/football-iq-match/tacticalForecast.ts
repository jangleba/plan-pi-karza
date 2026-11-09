import type { JourneySession, TacticalForecast } from "./journeyTypes";
import { actorId, distance, teamOf } from "./tacticalWorld";

export const reactionLabels = {
  ball: "Przesunie się do piłki",
  follow: "Podąży za moim ruchem",
  cover: "Utrzyma lub skoryguje pozycję",
} as const;
export const planLabels = {
  support: "Otworzę kolejny kąt wsparcia",
  protect: "Sprawdzę osłonę po ewentualnej stracie",
  scan: "Sprawdzę ponownie grę do przodu",
} as const;
export const actualReactionLabels = {
  ...reactionLabels,
  mixed: "Zareagował jednocześnie na piłkę i Twój ruch — brak jednoznacznego rozstrzygnięcia",
} as const;

export function forecastRival(s: JourneySession) {
  const id = actorId(s),
    team = teamOf(s, id),
    at = s.world.positions[id];
  return s.players
    .filter((p) => p.team !== team && !p.goalkeeper && p.id !== s.world.carrierId)
    .sort(
      (a, b) =>
        distance(at, s.world.positions[a.id]) - distance(at, s.world.positions[b.id]) ||
        a.id.localeCompare(b.id),
    )[0];
}

/** Window (s) after the decision in which the rival's first reaction is read (rules v9). */
export const REACTION_WINDOW = 2;
const REACTION_MIN = 1.5;

/** Rules v9: read the reaction from the live samples in the first seconds after the
 * decision. When TY still has the ball, moving to TY and to the ball is the same move. */
function observedLiveReaction(
  s: JourneySession,
  decisionIndex: number,
  rivalId: string,
  actor: string,
): TacticalForecast["actual"] {
  const decision = s.decisions[decisionIndex];
  const frames = s.beats
    .slice(decision.firstBeat, decision.lastBeat + 1)
    .flatMap((b) => b.live ?? []);
  const first = frames[0];
  if (!first) return "cover";
  const start = first.time;
  const last = frames.filter((f) => f.time - start <= REACTION_WINDOW).at(-1) ?? first;
  const from = first.world.positions[rivalId],
    to = last.world.positions[rivalId];
  if (!from || !to) throw new Error("Brak rywala w zapisie.");
  if (distance(from, to) < REACTION_MIN) return "cover";
  const you = last.world.positions[actor];
  const follow = distance(from, you) - distance(to, you);
  const ball = distance(from, last.ball) - distance(to, last.ball);
  const youHaveBall = !last.inFlight && !last.world.looseBall && last.world.carrierId === actor;
  if (youHaveBall) return Math.max(follow, ball) > REACTION_MIN ? "ball" : "cover";
  if (Math.max(follow, ball) <= REACTION_MIN) return "cover";
  return follow > ball ? "follow" : "ball";
}

/** Inspect the first visible reaction, not the final score or a hidden answer key. */
export function observedReaction(
  s: JourneySession,
  decisionIndex: number,
  rivalId: string,
): TacticalForecast["actual"] {
  const decision = s.decisions[decisionIndex];
  if (!decision) throw new Error("Brak decyzji do analizy.");
  const actor = decision.actorId ?? "you";
  if (s.rulesVersion === 9) return observedLiveReaction(s, decisionIndex, rivalId, actor);
  for (const beat of s.beats.slice(decision.firstBeat, decision.lastBeat + 1)) {
    const from = beat.before.positions[rivalId],
      to = beat.after.positions[rivalId];
    if (!from || !to) throw new Error("Brak rywala w zapisie.");
    if (distance(from, to) < 1) continue;
    const toActor = beat.after.positions[actor];
    const toBall = beat.after.positions[beat.after.carrierId];
    const follow = distance(from, toActor) - distance(to, toActor);
    const ball = distance(from, toBall) - distance(to, toBall);
    if (follow > 1 && ball > 1 && Math.abs(follow - ball) < 0.8) return "mixed";
    if (follow > 1 && follow > ball + 0.8) return "follow";
    if (ball > 1) return "ball";
    return "cover";
  }
  return "cover";
}
export function addForecast(
  s: JourneySession,
  before: JourneySession,
  input: Pick<TacticalForecast, "predicted" | "plan">,
): JourneySession {
  const rival = forecastRival(before);
  if (!rival || (s.rulesVersion !== 7 && s.rulesVersion !== 9) || !s.decisions.length) return s;
  const decisionIndex = s.decisions.length - 1;
  const record: TacticalForecast = {
    ...input,
    decisionIndex,
    rivalId: rival.id,
    actual: observedReaction(s, decisionIndex, rival.id),
  };
  return { ...s, forecasts: [...(s.forecasts ?? []), record] };
}
export function observationCue(s: JourneySession) {
  const rival = forecastRival(s),
    id = actorId(s);
  if (!rival) return "Sprawdź piłkę, wolną przestrzeń i osłonę za akcją.";
  const ballOwn = teamOf(s, s.world.carrierId) === teamOf(s, id);
  return ballOwn
    ? `Znajdź rywala nr ${rival.number}. Sprawdź jego odstęp od piłki i od Ciebie. Którą linię może zamknąć po Twoim ruchu?`
    : `Znajdź rywala nr ${rival.number} bez piłki. Sprawdź drogę podania do niego i partnera za swoimi plecami. Co odsłonisz, gdy wyjdziesz do piłki?`;
}
export function forecastReflection(f: TacticalForecast) {
  const plan =
    f.plan === "support"
      ? "Sprawdź, czy po reakcji rywala nadal możesz otworzyć inny kąt; nie biegnij automatycznie do piłki."
      : f.plan === "protect"
        ? "Porównaj pozycję piłki z osłoną środka. Jeśli rywal zmienił stronę, skoryguj zabezpieczenie."
        : "Ponownie oceń przestrzeń i dalszego odbiorcę. Pierwsza otwarta linia mogła już zniknąć.";
  const past = {
    ball: "przesunął się do piłki",
    follow: "podążył za Twoim ruchem",
    cover: "utrzymał lub skorygował pozycję",
  };
  const reaction =
    f.actual === "mixed" ? actualReactionLabels.mixed : `W animacji ${past[f.actual]}.`;
  return {
    matches: f.actual === "mixed" ? null : f.actual === f.predicted,
    reaction,
    plan,
  };
}

/** Rules v9: the question asked before TY's decision, in tactical words. */
export const predictionLabels = {
  ball: "Ruszy do piłki",
  follow: "Pójdzie za mną",
  cover: "Zostanie na pozycji",
} as const;

/** Rules v9: did TY still have the ball when the reaction was read? Then moving to TY
 * and moving to the ball are the same move. */
export function keptBallDuringReaction(s: JourneySession, decisionIndex: number) {
  const decision = s.decisions[decisionIndex];
  const actor = decision?.actorId ?? "you";
  const frames = decision
    ? s.beats.slice(decision.firstBeat, decision.lastBeat + 1).flatMap((b) => b.live ?? [])
    : [];
  if (!frames.length) return false;
  const last = frames.filter((f) => f.time - frames[0].time <= REACTION_WINDOW).at(-1) ?? frames[0];
  return !last.inFlight && !last.world.looseBall && last.world.carrierId === actor;
}

/** Compares the prediction with the reaction read from the animation, with its tactical meaning. */
export function predictionResult(s: JourneySession, f: TacticalForecast) {
  const rival = s.players.find((p) => p.id === f.rivalId);
  const n = rival?.number ?? "?";
  const hit =
    f.actual === "mixed"
      ? null
      : f.predicted === f.actual ||
        (f.actual === "ball" &&
          f.predicted === "follow" &&
          keptBallDuringReaction(s, f.decisionIndex));
  const actual =
    f.actual === "ball"
      ? `Nr ${n} ruszył do piłki. Za nim zostaje wolne miejsce: tam szukaj kolejnego podania.`
      : f.actual === "follow"
        ? `Nr ${n} poszedł za Tobą i zostawił miejsce, z którego wyszedł. Partner może je zająć.`
        : f.actual === "cover"
          ? `Nr ${n} został na pozycji i pilnuje środka. Szukaj miejsca obok niego, nie przed nim.`
          : `Nr ${n} ruszył jednocześnie do piłki i w Twoją stronę.`;
  return {
    hit,
    predicted: predictionLabels[f.predicted],
    actual,
  };
}
