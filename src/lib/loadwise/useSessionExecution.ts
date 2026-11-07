import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { TrainingExercise } from "./types";
import { useTrainingLocalState } from "./useTrainingLocalState";
import {
  parseExerciseProgress,
  progressForPrescription,
  trainingFingerprint,
  trainingStorageKey,
} from "./trainingDetails";
import { executionKey } from "./sessionExecution";
import {
  withDurableTrainingWrite,
  isRetryableWriteError,
  readPendingTrainingWrites,
  recoverTrainingQueue,
} from "./offlineTrainingQueue";

/** Completion is evidence of an explicit athlete mark, never invented reps or kg. */
export function useSessionExecution(
  exercises: TrainingExercise[],
  sessionId?: string | null,
  date = "",
) {
  const { user } = useAuth();
  const fingerprint = trainingFingerprint(exercises),
    scope = `${user?.id ?? "guest"}:${sessionId ?? date}:${fingerprint}`;
  const cloud = Boolean(user && sessionId && /^[\da-f]{8}-[\da-f-]{27}$/i.test(sessionId));
  const local = useTrainingLocalState(
    trainingStorageKey("execution", user?.id, sessionId ?? date),
    { done: {}, started: false, currentBlockIdx: 0, fingerprint },
    parseExerciseProgress,
  );
  const progress = progressForPrescription(local.value, fingerprint);
  const live = useRef({ scope, progress, local });
  live.current = { scope, progress, local };
  const versions = useRef<Record<string, number>>({}),
    edits = useRef<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    versions.current = {};
    edits.current = {};
    setNotice(null);
    if (!cloud || !user || !sessionId) return;
    void (async () => {
      await recoverTrainingQueue(user.id);
      const result = await supabase
        .from("exercise_set_logs")
        .select("exercise_key,metric_kind,metric_value,write_version,performed_at")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .like("exercise_key", "done:v1:%")
        .limit(500);
      if (cancelled || live.current.scope !== scope) return;
      if (result.error) {
        setNotice("Nie odczytano zapisu z konta. Zachowano postęp na tym urządzeniu.");
        return;
      }
      const pending = readPendingTrainingWrites(user.id).flatMap((w) =>
        w.kind === "exercise_set_log" && w.payload.session_id === sessionId
          ? [
              {
                exercise_key: w.payload.exercise_key,
                metric_kind: w.payload.metric_kind ?? null,
                metric_value: w.payload.metric_value ?? null,
                write_version: w.expectedVersion ?? 0,
                performed_at: w.payload.performed_at ?? "",
              },
            ]
          : [],
      );
      const rows = [...(result.data ?? []), ...pending];
      const done: Record<string, boolean> = {};
      for (const exercise of exercises) {
        const key = executionKey(exercise);
        const row = [...rows]
          .reverse()
          .find((r) => r.exercise_key === key && r.metric_kind === "completion");
        if (row) {
          done[exercise.id] = Number(row.metric_value) === 1;
          versions.current[key] = Number(row.write_version ?? 0);
        }
      }
      live.current.local.setValue({
        ...live.current.progress,
        done: { ...live.current.progress.done, ...done, ...edits.current },
        fingerprint,
      });
    })().catch(() => {
      if (!cancelled && live.current.scope === scope)
        setNotice("Zapis na koncie jest chwilowo niedostępny. Postęp pozostaje na tym urządzeniu.");
    });
    return () => {
      cancelled = true;
    };
    // A prescription is a stable primitive identity even when callers recreate arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, cloud, user?.id, sessionId]);
  async function markDone(id: string, value: boolean) {
    const exercise = exercises.find((e) => e.id === id);
    if (!exercise) return false;
    const savingScope = scope,
      key = executionKey(exercise);
    if (cloud && user && sessionId) {
      try {
        const operationId = crypto.randomUUID(),
          expectedVersion = versions.current[key] ?? 0;
        const payload = {
          user_id: user.id,
          session_id: sessionId,
          exercise_key: key,
          exercise_name: exercise.name,
          set_number: 1,
          weight_kg: null,
          reps: null,
          rir: null,
          metric_kind: "completion",
          metric_value: value ? 1 : 0,
          performed_at: new Date().toISOString(),
        };
        const result = await withDurableTrainingWrite(
          user.id,
          {
            kind: "exercise_set_log",
            dedupeKey: `set:${sessionId}:${key}:1`,
            payload,
            operationId,
            expectedVersion,
          },
          (entry) =>
            supabase.rpc("save_exercise_set", {
              p_operation_id: operationId,
              p_expected_version: expectedVersion,
              p_payload: {
                ...payload,
                _predecessor_operation_ids: entry.predecessors ?? [],
              } as Json,
            }),
        );
        if (result.error && !isRetryableWriteError(result.error)) throw result.error;
        if (live.current.scope !== savingScope) return true;
        if (result.error) setNotice("Zapisano na urządzeniu · oczekuje na synchronizację");
        else {
          versions.current[key] = Number(
            (result.data as { write_version?: number } | null)?.write_version ?? expectedVersion,
          );
          setNotice(null);
        }
      } catch {
        if (live.current.scope === savingScope)
          setNotice("Nie zapisano oznaczenia. Spróbuj ponownie.");
        return false;
      }
    }
    if (live.current.scope !== savingScope) return true;
    edits.current[id] = value;
    live.current.local.setValue((current) => ({
      ...progressForPrescription(current, fingerprint),
      done: { ...progressForPrescription(current, fingerprint).done, [id]: value },
      fingerprint,
    }));
    return true;
  }
  return { done: progress.done, markDone, notice, available: local.available, cloud };
}
