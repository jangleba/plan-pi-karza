import { isMasTestRecipe } from "../engineV2/masTestRecipe";
import { measureMasEvidence } from "@/lib/running/masQuality";
import { sessionPrescription, trainingProfileRevision } from "../planIdentity";
import { resolveEffectivePlan } from "../effectivePlan";
import { sessionStartIssue } from "../engineV2/planStatus";
import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import { fieldMasFromActivity } from "@/lib/running/engine";
import type { RunningActivity, RunningActivityDraft } from "@/lib/running/types";
import { toast } from "sonner";
import { isRetryableWriteError, withDurableTrainingWrite } from "../offlineTrainingQueue";
import { waitForPlanWrites } from "./planWriteGuard";
import { FEEDBACK_VERSION } from "../sessionFeedback";
import type { Profile, SessionCompletion, SessionDay, SessionHistoryRecord } from "../types";
import {
  findSessionByDbId,
  applyExerciseReplacements,
  historyCategoryOf,
  mapCompletionRows,
  rowToRunningActivity,
  type AnyRow,
  type CompletionDetails,
  type LoadwiseContextValue,
  type StoreActionContext,
} from "./model";

function executionSnapshot(session: SessionDay, slot: 1 | 2 = 1): SessionDay {
  return JSON.parse(
    JSON.stringify({
      ...session,
      executionSlot: slot,
      secondSession: null,
      readinessOriginalSession: null,
      readinessAdjustmentKey: undefined,
    }),
  );
}
function derivedProfile(profile: Profile, row: AnyRow): Profile {
  const next = {
    ...profile,
    serverProfileUpdatedAt:
      (row.updated_at as string | undefined) ?? profile.serverProfileUpdatedAt,
    fieldMasKmh: row.field_mas_kmh == null ? null : Number(row.field_mas_kmh),
    fieldMasTestedAt: row.field_mas_tested_at as string | null,
    fieldMasSourceSessionId: row.field_mas_source_session_id as string | null,
    runningProgressionLevel: Number(row.running_progression_level ?? 0),
    runningProgressionUpdatedAt: row.running_progression_updated_at as string | null,
  };
  return { ...next, onboardingRevision: trainingProfileRevision(next) };
}
function requestRefresh() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("ballwise:server-state-changed"));
}

export function createSessionActions(
  context: StoreActionContext,
): Pick<
  LoadwiseContextValue,
  | "startSession"
  | "skipSession"
  | "completeSession"
  | "saveRunningActivity"
  | "deleteRunningActivity"
