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

/** Inspect the first visible reaction, not the final score or a hidden answer key. */
export function observedReaction(
  s: JourneySession,
  decisionIndex: number,
  rivalId: string,
): TacticalForecast["actual"] {
  const decision = s.decisions[decisionIndex];
  if (!decision) throw new Error("Brak decyzji do analizy.");
  const actor = decision.actorId ?? "you";
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
  if (!rival || s.rulesVersion !== 7 || !s.decisions.length) return s;
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
  return { matches: f.actual === "mixed" ? null : f.actual === f.predicted, reaction, plan };
}
