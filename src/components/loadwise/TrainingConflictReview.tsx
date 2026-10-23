import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  readPendingTrainingWrites,
  recoverTrainingQueue,
  resolveTrainingQueueConflict,
  type StoredTrainingWrite,
} from "@/lib/loadwise/offlineTrainingQueue";

function summary(row: Record<string, unknown>) {
  const keys = [
    "completed",
    "completion_status",
    "duration_minutes",
    "rpe",
    "notes",
    "duration_sec",
    "distance_m",
    "exercise_key",
    "set_number",
    "weight_kg",
    "reps",
    "rir",
    "running_progression_level",
  ];
  return JSON.stringify(
    Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]])),
    null,
    2,
  );
}

export function TrainingConflictReview({ userId }: { userId: string }) {
  const [rows, setRows] = useState<StoredTrainingWrite[]>([]);
  const [selected, setSelected] = useState<{
    entry: StoredTrainingWrite;
    remote: Record<string, unknown> | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        setRows(
          readPendingTrainingWrites(userId).filter(
            (row) => row.status === "conflict" || row.status === "failed",
          ),
        );
    };
    void recoverTrainingQueue(userId).then(refresh);
    refresh();
    window.addEventListener("ballwise:training-queue-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("ballwise:training-queue-changed", refresh);
    };
  }, [userId]);

  async function compare(entry: StoredTrainingWrite) {
    setBusy(true);
    try {
      if (entry.kind === "running_progression") {
        setSelected({ entry, remote: null });
        return;
      }
      const table =
        entry.kind === "session_log"
          ? "session_logs"
          : entry.kind === "running_activity"
            ? "running_activities"
            : "exercise_set_logs";
      type Query = {
        eq(key: string, value: unknown): Query;
        is(key: string, value: null): Query;
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
      };
      let query = (supabase.from(table).select("*") as unknown as Query).eq("user_id", userId);
      query = entry.payload.session_id
        ? query.eq("session_id", entry.payload.session_id)
        : query.is("session_id", null);
      if (entry.kind === "exercise_set_log")
        query = query
          .eq("exercise_key", entry.payload.exercise_key)
          .eq("set_number", entry.payload.set_number);
      const result = await query.maybeSingle();
      if (result.error) throw result.error;
      setSelected({ entry, remote: result.data as Record<string, unknown> | null });
    } catch {
      toast.error("Połącz się z internetem, aby porównać wersje. Lokalna kopia została zachowana.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(choice: "server" | "local") {
    if (!selected?.entry.operationId) return;
    setBusy(true);
    try {
      const saved = await resolveTrainingQueueConflict(
        userId,
        selected.entry.operationId,
        choice,
        Number(selected.remote?.write_version ?? 0),
      );
      if (!saved) throw new Error("Changed");
      setSelected(null);
      toast.success(
        choice === "local"
          ? "Twoja wersja czeka na synchronizację."
          : "Zachowano wersję z serwera.",
      );
    } catch {
      toast.error("Zapis zmienił się podczas porównania. Ponownie wybierz wynik.");
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length) return null;
  return (
    <section className="soft-card space-y-3 p-4">
      <h2 className="font-semibold">Zapisy wymagające sprawdzenia ({rows.length})</h2>
      <p className="text-xs text-muted-foreground">
        Najpierw pobierz kopię danych z telefonu. Następnie porównaj zapis z serwerem i wybierz
        wersję.
      </p>
      {rows.map((row) => (
        <button
          disabled={busy}
          className="block min-h-11 text-left text-sm underline"
          key={row.operationId ?? row.dedupeKey}
          onClick={() => void compare(row)}
        >
          {row.kind === "session_log"
            ? "Wynik treningu"
            : row.kind === "running_activity"
              ? "Wynik biegu"
              : row.kind === "exercise_set_log"
                ? "Seria ćwiczenia"
                : "Starsza progresja biegu"}
          : {new Date(row.queuedAt).toLocaleString("pl-PL")}
        </button>
      ))}
      {selected && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold">Wersja na tym telefonie</h3>
          <pre className="overflow-auto whitespace-pre-wrap text-xs">
            {summary(selected.entry.payload as Record<string, unknown>)}
          </pre>
          <h3 className="text-sm font-semibold">Wersja na serwerze</h3>
          <pre className="overflow-auto whitespace-pre-wrap text-xs">
            {selected.remote ? summary(selected.remote) : "Brak zapisu do porównania."}
          </pre>
          {selected.entry.kind === "running_progression" ? (
            <p className="text-xs">
              Starsza operacja progresji nie zawiera wyniku treningu potrzebnego do bezpiecznego
              przeliczenia. Zachowaj ją w eksporcie; obecny poziom pochodzi z profilu na serwerze.
            </p>
          ) : (
            <button
              disabled={busy}
              className="min-h-11 w-full rounded-xl bg-primary px-3 text-sm text-primary-foreground"
              onClick={() => void resolve("local")}
            >
              Zapisz moją wersję jako nową korektę
            </button>
          )}
          <button
            disabled={busy}
            className="min-h-11 w-full rounded-xl border px-3 text-sm"
            onClick={() => void resolve("server")}
          >
            Zachowaj serwer i usuń tę lokalną kopię z kolejki
          </button>
          <button
            disabled={busy}
            className="min-h-11 w-full text-sm underline"
            onClick={() => setSelected(null)}
          >
            Anuluj
          </button>
        </div>
      )}
    </section>
  );
}
