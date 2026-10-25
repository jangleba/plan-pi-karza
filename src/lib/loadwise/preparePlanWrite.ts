import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import { isoDate, localToday } from "./labels";
import { prepareMonthlyPlan } from "./persist";
import type { Profile, SessionDay, WeeklyTransition } from "./types";

const sessionColumns =
  "id,user_id,training_day_id,session_type,title,goal,duration_min,intensity,warmup_json,main_work_json,cooldown_json,safety_notes";

// Postgres jsonb reorders object keys. Only content matters for identity.
function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, normalize(val)]),
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}

/**
 * Legacy plan_json can contain newer exercise descriptions than the immutable
 * training_sessions rows. Keep protected rows exactly as saved; changed future
 * prescriptions receive fresh IDs. The RPC still checks ownership, concurrency
 * and newly started/completed work atomically.
 */
export async function preparePlanWrite(
  userId: string,
  profile: Profile,
  plan: SessionDay[],
  transition?: WeeklyTransition,
) {
  const prepared = prepareMonthlyPlan(userId, profile, plan, transition);
  const slots = plan.flatMap((day) => (day.secondSession ? [day, day.secondSession] : [day]));
  const existing = new Map(slots.filter((slot) => slot.dbId).map((slot) => [slot.dbId!, slot]));
  if (!existing.size) return prepared;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const stored = new Map<string, Record<string, unknown>>();
  try {
    const ids = [...existing.keys()];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await supabase
        .from("training_sessions")
        .select(sessionColumns)
        .eq("user_id", userId)
        .in("id", ids.slice(offset, offset + 100))
        .abortSignal(controller.signal);
      assertNoSupabaseError("training_sessions.verify_snapshot", result.error);
      for (const row of result.data ?? []) stored.set(row.id, row);
    }
  } finally {
    clearTimeout(timeout);
  }

  const today = isoDate(localToday());
  const replacements = new Map<string, string>();
  const rows = prepared.args.p_sessions as Record<string, unknown>[];
  prepared.args.p_sessions = rows.map((row) => {
    const id = String(row.id);
    const slot = existing.get(id);
    if (!slot) return row;
    const original = stored.get(id);
    if (!original || original.training_day_id !== row.training_day_id)
      throw new Error(
        "Nie udało się potwierdzić zapisanej sesji. Odśwież plan i spróbuj ponownie.",
      );
    if (slot.executionProtected || slot.date < today) return original;
    if (stableJson(row) === stableJson(original)) return row;
    const nextId = crypto.randomUUID();
    replacements.set(id, nextId);
    return { ...row, id: nextId };
  }) as Json;
  for (const day of prepared.plan) {
    for (const slot of day.secondSession ? [day, day.secondSession] : [day]) {
      const nextId = slot.dbId ? replacements.get(slot.dbId) : undefined;
      if (nextId) {
        slot.dbId = nextId;
        slot.sessionId = undefined;
      }
    }
  }
  prepared.args.p_exercises = (prepared.args.p_exercises as Record<string, unknown>[]).map(
    (row) => ({ ...row, session_id: replacements.get(String(row.session_id)) ?? row.session_id }),
  ) as Json;
  // p_plan_json points to the detached plan, including newly allocated IDs.
  return prepared;
}
