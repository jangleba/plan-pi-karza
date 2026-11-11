import { assertSafePlanChange } from "../planChangeValidation";
import { repairSegmentBoundaries } from "../segmentBoundary";
import { boundedRequest } from "@/lib/boundedRequest";
import { generatePlanAsync } from "../generatePlanAsync";
import { reconcilePlanIdentity, sessionPrescription } from "../planIdentity";
import { ONBOARDING_SCHEMA_VERSION, stampPlanRevision } from "./model";
import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import type { RefObject } from "react";
import {
  hydrateTrainingExerciseFromDefinition,
  selectEquipmentAwareReplacement,
} from "../exerciseLibrary";
import { buildEquipmentReplacement } from "../equipmentReplacement";
import { parseIso } from "../labels";
import { addIsoDays } from "@/lib/isoDate";
import { weeklyConfirmationBounds } from "../weeklyNavigation";
import { transitionMatchesBlock } from "../confirmedCalendar";
import { normalizeMatchDates } from "../matchSchedule";
import { resolveEffectivePlan, resolveModifiedDay } from "../effectivePlan";
import { gymChangeBlockReason } from "../strengthScheduling";
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
import {
  type LoadwiseContextValue,
  type StoreActionContext,
  type WeeklyConfirmation,
} from "./model";

export const WEEK_STAGE_TIMEOUT_MS = 12_000;
export const WEEK_STAGE_TIMEOUT_MESSAGE =
  "Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.";

