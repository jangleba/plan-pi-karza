import type {
  ActivityTag,
  FeedbackAdjustmentMark,
  Profile,
  Readiness,
  SessionCompletion,
  SessionDay,
} from "../types";
import { trainingProfileRevision } from "../planIdentity";
import { effectiveActivityTags, hasRunningWork, isValidMatchMinutes } from "../sessionFeedback";
import { dayDistance, ENGINE_VERSION, plusDays, trainingTier } from "./model";
import type { EngineOptions, EngineResult, EngineSession } from "./model";
import { mainGoalTasks, resolveGoalPolicy, type WeeklyTaskId } from "./goalPolicy";
import {
  lighterRecipes,
  placeRecipeOnDate,
  removeOwnSession,
  validateTrainingPlan,
} from "./planner";

/**
 * Versioned product policy, observed in use. The thresholds are decisions of the product,
 * not physiological facts: RPE 8 does not diagnose fatigue, 48 h is not a required recovery
 * time, and RPE 5 only qualifies a proposal, it does not prove an equivalent stimulus.
 */
export interface FeedbackPolicy {
  version: string;
  /** Club/match RPE at or above this may open a proposal for the next sessions. */
  hardRpe: number;
  windowHours: number;
  /** Days from today that a proposal may touch. */
  horizonDays: number;
  /** Minimum RPE for a reported running club session to qualify a calm-run credit. */
  creditMinRpe: number;
  /** A match opens a proposal when minutes played × RPE reaches this (not "minutes > 0"). */
  matchLoadAu: number;
  /** ...and RPE is at least this, so a long easy match is not read as a hard one. */
  matchMinRpe: number;
}
export const DEFAULT_FEEDBACK_POLICY: FeedbackPolicy = {
  version: "feedback-policy-1",
  hardRpe: 8,
  windowHours: 48,
  horizonDays: 7,
  creditMinRpe: 5,
  matchLoadAu: 240,
  matchMinRpe: 5,
};

export type AdjustmentKind = FeedbackAdjustmentMark["kind"];
export interface AdjustmentChange {
  kind: AdjustmentKind;
  /** Session that is replaced or removed (its identity is retired in the saved plan). */
  sessionId: string;
  title: string;
  before: { date: string; minutes: number };
  after: { date: string; minutes: number } | null;
  line: string;
}
export interface AdjustmentProposal {
  /** Same feedback → same id; changed feedback → a different id (old proposal is void). */
  id: string;
  policyVersion: string;
  sourceSessionId: string;
  sourceDate: string;
  sourceKind: "club" | "match" | "voluntary";
  feedback: {
    rpe: number;
    tags: ActivityTag[];
    matchMinutesPlayed: number | null;
    feedbackVersion: number | null;
  };
  planId: string | null;
  /** One short sentence for the card. */
  reason: string;
  changes: AdjustmentChange[];
  affectedSessionIds: string[];
  /** Plan from today on, ready for the explicit, version-checked write. */
  candidatePlan: SessionDay[];
  minutesPerSession: number;
  /** Changes if the plan, the feedback or the affected sessions change. */
  fingerprint: string;
}
export interface AdjustmentInput {
  profile: Profile;
  /** Effective plan (saved plan with modifications resolved). */
  plan: SessionDay[];
  completions: Record<string, SessionCompletion>;
  todayIso: string;
  planId: string | null;
  readiness?: Record<string, Readiness>;
  minutesPerSession?: number;
  policy?: FeedbackPolicy;
  /** True when plan modifications touch the horizon; their overlay is not rewritten here. */
  hasModificationsInWindow?: boolean;
}

const slotsOf = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
/** Stable short fingerprint of what a proposal would change (plan, ids, dates). */
export const proposalFingerprint = (parts: unknown) => hash(JSON.stringify(parts));
const hash = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
};
const executed = (s: SessionDay, c: Record<string, SessionCompletion>) => {
  const x = s.dbId ? c[s.dbId] : undefined;
  return (
    !!x?.completed || x?.status === "started" || x?.status === "completed" || x?.status === "missed"
  );
};

/** Everything that identifies the feedback; storing the same value again keeps the same id. */
export function feedbackSignature(c: SessionCompletion): string {
  return [
    c.rpe,
    effectiveActivityTags(c).join("+"),
    c.matchMinutesPlayed ?? "",
    c.feedbackVersion ?? 0,
  ].join(":");
}
export const proposalIdFor = (sourceSessionId: string, c: SessionCompletion) =>
  `fb1:${sourceSessionId}:${feedbackSignature(c)}`;

