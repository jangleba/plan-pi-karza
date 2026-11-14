import type { Profile, SessionCompletion, SessionDay } from "../types";
import {
  dayDistance,
  plusDays,
  trainingTier,
  type CycleContext,
  type EngineOptions,
  type EngineSession,
} from "./model";

const validDate = (date: unknown): date is string =>
  typeof date === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
  plusDays(date, 0) === date;

/** Saved plan metadata owns the anchor; recalculation never starts a new block implicitly. */
export function cycleAnchor(options: EngineOptions): string {
  if (options.cycleAnchorDate !== undefined) {
    if (!validDate(options.cycleAnchorDate) || options.cycleAnchorDate > options.startDate)
      throw new Error("Nieprawidłowa data początku cyklu.");
    return options.cycleAnchorDate;
  }
  const previous = [
    ...(options.previousPlan ?? []),
    ...(options.precedingDays ?? []),
    ...(options.lockedDays ?? []),
  ];
  const saved = previous
    .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
    .map((d) => d.engineV2?.cycle?.anchorDate)
    .filter(validDate)
    .filter((date) => date <= options.startDate)
    .sort();
  // One-time V2.4 migration: retain the original plan start as the conservative anchor.
  return (
    saved[0] ??
    previous
      .filter(
        (d) =>
          (d.engineV2 || d.generatorVersion?.startsWith("ballwise-v2")) &&
          validDate(d.date) &&
          d.date <= options.startDate,
      )
      .map((d) => d.date)
      .sort()[0] ??
    options.startDate
  );
}

/** Weeks of lighter start per recommendation; other kinds never add load by themselves. */
const LIGHT_START_WEEKS: Partial<Record<string, number>> = { deload: 1, health: 2, transition: 1 };
const START_REASON: Record<string, string> = {
  deload:
    "Podsumowanie poprzedniego cyklu zaleciło lżejszy start: mniej serii przez pierwszy tydzień, potem zwykła dawka.",
  health:
    "Podsumowanie poprzedniego cyklu zaleciło ostrożny start: lżejsze dawki przez dwa pierwsze tygodnie.",
  transition:
    "Okres po sezonie lub powrocie: lżejszy pierwszy tydzień, bez zakładania utraty formy.",
};

/** The recommendation in force: passed explicitly, else the record stamped on the saved plan. */
export function startRecommendation(options: EngineOptions) {
  // A new plan applies it from its own first day; a rebuild of a saved plan keeps the date that
  // plan started, so rebuilding mid-cycle never lights the "lighter start" up again.
  if (options.cycleStart?.review)
    return { kind: options.cycleStart.kind, appliesFrom: options.startDate };
  const stamped = [
    ...(options.previousPlan ?? []),
    ...(options.precedingDays ?? []),
    ...(options.lockedDays ?? []),
  ]
    .filter((d) => d.cycleStart?.review && validDate(d.date))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return stamped ? { kind: stamped.cycleStart!.kind, appliesFrom: stamped.date } : null;
}

function strengthCompletions(options: EngineOptions): SessionCompletion[] {
  const seen = new Set<string>();
  return Object.values(options.completions ?? {})
    .filter((c) => {
      const s = c.executionSnapshot;
      return (
        c.completed &&
        c.status !== "started" &&
        c.status !== "missed" &&
        !!s?.engineV2?.roles.some((r) => r.startsWith("strength")) &&
        validDate(s.date) &&
        s.date < options.startDate
      );
    })
    .filter((c) => {
      const s = c.executionSnapshot!;
      const key = s.dbId ?? `${s.date}:${s.engineV2!.roles.join(",")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.executionSnapshot!.date.localeCompare(a.executionSnapshot!.date));
}

/** These thresholds are conservative product guardrails, not a validated fatigue diagnosis. */
export function cycleForWeek(
  p: Profile,
  options: EngineOptions,
  date: string,
): {
  cycle: CycleContext;
  phase: EngineSession["phase"];
} {
  const anchorDate = cycleAnchor(options);
  const weekIndex = Math.max(0, Math.floor(dayDistance(date, anchorDate) / 7));
  const currentWeek = dayDistance(date, options.startDate) < 7;
  const history = strengthCompletions(options);
  const latest = history[0]?.executionSnapshot;
  const gap = latest ? dayDistance(options.startDate, latest.date) : 0;
  const recent = history.slice(0, 2);
  const repeatedHard =
    recent.length === 2 &&
    recent.every(
      (c) =>
        typeof c.rpe === "number" &&
        c.rpe >= 9 &&
        c.rpe <= 10 &&
        dayDistance(options.startDate, c.executionSnapshot!.date) <= 7 &&
        c.executionSnapshot!.engineV2?.phase !== "deload",
    );
  const declaredLighter =
    p.secondaryLimiter === "fatigue" || p.seasonPhase === "transition" || p.goal === "return";
  let state: CycleContext["state"] = weekIndex % 4 === 3 ? "review" : "build";
  let reason =
    state === "review"
      ? "Przegląd po trzech tygodniach. Sam numer tygodnia nie wymusza deloadu ani zwiększenia dawki."
      : "Kontynuacja cyklu; obciążenie dobierane do wykonania, bez automatycznego dodawania serii.";
  const recommended = startRecommendation(options);
  const lightWeeks = recommended ? (LIGHT_START_WEEKS[recommended.kind] ?? 0) : 0;
  const weekOfStart = recommended ? Math.floor(dayDistance(date, recommended.appliesFrom) / 7) : -1;
  if (recommended && weekOfStart >= 0 && weekOfStart < lightWeeks && !declaredLighter) {
    state = "deload";
    reason = START_REASON[recommended.kind];
  } else if (declaredLighter || (currentWeek && repeatedHard)) {
    state = "deload";
    reason = declaredLighter
      ? "Lżejszy wariant wynika z zadeklarowanego zmęczenia, okresu przejściowego lub powrotu do treningów."
      : "Dwa ostatnie ukończone treningi siłowe miały RPE 9–10 w ciągu 7 dni. Ostrożny lżejszy tydzień; to nie diagnoza przemęczenia.";
  } else if (currentWeek && gap >= 14) {
    state = "reentry";
    reason =
      "Co najmniej 14 dni od ostatniej potwierdzonej siłowni w aplikacji. Mniej serii, bez zakładania utraty siły ani odrabiania zaległości.";
  }
  const phase: EngineSession["phase"] =
    state === "deload" || state === "reentry"
      ? "deload"
      : weekIndex === 0 && trainingTier(p) === "foundation"
        ? "adaptation"
        : "development";
  return { cycle: { anchorDate, weekIndex, state, reason }, phase };
}

export function attachCycle(days: SessionDay[], cycle: CycleContext): void {
  for (const d of days)
    for (const s of [d, ...(d.secondSession ? [d.secondSession] : [])]) {
      if (!d.executionProtected && !s.executionProtected && s.engineV2) {
        s.engineV2.cycle = { ...cycle };
        s.blockPhaseLabel =
          cycle.state === "deload"
            ? "Lżejszy tydzień"
            : cycle.state === "reentry"
              ? "Powrót do regularności"
              : cycle.state === "review"
                ? "Przegląd obciążenia"
                : "Rozwój";
      }
    }
}
