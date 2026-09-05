import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/loadwise/auth";
import type { TrainingExercise } from "@/lib/loadwise/types";

/** Jeden zapisany zestaw (seria) ćwiczenia. */
export interface SetLog {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  /** Rodzaj pomiaru innego niż ciężar/powtórzenia (czas, dystans, kontakty, utrzymanie). */
  metricKind?: string | null;
  metricValue?: number | null;
}

interface SetLogRow {
  session_id: string | null;
  exercise_key: string;
  set_number: number;
  weight_kg: number | string | null;
  reps: number | null;
  rir: number | null;
  metric_kind?: string | null;
  metric_value?: number | string | null;
  performed_at: string;
}

/** Stabilny klucz ćwiczenia — po ID z biblioteki, w ostateczności po nazwie. */
export function exerciseKey(e: Pick<TrainingExercise, "exerciseId" | "name">): string {
  return (e.exerciseId?.trim() || e.name.trim().toLowerCase()).slice(0, 120);
}

/** Liczba planowanych serii ćwiczenia (0 = brak logowania serii). */
export function plannedSets(e: TrainingExercise): number {
  if (typeof e.sets === "number" && Number.isFinite(e.sets)) return Math.max(0, Math.round(e.sets));
  const match = String(e.displayPrescription ?? "").match(/(\d+)\s*(?:serie|serii|seria|×)/i);
  return match ? Number(match[1]) : 0;
}

function toLog(row: SetLogRow): SetLog {
  return {
    setNumber: row.set_number,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    reps: row.reps,
    rir: row.rir,
    metricKind: row.metric_kind ?? null,
    metricValue:
      row.metric_value === null || row.metric_value === undefined ? null : Number(row.metric_value),
  };
}

const table = () => supabase.from("exercise_set_logs" as never);

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
  return Object.fromEntries(selected.map((row) => [row.set_number, toLog(row)]));
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await table()
      .select(
        "session_id,exercise_key,set_number,weight_kg,reps,rir,metric_kind,metric_value,performed_at",
      )
      .eq("user_id", userId)
      .eq("exercise_key", key)
      .order("performed_at", { ascending: false })
      .limit(60);
    const rows = (data ?? []) as unknown as SetLogRow[];
    const mine: Record<number, SetLog> = {};
    for (const row of rows) {
      if (sessionId && row.session_id === sessionId) {
        if (!mine[row.set_number]) mine[row.set_number] = toLog(row);
      }
    }
    setCurrent(mine);
    setPrevious(previousSessionLogs(rows, sessionId));
    setLoading(false);
  }, [userId, key, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSet = useCallback(
    async (log: SetLog) => {
      if (!userId) return false;
      const { error } = await table().upsert(
        {
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
        } as never,
        { onConflict: "user_id,session_id,exercise_key,set_number" } as never,
      );
      if (error) {
        // Brak zapisu z session_id (np. konflikt indeksu częściowego) — spróbuj update.
        let updateQuery = table()
          .update({
            weight_kg: log.weightKg,
            reps: log.reps,
            rir: log.rir,
            metric_kind: log.metricKind ?? null,
            metric_value: log.metricValue ?? null,
            performed_at: new Date().toISOString(),
          } as never)
          .eq("user_id", userId)
          .eq("exercise_key", key)
          .eq("set_number", log.setNumber);
        updateQuery = sessionId
          ? updateQuery.eq("session_id", sessionId)
          : updateQuery.is("session_id", null);
        const { error: updateError } = await updateQuery;
        if (updateError) return false;
      }
      setCurrent((state) => ({ ...state, [log.setNumber]: log }));
      return true;
    },
    [userId, key, sessionId],
  );

  return { current, previous, loading, saveSet };
}

/** Subtelny opis poprzedniego wyniku serii. */
export function formatLastSet(log: SetLog | undefined): string {
  if (!log) return "Pierwszy zapis";
  const parts: string[] = [];
  if (log.weightKg !== null) parts.push(`${log.weightKg} kg`);
  if (log.reps !== null) parts.push(`× ${log.reps}`);
  const head = parts.join(" ");
  const rir = log.rir !== null ? `RIR ${log.rir}` : "";
  if (!head && !rir) return "Pierwszy zapis";
  return `Ostatnio: ${[head, rir].filter(Boolean).join(" · ")}`;
}