/** IDs of proposals already applied, read from the saved plan itself (works across devices). */
export function appliedProposalIds(plan: readonly SessionDay[]): Set<string> {
  const ids = new Set<string>();
  for (const d of plan)
    for (const s of slotsOf(d)) for (const m of s.feedbackAdjustments ?? []) ids.add(m.proposalId);
  return ids;
}

const demanding = (s: SessionDay) => {
  const r = s.engineV2;
  if (!r) return false;
  if (r.roles.includes("strengthA") || r.roles.includes("strengthB") || r.roles.includes("speed"))
    return true;
  // Support blocks are never touched; a calm run is not made lighter than it already is.
  return (
    r.roles.includes("endurance") &&
    (s.runningRecipe ?? r.runningRecipe)?.method !== "easy_continuous"
  );
};
const taskIdOf = (r: EngineSession): WeeklyTaskId | null =>
  r.roles.includes("strengthA")
    ? "strengthA"
    : r.roles.includes("strengthB")
      ? "strengthB"
      : r.roles.includes("speed")
        ? "speed"
        : r.roles.includes("endurance")
          ? "endurance"
          : null;
const sessionLabel = (s: SessionDay) => s.title || "Trening";

interface FeedbackEvent {
  session: SessionDay;
  completion: SessionCompletion;
  kind: "club" | "match";
}
function collectEvents(
  plan: readonly SessionDay[],
  completions: Record<string, SessionCompletion>,
): FeedbackEvent[] {
  const events: FeedbackEvent[] = [];
  for (const d of plan)
    for (const s of slotsOf(d)) {
      const kind = s.dayType === "club" ? "club" : s.dayType === "match" ? "match" : null;
      const completion = s.dbId ? completions[s.dbId] : undefined;
      // Only saved, completed execution counts. A future club or a start is not a load.
      if (!kind || !s.dbId || !completion?.completed || completion.status === "missed") continue;
      if (typeof completion.rpe !== "number") continue;
      events.push({ session: s, completion, kind });
    }
  return events.sort((a, b) =>
    (b.completion.endedAt ?? b.session.date).localeCompare(a.completion.endedAt ?? a.session.date),
  );
}

/**
 * Pure proposal builder. It never writes. It reads only saved execution, rebuilds doses with the
 * generator's own recipes and gates, and returns null when no validated alternative exists.
 */
