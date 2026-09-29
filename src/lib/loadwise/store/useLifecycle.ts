import { supabase } from "@/integrations/supabase/client";
import { assertNoSupabaseError } from "@/integrations/supabase/errors";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { saveBootState } from "../bootCache";
import { resolveEffectivePlan } from "../effectivePlan";
import { isoDate, localToday } from "../labels";
import { flushPendingTrainingWrites, type PendingTrainingWrite } from "../offlineTrainingQueue";
import { expiredUnfinishedSessions } from "../sessionStatus";
import type { LoadwiseState } from "../types";
import { saveLocal } from "./localState";
import { type StoreActionContext, type StoreUser } from "./model";
import { clearFutureOverlaysForUser } from "./repository";

export function useTodayIso() {
  const [todayIso, setTodayIso] = useState(() => isoDate(localToday()));
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const refreshToday = () => {
      const next = isoDate(localToday());
      setTodayIso((prev) => (prev === next ? prev : next));
    };
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 1, 0);
      timeout = setTimeout(
        () => {
          refreshToday();
          scheduleMidnight();
        },
        Math.max(1000, nextMidnight.getTime() - now.getTime()),
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshToday();
    };
    const onFocus = () => refreshToday();
    const onPageShow = () => refreshToday();
    scheduleMidnight();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
  return todayIso;
}

export function useOfflineTrainingSync(user: StoreUser) {
  const offlineSyncInFlightRef = useRef(false);
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const userId = user.id;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelayMs = 15_000;

    function scheduleRetry() {
      if (disposed || navigator.onLine === false) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void sync(), retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, 120_000);
    }

    async function sync() {
      if (disposed || offlineSyncInFlightRef.current || navigator.onLine === false) return;
      offlineSyncInFlightRef.current = true;
      try {
        const result = await flushPendingTrainingWrites(
          userId,
          async (write: PendingTrainingWrite) => {
            if (write.kind === "session_log") {
              const saved = await supabase
                .from("session_logs")
                .upsert(write.payload, { onConflict: "user_id,session_id" });
              return !saved.error;
            }
            if (write.kind === "exercise_set_log") {
              const saved = await supabase.from("exercise_set_logs").upsert(write.payload, {
                onConflict: "user_id,session_id,exercise_key,set_number",
              });
              return !saved.error;
            }
            if (write.kind === "running_activity") {
              const saved = await supabase
                .from("running_activities")
                .upsert(write.payload, { onConflict: "user_id,session_id" });
              return !saved.error;
            }
            const saved = await supabase
              .from("athlete_profiles")
              .update(write.payload)
              .eq("user_id", userId);
            return !saved.error;
          },
        );
        if (result.synced > 0) toast.success("Zapis treningu zsynchronizowany.");
        if (result.remaining > 0) scheduleRetry();
        else retryDelayMs = 15_000;
      } catch {
        scheduleRetry();
      } finally {
        offlineSyncInFlightRef.current = false;
      }
    }
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [user]);
}

export function usePersistedState(user: StoreUser, hydrated: boolean, state: LoadwiseState) {
  useEffect(() => {
    if (!user || !hydrated) return;
    saveLocal(user.id, {
      unavailableEquipmentIds: state.profile?.unavailableEquipmentIds ?? [],
      exerciseReplacements: state.exerciseReplacements,
    });
  }, [user, hydrated, state.profile?.unavailableEquipmentIds, state.exerciseReplacements]);
  useEffect(() => {
    if (!user || !hydrated || !state.profile?.onboardingComplete) return;
    const timeout = window.setTimeout(() => saveBootState(user.id, state), 180);
    return () => window.clearTimeout(timeout);
  }, [user, hydrated, state]);
}

export function useMissedSessionSync({
  user,
  state,
  setState,
  todayIso,
  savePlanToDb,
  hydrated,
}: StoreActionContext & { hydrated: boolean }) {
  const missedSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !hydrated || !state.profile?.onboardingComplete) return;
    const syncKey = `${user.id}:${todayIso}`;
    if (missedSyncRef.current === syncKey) return;
    const effectivePlan = resolveEffectivePlan(state.plan, state.modifications);
    const expired = expiredUnfinishedSessions(effectivePlan, todayIso, state.completions);
    missedSyncRef.current = syncKey;
    if (expired.length === 0) return;

    void (async () => {
      try {
        const now = new Date().toISOString();
        await Promise.all(
          expired.map(async (session) => {
            const result = await supabase.from("session_logs").upsert(
              {
                user_id: user.id,
                session_id: session.dbId!,
                completed: false,
                completion_status: "missed",
                rpe: null,
                notes: "",
                duration_minutes: 0,
                activity_type: null,
                updated_at: now,
              },
              { onConflict: "user_id,session_id" },
            );
            assertNoSupabaseError("session_logs.mark_missed", result.error);
          }),
        );
        const plan = await savePlanToDb(
          state.profile!,
          state.profile!.onboardingRevision ?? null,
          expired,
        );
        await clearFutureOverlaysForUser(user.id, todayIso);
        setState((current) => ({
          ...current,
          plan,
          planGeneratedFor: todayIso,
          completions: {
            ...current.completions,
            ...Object.fromEntries(
              expired.map((session) => [
                session.dbId!,
                {
                  completed: false,
                  status: "missed",
                  rpe: null,
                  notes: "",
                  durationMin: 0,
                },
              ]),
            ),
          },
          modifications: Object.fromEntries(
            Object.entries(current.modifications).filter(([date]) => date < todayIso),
          ),
          transitions: {},
          planChangeEvents: [
            ...(current.planChangeEvents ?? []).filter(
              (event) => event.source !== "missed_session",
            ),
            ...expired.map((session) => ({
              id: `missed:${session.dbId ?? session.date}`,
              date: todayIso,
              source: "missed_session" as const,
              title: "Plan przeliczony po pominiętej sesji",
              detail:
                "Silnik zachował tylko brakujący bodziec, jeśli znalazł bezpieczne miejsce; reszty nie nadrabia na siłę.",
            })),
          ],
        }));
      } catch (error) {
        missedSyncRef.current = null;
        console.error("[loadwise] missed-session sync failed", error);
      }
    })();
    // savePlanToDb is provider-local; state inputs above are the intended triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    state.plan,
    state.modifications,
    state.completions,
    state.profile,
    state.readiness,
    todayIso,
    user,
  ]);
}
