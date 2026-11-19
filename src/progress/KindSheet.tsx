import { useMemo, useState } from "react";
import { Sheet } from "../Sheet";
import { inRange, records, series, trend, weeklyByKind } from "../engine";
import type { HistoryEvent, Metric, Range } from "../engine";
import { fmtValue } from "../engine/progress2";
import { TrendChart } from "./TrendChart";
import { GROUP_KIND, GROUP_TITLE, groupOf, shortDate, type Group } from "./metrics";

export const RANGES: Array<[Range, string]> = [["4w", "4 tyg."], ["12w", "12 tyg."], ["all", "Wszystko"]];

export function RangeTabs({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-hairline/70 p-1">
      {RANGES.map(([r, t]) => (
        <button key={r} onClick={() => onChange(r)} className={`rounded-xl py-1.5 text-sm ${range === r ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>
      ))}
    </div>
  );
}

/** Szczegóły rodzaju treningu: wykresy metryk, sesje w tygodniu i rekordy. */
export function KindSheet({ group, events, metrics, today, range: r0, onClose }: { group: Group; events: HistoryEvent[]; metrics: Metric[]; today: string; range: Range; onClose: () => void }) {
  const [range, setRange] = useState<Range>(r0);
  const mine = useMemo(() => metrics.filter((m) => groupOf(m) === group), [metrics, group]);
  const recs = useMemo(() => records(events, mine, today), [events, mine, today]);
  const weekly = weeklyByKind(events, GROUP_KIND[group], today);
  const withData = mine.map((m) => ({ m, all: series(events, m.type, m.key) })).filter((x) => x.all.length > 0);
  const card = "mb-3 rounded-2xl border border-hairline bg-card px-4 pb-3 pt-3";
  return (
    <Sheet title={GROUP_TITLE[group]} onClose={onClose}>
      <RangeTabs range={range} onChange={setRange} />
      <div className="mt-4">
        {withData.map(({ m, all }) => {
          const pts = inRange(all, range, today);
          const t = trend(all.map((p) => p.value), m.better);
          return (
            <section key={m.key} className={card}>
              <h3 className="mb-2 text-sm font-semibold">{m.title}</h3>
              {pts.length >= 1 ? <TrendChart points={pts} tone={t?.tone ?? "neutral"} unit={m.unit} dec={m.dec ?? 1} better={m.better} /> : <p className="py-3 text-sm text-muted">Brak pomiarów w tym zakresie.</p>}
              {all.length === 1 && <p className="text-xs text-muted">Jeden pomiar – po drugim pojawi się trend.</p>}
            </section>
          );
        })}
        {withData.length === 0 && <p className="mb-3 text-sm text-muted">Brak pomiarów. Wykresy pojawią się po pierwszych zapisach.</p>}
        <section className={card}>
          <h3 className="mb-2 text-sm font-semibold">Sesje w tygodniu</h3>
          {inRange(weekly, range, today).length >= 2 ? <TrendChart points={inRange(weekly, range, today)} tone="neutral" dec={0} /> : <p className="py-3 text-sm text-muted">Za mało tygodni z danymi.</p>}
        </section>
        {recs.length > 0 && (
          <section className={card}>
            <h3 className="mb-1 text-sm font-semibold">Rekordy</h3>
            <ul className="divide-y divide-hairline/70">
              {recs.map((r) => (
                <li key={r.metric.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>{r.metric.title}{r.isNew && <span className="ml-2 rounded-full bw-sel px-2 py-0.5 text-[10px] font-medium">nowy</span>}</span>
                  <span className="tabular-nums"><span className="font-semibold">{fmtValue(r.metric, r.value)}{r.metric.unit}</span><span className="ml-2 text-xs text-muted">{shortDate(r.date)}</span></span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}
