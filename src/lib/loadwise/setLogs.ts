import { awaitAbortable } from "@/lib/awaitAbortable";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/loadwise/auth";
import type { Json } from "@/integrations/supabase/types";
import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  enqueueDurableTrainingWrite,
  recoverTrainingQueue,
  readPendingTrainingWrites,
  isRetryableWriteError,
  withDurableTrainingWrite,
} from "@/lib/loadwise/offlineTrainingQueue";
import {
  previousExerciseSessions,
  toSetLog,
  type HistorySetLog,
  type HistorySetLogRow,
  type ExerciseSessionLog,
} from "./setLogHistory";

export { previousExerciseSessions } from "./setLogHistory";
export type { ExerciseSessionLog } from "./setLogHistory";

export type SetLog = HistorySetLog;

export interface SetLogRow extends HistorySetLogRow {
  exercise_key: string;
}

/** Stabilny klucz ćwiczenia — po ID z biblioteki, w ostateczności po nazwie. */
export function exerciseKey(e: Pick<TrainingExercise, "exerciseId" | "name">): string {
  return (e.exerciseId?.trim() || e.name.trim().toLowerCase()).slice(0, 120);
}

/** Liczba planowanych serii ćwiczenia (0 = brak logowania serii). */
export function plannedSets(e: TrainingExercise): number {
  if (typeof e.sets === "number" && Number.isFinite(e.sets)) return Math.max(0, Math.round(e.sets));
  const explicit = String(e.sets ?? "")
    .trim()
    .match(/^(\d+)(?:\s*[–-]\s*\d+)?$/);
  if (explicit) return Number(explicit[1]);
  const match = String(e.displayPrescription ?? "").match(/(\d+)\s*(?:serie|serii|seria|×)/i);
  return match ? Number(match[1]) : 0;
}

const table = () => supabase.from("exercise_set_logs");

/** Zwraca serie tylko z jednej, ostatniej poprzedniej sesji. */
export function previousSessionLogs(
  rows: SetLogRow[],
  currentSessionId: string | null | undefined,
): Record<number, SetLog> {
  const previousRows = rows.filter(
    (row) => !currentSessionId || row.session_id !== currentSessionId,
  );
  const first = previousRows[0];
  if (!first) return {};
  const group = first.session_id ?? first.performed_at.slice(0, 10);
  const selected = previousRows.filter(
    (row) => (row.session_id ?? row.performed_at.slice(0, 10)) === group,
  );
  return Object.fromEntries(selected.map((row) => [row.set_number, toSetLog(row)]));
}

/**
 * Trwałe rejestrowanie serii: zapisy bieżącej sesji + ostatnie wartości
 * z poprzednich sesji (podpowiedź „Ostatnio”).
 */
