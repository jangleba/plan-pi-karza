import type { SessionCompletion, SessionDay } from "../types";
import { ENGINE_VERSION } from "./model";

const executed = (
  session: SessionDay | null | undefined,
  completions: Record<string, SessionCompletion>,
) => {
  const completion = session?.dbId ? completions[session.dbId] : undefined;
  return !!completion?.completed || ["started", "completed"].includes(completion?.status ?? "");
};

/** Keep an executed second slot in slot two. Retire only the unstarted own primary identity. */
function cancelledPrimary(day: SessionDay, second: SessionDay): SessionDay {
  return {
    date: day.date,
    dayName: day.dayName,
    dayType: "rest",
    type: "rest",
    title: "Nierozpoczęta sesja odwołana",
    sessionType: "Odpoczynek",
    goalLabel: "",
    goalOfSession: "",
    durationMin: 0,
    intensity: "niska",
    reason:
      "Aktualizacja planu odwołała nierozpoczętą sesję własną. Wykonanie drugiej sesji zachowano.",
    whyToday: "Zachowano rozpoczętą drugą sesję bez zmiany jej miejsca i dawki.",
    riskManaged: "",
    avoidToday: "",
    safetyNote: null,
    mdLabel: day.mdLabel,
    slotLabel: "Sesja 1",
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: second,
    dayDbId: day.dayDbId,
    planDbId: day.planDbId,
    cycleId: day.cycleId,
    generatorVersion: ENGINE_VERSION,
    canonicalRevision: day.canonicalRevision,
    trainingSetupRevision: day.trainingSetupRevision,
    isOwnSession: false,
    externalCommitment: false,
    isClubSession: false,
    // The planner stamps this pending shell, then protects the whole physical day from new work.
    executionProtected: false,
  };
}

/** Reserve the physical day, preserving executed identities and cancelling pending own work on rebuild. */
export function lockedExecutionDays(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
): SessionDay[] {
  return plan.flatMap((day) => {
    const primaryExecuted = executed(day, completions);
    const secondaryExecuted = executed(day.secondSession, completions);
    if (primaryExecuted)
      return [
        {
          ...day,
          executionProtected: true,
          secondSession: secondaryExecuted
            ? { ...day.secondSession!, executionProtected: true }
            : null,
        },
      ];
    if (secondaryExecuted) {
      const second = { ...day.secondSession!, executionProtected: true };
      const external = day.externalCommitment || day.dayType === "club" || day.dayType === "match";
      return [
        external
          ? { ...day, executionProtected: false, secondSession: second }
          : cancelledPrimary(day, second),
      ];
    }
    // A legacy protection flag without its execution log is ambiguous: do not discard either slot.
    return day.executionProtected || day.secondSession?.executionProtected
      ? [{ ...day, executionProtected: true }]
      : [];
  });
}
