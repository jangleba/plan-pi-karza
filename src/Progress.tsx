import { useMemo } from "react";
import { EXERCISES, FEEL_NOW, feelChange, loadFeelings, loadHistory, localISO, series, sessionsPerWeek, trend, weekStartOf } from "./engine";
import type { Better, EventType, HistoryEvent } from "./engine";
import { LineChart, TREND_HEX } from "./LineChart";
import { Empty } from "./Sketch";
import { Group, LargeTitle, ListRow } from "./ui";

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
    <section className="bw-rise mb-3 rounded-3xl border border-hairline bg-card px-5 pb-3 pt-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {t && (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ color: TREND_HEX[t.tone], background: `${TREND_HEX[t.tone]}14` }}>
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
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Na boisku</h2>
      <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card px-5 py-4 text-[15px]">
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

  const label = (t: string) => <h2 className="mb-2 mt-6 px-1 text-xs uppercase tracking-wide text-muted">{t}</h2>;
  const labSeries = LABS.map((m) => ({ m, pts: series(events, m.type, m.key) }));
  const measured = labSeries.filter((x) => x.pts.length > 0);
  const missing = labSeries.filter((x) => x.pts.length === 0);
  const mas = series(events, "mas", "mas");
  const legend: Array<[string, string]> = [[TREND_HEX.green, "postęp"], [TREND_HEX.orange, "lekki spadek"], [TREND_HEX.red, "regres"]];

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <LargeTitle kind="progres" title="Progres" sub="Twoje trendy" />
      <div className="bw-rise mb-6 flex gap-4 px-1 text-xs text-muted">
        {legend.map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{t}</span>)}
      </div>
      {empty && (
        <div className="mb-6">
          <Empty kind="progres">Wykresy pojawią się po pierwszych sesjach i testach.</Empty>
        </div>
      )}
      <FeelSection />
      {label("Regularność")}
      <Card title="Sesje w tygodniu" points={weeks} better="higher" unit="" />
      {strengthKeys.length > 0 && label("Siła · szacowane 1RM")}
      {strengthKeys.map((k) => (
        <Card key={k} title={EXERCISES[k]?.name ?? k} points={series(events, "strength", k)} better="higher" unit=" kg" />
      ))}
      {mas.length > 0 && <>{label("Bieganie")}<Card title="MAS" points={mas} better="higher" unit=" km/h" /></>}
      {measured.length > 0 && label("Lab")}
      {measured.map(({ m, pts }) => <Card key={m.key} title={m.title} points={pts} better={m.better} unit={m.unit} />)}
      {missing.length > 0 && (
        <Group label="Jeszcze bez pomiarów">
          {missing.map(({ m }, i) => <ListRow key={m.key} index={i} title={m.title} detail="Lab" />)}
          {strengthKeys.length === 0 && <ListRow index={missing.length} title="Siła" detail="kg w sesji" />}
          {mas.length === 0 && <ListRow index={missing.length + 1} title="MAS" detail="test 5 min" />}
        </Group>
      )}
    </main>
  );
}
