import { resolveEffectivePlan, type EffectivePlanContext } from "./effectivePlan";
import type { SessionDay, SessionModification } from "./types";

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