> {
  const { user, state, setState } = context;
  const latest = () => context.getState?.() ?? state;
  const slotFor = (session: SessionDay): 1 | 2 =>
    resolveEffectivePlan(latest().plan, latest().modifications).some(
      (day) => day.secondSession?.dbId === session.dbId,
    )
      ? 2
      : 1;

  async function refreshDerived(row: AnyRow | undefined, before: Profile | null) {
    if (!row || !before) {
      requestRefresh();
      return;
    }
    const current = latest();
    if (current.profile !== before) {
      requestRefresh();
      return;
    }
    const profile = derivedProfile(before, row);
    if (trainingProfileRevision(before) === trainingProfileRevision(profile)) return;
    // Results update the input for the next preview; a saved prescription stays intact.
    setState((s) => (s.profile === before ? { ...s, profile } : s));
  }

  async function startSession(session: SessionDay) {
    const sid = session.dbId;
    if (!user || !sid) throw new Error("Nie można rozpocząć tej sesji.");
    // A plan shown right after login or onboarding may still be on its way to the server.
    await waitForPlanWrites(user.id);
    const before = latest();
    const existing = before.completions[sid];
    if (existing?.completed || existing?.status === "started") return;
    const linked = findSessionByDbId(
      resolveEffectivePlan(before.plan, before.modifications, { completions: before.completions }),
      sid,
    );
    const currentSession = linked
      ? applyExerciseReplacements(linked, before.exerciseReplacements[linked.date] ?? [])
      : session;
    if (
      session.engineV2 &&
      (!linked || sessionPrescription(currentSession) !== sessionPrescription(session))
    )
      throw new Error("Plan zmienił się. Otwórz aktualną sesję przed rozpoczęciem treningu.");
    const issue = sessionStartIssue({
      session: currentSession,
      profile: before.profile,
      readiness: before.readiness[currentSession.date],
      todayIso: context.todayIso,
      completion: existing,
    });
    if (issue) throw new Error(issue);
    const startedAt = new Date().toISOString(),
      operationId = crypto.randomUUID();
    const snapshot = executionSnapshot(currentSession, slotFor(currentSession)),
      expectedVersion = existing?.writeVersion ?? 0;
    const payload = {
      user_id: user.id,
      session_id: sid,
      completed: false,
      completion_status: "started",
      rpe: null,
      notes: null,
      duration_minutes: null,
      activity_type: session.dayType === "match" ? "mixed" : null,
      started_at: startedAt,
      ended_at: null,
      updated_at: startedAt,
      execution_snapshot: snapshot as unknown as Json,
    };
    const result = await withDurableTrainingWrite(
      user.id,
      { kind: "session_log", dedupeKey: `session:${sid}`, payload, operationId, expectedVersion },
      (entry) =>
        supabase.rpc("save_training_log", {
          p_operation_id: operationId,
          p_session_id: sid,
          p_expected_version: expectedVersion,
          p_payload: {
            ...payload,
            _predecessor_operation_ids: entry.predecessors ?? [],
          } as unknown as Json,
        }),
    );
    let completion: SessionCompletion = {
      completed: false,
      status: "started",
      rpe: null,
      notes: "",
      durationMin: null,
      activityType: session.dayType === "match" ? "mixed" : null,
      startedAt,
      endedAt: null,
      executionSnapshot: snapshot,
      writeVersion: expectedVersion,
    };
    if (result.error) {
      if (!isRetryableWriteError(result.error))
        assertNoSupabaseError("save_training_log.start", result.error);
      toast.info("Brak internetu — początek treningu zapisano na tym telefonie.");
    } else if (result.data)
      completion = mapCompletionRows([result.data as AnyRow])[sid] ?? completion;
    setState((s) =>
      s.completions[sid]?.completed
        ? s
        : { ...s, completions: { ...s.completions, [sid]: completion } },
    );
  }

  /**
   * Skipping is a recorded fact, not a reschedule: the session stays in the plan as skipped and no
   * overdue work is moved to another day. A started or finished session cannot be skipped.
   */
  async function skipSession(session: SessionDay) {
    const sid = session.dbId;
    if (!user || !sid) throw new Error("Nie można opuścić tej sesji.");
    await waitForPlanWrites(user.id);
    const existing = latest().completions[sid];
    if (existing?.completed || existing?.status === "started" || existing?.status === "missed")
      return;
    if (session.date !== context.todayIso) throw new Error("Opuścić można tylko dzisiejszą sesję.");
    if (!session.engineV2) throw new Error("Opuścić można tylko własny trening z planu.");
    const at = new Date().toISOString(),
      operationId = crypto.randomUUID(),
      expectedVersion = existing?.writeVersion ?? 0;
    const snapshot = executionSnapshot(session, slotFor(session));
    const payload = {
      user_id: user.id,
      session_id: sid,
      completed: false,
      completion_status: "missed",
      rpe: null,
      notes: null,
      duration_minutes: null,
      activity_type: null,
      started_at: null,
      ended_at: null,
      updated_at: at,
      execution_snapshot: snapshot as unknown as Json,
    };
    const result = await withDurableTrainingWrite(
      user.id,
      { kind: "session_log", dedupeKey: `session:${sid}`, payload, operationId, expectedVersion },
      (entry) =>
        supabase.rpc("save_training_log", {
          p_operation_id: operationId,
          p_session_id: sid,
          p_expected_version: expectedVersion,
          p_payload: {
            ...payload,
            _predecessor_operation_ids: entry.predecessors ?? [],
          } as unknown as Json,
        }),
    );
    let completion: SessionCompletion = {
      completed: false,
      status: "missed",
      rpe: null,
      notes: "",
      durationMin: null,
      startedAt: null,
      endedAt: null,
      executionSnapshot: snapshot,
      writeVersion: expectedVersion,
    };
    if (result.error) {
      if (!isRetryableWriteError(result.error))
        assertNoSupabaseError("save_training_log.skip", result.error);
      toast.info("Brak internetu — opuszczenie zapisano na tym telefonie.");
    } else if (result.data)
      completion = mapCompletionRows([result.data as AnyRow])[sid] ?? completion;
    setState((s) =>
      s.completions[sid]?.completed || s.completions[sid]?.status === "started"
        ? s
        : { ...s, completions: { ...s.completions, [sid]: completion } },
    );
  }

  async function completeSession(
    session: SessionDay,
    rpe: number | null,
    notes: string,
    details: CompletionDetails = {},
  ) {
    const sid = session.dbId;
    if (!user || !sid) throw new Error("Nie można zapisać tej sesji.");
    await waitForPlanWrites(user.id);
    const before = latest(),
      existing = before.completions[sid],
      operationId = crypto.randomUUID();
    const endedAt = new Date().toISOString(),
      expectedVersion = existing?.writeVersion ?? 0;
    const snapshot = existing?.executionSnapshot ?? executionSnapshot(session, slotFor(session));
    let completion: SessionCompletion = {
      completed: true,
      status: "completed",
      rpe,
      notes,
      durationMin: details.durationMin ?? existing?.durationMin ?? null,
      durationSource:
        details.durationSource ??
        (details.durationMin == null ? (existing?.durationSource ?? null) : "user"),
      activityType: details.activityType ?? null,
      activityTags: details.activityTags ?? existing?.activityTags ?? null,
      matchMinutesPlayed:
        details.matchMinutesPlayed === undefined
          ? (existing?.matchMinutesPlayed ?? null)
          : details.matchMinutesPlayed,
      // A legacy RPE 0 cannot be re-saved under the 1–10 contract; keep its old version.
      feedbackVersion: rpe === 0 ? (existing?.feedbackVersion ?? null) : FEEDBACK_VERSION,
      startedAt: existing?.startedAt ?? endedAt,
      endedAt,
      executionSnapshot: snapshot,
      writeVersion: expectedVersion,
    };
    const payload = {
      user_id: user.id,
      session_id: sid,
      completed: true,
      completion_status: "completed",
      rpe,
      notes,
      duration_minutes: completion.durationMin,
      activity_type: completion.activityType,
      activity_tags: completion.activityTags ?? null,
      duration_source: completion.durationSource ?? null,
      match_minutes_played: completion.matchMinutesPlayed ?? null,
      feedback_version: completion.feedbackVersion ?? null,
      started_at: completion.startedAt,
      ended_at: endedAt,
      updated_at: endedAt,
      execution_snapshot: snapshot as unknown as Json,
    };
    const result = await withDurableTrainingWrite(
      user.id,
      { kind: "session_log", dedupeKey: `session:${sid}`, payload, operationId, expectedVersion },
      (entry) =>
        supabase.rpc("save_training_log", {
          p_operation_id: operationId,
          p_session_id: sid,
          p_expected_version: expectedVersion,
          p_payload: {
            ...payload,
            _predecessor_operation_ids: entry.predecessors ?? [],
          } as unknown as Json,
        }),
    );
    if (result.error) {
      if (!isRetryableWriteError(result.error))
        assertNoSupabaseError("save_training_log.complete", result.error);
      toast.info("Brak internetu — ukończenie zapisano i zsynchronizuje się później.");
    } else if (result.data)
      completion = mapCompletionRows([result.data as AnyRow])[sid] ?? completion;
    const category = historyCategoryOf(snapshot.type ?? snapshot.sessionType, snapshot.dayType);
    const record: SessionHistoryRecord | null = category
      ? {
          key: sid,
          date: session.date,
          title: snapshot.title,
          category,
          durationMin: completion.durationMin ?? 0,
          durationEstimated:
            completion.durationMin == null || completion.durationSource === "club_default",
          matchMinutesPlayed: completion.matchMinutesPlayed ?? null,
          rpe: completion.rpe,
          notes: completion.notes,
        }
      : null;
    setState((s) => ({
      ...s,
      completions: { ...s.completions, [sid]: completion },
      history: record
        ? [record, ...s.history.filter((item) => item.key !== sid)].sort((a, b) =>
            b.date.localeCompare(a.date),
          )
        : s.history,
    }));
    if (!result.error)
      await refreshDerived(
        (result.data as AnyRow | null)?.profile as AnyRow | undefined,
        before.profile,
      );
  }

  async function saveRunningActivity(draft: RunningActivityDraft) {
    if (!user) throw new Error("Musisz być zalogowany, aby zapisać bieg.");
    const before = latest(),
      linked = findSessionByDbId(
        resolveEffectivePlan(before.plan, before.modifications),
        draft.sessionId,
      );
    const masTestAttempt =
      linked?.classification?.subcategory === "field_mas_test" ||
      isMasTestRecipe(linked?.runningRecipe);
    const masTestEvidence = masTestAttempt
      ? (draft.masTestEvidence ?? measureMasEvidence(draft))
      : null;
    const isMas = masTestAttempt && fieldMasFromActivity({ ...draft, masTestEvidence }) !== null;
    const operationId = crypto.randomUUID(),
      updatedAt = new Date().toISOString();
    const prior = before.runningActivities[draft.sessionId],
      expectedVersion = prior?.writeVersion ?? 0;
    const payload = {
      id: prior?.id ?? crypto.randomUUID(),
      user_id: user.id,
      session_id: draft.sessionId,
      date: draft.date,
      duration_sec: draft.durationSec,
      distance_m: draft.distanceM,
      avg_pace_sec_per_km: draft.avgPaceSecPerKm,
      is_field_mas_test: isMas,
      mas_test_attempt: masTestAttempt,
      mas_test_evidence: masTestEvidence as unknown as Json,
      updated_at: updatedAt,
      started_at: draft.startedAt,
      ended_at: draft.endedAt,
      interval_results: draft.intervalResults as unknown as Json,
    };
    const write = await withDurableTrainingWrite(
      user.id,
      {
        kind: "running_activity",
        dedupeKey: `running:${draft.sessionId}`,
        payload,
        operationId,
        expectedVersion,
      },
      (entry) =>
        supabase.rpc("save_running_result", {
          p_operation_id: operationId,
          p_expected_version: expectedVersion,
          p_payload: {
            ...payload,
            _predecessor_operation_ids: entry.predecessors ?? [],
          } as unknown as Json,
        }),
    );
    let stored: RunningActivity | null;
    if (write.error) {
      if (!isRetryableWriteError(write.error))
        assertNoSupabaseError("save_running_result", write.error);
      stored = {
        ...draft,
        id: payload.id,
        createdAt: updatedAt,
        updatedAt,
        writeVersion: expectedVersion,
      };
      toast.info(
        "Brak internetu — wynik biegu zapisano na tym telefonie. Parametry planu odświeżą się po synchronizacji.",
      );
    } else {
      const data = write.data as AnyRow | null;
      stored = data?.activity ? rowToRunningActivity(data.activity as AnyRow) : null;
    }
    if (!stored) throw new Error("Baza zwróciła nieprawidłowy zapis biegu.");
    const activity: RunningActivity = {
      ...stored,
      route: draft.route,
      splits: draft.splits,
      intervalResults: draft.intervalResults,
      source: draft.source,
      isFieldMasTest: isMas,
      masTestAttempt,
      masTestEvidence,
    };
    setState((s) => ({
      ...s,
      runningActivities: { ...s.runningActivities, [activity.sessionId]: activity },
    }));
    if (!write.error)
      await refreshDerived(
        (write.data as AnyRow | null)?.profile as AnyRow | undefined,
        before.profile,
      );
  }

  async function deleteRunningActivity(activityId: string) {
    if (!user) throw new Error("Musisz być zalogowany, aby usunąć bieg.");
    const before = latest();
    const activity = Object.values(before.runningActivities).find((item) => item.id === activityId);
    const remove = await supabase.rpc("delete_running_activity_atomic", {
      p_activity_id: activityId,
    });
    assertNoSupabaseError("running_activities.delete", remove.error);
    setState((s) => {
      const runningActivities = { ...s.runningActivities };
      if (activity) delete runningActivities[activity.sessionId];
      return { ...s, runningActivities };
    });
    requestRefresh();
  }
  return { startSession, skipSession, completeSession, saveRunningActivity, deleteRunningActivity };
}
