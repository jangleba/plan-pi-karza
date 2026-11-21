import { useMemo, useState } from "react";
import { FEEL_NOW, adherence, byKind, feelChange, insights, inRange, loadFeelings, loadHistory, localISO, nutritionSummary, recentAdherence, records, series, streak, trend, weeklyByKind } from "./engine";
import type { HistoryEvent, Metric, Profile, Range } from "./engine";
import { KIND_PL, fmtValue } from "./engine/progress2";
import { Empty } from "./Sketch";
import { LargeTitle } from "./ui";
import { VARIANTS, attemptStats, createScenario } from "./engine/sim";
import { loadAttempts } from "./iq/attempts-store";
import { TREND_HEX } from "./progress/trend";
import { Heatmap } from "./progress/Heatmap";
import { KindSheet, RangeTabs } from "./progress/KindSheet";
import { RunsCard } from "./progress/RunsCard";
import { GoalPath } from "./goal/GoalPath";
import { Sparkline } from "./progress/TrendChart";
import { nutritionDays, plannedDays } from "./progress/data";
import { GROUP_KIND, GROUP_TITLE, allMetrics, groupOf, sesji, shortDate, type Group } from "./progress/metrics";

const FEEL_LABEL = Object.fromEntries(FEEL_NOW) as Record<string, string>;
const label = (t: string) => <h2 className="mb-2 mt-7 px-1 text-xs uppercase tracking-wide text-muted">{t}</h2>;
const card = "bw-rise rounded-3xl border border-hairline bg-card";
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")}%`;

type CardKey = Group | "technique";

