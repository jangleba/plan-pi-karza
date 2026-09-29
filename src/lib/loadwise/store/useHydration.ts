import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import type { Json } from "@/integrations/supabase/types";
import type { RunningActivity } from "@/lib/running/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { adaptMdPlusOneFromMatchMinutes } from "../adaptiveWeek";
import { clearBootState, loadBootState } from "../bootCache";
import { migratePersistedExerciseData } from "../exerciseLibrary";
import { localToday } from "../labels";
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
}
export function useHydration({
  user,
  authLoading,
  recoveryMode,
  todayIso,
  setState,
}: HydrationOptions) {
  const [hydrated, setHydrated] = useState(false);
  const activeUserIdRef = useRef<string | null>(null);
  useClientLayoutEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (recoveryMode) {
      setHydrated(false);
      return;
    }
    if (!user) {
      if (activeUserIdRef.current) clearBootState(activeUserIdRef.current);
      activeUserIdRef.current = null;
      setState(initialState);
      setHydrated(true);
      return;
    }
    activeUserIdRef.current = user.id;
    const cachedState = loadBootState(user.id);
    if (cachedState) {
      setState(cachedState);
      setHydrated(true);
    } else {
      setHydrated(false);
    }
    (async () => {
      let safeProfile: Profile | null = cachedState?.profile ?? null;
      const safeLocal: LocalState = loadLocal(user.id);
      try {
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
          supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle(),
          supabase
            .from("onboarding_answers")
            .select("answers_json")
            .eq("user_id", user.id)
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("training_plans")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("session_logs")
            .select(
              "session_id, completed, completion_status, rpe, notes, duration_minutes, activity_type, started_at, ended_at",
            )
            .eq("user_id", user.id),
          supabase
            .from("session_modifications")
            .select("*")
            .eq("user_id", user.id)
            .eq("active", true)
            .order("created_at", { ascending: true }),
          supabase.from("weekly_transitions").select("*").eq("user_id", user.id),
          supabase
            .from("exercise_replacements")
            .select("*")
            .eq("user_id", user.id)
            .eq("active", true)
            .order("created_at", { ascending: true }),
          supabase
            .from("running_activities")
            .select("*")
            .eq("user_id", user.id)
            .order("date", { ascending: false }),
          supabase
            .from("readiness_logs")
            .select(
              "date, sleep, energy, fatigue, soreness, stress, pain_level, pain_location, pain_onset, alters_movement, red_flags, overall",
            )
            .eq("user_id", user.id)
            .order("date", { ascending: false })
            .limit(45),
        ]);

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

        const completions = mapCompletionRows((logRes.data as AnyRow[] | null) ?? []);
        let plan: SessionDay[] = [];
        let migrationOriginalPlan: SessionDay[] | null = null;
        let migrationChanged = false;
        let planGeneratedFor: string | null = null;
        let clearFutureOverlays = false;
        const planRow = planRes.data as AnyRow | null;
        const planRowCreatedAt = (planRow?.created_at as string | undefined) ?? null;
        if (planRow && Array.isArray(planRow.plan_json)) {
          const { normalizeLegacyPersistedPlan } = await import("../dailyCheckin");
          plan = planRow.plan_json as SessionDay[];
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
            !!profileRevision && !!planRowCreatedAt && planRowCreatedAt < profileRevision;
          const missingToday = !plan.some((day) => day.date === todayIso);
          const invalidCanonical =
            plan.length === 0 ||
            missingToday ||
            persistedPlanNeedsRegeneration(plan, profile, PLAN_ENGINE_VERSION);
          const shouldRebuildCanonical =
            invalidCanonical ||
            mixedRevisionData ||
            schemaMissingOrMismatched ||
            revisionMismatch ||
            planOlderThanProfile;

          if (shouldRebuildCanonical) {
            const [{ generatePlan }, { persistMonthlyPlan }] = await Promise.all([
              import("../planEngine"),
              import("../persist"),
            ]);
            const canonical = stampPlanRevision(
              generatePlan(profile, localToday()),
              profileRevision,
              ONBOARDING_SCHEMA_VERSION,
            );
            plan = canonical;
            await persistMonthlyPlan(user.id, profile, canonical);
            planGeneratedFor = todayIso;
            clearFutureOverlays = true;
          } else if (revisionInfo.revision !== profileRevision || schemaMissingOrMismatched) {
            const { persistMonthlyPlan } = await import("../persist");
            plan = stampPlanRevision(plan, profileRevision, ONBOARDING_SCHEMA_VERSION);
            await persistMonthlyPlan(user.id, profile, plan);
            planGeneratedFor = todayIso;
          } else if (migrationOriginalPlan && migrationChanged) {
            const planId = planRow?.id as string | undefined;
            if (planId) {
              const migrationWrite = await supabase
                .from("training_plans")
                .update({ plan_json: plan as unknown as Json })
                .eq("id", planId)
                .eq("user_id", user.id)
                .eq("active", true);
              if (migrationWrite.error) plan = migrationOriginalPlan;
            } else {
              plan = migrationOriginalPlan;
            }
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
        const historyPromise = loadSessionHistory(
          user.id,
          (logRes.data as AnyRow[] | null) ?? [],
        ).catch((error) => {
          console.warn("[loadwise] session history background load failed", error);
          return cachedState?.history ?? [];
        });

        const modifications: Record<string, SessionModification[]> = {};
        for (const row of (modRes.data as AnyRow[] | null) ?? []) {
          const mod = rowToModification(row);
          if (!mod) continue;
          if (clearFutureOverlays && mod.date >= todayIso) continue;
          (modifications[mod.date] ??= []).push(mod);
        }

        const transitions: Record<number, WeeklyTransition> = {};
        for (const row of clearFutureOverlays ? [] : ((transRes.data as AnyRow[] | null) ?? [])) {
          const wn = Number(row.week_number);
          if (!Number.isFinite(wn)) continue;
          transitions[wn] = {
            id: row.id as string,
            weekNumber: wn,
            nextMatchDate: (row.next_match_date as string) ?? null,
            nextMatchDates: normalizeMatchDates([
              row.next_match_date as string | null,
              ...(Array.isArray(row.next_match_dates) ? (row.next_match_dates as string[]) : []),
            ]),
            noMatchNextWeek: Boolean(row.no_match_next_week),
            confirmedAt: (row.confirmed_at as string) ?? new Date().toISOString(),
          };
        }

        const persistedReplacements: Record<string, ExerciseReplacement[]> = {};
        for (const row of (replacementRes.data as AnyRow[] | null) ?? []) {
          const replacement = rowToExerciseReplacement(row);
          if (replacement) (persistedReplacements[replacement.date] ??= []).push(replacement);
        }
        const persistedEquipment = Object.values(persistedReplacements)
          .flat()
          .flatMap((replacement) => replacement.equipmentIds);

        if (clearFutureOverlays) {
          await clearFutureOverlaysForUser(user.id, todayIso);
        }
        const matchMinuteAdjustment = adaptMdPlusOneFromMatchMinutes(
          plan,
          completions,
          persistedReadiness,
        );
        plan = matchMinuteAdjustment.plan;
        if (cancelled) return;
        setState({
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
          planChangeEvents: matchMinuteAdjustment.events,
        });
        setHydrated(true);
        void historyPromise.then((history) => {
          if (!cancelled) setState((current) => ({ ...current, history }));
        });
      } catch (error) {
        console.error("[loadwise] hydration failed; using safe persisted state", error);
        if (!cancelled) {
          setState((current) => ({
            ...(cachedState ?? current),
            profile: safeProfile,
            readiness: {},
            exerciseReplacements:
              cachedState?.exerciseReplacements ?? safeLocal.exerciseReplacements,
            equipmentNotice:
              "Nie udało się odświeżyć zapisanej części planu. Pokazujemy ostatnie dostępne dane.",
          }));
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, recoveryMode]);
  return hydrated;
}
