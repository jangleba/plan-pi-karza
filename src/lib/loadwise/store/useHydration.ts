import { readPendingTrainingWrites, recoverTrainingQueue } from "../offlineTrainingQueue";
import { readAllPages } from "../pagination";
import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { RunningActivity } from "@/lib/running/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { stateWithoutHealthData } from "../localPrivacy";
import { clearBootState, loadBootState } from "../bootCache";
import { primeConsentRows } from "../legalStatus";
import {
  mergeHydratedRecord,
  mergeHydratedHistory,
  mergeHydratedState,
  mergePendingCompletionRows,
} from "./hydrationMerge";
import type { LoadwiseState } from "../types";
import { waitForPlanWrites } from "./planWriteGuard";
import type {
  ExerciseReplacement,
  Profile,
  Readiness,
  SessionDay,
  SessionModification,
} from "../types";
import { loadLocal, type LocalState } from "./localState";
import {
  buildProfile,
  initialState,
  mapCompletionRows,
  rowToExerciseReplacement,
  rowToModification,
  rowToRunningActivity,
  type AnyRow,
  type StateSetter,
  type StoreUser,
} from "./model";
import { loadSessionHistory } from "./repository";
import { loadV2Plan } from "../engineV2/persistence";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
interface HydrationOptions {
  user: StoreUser;
  authLoading: boolean;
  recoveryMode: boolean;
  profileWritePending?: boolean;
  setState: StateSetter;
  state: LoadwiseState;
  setSyncing?: (value: boolean) => void;
  setHydrationError?: (value: string | null) => void;
}

