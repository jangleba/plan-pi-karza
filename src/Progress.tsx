import { useMemo } from "react";
import { EXERCISES, loadHistory, series, sessionsPerWeek, trend } from "./engine";
import type { Better, EventType, HistoryEvent } from "./engine";
import { LineChart, TREND_HEX } from "./LineChart";

interface Metric { title: string; type: EventType; key: string; unit: string; better: Better; fmt?: (v: number) => number }

const LABS: Metric[] = [
  { title: "CMJ", type: "lab", key: "cmj", unit: " cm", better: "higher" },
  { title: "Skok w dal", type: "lab", key: "broad-jump", unit: " cm", better: "higher" },
  { title: "Sprint 10 m", type: "lab", key: "sprint-10", unit: " s", better: "lower" },
  { title: "Sprint 20 m", type: "lab", key: "sprint-20", unit: " s", better: "lower" },
  { title: "Sprint 30 m", type: "lab", key: "sprint-30", unit: " s", better: "lower" },
];

function Card({
  title, points, better, unit,
}: { title: string; points: Array<{ date: string; value: number }>; better: Better; unit: string }) {
  const t = trend(points.map((p) => p.value), better);
  return (
    <section className="mb-3 rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {t && (
          <span className="text-xs font-medium" style={{ color: TREND_HEX[t.tone] }}>
            {t.pct >= 0 ? "+" : ""}{t.pct.toFixed(1)}%
          </span>
        )}
      </div>
      {points.length >= 2 ? (
        <LineChart points={points.map((p) => ({ label: p.date, value: p.value }))} tone={t?.tone ?? "neutral"} unit={unit} />
      ) : (
        <p className="py-4 text-sm text-muted">
          {points.length === 1 ? "Jeden pomiar – po drugim pojawi się trend." : "Brak danych."}
        </p>
      )}
    </section>
  );
}

export function Progress({ refreshKey }: { refreshKey?: number }) {
  const events: HistoryEvent[] = useMemo(loadHistory, [refreshKey]);
  const strengthKeys = [...new Set(events.filter((e) => e.type === "strength").map((e) => e.key))];
  const weeks = sessionsPerWeek(events);
  const empty = events.length === 0;

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-14">
      <h1 className="text-3xl font-semibold tracking-tight">Progres</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Zielony – postęp, pomarańczowy i czerwony – regres.</p>
      {empty && (
        <p className="mb-4 rounded-2xl bg-yellow-soft p-3 text-sm text-yellow-ink">
          Brak danych. Wykresy pojawią się po pierwszych sesjach i testach.
        </p>
      )}
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Regularność</h2>
      <Card title="Sesje w tygodniu" points={weeks} better="higher" unit="" />
      <h2 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Siła (szac. 1RM)</h2>
      {strengthKeys.length === 0 && <p className="mb-3 text-sm text-muted">Wpisz kg w sesji siłowej.</p>}
      {strengthKeys.map((k) => (
        <Card key={k} title={EXERCISES[k]?.name ?? k} points={series(events, "strength", k)} better="higher" unit=" kg" />
      ))}
      <h2 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Bieganie</h2>
      <Card title="MAS" points={series(events, "mas", "mas")} better="higher" unit=" km/h" />
      <h2 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Lab</h2>
      {LABS.map((m) => (
        <Card key={m.key} title={m.title} points={series(events, m.type, m.key)} better={m.better} unit={m.unit} />
      ))}
    </main>
  );
}
