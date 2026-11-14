import {
  buildCycleReview,
  plannedOwnSessions,
  strengthChanges,
  type CycleReview,
  type StrengthSetEntry,
} from "./cycleReview";
import { estimatedSessionLoad } from "./sessionFeedback";
import type {
  ExternalGoalCredit,
  Profile,
  Readiness,
  SessionCompletion,
  SessionDay,
  SessionHistoryRecord,
} from "./types";

export type SummaryTarget = "strengthA" | "strengthB" | "speed" | "endurance";
export const SUMMARY_TARGETS: readonly SummaryTarget[] = [
  "strengthA",
  "strengthB",
  "speed",
  "endurance",
];
export const TARGET_LABELS: Record<SummaryTarget, string> = {
  strengthA: "Siła A",
  strengthB: "Siła B",
  speed: "Sprint",
  endurance: "Wydolność",
};

export interface TargetSummary {
  target: SummaryTarget;
  label: string;
  /** Own sessions the plan contained for this target. */
  planned: number;
  done: number;
  /** Planned, date passed, not completed: a skipped execution. */
  missed: number;
  /** Covered by reported club work after the athlete's acceptance; not a completed own session. */
  external: number;
  /** The generator could not schedule it (calendar, equipment, time): not a skipped execution. */
  notPlanned: number;
}
export interface PlanSummary {
  startDate: string;
  endDate: string;
  own: { planned: number; done: number; missed: number };
  targets: TargetSummary[];
  club: {
    sessions: number;
    completed: number;
    matches: number;
    matchesCompleted: number;
    matchMinutesPlayed: number;
    /** Σ minutes × RPE over completed club sessions and matches with the needed data. */
    loadAu: number;
    /** True when at least one club load uses the 90-minute default, not a measurement. */
    loadUsesAssumedMinutes: boolean;
    /** Completed but without a number (no RPE, or no match minutes): not counted as zero. */
    withoutLoad: number;
  };
  credits: ExternalGoalCredit[];
  comparable: string[];
  review: CycleReview | null;
}

const slotsOf = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const targetOf = (s: SessionDay): SummaryTarget | null => {
  const r = s.engineV2?.roles;
  if (!r) return null;
  return r.includes("strengthA")
    ? "strengthA"
    : r.includes("strengthB")
      ? "strengthB"
      : r.includes("speed")
        ? "speed"
        : r.includes("endurance")
          ? "endurance"
          : null;
};
const LEGACY_LABELS: Array<[RegExp, SummaryTarget]> = [
  [/siłę A/, "strengthA"],
  [/siłę B/, "strengthB"],
  [/sprint/, "speed"],
  [/wydolność|wydolności/, "endurance"],
];

export interface PlanSummaryInput {
  profile: Profile | null;
  /** Effective plan of the ended window. */
  plan: readonly SessionDay[];
  completions: Record<string, SessionCompletion>;
  history: readonly SessionHistoryRecord[];
  readiness: Record<string, Readiness>;
  todayIso: string;
  /** Comparable sets from the real logs of this window (see strengthSets.ts). */
  strengthSets?: readonly StrengthSetEntry[];
}

/** Pure, read-only summary: opening Progress never regenerates or saves a plan. */
export function buildPlanSummary(input: PlanSummaryInput): PlanSummary | null {
  const { plan, completions, todayIso } = input;
  if (!plan.length) return null;
  const dates = plan.map((d) => d.date).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const targets = new Map<SummaryTarget, TargetSummary>(
    SUMMARY_TARGETS.map((target) => [
      target,
      {
        target,
        label: TARGET_LABELS[target],
        planned: 0,
        done: 0,
        missed: 0,
        external: 0,
        notPlanned: 0,
      },
    ]),
  );
  const own = { planned: 0, done: 0, missed: 0 };
  const club = {
    sessions: 0,
    completed: 0,
    matches: 0,
    matchesCompleted: 0,
    matchMinutesPlayed: 0,
    loadAu: 0,
    loadUsesAssumedMinutes: false,
    withoutLoad: 0,
  };
  const credits: ExternalGoalCredit[] = [];
  for (const day of plan) {
    for (const credit of day.externalGoalCredits ?? []) {
      credits.push(credit);
      targets.get(credit.goal)!.external += 1;
    }
    for (const s of slotsOf(day)) {
      const completion = s.dbId ? completions[s.dbId] : undefined;
      const type = s.dayType === "club" || s.dayType === "match" ? s.dayType : null;
      if (type) {
        if (type === "club") club.sessions += 1;
        else club.matches += 1;
        if (completion?.completed) {
          if (type === "club") club.completed += 1;
          else {
            club.matchesCompleted += 1;
            club.matchMinutesPlayed += completion.matchMinutesPlayed ?? 0;
          }
          const load = estimatedSessionLoad(completion, type);
          if (load.value === null) club.withoutLoad += 1;
          else {
            club.loadAu += load.value;
            club.loadUsesAssumedMinutes ||= load.minutesAssumed;
          }
        }
        continue;
      }
      const target = targetOf(s);
      if (!target) continue;
      const row = targets.get(target)!;
      row.planned += 1;
      own.planned += 1;
      if (completion?.completed) {
        row.done += 1;
        own.done += 1;
      } else if (completion?.status === "missed" || s.date < todayIso) {
        row.missed += 1;
        own.missed += 1;
      }
    }
  }
  // Diagnostics the generator saved with the plan: a stimulus it could not schedule.
  const seen = new Set<string>();
  for (const issue of plan[0].enginePlanIssues ?? []) {
    if (issue.code !== "UNMET_WEEKLY_TARGET" && issue.code !== "UNMET_GOAL_TARGET") continue;
    const target =
      issue.target ?? LEGACY_LABELS.find(([re]) => re.test(issue.message))?.[1] ?? null;
    const key = `${issue.code}:${issue.date ?? ""}:${target}:${issue.message}`;
    if (!target || seen.has(key)) continue;
    seen.add(key);
    targets.get(target)!.notPlanned += 1;
  }
  const consent = input.profile?.healthPersonalizationEnabled === true;
  const review = input.profile
    ? buildCycleReview({
        startDate,
        endDate,
        planned: plannedOwnSessions(plan),
        history: [...input.history],
        readiness: consent ? Object.values(input.readiness) : [],
        strengthSets: [...(input.strengthSets ?? [])],
        tests: { improved: 0, declined: 0, flat: 0 },
        age: input.profile.age,
        phaseNext: input.profile.seasonPhase ?? "inseason",
      })
    : null;
  const comparable: string[] = [];
  const strength = strengthChanges([...(input.strengthSets ?? [])], startDate, endDate);
  const compared = strength.improved + strength.declined + strength.flat;
  if (compared > 0)
    comparable.push(
      `Siła (szacowany 1RM z zapisanych serii, ćwiczenia z co najmniej dwoma dniami): poprawa ${strength.improved}, bez zmiany ${strength.flat}, spadek ${strength.declined} z ${compared}. To nie jest wynik szybkości ani mocy.`,
    );
  else
    comparable.push(
      "Brak porównywalnych pomiarów w tym cyklu. Sama frekwencja nie oznacza poprawy szybkości ani mocy.",
    );
  if (review?.avgRpe != null) comparable.push(`Średnie RPE własnych treningów: ${review.avgRpe}.`);
  return {
    startDate,
    endDate,
    own,
    targets: [...targets.values()],
    club,
    credits,
    comparable,
    review,
  };
}