export function useExerciseSetLogs(sessionId: string | null | undefined, key: string) {
  const { user } = useAuth();
  const userId = user?.id;
  const [current, setCurrent] = useState<Record<number, SetLog>>({});
  const [previous, setPrevious] = useState<Record<number, SetLog>>({});
  const [recentSessions, setRecentSessions] = useState<ExerciseSessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const scope = `${userId ?? ""}:${sessionId ?? ""}:${key}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const requestRevision = useRef(0);
  const localEdits = useRef<Record<number, SetLog>>({});
  const versions = useRef<Record<number, number>>({});

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const revision = ++requestRevision.current;
    const isCurrent = () => activeScope.current === scope && requestRevision.current === revision;
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      await awaitAbortable(recoverTrainingQueue(userId), controller.signal);
      controller.signal.throwIfAborted();
      if (!isCurrent()) return;
      const pending = readPendingTrainingWrites(userId).filter(
        (write) => write.kind === "exercise_set_log" && write.payload.exercise_key === key,
      );
      const { data, error } = await awaitAbortable(
        table()
          .select(
            "session_id,exercise_key,set_number,weight_kg,reps,rir,metric_kind,metric_value,performed_at,write_version",
          )
          .eq("user_id", userId)
          .eq("exercise_key", key)
          .order("performed_at", { ascending: false })
          .limit(60)
          .abortSignal(controller.signal),
        controller.signal,
      );
      if (!isCurrent()) return;
      if (error) throw error;
      const rows = [
        ...(data ?? []),
        ...pending.map((write) => write.payload),
      ] as unknown as SetLogRow[];
      rows.sort((a, b) => b.performed_at.localeCompare(a.performed_at));
      const mine: Record<number, SetLog> = {};
      for (const row of rows) {
        if (sessionId && row.session_id === sessionId) {
          if (!mine[row.set_number]) mine[row.set_number] = toSetLog(row);
        }
      }
      for (const row of (data ?? []) as (SetLogRow & { write_version?: number })[]) {
        if (row.session_id === sessionId)
          versions.current[row.set_number] = Math.max(
            versions.current[row.set_number] ?? 0,
            row.write_version ?? 0,
          );
      }
      for (const write of pending)
        if (write.kind === "exercise_set_log" && write.payload.session_id === sessionId) {
          const number = write.payload.set_number;
          mine[number] = toSetLog(write.payload as unknown as SetLogRow);
          versions.current[number] = Math.max(
            versions.current[number] ?? 0,
            write.expectedVersion ?? 0,
          );
        }
      setCurrent({ ...mine, ...localEdits.current });
      setPrevious(previousSessionLogs(rows, sessionId));
      setRecentSessions(previousExerciseSessions(rows, sessionId));
    } catch {
      if (isCurrent())
        setLoadError(
          "Nie udało się wczytać historii serii. Twoje wpisy są zachowane. Spróbuj ponownie.",
        );
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) setLoading(false);
    }
  }, [userId, key, sessionId, scope]);

  useEffect(() => {
    localEdits.current = {};
    versions.current = {};
    setCurrent({});
    setPrevious({});
    setRecentSessions([]);
    void load();
    return () => {
      requestRevision.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);

  const saveSet = useCallback(
    async (log: SetLog) => {
      if (!userId) return false;
      const payload = {
        user_id: userId,
        session_id: sessionId ?? null,
        exercise_key: key,
        set_number: log.setNumber,
        weight_kg: log.weightKg,
        reps: log.reps,
        rir: log.rir,
        metric_kind: log.metricKind ?? null,
        metric_value: log.metricValue ?? null,
        performed_at: new Date().toISOString(),
      };
      const dedupeKey = `set:${sessionId ?? "none"}:${key}:${log.setNumber}`;
      const operationId = crypto.randomUUID();
      let expectedVersion = versions.current[log.setNumber] ?? 0;
      const result = await withDurableTrainingWrite(
        userId,
        { kind: "exercise_set_log", dedupeKey, payload, operationId, expectedVersion },
        async (previous) => {
          if (activeScope.current === scope) expectedVersion = versions.current[log.setNumber] ?? 0;
          const saved = await supabase.rpc("save_exercise_set", {
            p_operation_id: operationId,
            p_expected_version: expectedVersion,
            p_payload: {
              ...payload,
              _predecessor_operation_ids: [
                ...(previous?.predecessors ?? []),
                ...(previous?.operationId ? [previous.operationId] : []),
              ],
            } as Json,
          });
          if (!saved.error && activeScope.current === scope) {
            const canonical = saved.data as { write_version?: number } | null;
            versions.current[log.setNumber] = canonical?.write_version ?? expectedVersion;
          }
          return saved;
        },
      );
      if (
        result.error &&
        !(
          isRetryableWriteError(result.error) &&
          (await enqueueDurableTrainingWrite(userId, {
            kind: "exercise_set_log",
            dedupeKey,
            payload,
            operationId,
            expectedVersion,
          }))
        )
      )
        return false;
      // A successful old save belongs to its session, never the newly opened one.
      if (activeScope.current !== scope) return true;
      localEdits.current[log.setNumber] = log;
      setCurrent((state) => ({ ...state, [log.setNumber]: log }));
      return true;
    },
    [userId, key, sessionId, scope],
  );

  return { current, previous, recentSessions, loading, loadError, retry: load, saveSet };
}
