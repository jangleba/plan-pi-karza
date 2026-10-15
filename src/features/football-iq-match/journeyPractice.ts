import type { JourneyAttempt, JourneyDefinition, JourneyMode } from "./journeyTypes";

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
  const attempts = history.filter((a) => a.mode === mode);
  const seen = new Set(attempts.map((a) => a.scenarioId));
  // The third action can revisit a difficult topic in another context. It does
  // not repeat the just-played situation or borrow results from the other mode.
  if (practiceToday(history, mode, now) % 3 === 2) {
    for (const a of [...attempts].reverse()) {
      if (a.verdict !== "risky") continue;
      const original = pool.find((d) => d.id === a.scenarioId);
      const repeat =
        original && original.topicId !== current.topicId
          ? pool.find((d) => d.topicId === original.topicId && !seen.has(d.id))
          : undefined;
      if (repeat) return repeat;
    }
  }
  return (
    pool.find((d) => d.revision === 2 && d.pattern !== current.pattern && !seen.has(d.id)) ??
    pool.find((d) => d.topicId !== current.topicId && !seen.has(d.id)) ??
    pool[(pool.findIndex((d) => d.id === current.id) + 1 + pool.length) % pool.length] ??
    current
  );
}