/** Kafelek rodzaju treningu: główna metryka z trendem i wykresem, liczba sesji z 4 tygodni. */
function KindCard({ k, events, metrics, today, range, onOpen }: { k: CardKey; events: HistoryEvent[]; metrics: Metric[]; today: string; range: Range; onOpen?: () => void }) {
  const kind = k === "technique" ? "technique" : GROUP_KIND[k];
  const title = k === "technique" ? "Technika" : GROUP_TITLE[k];
  const done28 = events.filter((e) => e.type === "session" && !e.viaRest && e.key === kind && e.date >= shiftDays(today, -28)).length;
  const mine = k === "technique" ? [] : metrics.filter((m) => groupOf(m) === k).map((m) => ({ m, s: series(events, m.type, m.key) })).filter((x) => x.s.length > 0);
  // główna metryka: ta, która ma najwięcej pomiarów (przy remisie – najświeższa)
  const main = [...mine].sort((a, b) => b.s.length - a.s.length)[0];
  const weekly = weeklyByKind(events, kind, today);
  const t = main ? trend(main.s.map((p) => p.value), main.m.better) : null;
  const spark = main ? inRange(main.s, range, today) : inRange(weekly, range, today);
  const tone = t?.tone ?? "neutral";
  const clickable = k !== "technique";
  const Tag = clickable ? "button" : "div";
  return (
    <Tag onClick={clickable ? onOpen : undefined} className={`${card} flex flex-col p-4 text-left ${clickable ? "active:scale-[0.98]" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{title}</span>
        {t && <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums" style={{ color: TREND_HEX[t.tone], background: `${TREND_HEX[t.tone]}14` }}>{pct(t.pct)}</span>}
      </div>
      {main ? (
        <>
          <div className="mt-1 text-[22px] font-semibold leading-tight tabular-nums">{fmtValue(main.m, main.s[main.s.length - 1]!.value)}<span className="text-xs font-normal text-muted">{main.m.unit}</span></div>
          <div className="line-clamp-2 min-h-[28px] text-[11px] leading-[14px] text-muted">{main.m.title}</div>
        </>
      ) : (
        <>
          <div className="mt-1 text-[22px] font-semibold leading-tight tabular-nums">{done28}</div>
          <div className="text-[11px] text-muted">{done28 === 1 ? "sesja" : "sesji"} w 4 tyg.</div>
        </>
      )}
      <div className="mt-2"><Sparkline points={spark} tone={tone} /></div>
      {main && <div className="mt-1.5 text-[11px] tabular-nums text-muted">{sesji(done28)} w 4 tyg.</div>}
    </Tag>
  );
}

function shiftDays(iso: string, n: number): string {
  const d = new Date(Date.parse(iso)); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** Jak zawodnik czuje się na boisku: pierwsza vs ostatnia odpowiedź. */
function FeelSection() {
  const all = loadFeelings();
  if (!all.length) return null;
  const first = all[0]!, last = all[all.length - 1]!;
  const ch = all.length > 1 ? feelChange(first, last) : null;
  return (
    <>
      {label("Na boisku")}
      <section className={`${card} px-5 py-4 text-[15px]`}>
        {ch ? (
          <>
            {ch.better.map((f) => <p key={f} className="text-green-ink">Lepiej: już nie „{FEEL_LABEL[f]}”</p>)}
            {ch.worse.map((f) => <p key={f} className="text-red-ink">Nowe: „{FEEL_LABEL[f]}”</p>)}
            {!ch.better.length && !ch.worse.length && <p className="text-muted">Bez zmian od {first.date.split("-").reverse().join(".")}.</p>}
          </>
        ) : (
          <p className="text-muted">{last.now.length ? last.now.map((f) => FEEL_LABEL[f]).join(", ") : "Bez problemów"} · pytanie wróci za 5 tygodni.</p>
        )}
      </section>
    </>
  );
}

export function Progress({ profile, refreshKey }: { profile: Profile; refreshKey?: number }) {
  const today = localISO();
  const events: HistoryEvent[] = useMemo(loadHistory, [refreshKey]);
  const metrics = useMemo(() => allMetrics(events), [events]);
  const [range, setRange] = useState<Range>("12w");
  const [open, setOpen] = useState<Group | null>(null);

  const planned = useMemo(() => plannedDays(profile, today, 12), [profile, today]);
  const adh = useMemo(() => adherence(planned, events, today, profile.startDate), [planned, events, today, profile.startDate]);
  const recent = recentAdherence(adh.weeks, today);
  const serie = streak(adh.weeks, today);
  const kinds = useMemo(() => byKind(adh.cells, today, 28), [adh.cells, today]);
  const recs = useMemo(() => records(events, metrics, today), [events, metrics, today]);
  const nutDays = useMemo(() => nutritionDays(profile, today, 14), [profile, today]);
  const nut = nutritionSummary(nutDays);
  const notes = insights({ events, metrics, today, adherence: recent, kinds, nutrition: nut });
  const attempts = useMemo(loadAttempts, [refreshKey]);
  const iq = useMemo(() => { const names = createScenario(0).agents; return attemptStats(attempts, (id) => names.find((a) => a.id === id)?.name ?? id); }, [attempts]);
  const empty = events.length === 0 && attempts.length === 0;
  const legend: Array<[string, string]> = [[TREND_HEX.green, "postęp"], [TREND_HEX.orange, "lekki spadek"], [TREND_HEX.red, "regres"]];

  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-14">
      <LargeTitle kind="progres" title="Progres" sub="Twoje trendy" />
      {empty && <div className="mb-5"><Empty kind="progres">Wykresy pojawią się po pierwszych sesjach i testach.</Empty></div>}

      <RangeTabs range={range} onChange={setRange} />
      <div className="mt-3 flex gap-4 px-1 text-xs text-muted">
        {legend.map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{t}</span>)}
      </div>

      <GoalPath profile={profile} events={events} metrics={metrics} planned={planned} today={today} />

      {label("Treningi")}
      <div className="grid grid-cols-2 gap-3">
        {(["strength", "speed", "run", "technique"] as CardKey[]).map((k) => (
          <KindCard key={k} k={k} events={events} metrics={metrics} today={today} range={range} onOpen={k !== "technique" ? () => setOpen(k as Group) : undefined} />
        ))}
      </div>

      <RunsCard refreshKey={refreshKey} />

      {label("Regularność")}
      <section className={`${card} px-5 py-4`}>
        {recent ? (
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="text-[34px] font-semibold leading-none tabular-nums">{recent.pct}<span className="text-base font-normal text-muted">%</span></div>
              <div className="mt-1 text-xs text-muted">realizacji planu · {recent.done} z {recent.planned} sesji w 4 tyg.</div>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-semibold leading-none tabular-nums">{serie}</div>
              <div className="mt-1 text-xs text-muted">tyg. z rzędu ≥ 80%</div>
            </div>
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted">Realizacja planu pojawi się po pierwszym pełnym tygodniu.</p>
        )}
        <Heatmap cells={adh.cells} today={today} />
        {kinds.length > 0 && (
          <div className="mt-4 space-y-2.5 border-t border-hairline pt-3">
            {kinds.map((k) => (
              <div key={k.kind}>
                <div className="mb-1 flex justify-between text-xs"><span>{KIND_PL[k.kind] ?? k.kind}</span><span className="tabular-nums text-muted">{k.done} z {k.planned}</span></div>
                <div className="h-1.5 rounded-full bg-hairline"><div className="h-1.5 rounded-full bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)]" style={{ width: `${k.planned ? (k.done / k.planned) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted">Plan liczony wg obecnych ustawień profilu; seria = tydzień z realizacją ≥ 80% (próg umowny).</p>
      </section>

      {recs.length > 0 && (
        <>
          {label("Rekordy")}
          <section className={`${card} px-5 py-1`}>
            <ul className="divide-y divide-hairline/70">
              {recs.slice(0, 8).map((r) => (
                <li key={r.metric.key} className="flex items-center justify-between gap-3 py-3 text-[15px]">
                  <span className="min-w-0">{r.metric.title}{r.isNew && <span className="ml-2 rounded-full bw-sel px-2 py-0.5 text-[10px] font-medium">nowy</span>}{r.first && <span className="ml-2 text-[11px] text-muted">pierwszy pomiar</span>}</span>
                  <span className="shrink-0 tabular-nums"><span className="font-semibold">{fmtValue(r.metric, r.value)}{r.metric.unit}</span><span className="ml-2 text-xs text-muted">{shortDate(r.date)}</span></span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {notes.length > 0 && (
        <>
          {label("Wnioski")}
          <section className={`${card} px-5 py-4`}>
            <ul className="space-y-2.5 text-[15px] leading-snug">
              {notes.map((n) => <li key={n} className="border-l-2 border-btn-line pl-3">{n}</li>)}
            </ul>
            <p className="mt-3 text-[11px] text-muted">Opis liczb z Twoich danych – bez zgadywania przyczyn.</p>
          </section>
        </>
      )}

      {label("Odżywianie")}
      <section className={`${card} px-5 py-4`}>
        {nut.logged >= 3 ? (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Ostatnie 14 dni">
              {nutDays.map((d) => {
                const ok = d.logged && d.carb >= 0.85 * d.target.carb;
                return <span key={d.date} title={`${shortDate(d.date)}${d.logged ? "" : " · brak wpisów"}`} className={`h-4 w-4 rounded-full ${ok ? "bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)]" : d.logged ? "border border-muted/60 bg-card" : "bg-hairline/50"}`} />;
              })}
            </div>
            <ul className="space-y-1.5 text-[15px]">
              <li className="flex justify-between"><span>Węglowodany ≥ 85% celu</span><span className="tabular-nums text-muted">{nut.carbOk} z {nut.logged} dni</span></li>
              <li className="flex justify-between"><span>Białko ≥ 85% celu</span><span className="tabular-nums text-muted">{nut.proteinOk} z {nut.logged} dni</span></li>
              <li className="flex justify-between"><span>Woda ≥ 85% celu</span><span className="tabular-nums text-muted">{nut.waterOk} z {nut.logged} dni</span></li>
              {nut.avgCarbPct !== null && <li className="flex justify-between"><span>Średnio węglowodanów</span><span className="tabular-nums text-muted">{nut.avgCarbPct}% celu</span></li>}
            </ul>
            <p className="mt-3 text-[11px] text-muted">Ostatnie {nut.total} dni; liczone tylko dni z wpisami ({nut.logged}). Cele z planu dnia w Fuel – orientacyjne.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Za mało wpisów na wnioski ({nut.logged} z {nut.total} dni). Dodawaj posiłki w Fuel – po 3 dniach pojawi się podsumowanie.</p>
        )}
      </section>

      {iq && (
        <>
          {label("IQ · decyzje z piłką")}
          <section className={`${card} px-5 py-4`}>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-[34px] font-semibold leading-none tabular-nums">{iq.cleanPct}<span className="text-base font-normal text-muted">%</span></div>
                <div className="mt-1 text-xs text-muted">wyjść bez straty · {iq.clean} z {iq.total} prób</div>
              </div>
              {iq.lastPct !== null && <div className="text-right"><div className="text-[22px] font-semibold leading-none tabular-nums">{iq.lastPct}%</div><div className="mt-1 text-xs text-muted">ostatnie 5 prób</div></div>}
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Ostatnie próby">
              {attempts.slice(-14).map((a, i) => (
                <span key={i} title={a.cls} className={`h-4 w-4 rounded-full ${a.cls === "clean" ? "bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)]" : a.cls === "recovered" ? "border border-btn-line bg-card" : "border border-dashed border-muted/60 bg-card"}`} />
              ))}
            </div>
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)]" />bez straty</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-btn-line" />strata odzyskana</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-dashed border-muted/60" />strata i kontra</span>
            </div>
            <ul className="space-y-1.5 border-t border-hairline pt-3 text-[15px]">
              {iq.byVariant.map((v) => (
                <li key={v.variant} className="flex justify-between"><span>{VARIANTS[v.variant]?.title ?? `Wariant ${v.variant + 1}`}</span><span className="tabular-nums text-muted">{v.clean} z {v.total}</span></li>
              ))}
            </ul>
            {iq.mistake && <p className="mt-3 border-l-2 border-btn-line pl-3 text-[15px] leading-snug">Najczęstszy błąd: {iq.mistake.text} ({iq.mistake.count}×).</p>}
            <p className="mt-3 text-[11px] text-muted">Bez punktów: liczy się, czy akcja skończyła się bez straty piłki.</p>
          </section>
        </>
      )}

      <FeelSection />

      {open && <KindSheet group={open} events={events} metrics={metrics} today={today} range={range} onClose={() => setOpen(null)} />}
    </main>
  );
}
