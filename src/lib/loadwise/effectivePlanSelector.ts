import { resolveEffectivePlan, type EffectivePlanContext } from "./effectivePlan";
import { buildPlanWeeks } from "./sessionRuntime";
import type { Profile, PlanWeek, SessionDay, SessionModification } from "./types";

const EMPTY_MODIFICATIONS: Record<string, SessionModification[]> = {};
type Entry = EffectivePlanContext & {
  modifications: Record<string, SessionModification[]>;
  adapted: boolean;
  result: SessionDay[];
};
const cache = new WeakMap<SessionDay[], Entry[]>();

/** Shared, read-only UI projection. Writes keep using resolveEffectivePlan's fresh copies. */
export function selectEffectivePlan(
  plan: SessionDay[],
  modifications = EMPTY_MODIFICATIONS,
  context?: EffectivePlanContext,
): SessionDay[] {
  const entries = cache.get(plan) ?? [];
  const match = entries.find(
    (entry) =>
      entry.modifications === modifications &&
      entry.adapted === Boolean(context) &&
      entry.profile === context?.profile &&
      entry.readiness === context?.readiness &&
      entry.completions === context?.completions,
  );
  if (match) return match.result;
  const result = resolveEffectivePlan(plan, modifications, context);
  // The plan identity scopes the cache to an immutable snapshot; bound alternate contexts too.
  cache.set(
    plan,
    [{ ...context, modifications, adapted: Boolean(context), result }, ...entries].slice(0, 4),
  );
  return result;
}

const weekCache = new WeakMap<
  SessionDay[],
  { profile: Profile | null | undefined; weeks: PlanWeek[] }
>();
/** Week decoration can be prepared while idle and reused when Plan is opened. */
export function selectPlanWeeks(plan: SessionDay[], profile?: Profile | null): PlanWeek[] {
  const cached = weekCache.get(plan);
  if (cached && cached.profile === profile) return cached.weeks;
  const weeks = buildPlanWeeks(plan, profile);
  weekCache.set(plan, { profile, weeks });
  return weeks;
}