// Each snapshot names the plan it replaces, so writes must land in order.
let planCommitQueue: Promise<unknown> = Promise.resolve();
function queuePlanCommit<T>(commit: () => Promise<T>): Promise<T> {
  const run = planCommitQueue.then(commit, commit);
  planCommitQueue = run.catch(() => undefined);
  return run;
}

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
    // A started or completed session keeps its recorded prescription.
    const day = state.plan.find((item) => item.date === date);
    const owner = [day, day?.secondSession].find((slot) =>
      (slot?.structuredSections ?? []).some((section) =>
        section.blocks.some((block) => block.exercises.some((item) => item.id === exercise.id)),
      ),
    );
    const log = owner?.dbId ? state.completions[owner.dbId] : undefined;
    if (
      owner &&
      (owner.executionProtected ||
        log?.completed ||
        log?.status === "started" ||
        log?.status === "completed")
    ) {
      setState((s) => ({
        ...s,
        equipmentNotice: "Sesja jest rozpoczęta lub wykonana. Zamiennik nie zmienia jej zapisu.",
      }));
      return;
    }
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
      const replacement: TrainingExercise = hydrateTrainingExerciseFromDefinition(
        buildEquipmentReplacement(exercise, result.exercise),
      );
      const item: ExerciseReplacement = {
        id: crypto.randomUUID(),
        date,
        exerciseId: exercise.id,
        original: exercise,
        replacement,
        equipmentIds,
        createdAt: new Date().toISOString(),
      };
      const write = await supabase.rpc("set_equipment_replacement", {
        p_operation_id: item.id,
        p_replacement: {
          id: item.id,
          user_id: user.id,
          date,
          exercise_id: item.exerciseId,
          original_json: item.original,
          replacement_json: item.replacement,
          equipment_ids: item.equipmentIds,
          active: true,
        } as unknown as Json,
      });
      assertNoSupabaseError("set_equipment_replacement", write.error);
      const response = write.data as Record<string, unknown> | null;
      const persistedUnavailable = Array.isArray(response?.unavailable_equipment_ids)
        ? (response.unavailable_equipment_ids as string[])
        : unavailableEquipmentIds;
      setState((s) => ({
        ...s,
        equipmentNotice: null,
        profile: s.profile
          ? {
              ...s.profile,
              unavailableEquipmentIds: persistedUnavailable,
              serverProfileUpdatedAt: response?.profile_updated_at as string | undefined,
            }
          : s.profile,
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
    const remainingEquipment = new Set(
      Object.values(state.exerciseReplacements)
        .flat()
        .filter((replacement) => replacement.id !== replacementId)
        .flatMap((replacement) => replacement.equipmentIds),
    );
    const unavailableEquipmentIds = (state.profile?.unavailableEquipmentIds ?? []).filter(
      (id) => !removed.equipmentIds.includes(id) || remainingEquipment.has(id),
    );
    const write = await supabase.rpc("set_equipment_replacement", {
      p_operation_id: crypto.randomUUID(),
      p_undo_id: replacementId,
    });
    assertNoSupabaseError("set_equipment_replacement.undo", write.error);
    const response = write.data as Record<string, unknown> | null;
    const persistedUnavailable = Array.isArray(response?.unavailable_equipment_ids)
      ? (response.unavailable_equipment_ids as string[])
      : unavailableEquipmentIds;
    setState((s) => ({
      ...s,
      equipmentNotice: null,
      profile: s.profile
        ? {
            ...s.profile,
            unavailableEquipmentIds: persistedUnavailable,
            serverProfileUpdatedAt: response?.profile_updated_at as string | undefined,
          }
        : s.profile,
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
    const sourceDay = state.plan.find((day) => day.date === date);
    const current = sourceDay
      ? resolveModifiedDay(sourceDay, state.modifications[date] ?? [])
      : originalSession;
    if (!current?.dayDbId) throw new Error("Brak zapisanego dnia treningowego dla tej sesji.");
    const original = type === "swap" ? current : null;
    const protectedSlot = (
      old: SessionDay | null | undefined,
      next: SessionDay | null | undefined,
    ) => {
      const log = old?.dbId ? state.completions[old.dbId] : undefined;
      if (
        (log?.completed || log?.status === "started") &&
        (!next || sessionPrescription(old!) !== sessionPrescription(next))
      )
        throw new Error("Nie zmieniamy rozpoczętej lub ukończonej sesji. Wybierz inną jednostkę.");
    };
    if (type === "swap") {
      protectedSlot(current, session);
      protectedSlot(current.secondSession, session.secondSession);
    }
    const id = crypto.randomUUID();
    const safetyStatus: SessionStatus = type === "swap" ? "swapped_by_user" : "added_by_user";
    const { prepareModifiedSession } = await import("../persist");
    const samePrimary =
      !!original && sessionPrescription(original) === sessionPrescription(session);
    const prepared = prepareModifiedSession(
      user.id,
      current.dayDbId,
      { ...session, planDbId: current.planDbId, cycleId: current.cycleId },
      samePrimary ? original?.dbId : undefined,
    );
    const sameSecond =
      !!session.secondSession &&
      !!current.secondSession &&
      sessionPrescription(session.secondSession) === sessionPrescription(current.secondSession);
    const second = session.secondSession
      ? prepareModifiedSession(
          user.id,
          current.dayDbId,
          session.secondSession,
          sameSecond ? current.secondSession?.dbId : undefined,
        )
      : null;
    prepared.session.secondSession = second?.session ?? null;
    const replaceSecond =
      type === "swap" &&
      JSON.stringify(current.secondSession) !== JSON.stringify(session.secondSession);
    const mod: SessionModification = {
      id,
      date,
      type,
      reason,
      safetyStatus,
      session: prepared.session,
      originalSession: original,
      createdAt: new Date().toISOString(),
    };
    const retained = (state.modifications[date] ?? []).filter(
      (item) =>
        !(type === "swap" && item.type === "swap") && !(replaceSecond && item.type === "add"),
    );
    const changedDay = resolveModifiedDay(sourceDay ?? current, [...retained, mod]);
    const effective = resolveEffectivePlan(state.plan, state.modifications);
    const blockReason = gymChangeBlockReason(effective, date, changedDay);
    if (blockReason) throw new Error(blockReason);
    if (state.profile)
      assertSafePlanChange(
        effective,
        effective.map((day) => (day.date === date ? changedDay : day)),
        state.profile,
      );
    const expectedPlanId = current.planDbId ?? sourceDay?.planDbId;
    if (!expectedPlanId) throw new Error("Odśwież plan przed zapisaniem zmiany.");
    const result = await supabase.rpc("apply_plan_modification", {
      p_operation_id: id,
      p_expected_plan_id: expectedPlanId,
      p_modification: {
        id,
        user_id: user.id,
        date,
        type,
        reason,
        safety_status: safetyStatus,
        original_session_id: original?.dbId ?? null,
        new_session_id: prepared.session.dbId,
        original_session_json: original,
        new_session_json: prepared.session,
        active: true,
        replace_second: replaceSecond,
      } as unknown as Json,
      p_session: prepared.row as unknown as Json,
      p_exercises: prepared.exercises as unknown as Json,
      p_second_session: (second?.row as unknown as Json) ?? undefined,
      p_second_exercises: (second?.exercises ?? []) as unknown as Json,
    });
    assertNoSupabaseError("apply_plan_modification", result.error);
    setState((currentState) => ({
      ...currentState,
      modifications: {
        ...currentState.modifications,
        [date]: [
          ...(currentState.modifications[date] ?? []).filter(
            (item) =>
              !(type === "swap" && item.type === "swap") && !(replaceSecond && item.type === "add"),
          ),
          mod,
        ],
      },
    }));
  }

  async function undoModification(date: string, id: string) {
    if (!user) return;
    const modification = (state.modifications[date] ?? []).find((item) => item.id === id);
    const resultId = modification?.session.dbId;
    const log = resultId ? state.completions[resultId] : undefined;
    const ownsNewSession = resultId && resultId !== modification?.originalSession?.dbId;
    if (ownsNewSession && (log?.completed || log?.status === "started"))
      throw new Error("Nie można usunąć rozpoczętej lub ukończonej sesji przez cofnięcie zmiany.");
    const oldSecond = modification?.session.secondSession;
    const secondLog = oldSecond?.dbId ? state.completions[oldSecond.dbId] : undefined;
    if (secondLog?.completed || secondLog?.status === "started")
      throw new Error("Nie można cofnąć zmiany obejmującej rozpoczętą lub ukończoną drugą sesję.");
    const deactivate = await supabase.rpc("undo_plan_modification", {
      p_modification_id: id,
      p_operation_id: crypto.randomUUID(),
      p_expected_plan_id: state.plan[0]?.planDbId,
    });
    assertNoSupabaseError("undo_plan_modification", deactivate.error);
    // Rows and results are archival records; undo only changes the active overlay.
    const modifiedSessionId: string | undefined = undefined;
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
  ): Promise<WeeklyConfirmation> {
    if (!user) throw new Error("Zaloguj się, żeby zapisać tydzień.");
    const profile = state.profile;
    if (!profile) throw new Error("Najpierw uzupełnij profil.");
    const [{ weekRanges }, { stageMonthlyPlan }] = await Promise.all([
      import("../planEngine"),
      import("../persist"),
    ]);

    // weekNumber = indeks (0-based) ODBLOKOWYWANEGO tygodnia kalendarzowego.
    // Wyznaczamy jego przedział w planie wg granic poniedziałek–niedziela.
    let current = state.plan;
    const normalizedMatchDates = noMatchNextWeek ? [] : normalizeMatchDates(nextMatchDates);
    const bounds = weeklyConfirmationBounds(
      current.map((day) => day.date),
      weekNumber,
    );
    if (
      normalizedMatchDates.some((date) => date < bounds.startDate || date > bounds.endDate) ||
      (!noMatchNextWeek && !normalizedMatchDates.length)
    )
      throw new Error("Wybierz daty meczów w podanym tygodniu.");
    const lastDate = current[current.length - 1].date;
    const knownDates = normalizeMatchDates(
      [
        ...(profile.matchDates ?? []),
        ...(profile.matchDate ? [profile.matchDate] : []),
        ...current.filter((day) => day.dayType === "match").map((day) => day.date),
        ...Object.entries(state.transitions)
          .filter(([key, item]) => transitionMatchesBlock(state.plan, item, Number(key)))
          .flatMap(
            ([, item]) => item.nextMatchDates ?? (item.nextMatchDate ? [item.nextMatchDate] : []),
          ),
      ],
      64,
    ).filter((date) => date < bounds.startDate || date > bounds.endDate);
    const dates = normalizeMatchDates([...knownDates, ...normalizedMatchDates], 64);
    if (lastDate < bounds.endDate) {
      const extensionDays = Math.round(
        (Date.parse(`${bounds.endDate}T12:00:00Z`) - Date.parse(`${lastDate}T12:00:00Z`)) /
          86_400_000,
      );
      if (extensionDays > 13) throw new Error("Najpierw przygotuj poprzedni tydzień.");
      const extension = await generatePlanAsync(
        {
          ...profile,
          usualMatchDay: "no_fixed_day",
          matchDate: dates[0] ?? null,
          matchDates: dates,
        },
        parseIso(addIsoDays(lastDate, 1)),
        extensionDays,
        Math.max(0, weekNumber - 1),
      );
      current = repairSegmentBoundaries(
        [...current, ...extension],
        extension.map((day) => day.date),
      );
    }
    let newPlan = current;
    const planStart = current[0] ? parseIso(current[0].date) : null;
    const ranges = planStart ? weekRanges(planStart, current.length) : [];
    const range = ranges[weekNumber];

    if (!range || !current[range.start]) throw new Error("Nie znaleziono tygodnia. Odśwież plan.");
    const startDate = current[range.start].date;
    const endDate = current[range.end - 1].date;
    if (
      normalizedMatchDates.some((date) => date < startDate || date > endDate) ||
      (!noMatchNextWeek && normalizedMatchDates.length === 0)
    )
      throw new Error("Wybierz daty meczów w podanym tygodniu.");
    if (range && current[range.start]) {
      const startIdx = range.start;
      const weekStart = parseIso(current[startIdx].date);
      // Keep neighboring confirmed matches so Monday still knows about Sunday's load.
      const tempProfile: Profile = {
        ...profile,
        usualMatchDay: "no_fixed_day",
        matchDate: dates[0] ?? null,
        matchDates: dates,
      };
      const regenDays = range.end - range.start;
      const fresh = stampPlanRevision(
        await generatePlanAsync(tempProfile, weekStart, regenDays, weekNumber),
        profile.onboardingRevision ?? null,
        ONBOARDING_SCHEMA_VERSION,
      );
      newPlan = repairSegmentBoundaries(
        [...current.slice(0, startIdx), ...fresh, ...current.slice(startIdx + regenDays)],
        fresh.map((day) => day.date),
      );
      newPlan = reconcilePlanIdentity(newPlan, current, state.completions, context.todayIso);
      newPlan = stampPlanRevision(
        newPlan,
        profile.onboardingRevision ?? null,
        ONBOARDING_SCHEMA_VERSION,
      );
      assertSafePlanChange(current, newPlan, { ...profile, matchDate: null, matchDates: [] });
      const effectiveNew = resolveEffectivePlan(newPlan, state.modifications);
      for (const matchDate of normalizedMatchDates) {
        if (effectiveNew.find((day) => day.date === matchDate)?.dayType !== "match")
          throw new Error(
            "Zapisana zmiana sesji koliduje z nowym meczem. Cofnij zmianę tego dnia i potwierdź tydzień ponownie.",
          );
      }
      assertSafePlanChange(resolveEffectivePlan(current, state.modifications), effectiveNew, {
        ...profile,
        matchDate: null,
        matchDates: [],
      });
    }

    const id = state.transitions[weekNumber]?.id ?? crypto.randomUUID();
    const transition: WeeklyTransition = {
      id,
      weekNumber,
      cycleId: current[0]?.cycleId,
      weekStart: startDate,
      weekEnd: endDate,
      nextMatchDate: normalizedMatchDates[0] ?? null,
      nextMatchDates: normalizedMatchDates,
      noMatchNextWeek,
      confirmedAt: new Date().toISOString(),
    };

    // Ids come from one small read; the week is shown right away and the atomic
    // snapshot is sent in the background. A failed write restores the old week.
    const staged = await boundedRequest(
      () => stageMonthlyPlan(user.id, profile, newPlan, transition),
      WEEK_STAGE_TIMEOUT_MS,
      WEEK_STAGE_TIMEOUT_MESSAGE,
    );
    const previousPlan = state.plan;
    const previousTransition = state.transitions[weekNumber];
    setState((s) => ({
      ...s,
      plan: staged.plan,
      transitions: { ...s.transitions, [weekNumber]: transition },
    }));
    const saved = queuePlanCommit(staged.commit).then(
      () => undefined,
      (error: unknown) => {
        setState((s) => {
          // A newer change (or a fresh load) owns the plan now; keep it.
          if (s.plan !== staged.plan) return s;
          const transitions = { ...s.transitions };
          if (previousTransition) transitions[weekNumber] = previousTransition;
          else delete transitions[weekNumber];
          return { ...s, plan: previousPlan, transitions };
        });
        throw error instanceof Error
          ? error
          : new Error("Nie udało się zapisać tygodnia. Spróbuj ponownie.");
      },
    );
    return { saved };
  }

  async function saveReadiness(r: Readiness) {
    if (!state.profile?.healthPersonalizationEnabled) {
      throw new Error("Check-in jest wyłączony. Włącz opcjonalną personalizację w profilu.");
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("Check-in zdrowotny wymaga połączenia z internetem.");
    }
    if (user) {
      const write = await supabase.rpc("save_readiness_checkin", {
        p_payload: {
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
        } as unknown as Json,
      });
      assertNoSupabaseError("save_readiness_checkin", write.error);
    }

    setState((s) => {
      const nextReadiness = { ...s.readiness, [r.date]: r };
      const next = { ...s, readiness: nextReadiness };
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
