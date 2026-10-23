import { activeSessionForRoute, activeSessionGraceDeadline } from "./activeSession";
import type { SessionCompletion, SessionDay } from "./types";

type SessionTarget = { session: SessionDay; slot: 1 | 2 };

export type StartSessionSummary =
  | (SessionTarget & { kind: "active"; expiresAt: number })
  | (SessionTarget & { kind: "ready" | "blocked" })
  | { kind: "rest" | "unavailable" | "completed" | "review" | "missing" };

function completed(value: SessionCompletion | undefined): boolean {
  return Boolean(value?.completed || value?.status === "completed");
}

/** Read-only navigation to a real slot; opening the card never starts a workout. */
export function buildStartSessionSummary(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
  todayIso: string,
  nowMs = Date.now(),
): StartSessionSummary {
  const today = plan.find((day) => day.date === todayIso);
  // A current safety stop takes priority over resuming any unfinished work.
  if (today?.loadLabelOverride === "Wstrzymaj trening")
    return { kind: "blocked", session: today, slot: 1 };

  const routes: { date: string; slot: 1 | 2 }[] = plan.flatMap((day) => [
    { date: day.date, slot: 1 as const },
    ...(day.secondSession ? [{ date: day.date, slot: 2 as const }] : []),
  ]);
  // The session route can recover a pinned slot after its whole day left the plan.
  // Do not link an orphaned snapshot over a different session now occupying that date.
  for (const completion of Object.values(completions)) {
    const snapshot = completion.executionSnapshot;
    if (
      snapshot &&
      (snapshot.executionSlot === 1 || snapshot.executionSlot === 2) &&
      !plan.some((day) => day.date === snapshot.date) &&
      !routes.some((route) => route.date === snapshot.date && route.slot === snapshot.executionSlot)
    )
      routes.push({ date: snapshot.date, slot: snapshot.executionSlot });
  }

  const active = routes
    .map(({ date, slot }) => {
      const session = activeSessionForRoute(plan, completions, date, slot, todayIso, nowMs);
      const completion = session?.dbId ? completions[session.dbId] : undefined;
      const parent = plan.find((day) => day.date === date);
      const currentSlot = slot === 2 ? parent?.secondSession : parent;
      if (
        !session ||
        !session.dbId ||
        completed(completion) ||
        session.dayType === "rest" ||
        session.isUnavailable ||
        (parent && currentSlot?.dbId !== session.dbId) ||
        parent?.isUnavailable ||
        session.loadLabelOverride === "Wstrzymaj trening" ||
        parent?.loadLabelOverride === "Wstrzymaj trening"
      )
        return null;
      const expiresAt = activeSessionGraceDeadline(date, completion, todayIso, nowMs);
      return expiresAt === null ? null : { kind: "active" as const, session, slot, expiresAt };
    })
    .filter((target): target is Extract<StartSessionSummary, { kind: "active" }> => target !== null)
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];
  if (active) return active;
  if (!today) return { kind: "missing" };
  if (today.isUnavailable) return { kind: "unavailable" };

  const slots: SessionTarget[] = [
    { session: today, slot: 1 },
    ...(today.secondSession ? [{ session: today.secondSession, slot: 2 as const }] : []),
  ];
  const training = slots.filter(
    ({ session }) => session.dayType !== "rest" && !session.isUnavailable,
  );
  for (const target of training) {
    const completion = target.session.dbId ? completions[target.session.dbId] : undefined;
    if (completed(completion) || completion?.status === "missed") continue;
    return {
      ...target,
      kind: target.session.loadLabelOverride === "Wstrzymaj trening" ? "blocked" : "ready",
    };
  }
  if (training.length)
    return {
      kind: training.every(({ session }) =>
        completed(session.dbId ? completions[session.dbId] : undefined),
      )
        ? "completed"
        : "review",
    };
  return { kind: "rest" };
}
