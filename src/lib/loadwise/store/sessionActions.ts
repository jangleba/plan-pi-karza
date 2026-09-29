import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import { fieldMasFromActivity, nextRunningProgressionLevel } from "@/lib/running/engine";
import type { RunningActivity, RunningActivityDraft } from "@/lib/running/types";
import { toast } from "sonner";
import { adaptMdPlusOneFromMatchMinutes } from "../adaptiveWeek";
import { enqueueTrainingWrite, isRetryableWriteError } from "../offlineTrainingQueue";
import type { SessionCompletion, SessionDay, SessionHistoryRecord } from "../types";
import {
  findSessionByDbId,
  historyCategoryOf,
  rowToRunningActivity,
  type AnyRow,
  type LoadwiseContextValue,
  type StoreActionContext,
} from "./model";

export function createSessionActions(
  context: StoreActionContext,
): Pick<
  LoadwiseContextValue,
  "startSession" | "completeSession" | "saveRunningActivity" | "deleteRunningActivity"
> {
  const { user, state, setState, todayIso, saveProfileRows, savePlanToDb } = context;
  async function startSession(session: SessionDay) {
    const sid = session.dbId;
    if (!user || !sid) throw new Error("Nie można rozpocząć tej sesji.");
    const existing = state.completions[sid];
    if (existing?.completed || existing?.status === "started") return;

    const startedAt = new Date().toISOString();
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
    };
    const result = await supabase
      .from("session_logs")
      .upsert(payload, { onConflict: "user_id,session_id" });
    if (result.error) {
      const queued =
        isRetryableWriteError(result.error) &&
        enqueueTrainingWrite(user.id, {
          kind: "session_log",
          dedupeKey: `session:${sid}`,
          payload,
        });
      if (!queued) assertNoSupabaseError("session_logs.start", result.error);
      toast.info("Brak internetu — początek treningu zapisano na tym telefonie.");
    }
    setState((current) => ({
      ...current,
      completions: {
        ...current.completions,
        [sid]: {
          completed: false,
          status: "started",
          rpe: null,
          notes: "",
          durationMin: null,
          activityType: session.dayType === "match" ? "mixed" : null,
          startedAt,
          endedAt: null,
        },
      },
    }));
  }

  async function completeSession(
    session: SessionDay,
    rpe: number | null,
    notes: string,
    details: Pick<SessionCompletion, "durationMin" | "activityType"> = {},
  ) {
    const sid = session.dbId;
    if (!user || !sid) return;
    const completion: SessionCompletion = {
      completed: true,
      status: "completed",
      rpe,
      notes,
      durationMin: details.durationMin ?? session.durationMin ?? null,
      activityType: details.activityType ?? null,
      startedAt: state.completions[sid]?.startedAt ?? null,
      endedAt: new Date().toISOString(),
    };
    const category = historyCategoryOf(session.sessionType, session.dayType);
    const record: SessionHistoryRecord | null = category
      ? {
          key: sid,
          date: session.date,
          title: session.title,
          category,
          durationMin: completion.durationMin ?? session.durationMin ?? 0,
          rpe,
          notes,
        }
      : null;
    const payload = {
      user_id: user.id,
      session_id: sid,
      completed: true,
      completion_status: "completed",
      rpe,
      notes,
      duration_minutes: completion.durationMin,
      activity_type: completion.activityType,
      started_at: completion.startedAt ?? completion.endedAt,
      ended_at: completion.endedAt,
      updated_at: new Date().toISOString(),
    };
    const result = await supabase
      .from("session_logs")
      .upsert(payload, { onConflict: "user_id,session_id" });
    let completionQueued = false;
    if (result.error) {
      completionQueued =
        isRetryableWriteError(result.error) &&
        enqueueTrainingWrite(user.id, {
          kind: "session_log",
          dedupeKey: `session:${sid}`,
          payload,
        });
      if (!completionQueued) assertNoSupabaseError("session_logs.upsert", result.error);
      toast.info("Brak internetu — ukończenie zapisano i zsynchronizuje się później.");
    }
    let updatedProfile = state.profile;
    const runningActivity = state.runningActivities[sid];
    if (
      updatedProfile &&
      runningActivity &&
      session.classification?.isEndurance &&
      session.classification.subcategory !== "field_mas_test"
    ) {
      const nextLevel = nextRunningProgressionLevel({
        currentLevel: updatedProfile.runningProgressionLevel ?? 0,
        rpe,
        results: runningActivity.intervalResults,
      });
      if (nextLevel !== (updatedProfile.runningProgressionLevel ?? 0)) {
        const updatedAt = new Date().toISOString();
        updatedProfile = {
          ...updatedProfile,
          runningProgressionLevel: nextLevel,
          runningProgressionUpdatedAt: updatedAt,
        };
      }
    }
    if (updatedProfile && updatedProfile !== state.profile) {
      if (completionQueued) {
        enqueueTrainingWrite(user.id, {
          kind: "running_progression",
          dedupeKey: "running-progression",
          payload: {
            running_progression_level: updatedProfile.runningProgressionLevel ?? 0,
            running_progression_updated_at: updatedProfile.runningProgressionUpdatedAt ?? null,
          },
        });
      } else {
        const revision = await saveProfileRows(updatedProfile, true);
        updatedProfile = { ...updatedProfile, onboardingRevision: revision };
      }
    }
    const refreshedPlan =
      !completionQueued && updatedProfile && updatedProfile !== state.profile
        ? await savePlanToDb(updatedProfile, updatedProfile.onboardingRevision ?? null)
        : state.plan;
    setState((s) => {
      const nextCompletions = { ...s.completions, [sid]: completion };
      const matchMinuteAdjustment = adaptMdPlusOneFromMatchMinutes(
        refreshedPlan,
        nextCompletions,
        s.readiness,
      );
      return {
        ...s,
        profile: updatedProfile,
        plan: matchMinuteAdjustment.plan,
        planGeneratedFor: updatedProfile !== state.profile ? todayIso : s.planGeneratedFor,
        completions: nextCompletions,
        history: record
          ? [record, ...s.history.filter((item) => item.key !== sid)].sort((a, b) =>
              a.date < b.date ? 1 : -1,
            )
          : s.history,
        planChangeEvents: [
          ...(s.planChangeEvents ?? []).filter((event) => event.source !== "match_minutes"),
          ...matchMinuteAdjustment.events,
        ],
      };
    });
  }

  async function saveRunningActivity(draft: RunningActivityDraft) {
    if (!user) throw new Error("Musisz być zalogowany, aby zapisać bieg.");
    const linkedSessionBeforeSave = findSessionByDbId(state.plan, draft.sessionId);
    const pendingFieldMas =
      linkedSessionBeforeSave?.classification?.subcategory === "field_mas_test"
        ? fieldMasFromActivity(draft as RunningActivity)
        : null;
    if (
      linkedSessionBeforeSave?.classification?.subcategory === "field_mas_test" &&
      !pendingFieldMas
    ) {
      throw new Error(
        "Test 5-minutowy nie ma pełnego, wiarygodnego odcinka GPS. Powtórz test na otwartej przestrzeni.",
      );
    }
    if (
      linkedSessionBeforeSave?.classification?.subcategory === "field_mas_test" &&
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      throw new Error(
        "Test 5-minutowy wymaga internetu do bezpiecznego zapisania i przeliczenia planu.",
      );
    }
    const activityId = crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    const payload = {
      id: activityId,
      user_id: user.id,
      session_id: draft.sessionId,
      date: draft.date,
      duration_sec: draft.durationSec,
      distance_m: draft.distanceM,
      avg_pace_sec_per_km: draft.avgPaceSecPerKm,
      is_field_mas_test: linkedSessionBeforeSave?.classification?.subcategory === "field_mas_test",
      updated_at: updatedAt,
    };
    const write = await supabase
      .from("running_activities")
      .upsert(payload, { onConflict: "user_id,session_id" })
      .select("*")
      .single();
    let storedActivity = write.error ? null : rowToRunningActivity(write.data as AnyRow);
    if (write.error) {
      const isMas = linkedSessionBeforeSave?.classification?.subcategory === "field_mas_test";
      const queued =
        !isMas &&
        isRetryableWriteError(write.error) &&
        enqueueTrainingWrite(user.id, {
          kind: "running_activity",
          dedupeKey: `running:${draft.sessionId}`,
          payload,
        });
      if (!queued) assertNoSupabaseError("running_activities.upsert", write.error);
      storedActivity = {
        id: activityId,
        sessionId: draft.sessionId,
        date: draft.date,
        startedAt: draft.startedAt,
        endedAt: draft.endedAt,
        durationSec: draft.durationSec,
        distanceM: draft.distanceM,
        avgPaceSecPerKm: draft.avgPaceSecPerKm,
        route: [],
        splits: [],
        intervalResults: [],
        source: draft.source,
        createdAt: updatedAt,
        updatedAt,
      };
      toast.info("Brak internetu — wynik biegu zapisano na tym telefonie.");
    }
    if (!storedActivity) throw new Error("Baza zwróciła nieprawidłowy zapis biegu.");
    // Trasa i odcinki żyją tylko w pamięci bieżącej sesji. Do bazy trafiają
    // wyłącznie trzy wyniki widoczne dla użytkownika.
    const activity: RunningActivity = {
      ...storedActivity,
      startedAt: draft.startedAt,
      endedAt: draft.endedAt,
      route: draft.route,
      splits: draft.splits,
      intervalResults: draft.intervalResults,
      source: draft.source,
    };
    const linkedSession = findSessionByDbId(state.plan, activity.sessionId);
    let updatedProfile = state.profile;
    if (linkedSession?.classification?.subcategory === "field_mas_test" && updatedProfile) {
      const fieldMasKmh = pendingFieldMas;
      if (!fieldMasKmh) throw new Error("Nie udało się wyliczyć terenowego MAS.");
      const testedAt = activity.date;
      updatedProfile = {
        ...updatedProfile,
        fieldMasKmh,
        fieldMasTestedAt: testedAt,
        runningProgressionLevel: 0,
        runningProgressionUpdatedAt: testedAt,
      };
    }
    if (updatedProfile && updatedProfile !== state.profile) {
      const revision = await saveProfileRows(updatedProfile, true);
      updatedProfile = { ...updatedProfile, onboardingRevision: revision };
    }
    const refreshedPlan =
      updatedProfile && updatedProfile !== state.profile
        ? await savePlanToDb(updatedProfile, updatedProfile.onboardingRevision ?? null)
        : state.plan;
    setState((current) => ({
      ...current,
      profile: updatedProfile,
      plan: refreshedPlan,
      planGeneratedFor: updatedProfile !== state.profile ? todayIso : current.planGeneratedFor,
      runningActivities: {
        ...current.runningActivities,
        [activity.sessionId]: activity,
      },
    }));
  }

  async function deleteRunningActivity(activityId: string) {
    if (!user) throw new Error("Musisz być zalogowany, aby usunąć bieg.");
    const activity = Object.values(state.runningActivities).find((item) => item.id === activityId);
    const linkedSession = activity ? findSessionByDbId(state.plan, activity.sessionId) : null;
    const remove = await supabase
      .from("running_activities")
      .delete()
      .eq("id", activityId)
      .eq("user_id", user.id);
    assertNoSupabaseError("running_activities.delete", remove.error);
    if (!activity) return;
    let updatedProfile = state.profile;
    let refreshedPlan = state.plan;
    if (linkedSession?.classification?.subcategory === "field_mas_test" && updatedProfile) {
      updatedProfile = {
        ...updatedProfile,
        fieldMasKmh: null,
        fieldMasTestedAt: null,
        runningProgressionLevel: 0,
        runningProgressionUpdatedAt: null,
      };
      const revision = await saveProfileRows(updatedProfile, true);
      updatedProfile = { ...updatedProfile, onboardingRevision: revision };
      refreshedPlan = await savePlanToDb(updatedProfile, revision);
    }
    setState((current) => {
      const runningActivities = { ...current.runningActivities };
      delete runningActivities[activity.sessionId];
      return {
        ...current,
        profile: updatedProfile,
        plan: refreshedPlan,
        planGeneratedFor: refreshedPlan !== current.plan ? todayIso : current.planGeneratedFor,
        runningActivities,
      };
    });
  }
  return { startSession, completeSession, saveRunningActivity, deleteRunningActivity };
}