export function useHydration({
  user,
  authLoading,
  recoveryMode,
  profileWritePending = false,
  setState,
  state,
  setSyncing,
  setHydrationError,
}: HydrationOptions) {
  const [hydrated, setHydrated] = useState(false);
  const [refreshRevision, refresh] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastRefresh = 0;
    const revalidate = (event?: Event) => {
      if (document.visibilityState === "hidden" || navigator.onLine === false) return;
      if (!event?.type.startsWith("ballwise:") && Date.now() - lastRefresh < 2000) return;
      lastRefresh = Date.now();
      refresh((value) => value + 1);
    };
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    window.addEventListener("ballwise:training-synced", revalidate);
    window.addEventListener("ballwise:server-state-changed", revalidate);
    window.addEventListener("ballwise:consent-changed", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      window.removeEventListener("ballwise:training-synced", revalidate);
      window.removeEventListener("ballwise:server-state-changed", revalidate);
      window.removeEventListener("ballwise:consent-changed", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, []);
  const activeUserIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useClientLayoutEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (authLoading) return;
    if (recoveryMode) {
      setSyncing?.(false);
      setHydrated(false);
      return;
    }
    if (!user) {
      if (activeUserIdRef.current) clearBootState(activeUserIdRef.current);
      activeUserIdRef.current = null;
      setState(initialState);
      setSyncing?.(false);
      setHydrationError?.(null);
      setHydrated(true);
      return;
    }
    // A profile command owns the transition: cancel previous reads and do not launch a new full hydration mid-save.
    if (profileWritePending) {
      setSyncing?.(false);
      return;
    }
    const sameUser = activeUserIdRef.current === user.id;
    activeUserIdRef.current = user.id;
    setSyncing?.(true);
    setHydrationError?.(null);
    primeConsentRows(user.id);
    const cachedState =
      sameUser && stateRef.current.profile ? stateRef.current : loadBootState(user.id);
    const baselineState = cachedState ?? initialState;
    let pendingAtStart = readPendingTrainingWrites(user.id);
    const timeout = setTimeout(() => controller.abort(), 15_000);
    if (cachedState) {
      setState(cachedState);
      setHydrated(true);
    } else {
      setState(initialState);
      setHydrated(false);
    }
    (async () => {
      let safeProfile: Profile | null = cachedState?.profile ?? null;
      const safeLocal: LocalState = loadLocal(user.id);
      try {
        // A plan saved in the background by the previous load must land before this read.
        await Promise.all([recoverTrainingQueue(user.id), waitForPlanWrites(user.id)]);
        if (cancelled) return;
        pendingAtStart = readPendingTrainingWrites(user.id);
        // Restore locally committed results even when all following remote reads fail offline.
        if (pendingAtStart.length)
          setState((current) => {
            const localRuns = { ...current.runningActivities };
            for (const write of pendingAtStart)
              if (write.kind === "running_activity") {
                const activity = rowToRunningActivity({
                  ...write.payload,
                  write_version: write.expectedVersion ?? write.payload.write_version ?? 0,
                } as AnyRow);
                if (activity) localRuns[activity.sessionId] = activity;
              }
            const localCompletions = mapCompletionRows(
              mergePendingCompletionRows([], pendingAtStart),
            );
            return {
              ...current,
              runningActivities: localRuns,
              completions: { ...current.completions, ...localCompletions },
            };
          });
        // Run summaries are used by Progress, not to decide today's plan. Their
        // paginated history must never hold the whole application on the splash.
        const runningController = new AbortController();
        const cancelRunning = () => runningController.abort();
        controller.signal.addEventListener("abort", cancelRunning, { once: true });
        const runningTimeout = setTimeout(cancelRunning, 15_000);
        const runningPromise = readAllPages(
          (from, to) =>
            supabase
              .from("running_activities")
              .select(
                "id,session_id,date,started_at,ended_at,duration_sec,distance_m,avg_pace_sec_per_km,interval_results,is_field_mas_test,created_at,updated_at,write_version",
              )
              .abortSignal(runningController.signal)
              .eq("user_id", user.id)
              .order("date", { ascending: false })
              .order("id", { ascending: true })
              .range(from, to),
          runningController.signal,
        )
          .catch(() => null)
          .finally(() => {
            clearTimeout(runningTimeout);
            controller.signal.removeEventListener("abort", cancelRunning);
          });
        const [profRes, athRes, onboardingRes, logRes, modRes, replacementRes, readinessRes, savedV2] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("*")
              .abortSignal(controller.signal)
              .eq("user_id", user.id)
              .maybeSingle(),
            supabase
              .from("athlete_profiles")
              .select("*")
              .abortSignal(controller.signal)
              .eq("user_id", user.id)
              .maybeSingle(),
            supabase
              .from("onboarding_answers")

              .select("answers_json")
              .abortSignal(controller.signal)
              .eq("user_id", user.id)
              .order("completed_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            readAllPages(
              (from, to) =>
                supabase
                  .from("session_logs")

                  .select(
                    "session_id, completed, completion_status, rpe, notes, duration_minutes, activity_type, activity_tags, duration_source, match_minutes_played, feedback_version, started_at, ended_at, updated_at, execution_snapshot, write_version",
                  )
                  .abortSignal(controller.signal)
                  .eq("user_id", user.id)
                  .gte("updated_at", new Date(Date.now() - 45 * 86400000).toISOString())
                  .order("id", { ascending: true })
                  .range(from, to),
              controller.signal,
            ),
            readAllPages(
              (from, to) =>
                supabase
                  .from("session_modifications")

                  .select("*")
                  .abortSignal(controller.signal)
                  .eq("user_id", user.id)
                  .eq("active", true)
                  .order("created_at", { ascending: true })
                  .order("id", { ascending: true })
                  .range(from, to),
              controller.signal,
            ),
            readAllPages(
              (from, to) =>
                supabase
                  .from("exercise_replacements")

                  .select("*")
                  .abortSignal(controller.signal)
                  .eq("user_id", user.id)
                  .eq("active", true)
                  .order("created_at", { ascending: true })
                  .order("id", { ascending: true })
                  .range(from, to),
              controller.signal,
            ),
            supabase
              .from("readiness_logs")

              .select(
                "date, sleep, energy, fatigue, soreness, stress, pain_level, pain_location, pain_onset, alters_movement, red_flags, overall",
              )
              .abortSignal(controller.signal)
              .eq("user_id", user.id)
              .order("date", { ascending: false })
              .limit(45),
            loadV2Plan(user.id, controller.signal),
          ]);

        clearTimeout(timeout);
        if (cancelled) return;
        assertNoSupabaseError("profiles.load", profRes.error);
        assertNoSupabaseError("athlete_profiles.load", athRes.error);

        assertNoSupabaseError("onboarding_answers.load", onboardingRes.error);
        const rawOnboardingAnswers = (onboardingRes.data as AnyRow | null)?.answers_json;
        const onboardingAnswers =
          rawOnboardingAnswers &&
          typeof rawOnboardingAnswers === "object" &&
          !Array.isArray(rawOnboardingAnswers)
            ? (rawOnboardingAnswers as AnyRow)
            : null;

        const rowProfile = buildProfile(
          profRes.data as AnyRow | null,
          athRes.data as AnyRow | null,
          onboardingAnswers,
        );
        const local = safeLocal;
        const persistedUnavailableEquipment = (athRes.data as AnyRow | null)
          ?.unavailable_equipment_ids;
        const profile = rowProfile
          ? {
              ...rowProfile,
              unavailableEquipmentIds: Array.isArray(persistedUnavailableEquipment)
                ? (persistedUnavailableEquipment as string[])
                : local.unavailableEquipmentIds,
            }
          : null;
        const runningActivities: Record<string, RunningActivity> = {
          ...cachedState?.runningActivities,
        };
        safeProfile = profile;
        assertNoSupabaseError("session_logs.load", logRes.error);
        assertNoSupabaseError("session_modifications.load", modRes.error);
        assertNoSupabaseError("readiness_logs.load", readinessRes.error);

        const pendingWrites = [...pendingAtStart, ...readPendingTrainingWrites(user.id)];
        const completions = mapCompletionRows(
          mergePendingCompletionRows((logRes.data as AnyRow[] | null) ?? [], pendingWrites),
        );
        for (const write of pendingWrites) {
          if (write.kind !== "running_activity") continue;
          const activity = rowToRunningActivity({
            ...write.payload,
            write_version: write.expectedVersion ?? write.payload.write_version ?? 0,
          } as AnyRow);
          if (activity) runningActivities[activity.sessionId] = activity;
        }

        const persistedReadiness: Record<string, Readiness> = {};
        if (profile?.healthPersonalizationEnabled) {
          for (const row of (readinessRes.data as AnyRow[] | null) ?? []) {
            const date = row.date as string | null;
            if (!date) continue;
            persistedReadiness[date] = {
              date,
              sleep: Number(row.sleep ?? 7),
              energy: Number(row.energy ?? 7),
              fatigue: Number(row.fatigue ?? 4),
              soreness: Number(row.soreness ?? row.fatigue ?? 4),
              jointPain: Number(row.pain_level ?? 0),
              painLocation: (row.pain_location as Readiness["painLocation"]) ?? null,
              stress: Number(row.stress ?? 3),
              motivation: Number(row.energy ?? 7),
              overall: Number(row.overall ?? 7),
              painOnset: (row.pain_onset as Readiness["painOnset"]) ?? null,
              altersMovement: Boolean(row.alters_movement),
              redFlags: Array.isArray(row.red_flags) ? (row.red_flags as string[]) : [],
            };
          }
        }
        // Only explicitly saved V2 plans are restored; startup never generates or writes.
        if (cancelled) return;
        const plan: SessionDay[] = savedV2.plan;
        const planGeneratedFor: string | null = plan[0]?.date ?? null;

        const historyPromise = (async () => {
          const allLogs = await readAllPages(
            (from, to) =>
              supabase
                .from("session_logs")
                .select(
                  "session_id,completed,rpe,notes,duration_minutes,duration_source,match_minutes_played,id,execution_snapshot,write_version",
                )
                .eq("user_id", user.id)
                .eq("completed", true)
                .order("id")
                .range(from, to)
                .abortSignal(controller.signal),
            controller.signal,
          );
          assertNoSupabaseError("session_history.load", allLogs.error);
          const history = await loadSessionHistory(
            user.id,
            (allLogs.data as AnyRow[] | null) ?? [],
          );
          const pendingIds = new Set(
            pendingWrites.flatMap((write) =>
              write.kind === "session_log" && write.payload.completed
                ? [write.payload.session_id]
                : [],
            ),
          );
          const localHistory = (cachedState?.history ?? []).filter((row) =>
            pendingIds.has(row.key),
          );
          const localKeys = new Set(localHistory.map((row) => row.key));
          return [...localHistory, ...history.filter((row) => !localKeys.has(row.key))].sort(
            (a, b) => b.date.localeCompare(a.date),
          );
        })().catch(() => {
          console.warn("[loadwise] session history refresh failed");
          return cachedState?.history ?? [];
        });

        const modifications: Record<string, SessionModification[]> = {};
        for (const row of (modRes.data as AnyRow[] | null) ?? []) {
          const mod = rowToModification(row);
          if (!mod) continue;
          (modifications[mod.date] ??= []).push(mod);
        }

        const persistedReplacements: Record<string, ExerciseReplacement[]> = {};
        for (const row of (replacementRes.data as AnyRow[] | null) ?? []) {
          const replacement = rowToExerciseReplacement(row);
          if (replacement) (persistedReplacements[replacement.date] ??= []).push(replacement);
        }
        const persistedEquipment = Object.values(persistedReplacements)
          .flat()
          .flatMap((replacement) => replacement.equipmentIds);

        if (cancelled) return;
        const remoteState: LoadwiseState = {
          profile: profile
            ? {
                ...profile,
                unavailableEquipmentIds: Array.from(
                  new Set([...(profile.unavailableEquipmentIds ?? []), ...persistedEquipment]),
                ),
              }
            : profile,
          plan,
          planGeneratedFor,
          activePlanId: savedV2.id ?? null,
          readiness: persistedReadiness,
          completions,
          history: cachedState?.history ?? [],
          modifications,
          transitions: {},
          exerciseReplacements: !replacementRes.error
            ? persistedReplacements
            : local.exerciseReplacements,
          runningActivities,
          equipmentNotice: replacementRes.error
            ? "Nie udało się wczytać zapisanych zamienników sprzętu."
            : null,
          planChangeEvents: [],
        };
        setState((current) => mergeHydratedState(current, baselineState, remoteState));
        setHydrated(true);
        void runningPromise.then((result) => {
          if (cancelled || !result || result.error) return;
          const remoteRuns: Record<string, RunningActivity> = {};
          for (const row of (result.data as AnyRow[] | null) ?? []) {
            const activity = rowToRunningActivity(row);
            if (activity) remoteRuns[activity.sessionId] = activity;
          }
          for (const write of [...pendingWrites, ...readPendingTrainingWrites(user.id)]) {
            if (write.kind !== "running_activity") continue;
            const activity = rowToRunningActivity({
              ...write.payload,
              write_version: write.expectedVersion ?? write.payload.write_version ?? 0,
            } as AnyRow);
            if (activity) remoteRuns[activity.sessionId] = activity;
          }
          setState((current) => ({
            ...current,
            runningActivities: mergeHydratedRecord(
              current.runningActivities,
              runningActivities,
              remoteRuns,
            ),
          }));
        });
        void historyPromise.then((history) => {
          if (!cancelled)
            setState((current) => ({
              ...current,
              history: mergeHydratedHistory(current.history, baselineState.history, history).map(
                (row) =>
                  current.profile?.healthPersonalizationEnabled ? row : { ...row, notes: "" },
              ),
            }));
        });
      } catch {
        console.warn("[loadwise] hydration refresh failed; using cached state");
        if (!cancelled) {
          setHydrationError?.("Nie udało się wczytać konta.");
          setState((current) => {
            const fallback = {
              ...current,
              profile: current.profile === baselineState.profile ? safeProfile : current.profile,
              exerciseReplacements:
                current.exerciseReplacements === baselineState.exerciseReplacements
                  ? (cachedState?.exerciseReplacements ?? safeLocal.exerciseReplacements)
                  : current.exerciseReplacements,
              equipmentNotice:
                "Nie udało się odświeżyć zapisanej części planu. Pokazujemy ostatnie dostępne dane.",
            };
            return safeProfile?.healthPersonalizationEnabled === false
              ? stateWithoutHealthData(fallback)
              : fallback;
          });
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) {
          setSyncing?.(false);
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [user?.id, authLoading, recoveryMode, profileWritePending, refreshRevision]);
  return hydrated && (authLoading || !user || activeUserIdRef.current === user.id);
}
