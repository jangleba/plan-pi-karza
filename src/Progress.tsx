import { useMemo } from "react";
import { EXERCISES, FEEL_NOW, feelChange, loadFeelings, loadHistory, localISO, series, sessionsPerWeek, trend, weekStartOf } from "./engine";
import type { Better, EventType, HistoryEvent } from "./engine";
import { LineChart, TREND_HEX } from "./LineChart";
import { Empty, PageHeader } from "./Sketch";

interface Metric { title: string; type: EventType; key: string; unit: string; better: Better; fmt?: (v: number) => number }

const LABS: Metric[] = [
  { title: "CMJ", type: "lab", key: "cmj", unit: " cm", better: "higher" },
  { title: "Skok w dal", type: "lab", key: "broad-jump", unit: " cm", better: "higher" },
  { title: "Sprint 10 m", type: "lab", key: "sprint-10", unit: " s", better: "lower" },
  { title: "Sprint 20 m", type: "lab", key: "sprint-20", unit: " s", better: "lower" },
  { title: "Sprint 30 m", type: "lab", key: "sprint-30", unit: " s", better: "lower" },
  { title: "Yo-Yo IR1", type: "lab", key: "yoyo-ir1", unit: " m", better: "higher" },
];

function Card({
  title, points, better, unit,
}: { title: string; points: Array<{ date: string; value: number }>; better: Better; unit: string }) {
  const t = trend(points.map((p) => p.value), better);
  return (
    <section className="mb-3 rounded-2xl bg-card p-4 border border-hairline">
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

const FEEL_LABEL = Object.fromEntries(FEEL_NOW) as Record<string, string>;

/** Jak zawodnik czuje się na boisku: pierwsza vs ostatnia odpowiedź. */
function FeelSection() {
  const all = loadFeelings();
  if (!all.length) return null;
  const first = all[0]!, last = all[all.length - 1]!;
  const ch = all.length > 1 ? feelChange(first, last) : null;
  return (
    <>
      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Na boisku</h2>
      <section className="mb-3 rounded-2xl border border-hairline bg-card p-4 text-sm">
        {ch ? (
          <>
            {ch.better.map((f) => <p key={f} className="text-green-ink">Lepiej: już nie „{FEEL_LABEL[f]}”</p>)}
            {ch.worse.map((f) => <p key={f} className="text-red-ink">Nowe: „{FEEL_LABEL[f]}”</p>)}
            {!ch.better.length && !ch.worse.length && <p className="text-muted">Bez zmian od {first.date.split("-").reverse().join(".")}.</p>}
          </>
        ) : (
          <p className="text-muted">
            {last.now.length ? last.now.map((f) => FEEL_LABEL[f]).join(", ") : "Bez problemów"} · pytanie wróci za 5 tygodni.
          </p>
        )}
      </section>
    </>
  );
}

export function Progress({ refreshKey }: { refreshKey?: number }) {
  const events: HistoryEvent[] = useMemo(loadHistory, [refreshKey]);
  const strengthKeys = [...new Set(events.filter((e) => e.type === "strength").map((e) => e.key))];
  const weeks = sessionsPerWeek(events, weekStartOf(localISO()));
  const empty = events.length === 0;

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-14">
      <PageHeader kind="progres" title="Progres" sub="Zielony – postęp, pomarańczowy i czerwony – regres." />
      {empty && (
        <div className="mb-4">
          <Empty kind="progres">Wykresy pojawią się po pierwszych sesjach i testach.</Empty>
        </div>
      )}
      <FeelSection />
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
