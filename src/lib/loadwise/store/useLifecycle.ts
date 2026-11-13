import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  clearLocalHealthData,
  stateWithoutHealthData,
  profileWithoutFuelPrecision,
} from "../localPrivacy";
import { loadConsentRows } from "../legalStatus";
import type { Json } from "@/integrations/supabase/types";
import { clearBootState, saveBootState } from "../bootCache";
import { isoDate, localToday } from "../labels";
import {
  flushPendingTrainingWrites,
  withTrainingWriteLock,
  type StoredTrainingWrite,
  trainingQueueStatus,
} from "../offlineTrainingQueue";
import type { LoadwiseState } from "../types";
import { saveLocal } from "./localState";
import { type StoreActionContext, type StoreUser } from "./model";

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

export function useOfflineTrainingSync(
  user: StoreUser,
  context?: Pick<StoreActionContext, "setState">,
) {
  const latestContext = useRef(context);
  latestContext.current = context;
  const ownerId = user?.id;
  useEffect(() => {
    if (!ownerId || typeof window === "undefined") return;
    const userId = ownerId;
    let disposed = false;
    let inFlight = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelayMs = 15_000;

    function scheduleRetry() {
      if (disposed || navigator.onLine === false) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void sync(), retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, 120_000);
    }

    async function sync() {
      if (disposed || inFlight || navigator.onLine === false) return;
      inFlight = true;
      try {
        const result = await withTrainingWriteLock(userId, () =>
          flushPendingTrainingWrites(userId, async (write: StoredTrainingWrite) => {
            if (disposed) return false;
            if (write.kind === "running_progression")
              throw { code: "40001", message: "Legacy progression has no evidence" };
            const payload = JSON.parse(
              JSON.stringify({
                ...write.payload,
                _predecessor_operation_ids: write.predecessors ?? [],
              }),
            ) as Json;
            const operationId = write.operationId ?? crypto.randomUUID();
            const expectedVersion = write.expectedVersion ?? 0;
            const saved =
              write.kind === "session_log"
                ? await supabase.rpc("save_training_log", {
                    p_operation_id: operationId,
                    p_session_id: write.payload.session_id!,
                    p_expected_version: expectedVersion,
                    p_payload: payload,
                  })
                : write.kind === "exercise_set_log"
                  ? await supabase.rpc("save_exercise_set", {
                      p_operation_id: operationId,
                      p_expected_version: expectedVersion,
                      p_payload: payload,
                    })
                  : await supabase.rpc("save_running_result", {
                      p_operation_id: operationId,
                      p_expected_version: expectedVersion,
                      p_payload: payload,
                    });
            if (saved.error) throw saved.error;
            // Re-read canonical server/profile/plan together after the committed batch.
            return true;
          }),
        );
        if (disposed) return;
        if (result.synced > 0) {
          toast.success("Zapis treningu zsynchronizowany.");
          window.dispatchEvent(new Event("ballwise:training-synced"));
        }
        if (trainingQueueStatus(userId).pending > 0) scheduleRetry();
        else retryDelayMs = 15_000;
      } catch {
        scheduleRetry();
      } finally {
        inFlight = false;
      }
    }
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    void sync();
    window.addEventListener("ballwise:training-queue-changed", scheduleRetry);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("ballwise:training-queue-changed", scheduleRetry);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [ownerId]);
  useEffect(() => {
    if (!ownerId || typeof window === "undefined") return;
    const userId = ownerId;
    const changed = (event: Event) => {
      const decision = (event as CustomEvent<{ type: string; accepted: boolean }>).detail;
      if (decision?.type === "fuel_precision" && decision.accepted === false) {
        latestContext.current?.setState((current) => ({
          ...current,
          profile: current.profile ? profileWithoutFuelPrecision(current.profile) : null,
        }));
        clearBootState(userId);
      }
      if (decision?.type === "health_data" && decision.accepted === false) {
        latestContext.current?.setState((current) => stateWithoutHealthData(current));
        void clearLocalHealthData(userId).catch(() =>
          toast.warning(
            "Zgoda wycofana. Ponownie otwórz aplikację, aby dokończyć czyszczenie pamięci telefonu.",
          ),
        );
      }
    };
    const recheck = () => {
      if (document.visibilityState === "hidden" || navigator.onLine === false) return;
      void loadConsentRows(userId, true).catch(() => undefined);
    };
    window.addEventListener("ballwise:consent-changed", changed);
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    return () => {
      window.removeEventListener("ballwise:consent-changed", changed);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
    };
  }, [ownerId]);
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
    let idle: number | undefined;
    let cancelled = false;
    const save = () => {
      if (!cancelled) saveBootState(user.id, state);
    };
    const timeout = window.setTimeout(() => {
      if (window.requestIdleCallback) idle = window.requestIdleCallback(save, { timeout: 2000 });
      else save();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, [user, hydrated, state]);
}
