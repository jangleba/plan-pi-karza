import type { SessionCompletion, SessionDay } from "../types";
import { plusDays, type EngineOptions } from "./model";
import {
  proposalFingerprint,
  type AdjustmentInput,
  type AdjustmentProposal,
} from "./feedbackAdjustment";
import { masTestIneligibility, buildMasTestSession } from "./masTestRecipe";
import { placeRecipeOnDate, removeOwnSession, validateTrainingPlan } from "./planner";
import { trainingProfileRevision } from "../planIdentity";

const slotsOf = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const executed = (s: SessionDay, c: Record<string, SessionCompletion>) => {
  const x = s.dbId ? c[s.dbId] : undefined;
  return !!x?.completed || ["started", "completed", "missed"].includes(x?.status ?? "");
};

export type MasTestOffer =
  { ok: true; proposal: AdjustmentProposal } | { ok: false; reason: string };

/**
 * "Ustal tempo": the athlete asks for the test. It replaces one unstarted calm run of the next
 * seven days (never adds a third session) and goes through the same gate and validator.
 */
export function proposeMasTest(input: AdjustmentInput): MasTestOffer {
  const { profile: p, todayIso } = input;
  const why = masTestIneligibility(p, todayIso);
  if (why) return { ok: false, reason: why };
  if (input.hasModificationsInWindow)
    return {
      ok: false,
      reason: "Plan ma ręczne modyfikacje w tym tygodniu; zaktualizuj go najpierw.",
    };
  const upcoming = input.plan.filter((d) => d.date >= todayIso);
  if (!upcoming.length || upcoming[0].date !== todayIso)
    return { ok: false, reason: "Plan nie obejmuje dzisiejszego dnia." };
  const revision = trainingProfileRevision(p);
  if (
    upcoming.some(
      (d) =>
        !d.executionProtected &&
        slotsOf(d).some((s) => s.engineV2) &&
        d.canonicalRevision !== revision,
    )
  )
    return { ok: false, reason: "Profil zmienił się; najpierw zaktualizuj plan." };
  const minutesPerSession = input.minutesPerSession ?? input.plan[0]?.engineTimeBudgetMin ?? 75;
  const options: EngineOptions = {
    startDate: todayIso,
    minutesPerSession,
    readiness: p.healthPersonalizationEnabled ? input.readiness : undefined,
    precedingDays: input.plan.filter((d) => d.date < todayIso),
  };
  const horizonEnd = plusDays(todayIso, 6);
  const candidates = upcoming
    .flatMap(slotsOf)
    .filter(
      (s) =>
        s.dbId &&
        s.date <= horizonEnd &&
        s.engineV2?.roles.length === 1 &&
        s.engineV2.roles[0] === "endurance" &&
        (s.runningRecipe ?? s.engineV2.runningRecipe)?.method === "easy_continuous" &&
        !s.engineV2.highLower &&
        !s.executionProtected &&
        !executed(s, input.completions),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!candidates.length)
    return {
      ok: false,
      reason:
        "W najbliższych 7 dniach nie ma nierozpoczętego spokojnego biegu, który test mógłby zastąpić.",
    };
  const key = (i: { code: string; date?: string; message: string }) =>
    `${i.code}|${i.date ?? ""}|${i.message}`;
  const baseline = new Set(validateTrainingPlan(upcoming, p, options).map(key));
  // The first date where the test passes the shared placement gate and the validator wins.
  let found: { target: SessionDay; plan: SessionDay[]; session: SessionDay } | null = null;
  let lastReason = "Test nie mieści się w żadnym z terminów spokojnego biegu.";
  for (const target of candidates) {
    const gone = removeOwnSession(structuredClone(upcoming), target.dbId!, p, options);
    if (!gone) continue;
    const recipe = buildMasTestSession(p, target.date);
    recipe.cycle = target.engineV2!.cycle ? { ...target.engineV2!.cycle } : undefined;
    recipe.phase = target.engineV2!.phase;
    const placed = placeRecipeOnDate(gone, target.date, recipe, p, options);
    if ("blocked" in placed) {
      lastReason = `Test nie mieści się w tym terminie: ${placed.blocked.message}`;
      continue;
    }
    if (placed.session.runningRecipe?.method !== "field_mas_test") continue;
    placed.session.blockPhaseLabel = target.blockPhaseLabel;
    placed.session.blockWeekNumber = target.blockWeekNumber;
    if (!validateTrainingPlan(placed.plan, p, options).every((i) => baseline.has(key(i)))) {
      lastReason = "Test nie przechodzi kontroli planu w tym terminie.";
      continue;
    }
    found = { target, plan: placed.plan, session: placed.session };
    break;
  }
  if (!found) return { ok: false, reason: lastReason };
  const { target, session: testSession } = found;
  const placed = { plan: found.plan, session: testSession };
  const id = `mas1:${input.planId ?? "none"}:${target.dbId}`;
  const candidate = placed.plan.map((d) =>
    d.date === target.date
      ? {
          ...d,
          feedbackAdjustments: [
            ...(d.feedbackAdjustments ?? []),
            {
              proposalId: id,
              sourceSessionId: target.dbId!,
              kind: "mas_test" as const,
              appliedAt: todayIso,
            },
          ],
        }
      : d,
  );
  const first = candidate[0];
  const old = input.plan.find((d) => d.date === first.date);
  if (old?.enginePlanIssues && !first.enginePlanIssues)
    first.enginePlanIssues = old.enginePlanIssues;
  first.engineTimeBudgetMin = minutesPerSession;
  first.planInputs = first.planInputs ?? old?.planInputs;
  const line = `${target.title} (${target.date}): zastąpiony testem 5 min (${placed.session.durationMin} min z rozgrzewką i schłodzeniem).`;
  const changes = [
    {
      kind: "mas_test" as const,
      sessionId: target.dbId!,
      title: target.title,
      before: { date: target.date, minutes: target.durationMin },
      after: { date: target.date, minutes: placed.session.durationMin },
      line,
    },
  ];
  return {
    ok: true,
    proposal: {
      id,
      policyVersion: "mas-test-1",
      sourceSessionId: target.dbId!,
      sourceDate: target.date,
      sourceKind: "voluntary",
      feedback: { rpe: 0, tags: [], matchMinutesPlayed: null, feedbackVersion: null },
      planId: input.planId,
      reason: "Ustal tempo: dobrowolny test 5-minutowy zamiast jednego spokojnego biegu.",
      changes,
      affectedSessionIds: [target.dbId!],
      candidatePlan: candidate,
      minutesPerSession,
      fingerprint: proposalFingerprint([
        id,
        input.planId,
        changes.map((c) => [c.kind, c.sessionId, c.after?.date]),
      ]),
    },
  };
}
