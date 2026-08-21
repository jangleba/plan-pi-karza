import type { Profile, SessionDay, ExerciseItem } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { isoDate, localToday } from "./labels";
import { assertPlanExerciseContract } from "./planExerciseContract";

function supabaseErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const row = error as Record<string, unknown>;
    const parts = [
      typeof row.message === "string" ? row.message : null,
      typeof row.details === "string" ? row.details : null,
      typeof row.hint === "string" ? row.hint : null,
      typeof row.code === "string" ? `code: ${row.code}` : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  if (error instanceof Error) return error.message;
  return "Unknown Supabase error";
}

function assertNoSupabaseError(context: string, error: unknown): void {
  if (!error) return;
  throw new Error(`[${context}] ${supabaseErrorMessage(error)}`);
}

/** Wyciąga łączny dystans (w metrach) z opisu ćwiczenia, jeśli dotyczy sprintu. */
function extractDistance(name: string, prescription: string): string | null {
  if (!/sprint|zryw|przyspiesz|bieg|tempo|lotne|odcin/i.test(name + prescription)) {
    return null;
  }
  const total = prescription.match(/łącznie\s*(\d+)\s*m/i);
  if (total) return `${total[1]} m`;
  // np. "6 × 20 m"
  const mult = prescription.match(/(\d+)\s*[×x]\s*(\d+)\s*m/i);
  if (mult) return `${Number(mult[1]) * Number(mult[2])} m`;
  const single = prescription.match(/(\d+)\s*m/i);
  if (single) return `${single[1]} m`;
  return null;
}

interface ExerciseRow {
  id: string;
  user_id: string;
  session_id: string;
  order_index: number;
  name: string;
  section: string;
  reps: string | null;
  duration: string | null;
  distance: string | null;
  rest: string | null;
  coaching_cues: string | null;
}

function buildExerciseRows(
  userId: string,
  sessionId: string,
  startIndex: number,
  sectionLabel: string,
  items: ExerciseItem[],
): ExerciseRow[] {
  return items.map((it, i) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    session_id: sessionId,
    order_index: startIndex + i,
    name: it.name,
    section: sectionLabel,
    reps: it.prescription ?? null,
    duration: null,
    distance: extractDistance(it.name, it.prescription ?? ""),
    rest: it.rest ?? null,
    coaching_cues: it.cue ?? null,
  }));
}

/**
 * Zapisuje wygenerowany plan do znormalizowanych tabel:
 * training_plans -> training_days -> training_sessions -> session_exercises.
 * Mutuje obiekty SessionDay, dopisując dbId/dayDbId, aby plan_json zawierał
 * identyfikatory potrzebne do śledzenia ukończenia sesji.
 */
export async function persistMonthlyPlan(
  userId: string,
  profile: Profile,
  plan: SessionDay[],
): Promise<void> {
  assertPlanExerciseContract(plan);
  const planId = crypto.randomUUID();
  const month = isoDate(localToday()).slice(0, 7);

  const dayRows: Record<string, unknown>[] = [];
  const sessionRows: Record<string, unknown>[] = [];
  const exerciseRows: ExerciseRow[] = [];

  for (const day of plan) {
    const dayId = crypto.randomUUID();
    day.dayDbId = dayId;
    dayRows.push({
      id: dayId,
      user_id: userId,
      plan_id: planId,
      date: day.date,
      day_type: day.dayType,
      decision_reason: day.reason,
    });

    const sessions: SessionDay[] = [day];
    if (day.secondSession) sessions.push(day.secondSession);

    for (const s of sessions) {
      const sessionId = crypto.randomUUID();
      s.dbId = sessionId;
      sessionRows.push({
        id: sessionId,
        user_id: userId,
        training_day_id: dayId,
        session_type: s.sessionType,
        title: s.title,
        goal: s.goalOfSession,
        duration_min: s.durationMin,
        intensity: s.intensity,
        warmup_json: s.sections.warmup,
        main_work_json: [
          ...s.sections.main,
          ...s.sections.accessory,
          ...s.sections.footballTransfer,
        ],
        cooldown_json: s.sections.cooldown,
        safety_notes: s.safetyNote,
      });

      let idx = 0;
      const push = (label: string, items: ExerciseItem[]) => {
        const rows = buildExerciseRows(userId, sessionId, idx, label, items);
        idx += rows.length;
        exerciseRows.push(...rows);
      };
      push("warmup", s.sections.warmup);
      push("main", s.sections.main);
      push("accessory", s.sections.accessory);
      push("footballTransfer", s.sections.footballTransfer);
      push("cooldown", s.sections.cooldown);
    }
  }

  // Kolejność: plan -> dni -> sesje -> ćwiczenia (klucze obce).
  const planInsert = await supabase.from("training_plans").insert({
    id: planId,
    user_id: userId,
    goal: profile.goal,
    month,
    plan_json: plan as unknown as never,
    status: "archived",
  });
  assertNoSupabaseError("training_plans.insert", planInsert.error);
  try {
    if (dayRows.length) {
      const dayInsert = await supabase.from("training_days").insert(dayRows as never);
      assertNoSupabaseError("training_days.insert", dayInsert.error);
    }
    if (sessionRows.length) {
      const sessionInsert = await supabase.from("training_sessions").insert(sessionRows as never);
      assertNoSupabaseError("training_sessions.insert", sessionInsert.error);
    }
    if (exerciseRows.length) {
      const exerciseInsert = await supabase.from("session_exercises").insert(exerciseRows as never);
      assertNoSupabaseError("session_exercises.insert", exerciseInsert.error);
    }
    const activatePlan = await supabase
      .from("training_plans")
      .update({ status: "active" })
      .eq("id", planId)
      .eq("user_id", userId);
    assertNoSupabaseError("training_plans.activate", activatePlan.error);
    const archivePrevious = await supabase
      .from("training_plans")
      .update({ status: "archived" })
      .eq("user_id", userId)
      .eq("status", "active")
      .neq("id", planId);
    assertNoSupabaseError("training_plans.archive_previous", archivePrevious.error);
  } catch (error) {
    await supabase.from("training_plans").delete().eq("id", planId).eq("user_id", userId);
    throw error;
  }
}
