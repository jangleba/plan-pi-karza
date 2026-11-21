import { useMemo, useState } from "react";
import { FOCUS_LABEL, adherence, cycleAt, cycleRegularity, loadAmbition, milestones, previousCycle, summarizeCycle } from "../engine";
import type { HistoryEvent, Metric, PlannedDay, Profile } from "../engine";
import { fmtValue } from "../engine/progress2";
import { shortDate } from "../progress/metrics";
import { GoalSheet } from "./GoalSheet";

const card = "bw-rise rounded-3xl border border-hairline bg-card px-5 py-4";
const label = (t: string) => <h2 className="mb-2 mt-7 px-1 text-xs uppercase tracking-wide text-muted">{t}</h2>;
const pl = (iso: string) => iso.split("-").reverse().join(".");

function Check({ on }: { on: boolean }) {
  return <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${on ? "bg-btn text-btn-ink shadow-[inset_0_0_0_1px_var(--color-btn-line)]" : "border border-hairline text-transparent"}`} aria-hidden="true">✓</span>;
}

/** „Droga do celu” (ambicja, regularność w cyklu, kamienie milowe) i podsumowanie ostatnio zakończonego cyklu. */
export function GoalPath({ profile, events, metrics, planned, today }: { profile: Profile; events: HistoryEvent[]; metrics: Metric[]; planned: PlannedDay[]; today: string }) {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const ambition = useMemo(loadAmbition, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = useMemo(() => {
    const weeks = adherence(planned, events, today, profile.startDate).weeks;
    const cycle = cycleAt(profile.startDate, today);
    const prev = previousCycle(cycle);
    return { cycle, reg: cycleRegularity(planned, events, cycle, today), list: milestones(events, weeks, today), summary: prev ? summarizeCycle(prev, planned, events, metrics, weeks, today) : null };
  }, [profile, events, metrics, planned, today]);
  const { cycle, reg, list, summary } = d;
  const labTitle = (m: Metric) => m.title;

  return (
    <>
      {label("Droga do celu")}
      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold leading-snug">{ambition?.league ? `Twoja ambicja: ${ambition.league}` : ambition ? "Twój cel na ten cykl" : "Nie ustawiono celu"}</div>
            {ambition && ambition.focus.length > 0 && <div className="mt-0.5 text-sm text-muted">Pracujesz nad: {ambition.focus.map((f) => FOCUS_LABEL[f]).join(", ")}</div>}
          </div>
          <button onClick={() => setOpen(true)} className="shrink-0 text-sm text-muted underline">{ambition ? "Zmień" : "Ustal"}</button>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Cykl {cycle.index + 1}, tydzień {cycle.weekNo} z 5</span>
            <span className="tabular-nums">{reg.planned ? `${reg.done} z ${reg.planned} treningów` : "Dopiero zaczynasz"}</span>
          </div>
          <div className="h-1.5 rounded-full bg-hairline"><div className="h-1.5 rounded-full bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)]" style={{ width: `${reg.planned ? (reg.done / reg.planned) * 100 : 0}%` }} /></div>
        </div>
        <ul className="mt-4 space-y-2.5 border-t border-hairline pt-3">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-3 text-[15px]">
              <Check on={m.done} />
              <span className={m.done ? "" : "text-muted"}>{m.title}</span>
              <span className="ml-auto text-xs tabular-nums text-muted">{m.done ? (m.achievedOn ? shortDate(m.achievedOn) : "") : m.target ? `${m.value ?? 0} z ${m.target}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      {label("Podsumowanie cyklu")}
      <section className={card}>
        {summary ? (
          <>
            <div className="text-[17px] font-semibold">Cykl {summary.cycle.index + 1}</div>
            <div className="text-xs text-muted">{pl(summary.cycle.start)} – {pl(summary.cycle.end)}</div>
            <div className="mt-4 text-sm">
              <div className="flex justify-between"><span>Regularność</span><span className="tabular-nums">{summary.regularity.planned ? `${summary.regularity.done} z ${summary.regularity.planned} treningów (${summary.regularity.pct}%)` : "brak planu"}</span></div>
              {summary.regularity.viaRest > 0 && <div className="mt-0.5 text-xs text-muted">w tym {summary.regularity.viaRest} × regeneracja zamiast sesji</div>}
            </div>
            {summary.lab.length > 0 && (
              <div className="mt-4 border-t border-hairline pt-3">
                <div className="mb-1.5 text-xs uppercase tracking-wide text-muted">Lab</div>
                <ul className="space-y-1.5 text-sm">
                  {summary.lab.map((l) => (
                    <li key={l.metric.key} className="flex justify-between gap-3">
                      <span>{labTitle(l.metric)}</span>
                      <span className="tabular-nums">{fmtValue(l.metric, l.to)}{l.metric.unit}{l.delta !== undefined && l.improved !== null ? <span className="ml-2 text-muted">{l.improved ? "▲" : "▼"} {fmtValue(l.metric, Math.abs(l.delta))}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.records.length > 0 && (
              <div className="mt-4 border-t border-hairline pt-3">
                <div className="mb-1.5 text-xs uppercase tracking-wide text-muted">Rekordy</div>
                <ul className="space-y-1.5 text-sm">
                  {summary.records.map((r) => <li key={r.metric.key} className="flex justify-between gap-3"><span>{r.metric.title}</span><span className="tabular-nums">{fmtValue(r.metric, r.value)}{r.metric.unit}<span className="ml-2 text-xs text-muted">{shortDate(r.date)}</span></span></li>)}
                </ul>
              </div>
            )}
            {summary.milestones.length > 0 && (
              <div className="mt-4 border-t border-hairline pt-3">
                <div className="mb-1.5 text-xs uppercase tracking-wide text-muted">Kamienie milowe</div>
                <ul className="space-y-1.5 text-sm">
                  {summary.milestones.map((m) => <li key={m.id} className="flex items-center gap-3"><Check on /><span>{m.title}</span></li>)}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">Podsumowanie pojawi się po zakończeniu pierwszego cyklu{cycle.daysLeft > 0 ? ` (za ${cycle.daysLeft} ${cycle.daysLeft === 1 ? "dzień" : "dni"})` : ""}.</p>
        )}
      </section>
      {open && <GoalSheet onClose={() => setOpen(false)} onSaved={() => setTick((t) => t + 1)} />}
    </>
  );
}
