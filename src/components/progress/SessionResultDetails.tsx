import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SessionCompletion } from "@/lib/loadwise/types";
import {
  readPendingTrainingWrites,
  recoverTrainingQueue,
} from "@/lib/loadwise/offlineTrainingQueue";
import {
  groupSessionResults,
  resultSetLabel,
  type SessionResultRow,
} from "@/lib/progress/sessionResults";

export function SessionResultDetails({
  ownerId,
  sessionId,
  completion,
  completions = {},
}: {
  ownerId?: string;
  sessionId: string;
  completion?: SessionCompletion;
  completions?: Record<string, SessionCompletion>;
}) {
  const [rows, setRows] = useState<SessionResultRow[]>([]),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<{ date: string; weight: number }[]>([]),
    [selected, setSelected] = useState("");
  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setError(null);
    setLoading(true);
    if (!ownerId) {
      setLoading(false);
      return;
    }
    void (async () => {
      await recoverTrainingQueue(ownerId);
      const result = await supabase
        .from("exercise_set_logs")
        .select(
          "session_id,exercise_key,exercise_name,set_number,weight_kg,reps,rir,metric_kind,metric_value,performed_at",
        )
        .eq("user_id", ownerId)
        .eq("session_id", sessionId)
        .order("performed_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      const pending = readPendingTrainingWrites(ownerId).flatMap((w) =>
        w.kind === "exercise_set_log" && w.payload.session_id === sessionId ? [w.payload] : [],
      );
      if (result.error && !pending.length) {
        setError("Nie udało się odczytać wyników. Spróbuj ponownie po połączeniu.");
        return;
      }
      setRows([...(result.data ?? []), ...pending] as SessionResultRow[]);
    })()
      .catch(() => {
        if (!cancelled) setError("Wyniki są chwilowo niedostępne.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, sessionId]);
  useEffect(() => {
    let cancelled = false;
    setTrend([]);
    if (!selected || !ownerId) return;
    void Promise.resolve()
      .then(() =>
        supabase
          .from("exercise_set_logs")
          .select("session_id,weight_kg,performed_at")
          .eq("user_id", ownerId)
          .eq("exercise_key", selected)
          .order("performed_at", { ascending: false })
          .limit(120),
      )
      .then((result) => {
        if (cancelled || result.error) return;
        const values = new Map<string, { date: string; weight: number }>();
        for (const r of result.data ?? []) {
          if (!r.session_id || !completions[r.session_id]?.completed || r.weight_kg == null)
            continue;
          const weight = Number(r.weight_kg);
          if (!Number.isFinite(weight)) continue;
          const old = values.get(r.session_id);
          if (!old || weight > old.weight)
            values.set(r.session_id, { date: r.performed_at.slice(0, 10), weight });
        }
        setTrend([...values.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-8));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected, ownerId, completions]);
  const result = groupSessionResults(rows, completion?.executionSnapshot);
  const weights = result.groups.filter((g) => g.sets.some((r) => r.weight_kg != null));
  if (loading)
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Odczytuję wyniki…
      </p>
    );
  if (error)
    return (
      <p className="text-xs text-muted-foreground" role="status">
        {error}
      </p>
    );
  return (
    <div className="bw-session-results">
      <p className="text-xs text-muted-foreground">
        {result.marked}/{result.total || "—"} ćwiczeń oznaczonych jako wykonane. Serie poniżej to
        osobne zapisane wyniki.
      </p>
      {result.markedNames.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-10 text-xs">Wykonane elementy</summary>
          <ul className="text-xs text-muted-foreground">
            {result.markedNames.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </details>
      )}
      {!result.groups.length && (
        <p className="text-xs text-muted-foreground">
          Brak osobno zapisanych serii lub czasów. Ukończenie sesji nie oznacza kompletu zapisanych
          wyników.
        </p>
      )}
      {result.groups.map((g) => (
        <section key={g.key} className="mt-3">
          <h4 className="text-sm font-semibold">{g.name}</h4>
          <ol className="mt-1 space-y-1 text-xs text-muted-foreground">
            {g.sets.map((r) => (
              <li key={r.set_number}>
                Seria {r.set_number}: {resultSetLabel(r)}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {weights.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <label className="block text-xs font-medium">
            Historia ciężaru
            <select
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
              aria-label="Ćwiczenie na wykresie"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Wybierz ćwiczenie</option>
              {weights.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {selected && trend.length < 2 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Wykres wymaga zapisów z co najmniej dwóch ukończonych sesji.
            </p>
          )}
          {trend.length >= 2 && (
            <>
              <svg
                viewBox="0 0 300 100"
                role="img"
                aria-label="Największy zapisany ciężar w kolejnych sesjach"
                className="mt-3 w-full"
              >
                <path d="M10 85H290" stroke="var(--border)" fill="none" />
                {(() => {
                  const low = Math.min(...trend.map((p) => p.weight)),
                    high = Math.max(...trend.map((p) => p.weight));
                  const points = trend.map((p, i) => ({
                    x: 10 + (i * 280) / (trend.length - 1),
                    y: 80 - ((p.weight - low) / Math.max(1, high - low)) * 65,
                    ...p,
                  }));
                  return (
                    <>
                      <polyline
                        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth="2"
                      />
                      {points.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r="3"
                          fill={i === points.length - 1 ? "#228466" : "var(--primary)"}
                        >
                          <title>
                            {p.date}: {p.weight} kg
                          </title>
                        </circle>
                      ))}
                    </>
                  );
                })()}
              </svg>
              <p className="text-xs text-muted-foreground">
                Największy zapisany ciężar w sesji, w kg. Porównuj także powtórzenia, zapas i
                technikę.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
