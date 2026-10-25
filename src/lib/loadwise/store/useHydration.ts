import { readPendingTrainingWrites, recoverTrainingQueue } from "../offlineTrainingQueue";
import { readAllPages } from "../pagination";
import { generatePlanAsync } from "../generatePlanAsync";
import { applyConfirmedCalendar, transitionMatchesBlock } from "../confirmedCalendar";
import { reconcilePlanIdentity } from "../planIdentity";
import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { RunningActivity } from "@/lib/running/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { stateWithoutHealthData } from "../localPrivacy";
import { clearBootState, loadBootState } from "../bootCache";
import { primeConsentRows } from "../legalStatus";
import {
  hasLocalPlanChanges,
  mergeHydratedHistory,
  mergeHydratedState,
  mergePendingCompletionRows,
} from "./hydrationMerge";
import type { LoadwiseState } from "../types";
import { migratePersistedExerciseData } from "../exerciseLibrary";
import { localToday, parseIso } from "../labels";
import { normalizeMatchDates } from "../matchSchedule";
import { PLAN_ENGINE_VERSION } from "../planVersion";
import type {
  ExerciseReplacement,
  Profile,
  Readiness,
  SessionDay,
  SessionModification,
  WeeklyTransition,
} from "../types";
import { loadLocal, type LocalState } from "./localState";
import {
  buildProfile,
  initialState,
  mapCompletionRows,
  ONBOARDING_SCHEMA_VERSION,
  planRevisionInfo,
  rowToExerciseReplacement,
  rowToModification,
  rowToRunningActivity,
  stampPlanRevision,
  type AnyRow,
  type StateSetter,
  type StoreUser,
} from "./model";
import { clearFutureOverlaysForUser, loadSessionHistory } from "./repository";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
interface HydrationOptions {
  user: StoreUser;
  authLoading: boolean;
  recoveryMode: boolean;
  todayIso: string;
  setState: StateSetter;
  state: LoadwiseState;
  setSyncing?: (value: boolean) => void;
  setHydrationError?: (value: string | null) => void;
}
export function useHydration({
  user,
  authLoading,
  recoveryMode,
  todayIso,
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
    const sameUser = activeUserIdRef.current === user.id;
    activeUserIdRef.current = user.id;
    setSyncing?.(true);
    setHydrationError?.(null);
    primeConsentRows(user.id);
    const cachedState =
      sameUser && stateRef.current.profile ? stateRef.current : loadBootState(user.id);
    const baselineState = cachedState ?? initialState;
    let pendingAtStart = readPendingTrainingWrites(user.id);
    const canWritePlan = () => !cancelled && !hasLocalPlanChanges(stateRef.current, baselineState);
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
        await recoverTrainingQueue(user.id);
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
        const [
          profRes,
          athRes,
          onboardingRes,
          planRes,
          logRes,
          modRes,
          transRes,
          replacementRes,
          runningRes,
          readinessRes,
        ] = await Promise.all([
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
          supabase
            .from("training_plans")

            .select("*")
            .abortSignal(controller.signal)
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          readAllPages(
            (from, to) =>
              supabase
                .from("session_logs")

                .select(
                  "session_id, completed, completion_status, rpe, notes, duration_minutes, activity_type, started_at, ended_at, updated_at, execution_snapshot, write_version",
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
          supabase
            .from("weekly_transitions")
            .select("*")
            .abortSignal(controller.signal)
            .eq("user_id", user.id),
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
          readAllPages(
            (from, to) =>
              supabase
                .from("running_activities")

                .select("*")
                .abortSignal(controller.signal)
                .eq("user_id", user.id)
                .order("date", { ascending: false })
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
        const runningActivities: Record<string, RunningActivity> = {};
        if (!runningRes.error) {
          for (const row of (runningRes.data as AnyRow[] | null) ?? []) {
            const activity = rowToRunningActivity(row);
            if (activity) runningActivities[activity.sessionId] = activity;
          }
        }
        safeProfile = profile;
        assertNoSupabaseError("training_plans.load", planRes.error);
        assertNoSupabaseError("session_logs.load", logRes.error);
        assertNoSupabaseError("session_modifications.load", modRes.error);
        assertNoSupabaseError("weekly_transitions.load", transRes.error);
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
        const transitions: Record<number, WeeklyTransition> = {};
        const activePlanRow = planRes.data as AnyRow | null;
        const activeDays = (
          (Array.isArray(activePlanRow?.plan_json) ? activePlanRow.plan_json : []) as SessionDay[]
        ).map((day) => ({
          ...day,
          cycleId: day.cycleId ?? String(activePlanRow?.cycle_id ?? activePlanRow?.id),
        }));
        const activeCycle = activeDays[0]?.cycleId ?? activePlanRow?.cycle_id;
        for (const row of (transRes.data as AnyRow[] | null) ?? []) {
          const wn = Number(row.week_number);
          if (!Number.isFinite(wn) || !activeCycle || row.cycle_id !== activeCycle) continue;
          transitions[wn] = {
            id: row.id as string,
            weekNumber: wn,
            cycleId: String(activeCycle),
            weekStart: row.week_start as string,
            weekEnd: row.week_end as string,
            nextMatchDate: (row.next_match_date as string) ?? null,
            nextMatchDates: normalizeMatchDates([
              row.next_match_date as string | null,
              ...(Array.isArray(row.next_match_dates) ? (row.next_match_dates as string[]) : []),
            ]),
            noMatchNextWeek: Boolean(row.no_match_next_week),
            confirmedAt: (row.confirmed_at as string) ?? new Date().toISOString(),
          };
          if (!transitionMatchesBlock(activeDays, transitions[wn], wn)) delete transitions[wn];
        }

        let plan: SessionDay[] = [];
        let migrationOriginalPlan: SessionDay[] | null = null;
        let migrationChanged = false;
        let planGeneratedFor: string | null = null;
        let clearFutureOverlays = false;
        const planRow = planRes.data as AnyRow | null;
        const planRowCreatedAt = (planRow?.created_at as string | undefined) ?? null;
        if (planRow && Array.isArray(planRow.plan_json)) {
          const { normalizeLegacyPersistedPlan } = await import("../dailyCheckin");
          plan = (planRow.plan_json as SessionDay[]).map((day) => ({
            ...day,
            planDbId: planRow.id as string,
            cycleId: day.cycleId ?? String(planRow.cycle_id ?? planRow.id),
          }));
          planGeneratedFor = (planRow.created_at as string)?.slice(0, 10) ?? null;
          const normalized = normalizeLegacyPersistedPlan(plan);
          plan = normalized.plan;
          const exerciseMigration = migratePersistedExerciseData(plan);
          if (exerciseMigration.changed) {
            migrationOriginalPlan = plan;
            migrationChanged = true;
            plan = exerciseMigration.plan;
          }
        }
        if (profile && plan.length > 0) {
          const { migratePersistedSpeedSessions } = await import("../speedSessionMigration");
          const persistedModifications: Record<string, SessionModification[]> = {};
          for (const row of (modRes.data as AnyRow[] | null) ?? []) {
            const mod = rowToModification(row);
            if (mod) (persistedModifications[mod.date] ??= []).push(mod);
          }
          const migrated = migratePersistedSpeedSessions(
            plan,
            profile,
            todayIso,
            completions,
            persistedModifications,
          );
          if (migrated.migratedDates.length > 0) {
            migrationOriginalPlan = plan;
            plan = migrated.plan;
            migrationChanged = true;
          }
        }

        if (!profile?.onboardingComplete) {
          plan = [];
          planGeneratedFor = null;
        } else {
          const { persistedPlanNeedsRegeneration } = await import("../persistedPlanValidation");
          const revisionInfo = planRevisionInfo(plan);
          const profileRevision = profile.onboardingRevision ?? null;
          const schemaMissingOrMismatched =
            revisionInfo.schemaVersion === null ||
            revisionInfo.schemaVersion !== ONBOARDING_SCHEMA_VERSION;
          const revisionMismatch =
            (profileRevision && revisionInfo.revision !== profileRevision) ||
            (!revisionInfo.revision && !!profileRevision);
          const mixedRevisionData = revisionInfo.mixedRevisions || revisionInfo.mixedSchemas;
          const planOlderThanProfile =
            !!profileRevision &&
            !profileRevision.startsWith("training-inputs:") &&
            !!planRowCreatedAt &&
            planRowCreatedAt < profileRevision;
          const missingToday = !plan.some((day) => day.date === todayIso);
          const invalidCanonical =
            plan.length === 0 ||
            missingToday ||
            persistedPlanNeedsRegeneration(plan, profile, PLAN_ENGINE_VERSION, todayIso);
          const shouldRebuildCanonical =
            invalidCanonical ||
            mixedRevisionData ||
            schemaMissingOrMismatched ||
            revisionMismatch ||
            planOlderThanProfile;

          if (shouldRebuildCanonical) {
            const { persistMonthlyPlan } = await import("../persist");
            const canonical = stampPlanRevision(
              await applyConfirmedCalendar(
                await generatePlanAsync(
                  profile,
                  plan[0]?.date && plan.some((day) => day.date === todayIso)
                    ? parseIso(plan[0].date)
                    : localToday(),
                  28,
                  0,
                  controller.signal,
                ).then((days) =>
                  plan[0]?.cycleId && plan.some((day) => day.date === todayIso)
                    ? days.map((day) => ({ ...day, cycleId: plan[0].cycleId }))
                    : days,
                ),
                profile,
                transitions,
                controller.signal,
              ),
              profileRevision,
              ONBOARDING_SCHEMA_VERSION,
            );
            plan = stampPlanRevision(
              reconcilePlanIdentity(canonical, plan, completions, todayIso),
              profileRevision,
              ONBOARDING_SCHEMA_VERSION,
            );
            // Even a corrupted empty snapshot still has a real active header for optimistic locking.
            if (plan[0] && planRow?.id && !plan[0].planDbId) plan[0].planDbId = String(planRow.id);
            if (cancelled) return;
            if (canWritePlan()) plan = await persistMonthlyPlan(user.id, profile, plan);
            planGeneratedFor = todayIso;
            clearFutureOverlays = true;
          } else if (revisionInfo.revision !== profileRevision || schemaMissingOrMismatched) {
            const { persistMonthlyPlan } = await import("../persist");
            plan = stampPlanRevision(plan, profileRevision, ONBOARDING_SCHEMA_VERSION);
            if (cancelled) return;
            if (canWritePlan()) plan = await persistMonthlyPlan(user.id, profile, plan);
            planGeneratedFor = todayIso;
          } else if (migrationOriginalPlan && migrationChanged) {
            if (canWritePlan()) {
              const { persistMonthlyPlan } = await import("../persist");
              const migrated = stampPlanRevision(
                reconcilePlanIdentity(plan, migrationOriginalPlan, completions, todayIso),
                profileRevision,
                ONBOARDING_SCHEMA_VERSION,
              );
              plan = await persistMonthlyPlan(user.id, profile, migrated);
            } else plan = migrationOriginalPlan;
          }
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
        const historyPromise = (async () => {
          const allLogs = await readAllPages(
            (from, to) =>
              supabase
                .from("session_logs")
                .select(
                  "session_id,completed,rpe,notes,duration_minutes,id,execution_snapshot,write_version",
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
          if (clearFutureOverlays && mod.date >= todayIso) continue;
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
        if (clearFutureOverlays && canWritePlan()) {
          await clearFutureOverlaysForUser(
            user.id,
            todayIso,
            false,
            ((modRes.data as AnyRow[] | null) ?? [])
              .filter((row) => String(row.date) >= todayIso)
              .map((row) => String(row.id)),
          );
        }
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
          readiness: persistedReadiness,
          completions,
          history: cachedState?.history ?? [],
          modifications,
          transitions,
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
  }, [user?.id, authLoading, recoveryMode, refreshRevision]);
  return hydrated && (authLoading || !user || activeUserIdRef.current === user.id);
}