export function proposeFeedbackAdjustment(input: AdjustmentInput): AdjustmentProposal | null {
  const policy = input.policy ?? DEFAULT_FEEDBACK_POLICY;
  const { profile: p, todayIso } = input;
  if (input.hasModificationsInWindow) return null;
  const upcoming = input.plan.filter((d) => d.date >= todayIso);
  if (!upcoming.length || upcoming[0].date !== todayIso) return null;
  const revision = trainingProfileRevision(p);
  // A plan the profile has outgrown is rebuilt in a preview, not patched here.
  if (
    upcoming.some(
      (d) =>
        !d.executionProtected &&
        slotsOf(d).some((s) => s.engineV2) &&
        d.canonicalRevision !== revision,
    )
  )
    return null;
  const minutesPerSession =
    input.minutesPerSession ??
    (input.plan[0]?.engineTimeBudgetMin && Number.isFinite(input.plan[0].engineTimeBudgetMin)
      ? input.plan[0].engineTimeBudgetMin
      : 75);
  const options: EngineOptions = {
    startDate: todayIso,
    minutesPerSession,
    readiness: p.healthPersonalizationEnabled ? input.readiness : undefined,
    precedingDays: input.plan.filter((d) => d.date < todayIso),
  };
  const key = (i: { code: string; date?: string; message: string }) =>
    `${i.code}|${i.date ?? ""}|${i.message}`;
  const baseline = new Set(validateTrainingPlan(upcoming, p, options).map(key));
  const sound = (plan: SessionDay[]) =>
    validateTrainingPlan(plan, p, options).every((i) => baseline.has(key(i)));
  const done = appliedProposalIds(input.plan);
  const alignStart = input.plan[0].date;
  const block = (date: string) => Math.floor(dayDistance(date, alignStart) / 7);
  const horizonEnd = plusDays(todayIso, policy.horizonDays - 1);

  for (const event of collectEvents(input.plan, input.completions)) {
    const id = proposalIdFor(event.session.dbId!, event.completion);
    if (done.has(id)) continue;
    const rpe = event.completion.rpe!;
    const tags = effectiveActivityTags(event.completion);
    const minutesPlayed = event.completion.matchMinutesPlayed ?? null;
    // A club uses RPE alone; a match combines the minutes actually played with RPE.
    const hard =
      event.kind === "club"
        ? rpe >= policy.hardRpe
        : isValidMatchMinutes(minutesPlayed) &&
          rpe >= policy.matchMinRpe &&
          minutesPlayed * rpe >= policy.matchLoadAu;
    let work = structuredClone(upcoming);
    const changes: AdjustmentChange[] = [];
    const mark = (date: string, kind: AdjustmentKind) => {
      work = work.map((d) =>
        d.date === date
          ? {
              ...d,
              feedbackAdjustments: [
                ...(d.feedbackAdjustments ?? []),
                {
                  proposalId: id,
                  sourceSessionId: event.session.dbId!,
                  kind,
                  appliedAt: todayIso,
                },
              ],
            }
          : d,
      );
    };

    if (hard) {
      const lastDate = plusDays(event.session.date, Math.ceil(policy.windowHours / 24));
      const adjustSession = (source: SessionDay) => {
        const recipe = source.engineV2!;
        const gone = removeOwnSession(work, source.dbId!, p, options);
        if (!gone) return null;
        const stamp = (placed: SessionDay) => {
          if (placed.engineV2 && recipe.cycle) placed.engineV2.cycle = { ...recipe.cycle };
          placed.blockPhaseLabel = source.blockPhaseLabel;
          placed.blockWeekNumber = source.blockWeekNumber;
        };
        const change = (
          kind: AdjustmentKind,
          after: SessionDay | null,
          line: string,
        ): AdjustmentChange => ({
          kind,
          sessionId: source.dbId!,
          title: sessionLabel(source),
          before: { date: source.date, minutes: source.durationMin },
          after: after ? { date: after.date, minutes: after.durationMin } : null,
          line,
        });
        // 1. the same session on another allowed date of the same plan week, outside the 48 h
        for (const target of work
          .map((d) => d.date)
          .filter(
            (date) =>
              date !== source.date &&
              date > lastDate &&
              date <= horizonEnd &&
              block(date) === block(source.date),
          )) {
          const placed = placeRecipeOnDate(gone, target, recipe, p, options);
          if ("blocked" in placed) continue;
          stamp(placed.session);
          if (!sound(placed.plan)) continue;
          return {
            plan: placed.plan,
            markDate: target,
            change: change(
              "reschedule",
              placed.session,
              `${sessionLabel(source)}: ${source.date} → ${target}`,
            ),
          };
        }
        // 2. an existing lighter or compact variant on the same date
        for (const alt of lighterRecipes(source, p, minutesPerSession)) {
          const placed = placeRecipeOnDate(gone, source.date, alt.recipe, p, options);
          if ("blocked" in placed) continue;
          stamp(placed.session);
          if (!sound(placed.plan)) continue;
          return {
            plan: placed.plan,
            markDate: source.date,
            change: change(
              alt.kind,
              placed.session,
              `${sessionLabel(source)} (${source.date}): ${
                alt.kind === "compact" ? "krótszy wariant" : "lżejszy wariant"
              }, ${source.durationMin} → ${placed.session.durationMin} min`,
            ),
          };
        }
        // 3. only then skip a target that is not the main goal
        const task = taskIdOf(recipe);
        if (task && !mainGoalTasks(p).includes(task) && sound(gone))
          return {
            plan: gone,
            markDate: source.date,
            change: change(
              "skip",
              null,
              `${sessionLabel(source)} (${source.date}): pominięcie tej sesji (nie jest celem głównym)`,
            ),
          };
        return null;
      };
      const affected = work
        .flatMap(slotsOf)
        .filter(
          (s) =>
            s.dbId &&
            demanding(s) &&
            !s.executionProtected &&
            !executed(s, input.completions) &&
            s.date >= event.session.date &&
            s.date >= todayIso &&
            s.date <= lastDate &&
            s.date <= horizonEnd,
        )
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const source of affected) {
        const found = adjustSession(source);
        if (!found) continue;
        work = found.plan;
        changes.push(found.change);
        mark(found.markDate, found.change.kind);
      }
    }

    // A reported club run may stand in for the extra calm run of the same plan week.
    if (event.kind === "club" && rpe >= policy.creditMinRpe && hasRunningWork(event.completion)) {
      const credited = input.plan.some((d) =>
        (d.externalGoalCredits ?? []).some((c) => c.sourceSessionId === event.session.dbId),
      );
      const policyNow = resolveGoalPolicy(p);
      if (!credited && !policyNow.reduced && p.goal !== "return") {
        const weekEndurance = input.plan
          .flatMap(slotsOf)
          .filter(
            (s) =>
              s.engineV2?.roles.includes("endurance") &&
              block(s.date) === block(event.session.date),
          )
          .sort((a, b) => a.date.localeCompare(b.date));
        const target = work
          .flatMap(slotsOf)
          .filter(
            (s) =>
              s.dbId &&
              s.engineV2 &&
              s.engineV2.roles.length === 1 &&
              s.engineV2.roles[0] === "endurance" &&
              (s.runningRecipe ?? s.engineV2.runningRecipe)?.method === "easy_continuous" &&
              !s.engineV2.highLower &&
              !s.executionProtected &&
              !executed(s, input.completions) &&
              !(s.feedbackAdjustments?.length ?? 0) &&
              s.date >= todayIso &&
              s.date <= horizonEnd &&
              block(s.date) === block(event.session.date) &&
              // The main endurance goal keeps its first, main session; only the extra run counts.
              (p.goal !== "endurance" ||
                (weekEndurance.length >= 2 && weekEndurance[0].dbId !== s.dbId)),
          )
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        if (target) {
          const gone = removeOwnSession(work, target.dbId!, p, options);
          if (gone && sound(gone)) {
            work = gone.map((d) =>
              d.date === target.date
                ? {
                    ...d,
                    externalGoalCredits: [
                      ...(d.externalGoalCredits ?? []),
                      {
                        goal: "endurance" as const,
                        status: "external_reported" as const,
                        sourceSessionId: event.session.dbId!,
                        sourceDate: event.session.date,
                        rpe,
                        tags,
                        replacedTitle: sessionLabel(target),
                        proposalId: id,
                      },
                    ],
                  }
                : d,
            );
            mark(target.date, "external_credit");
            changes.push({
              kind: "external_credit",
              sessionId: target.dbId!,
              title: sessionLabel(target),
              before: { date: target.date, minutes: target.durationMin },
              after: null,
              line: `${sessionLabel(target)} (${target.date}): dodatkowy spokojny bieg pominięty. Uwzględniono zgłoszoną pracę wydolnościową w klubie.`,
            });
          }
        }
      }
    }

    if (!changes.length || !sound(work)) continue;
    const first = work[0];
    const old = input.plan.find((d) => d.date === first.date);
    if (old?.enginePlanIssues && !first.enginePlanIssues)
      first.enginePlanIssues = old.enginePlanIssues;
    first.engineTimeBudgetMin = minutesPerSession;
    const lead =
      event.kind === "match"
        ? `Po meczu (${minutesPlayed} min gry, RPE ${rpe}) proponujemy:`
        : hard
          ? `Po ciężkim treningu klubowym (RPE ${rpe}) proponujemy:`
          : `Po treningu klubowym z pracą wydolnościową (RPE ${rpe}) proponujemy:`;
    const fingerprint = hash(
      JSON.stringify([
        id,
        input.planId,
        policy.version,
        changes.map((c) => [c.kind, c.sessionId, c.after?.date ?? null]),
      ]),
    );
    return {
      id,
      policyVersion: policy.version,
      sourceSessionId: event.session.dbId!,
      sourceDate: event.session.date,
      sourceKind: event.kind,
      feedback: {
        rpe,
        tags,
        matchMinutesPlayed: minutesPlayed,
        feedbackVersion: event.completion.feedbackVersion ?? null,
      },
      planId: input.planId,
      reason: lead,
      changes,
      affectedSessionIds: changes.map((c) => c.sessionId),
      candidatePlan: work,
      minutesPerSession,
      fingerprint,
    };
  }
  return null;
}

/** The explicit write goes through the same version-checked activation as any new plan. */
export function proposalToEngineResult(
  proposal: Pick<AdjustmentProposal, "planId" | "minutesPerSession" | "candidatePlan">,
  profile: Profile,
): EngineResult {
  return {
    version: ENGINE_VERSION,
    expectedPlanId: proposal.planId,
    minutesPerSession: proposal.minutesPerSession,
    plan: proposal.candidatePlan,
    issues: proposal.candidatePlan[0]?.enginePlanIssues ?? [],
    tier: trainingTier(profile),
  };
}
