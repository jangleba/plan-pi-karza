import type { JourneyAttempt, JourneyDefinition, JourneyMode } from "./journeyTypes";
import { createJourney } from "./journeyEngine";

const setupCache = new WeakMap<JourneyDefinition, string>();
function setup(definition: JourneyDefinition) {
  let value = setupCache.get(definition);
  if (!value) {
    value = JSON.stringify([
      definition.role,
      definition.pattern,
      definition.steps,
      createJourney(definition).initial,
    ]);
    setupCache.set(definition, value);
  }
  return value;
}

export function practiceToday(
  history: readonly JourneyAttempt[],
  mode: JourneyMode,
  now = new Date(),
) {
  return history.filter(
    (a) => a.mode === mode && new Date(a.createdAt).toDateString() === now.toDateString(),
  ).length;
}
export function nextPractice(
  pool: readonly JourneyDefinition[],
  history: readonly JourneyAttempt[],
  mode: JourneyMode,
  current: JourneyDefinition,
  now = new Date(),
) {
  if (!pool.length) return current;
  const byId = new Map(pool.map((definition) => [definition.id, definition]));
  const attempts = history.filter((a) => a.mode === mode && byId.has(a.scenarioId));
  const seen = new Set(attempts.map((a) => a.scenarioId));
  const seenSetups = new Set([
    setup(current),
    ...attempts.map((a) => setup(byId.get(a.scenarioId)!)),
  ]);
  const topics = new Set(attempts.map((a) => byId.get(a.scenarioId)!.topicId));
  // The third action can revisit a difficult topic in another context. It does
  // not repeat the just-played situation or borrow results from the other mode.
  if (practiceToday(history, mode, now) % 3 === 2) {
    const checkedTopics = new Set<string>();
    for (const a of [...attempts].reverse()) {
      const original = byId.get(a.scenarioId)!;
      if (checkedTopics.has(original.topicId)) continue;
      checkedTopics.add(original.topicId);
      if (a.verdict !== "risky") continue;
      const repeat =
        original && original.topicId !== current.topicId
          ? pool.find((d) => d.topicId === original.topicId && !seen.has(d.id))
          : undefined;
      if (repeat) return repeat;
    }
  }
  const count = (test: (d: JourneyDefinition) => boolean) =>
    attempts.filter((a) => test(byId.get(a.scenarioId)!)).length;
  const lastSeen = (d: JourneyDefinition) => attempts.map((a) => a.scenarioId).lastIndexOf(d.id);
  const candidates = pool.filter((d) => d.id !== current.id);
  // Visit new topics before consuming all three contexts of the first topic.
  // Role/pattern balance prevents the old array-order bias toward one role.
  const rank = (d: JourneyDefinition) => [
    Number(seen.has(d.id)),
    Number(seenSetups.has(setup(d))),
    Number(topics.has(d.topicId)),
    Number(d.topicId === current.topicId),
    Number(d.pattern === current.pattern),
    count((other) => other.role === d.role),
    count((other) => other.pattern === d.pattern),
    count((other) => other.id === d.id),
    lastSeen(d),
    Number(d.revision !== 2),
    d.context,
  ];
  const ranks = new Map(candidates.map((d) => [d.id, rank(d)]));
  candidates.sort((a, b) => {
    const left = ranks.get(a.id)!,
      right = ranks.get(b.id)!;
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
    return 0;
  });
  return candidates[0] ?? pool[0];
}
