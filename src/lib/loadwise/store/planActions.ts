import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import type { RefObject } from "react";
import { selectEquipmentAwareReplacement } from "../exerciseLibrary";
import { parseIso } from "../labels";
import { normalizeMatchDates } from "../matchSchedule";
import type {
  ExerciseReplacement,
  ModificationType,
  Profile,
  Readiness,
  SessionDay,
  SessionModification,
  SessionStatus,
  TrainingExercise,
  WeeklyTransition,
} from "../types";
import { persistLocal } from "./localState";
import { type LoadwiseContextValue, type StoreActionContext } from "./model";

export function createPlanActions(
  context: StoreActionContext & { replacementInFlightRef: RefObject<Set<string>> },
): Pick<
  LoadwiseContextValue,
  | "markEquipmentUnavailable"
  | "undoExerciseReplacement"
  | "applyModification"
  | "undoModification"
  | "confirmWeeklyTransition"
  | "saveReadiness"
> {
  const { user, state, setState, replacementInFlightRef } = context;
  async function markEquipmentUnavailable(
    date: string,
    exercise: TrainingExercise,
    equipmentIds: string[],
  ) {
    if (!user || exercise.completed) return;
    if ((state.exerciseReplacements[date] ?? []).some((r) => r.exerciseId === exercise.id)) return;
    if (!state.profile) return;
    const replacementKey = `${date}:${exercise.id}`;
    if (replacementInFlightRef.current.has(replacementKey)) return;
    replacementInFlightRef.current.add(replacementKey);
    try {
      const { buildAthleteTrainingProfile } = await import("../athleteProfile");
      const unavailableEquipmentIds = Array.from(
        new Set([...(state.profile.unavailableEquipmentIds ?? []), ...equipmentIds]),
      );
      const athlete = buildAthleteTrainingProfile(state.profile, {
        unavailableEquipmentIds,
      });
      const result = selectEquipmentAwareReplacement(exercise.exerciseId ?? exercise.name, athlete);
      if (!result.exercise || result.blockRebuildRequired) {
        setState((s) => ({
          ...s,
          equipmentNotice:
            "Nie znaleziono bezpiecznego zamiennika. Plan i historia pozostały bez zmian.",
        }));
        return;
      }
      const replacement: TrainingExercise = {
        ...exercise,
        exerciseId: result.exercise.id,
        name: result.exercise.displayNamePl,
        equipment: result.exercise.equipmentRequired.join(", "),
        replacementForBlockedExercise: exercise.name,
        wasAdjustedForAthleteProfile: true,
      };
      const item: ExerciseReplacement = {
        id: crypto.randomUUID(),
        date,
        exerciseId: exercise.id,
        original: exercise,
        replacement,
        equipmentIds,
        createdAt: new Date().toISOString(),
      };
      const insert = await supabase.from("exercise_replacements").insert({
        id: item.id,
        user_id: user.id,
        date,
        exercise_id: item.exerciseId,
        original_json: item.original as unknown as Json,
        replacement_json: item.replacement as unknown as Json,
        equipment_ids: item.equipmentIds,
        active: true,
      });
      assertNoSupabaseError("exercise_replacements.insert", insert.error);
      const profileUpdate = await supabase
        .from("athlete_profiles")
        .update({ unavailable_equipment_ids: unavailableEquipmentIds })
        .eq("user_id", user.id);
      if (profileUpdate.error) {
        await supabase
          .from("exercise_replacements")
          .delete()
          .eq("id", item.id)
          .eq("user_id", user.id);
        assertNoSupabaseError("athlete_profiles.equipment", profileUpdate.error);
      }
      setState((s) => ({
        ...s,
        equipmentNotice: null,
        profile: s.profile ? { ...s.profile, unavailableEquipmentIds } : s.profile,
        exerciseReplacements: {
          ...s.exerciseReplacements,
          [date]: [...(s.exerciseReplacements[date] ?? []), item],
        },
      }));
    } catch {
      setState((s) => ({
        ...s,
        equipmentNotice: "Nie udało się zapisać zamiennika. Plan i historia pozostały bez zmian.",
      }));
    } finally {
      replacementInFlightRef.current.delete(replacementKey);
    }
  }

  async function undoExerciseReplacement(date: string, replacementId: string) {
    if (!user) return;
    const current = state.exerciseReplacements[date] ?? [];
    const removed = current.find((replacement) => replacement.id === replacementId);
    if (!removed) return;
    const stillUsed = Object.values(state.exerciseReplacements)
      .flat()
      .some(
        (replacement) =>
          replacement.id !== replacementId &&
          replacement.equipmentIds.some((id) => removed.equipmentIds.includes(id)),
      );
    const unavailableEquipmentIds = stillUsed
      ? (state.profile?.unavailableEquipmentIds ?? [])
      : (state.profile?.unavailableEquipmentIds ?? []).filter(
          (id) => !removed.equipmentIds.includes(id),
        );
    const deactivate = await supabase
      .from("exercise_replacements")
      .update({ active: false })
      .eq("id", replacementId)
      .eq("user_id", user.id);
    assertNoSupabaseError("exercise_replacements.undo", deactivate.error);
    const profileUpdate = await supabase
      .from("athlete_profiles")
      .update({ unavailable_equipment_ids: unavailableEquipmentIds })
      .eq("user_id", user.id);
    if (profileUpdate.error) {
      await supabase
        .from("exercise_replacements")
        .update({ active: true })
        .eq("id", replacementId)
        .eq("user_id", user.id);
      assertNoSupabaseError("athlete_profiles.equipment_undo", profileUpdate.error);
    }
    setState((s) => ({
      ...s,
      equipmentNotice: null,
      profile: s.profile ? { ...s.profile, unavailableEquipmentIds } : s.profile,
      exerciseReplacements: {
        ...s.exerciseReplacements,
        [date]: (s.exerciseReplacements[date] ?? []).filter(
          (replacement) => replacement.id !== replacementId,
        ),
      },
    }));
  }

  async function applyModification(
    date: string,
    type: ModificationType,
    session: SessionDay,
    originalSession: SessionDay | null,
    reason: string,
  ) {
    if (!user) return;
    const id = crypto.randomUUID();
    const safetyStatus: SessionStatus = type === "swap" ? "swapped_by_user" : "added_by_user";
    const trainingDayId =
      originalSession?.dayDbId ?? state.plan.find((day) => day.date === date)?.dayDbId;
    if (!trainingDayId) {
      throw new Error("Brak zapisanego dnia treningowego dla tej sesji.");
    }
    const { persistModifiedSession } = await import("../persist");
    const persistedSession = await persistModifiedSession(user.id, trainingDayId, session);
    const mod: SessionModification = {
      id,
      date,
      type,
      reason,
      safetyStatus,
      session: persistedSession,
      originalSession,
      createdAt: new Date().toISOString(),
    };
    const modificationWrite = await supabase.from("session_modifications").insert({
      id,
      user_id: user.id,
      date,
      type,
      reason,
      safety_status: safetyStatus,
      original_session_id: originalSession?.dbId ?? null,
      new_session_id: persistedSession.dbId ?? null,
      original_session_json: originalSession as unknown as Json,
      new_session_json: persistedSession as unknown as Json,
      active: true,
    });
    if (modificationWrite.error) {
      await supabase
        .from("training_sessions")
        .delete()
        .eq("id", persistedSession.dbId!)
        .eq("user_id", user.id);
      assertNoSupabaseError("session_modifications.insert", modificationWrite.error);
    }
    if (type === "swap") {
      const deactivate = await supabase
        .from("session_modifications")
        .update({ active: false })
        .eq("user_id", user.id)
        .eq("date", date)
        .eq("type", "swap")
        .neq("id", id);
      if (deactivate.error) {
        await supabase.from("session_modifications").delete().eq("id", id).eq("user_id", user.id);
        await supabase
          .from("training_sessions")
          .delete()
          .eq("id", persistedSession.dbId!)
          .eq("user_id", user.id);
        assertNoSupabaseError("session_modifications.deactivate_previous", deactivate.error);
      }
    }
    setState((current) => {
      const existing = current.modifications[date] ?? [];
      const filtered = type === "swap" ? existing.filter((item) => item.type !== "swap") : existing;
      return {
        ...current,
        modifications: {
          ...current.modifications,
          [date]: [...filtered, mod],
        },
      };
    });
  }

  async function undoModification(date: string, id: string) {
    if (!user) return;
    const modification = (state.modifications[date] ?? []).find((item) => item.id === id);
    const deactivate = await supabase
      .from("session_modifications")
      .update({ active: false })
      .eq("user_id", user.id)
      .eq("id", id);
    assertNoSupabaseError("session_modifications.undo", deactivate.error);
    const modifiedSessionId = modification?.session.dbId;
    if (modifiedSessionId) {
      const logDelete = await supabase
        .from("session_logs")
        .delete()
        .eq("user_id", user.id)
        .eq("session_id", modifiedSessionId);
      assertNoSupabaseError("session_logs.delete_modified", logDelete.error);
      const sessionDelete = await supabase
        .from("training_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("id", modifiedSessionId);
      assertNoSupabaseError("training_sessions.delete_modified", sessionDelete.error);
    }
    setState((current) => {
      const existing = current.modifications[date] ?? [];
      const next = existing.filter((item) => item.id !== id);
      const modifications = { ...current.modifications };
      if (next.length) modifications[date] = next;
      else delete modifications[date];
      const completions = { ...current.completions };
      if (modifiedSessionId) delete completions[modifiedSessionId];
      const runningActivities = { ...current.runningActivities };
      if (modifiedSessionId) delete runningActivities[modifiedSessionId];
      return {
        ...current,
        modifications,
        completions,
        runningActivities,
        history: modifiedSessionId
          ? current.history.filter((item) => item.key !== modifiedSessionId)
          : current.history,
      };
    });
  }

  async function confirmWeeklyTransition(
    weekNumber: number,
    nextMatchDates: string[],
    noMatchNextWeek: boolean,
  ) {
    if (!user) return;
    const profile = state.profile;
    if (!profile) return;
    const [{ generatePlan, weekRanges }, { persistMonthlyPlan }] = await Promise.all([
      import("../planEngine"),
      import("../persist"),
    ]);

    // weekNumber = indeks (0-based) ODBLOKOWYWANEGO tygodnia kalendarzowego.
    // Wyznaczamy jego przedział w planie wg granic poniedziałek–niedziela.
    const current = state.plan;
    const normalizedMatchDates = noMatchNextWeek ? [] : normalizeMatchDates(nextMatchDates);
    let newPlan = current;
    const planStart = current[0] ? parseIso(current[0].date) : null;
    const ranges = planStart ? weekRanges(planStart, current.length) : [];
    const range = ranges[weekNumber];

    if (range && current[range.start]) {
      const startIdx = range.start;
      const weekStart = parseIso(current[startIdx].date);
      // Profil tymczasowy: tylko podana data meczu steruje taperem.
      const tempProfile: Profile = {
        ...profile,
        usualMatchDay: "no_fixed_day",
        matchDate: normalizedMatchDates[0] ?? null,
        matchDates: normalizedMatchDates,
      };
      const regenDays = range.end - range.start;
      const fresh = generatePlan(tempProfile, weekStart, regenDays, weekNumber);
      newPlan = [...current.slice(0, startIdx), ...fresh, ...current.slice(startIdx + regenDays)];
      // Zapisujemy cały plan ponownie (regeneruje identyfikatory sesji).
      await persistMonthlyPlan(user.id, profile, newPlan);
    }

    const id = state.transitions[weekNumber]?.id ?? crypto.randomUUID();
    const transition: WeeklyTransition = {
      id,
      weekNumber,
      nextMatchDate: normalizedMatchDates[0] ?? null,
      nextMatchDates: normalizedMatchDates,
      noMatchNextWeek,
      confirmedAt: new Date().toISOString(),
    };

    const transitionWrite = await supabase.from("weekly_transitions").upsert(
      {
        id,
        user_id: user.id,
        week_number: weekNumber,
        next_match_date: transition.nextMatchDate,
        next_match_dates: transition.nextMatchDates ?? [],
        no_match_next_week: noMatchNextWeek,
        confirmed_at: transition.confirmedAt,
      },
      { onConflict: "user_id,week_number" },
    );
    assertNoSupabaseError("weekly_transitions.upsert", transitionWrite.error);
    setState((s) => ({
      ...s,
      plan: newPlan,
      transitions: { ...s.transitions, [weekNumber]: transition },
    }));
  }

  async function saveReadiness(r: Readiness) {
    if (!state.profile?.healthPersonalizationEnabled) {
      throw new Error("Check-in jest wyłączony. Włącz opcjonalną personalizację w profilu.");
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("Check-in zdrowotny wymaga połączenia z internetem.");
    }
    const { applyCheckInToPlanDay } = await import("../dailyCheckin");
    if (user) {
      const write = await supabase.from("readiness_logs").upsert(
        {
          user_id: user.id,
          date: r.date,
          sleep: r.sleep,
          energy: r.energy,
          fatigue: r.fatigue,
          soreness: r.soreness,
          stress: r.stress,
          pain_level: r.jointPain,
          pain_location: r.painLocation ?? null,
          pain_onset: r.painOnset ?? null,
          alters_movement: r.altersMovement ?? false,
          red_flags: r.redFlags ?? [],
          overall: r.overall,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" },
      );
      assertNoSupabaseError("readiness_logs.upsert", write.error);

      const painWrite =
        r.jointPain > 0
          ? await supabase.from("pain_logs").upsert(
              {
                user_id: user.id,
                date: r.date,
                pain_level: r.jointPain,
                pain_location: r.painLocation ?? null,
                notes: null,
              },
              { onConflict: "user_id,date" },
            )
          : await supabase.from("pain_logs").delete().eq("user_id", user.id).eq("date", r.date);
      assertNoSupabaseError("pain_logs.sync", painWrite.error);
    }

    setState((s) => {
      const nextReadiness = { ...s.readiness, [r.date]: r };
      const nextPlan = s.profile
        ? applyCheckInToPlanDay(s.plan, r.date, r, s.profile).plan
        : s.plan;
      const next = { ...s, readiness: nextReadiness, plan: nextPlan };
      persistLocal(user?.id, next);
      return next;
    });
  }
  return {
    markEquipmentUnavailable,
    undoExerciseReplacement,
    applyModification,
    undoModification,
    confirmWeeklyTransition,
    saveReadiness,
  };
}
