import { boundedRequest } from "@/lib/boundedRequest";
import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import { isoDate, localToday } from "./labels";
import { assertPlanExerciseContract } from "./planExerciseContract";
import type { ExerciseItem, Profile, SessionDay, WeeklyTransition } from "./types";

/** Wyciąga łączny dystans (w metrach) z opisu ćwiczenia, jeśli dotyczy sprintu. */
function extractDistance(name: string, prescription: string): string | null {
  if (!/sprint|zryw|przyspiesz|bieg|tempo|lotne|odcin/i.test(name + prescription)) {
    return null;
  }
  // "m" must be a standalone unit: "3 min" or "8–10 min" is a duration, not metres.
  const total = prescription.match(/łącznie\s*(\d+)\s*m(?![a-ząćęłńóśźż])/i);
  if (total) return `${total[1]} m`;
  // np. "6 × 20 m"
  const mult = prescription.match(/(\d+)\s*[×x]\s*(\d+)\s*m(?![a-ząćęłńóśźż])/i);
  if (mult) return `${Number(mult[1]) * Number(mult[2])} m`;
  const single = prescription.match(/(\d+)\s*m(?![a-ząćęłńóśźż])/i);
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
 * Zwraca oddzielną kopię z dbId/dayDbId dopiero po potwierdzeniu transakcji.
 */
export function prepareMonthlyPlan(
  userId: string,
  profile: Profile,
  plan: SessionDay[],
  transition?: WeeklyTransition,
) {
  assertPlanExerciseContract(plan);
  // Allocate on a detached tree. A rejected transaction leaves the live plan untouched.
  plan = plan.map((day) => ({
    ...day,
    secondSession: day.secondSession ? { ...day.secondSession } : null,
  }));
  const expectedPlanId = plan.find((day) => day.planDbId)?.planDbId;
  const planId = crypto.randomUUID();
  const cycleId = plan.find((day) => day.cycleId)?.cycleId ?? crypto.randomUUID();
  const month = isoDate(localToday()).slice(0, 7);

  const dayRows: Record<string, unknown>[] = [];
  const sessionRows: Record<string, unknown>[] = [];
  const exerciseRows: ExerciseRow[] = [];

  for (const day of plan) {
    const dayId = day.dayDbId ?? crypto.randomUUID();
    day.dayDbId = dayId;
    day.planDbId = planId;
    day.cycleId = cycleId;
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
      const sessionId = s.dbId ?? crypto.randomUUID();
      s.dayDbId = dayId;
      s.planDbId = planId;
      s.cycleId = cycleId;
      s.dbId = sessionId;
      sessionRows.push({
        id: sessionId,
        user_id: userId,
        training_day_id: dayId,
        session_type: s.type ?? s.sessionType,
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

  return {
    plan,
    args: {
      p_expected_plan_id: expectedPlanId,
      p_transition: transition ? (transition as unknown as Json) : undefined,
      p_plan_id: planId,
      p_goal: profile.goal,
      p_month: month,
      p_plan_json: plan as unknown as Json,
      p_days: dayRows as unknown as Json,
      p_sessions: sessionRows as unknown as Json,
      p_exercises: exerciseRows as unknown as Json,
    },
  };
}

/** A plan write that has not answered by then is reported instead of waiting forever. */
export const PLAN_COMMIT_TIMEOUT_MS = 20_000;
export const PLAN_COMMIT_TIMEOUT_MESSAGE =
  "Zapis planu trwa za długo. Sprawdź internet i spróbuj ponownie.";

/**
 * Assigns the final database ids (one small read) without writing. The returned plan
 * can be shown at once; `commit` sends the atomic snapshot and resolves to the same plan.
 */
export async function stageMonthlyPlan(
  userId: string,
  profile: Profile,
  plan: SessionDay[],
  transition?: WeeklyTransition,
): Promise<{ plan: SessionDay[]; commit: () => Promise<SessionDay[]> }> {
  const { preparePlanWrite } = await import("./preparePlanWrite");
  const prepared = await preparePlanWrite(userId, profile, plan, transition);
  return {
    plan: prepared.plan,
    commit: async () => {
      // The client can also stall before the request (session refresh), so the
      // deadline covers the whole call, not only the network transfer.
      const atomicWrite = await boundedRequest(
        async () => await supabase.rpc("persist_training_plan_v2", prepared.args),
        PLAN_COMMIT_TIMEOUT_MS,
        PLAN_COMMIT_TIMEOUT_MESSAGE,
      );
      assertNoSupabaseError("persist_training_plan_v2", atomicWrite.error);
      return prepared.plan;
    },
  };
}

export async function persistMonthlyPlan(
  userId: string,
  profile: Profile,
  plan: SessionDay[],
  transition?: WeeklyTransition,
): Promise<SessionDay[]> {
  return (await stageMonthlyPlan(userId, profile, plan, transition)).commit();
}

/** Prepare a command payload without performing any partial database writes. */
export function prepareModifiedSession(
  userId: string,
  trainingDayId: string,
  session: SessionDay,
  reuseId?: string,
) {
  const id = reuseId ?? crypto.randomUUID();
  const persisted = { ...session, dbId: id, dayDbId: trainingDayId };
  const row = {
    id,
    user_id: userId,
    training_day_id: trainingDayId,
    session_type: session.type ?? session.sessionType,
    title: session.title,
    goal: session.goalOfSession,
    duration_min: session.durationMin,
    intensity: session.intensity,
    warmup_json: session.sections.warmup,
    main_work_json: [
      ...session.sections.main,
      ...session.sections.accessory,
      ...session.sections.footballTransfer,
    ],
    cooldown_json: session.sections.cooldown,
    safety_notes: session.safetyNote,
  };
  const exercises: ExerciseRow[] = [];
  for (const section of ["warmup", "main", "accessory", "footballTransfer", "cooldown"] as const)
    exercises.push(
      ...buildExerciseRows(userId, id, exercises.length, section, session.sections[section]),
    );
  return { session: persisted, row, exercises };
}
