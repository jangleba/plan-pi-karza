import { useMemo, useState } from "react";
import { adherence, ambitionCardHidden, cycleAt, cycleRegularity, dismissAmbitionCard, dreamLabel, visionLabel, loadAmbition, loadHistory, localISO, milestones, nextMilestone } from "../engine";
import type { Profile } from "../engine";
import { plannedDays } from "../progress/data";
import { GoalSheet } from "./GoalSheet";

/** Karta celu na Starcie: do ustawienia albo ambicja, regularność w cyklu i najbliższy kamień milowy. */
export function GoalCard({ profile }: { profile: Profile }) {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const today = localISO();
  const ambition = useMemo(loadAmbition, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useMemo(() => {
    const events = loadHistory();
    const planned = plannedDays(profile, today, 12);
    const cycle = cycleAt(profile.startDate, today);
    return { cycle, reg: cycleRegularity(planned, events, cycle, today), next: nextMilestone(milestones(events, adherence(planned, events, today, profile.startDate).weeks, today)) };
  }, [profile, today, tick]);
  const sheet = open && <GoalSheet onClose={() => setOpen(false)} onSaved={() => setTick((t) => t + 1)} />;

  if (!ambition) {
    if (ambitionCardHidden(today)) return null;
    return (
      <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card px-5 py-4" aria-label="Cel">
        <h2 className="text-[17px] font-semibold">Ustal swój cel</h2>
        <p className="mt-1 text-sm text-muted">Trzy krótkie pytania – liga i Twoja wizja.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setOpen(true)} className="flex-1 rounded-2xl bw-grad py-3 text-sm font-medium">Ustal</button>
          <button onClick={() => { dismissAmbitionCard(today); setTick((t) => t + 1); }} className="rounded-2xl bg-canvas px-4 text-sm text-muted">Nie teraz</button>
        </div>
        {sheet}
      </section>
    );
  }
  const { cycle, reg, next } = data;
  return (
    <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card px-5 py-4" aria-label="Cel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug">{ambition.league ? `Twoja ambicja: ${ambition.league}` : "Twój cel na ten cykl"}</h2>
          {ambition.vision && <p className="mt-0.5 text-sm text-muted">Za rok: {visionLabel(ambition.vision)}</p>}
        </div>
        <button onClick={() => setOpen(true)} className="shrink-0 text-sm text-muted underline">Zmień</button>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Tydzień {cycle.weekNo} z 5</span>
          <span className="tabular-nums">{reg.planned ? `${reg.done} z ${reg.planned} treningów` : "Dopiero zaczynasz"}</span>
        </div>
        <div className="h-1.5 rounded-full bg-hairline"><div className="h-1.5 rounded-full bg-btn shadow-[inset_0_0_0_1px_var(--color-btn-line)] transition-[width] duration-500" style={{ width: `${reg.planned ? (reg.done / reg.planned) * 100 : 0}%` }} /></div>
      </div>
      {next ? (
        <p className="mt-3 text-sm">Następny kamień milowy: <span className="font-medium">{next.title}</span>{next.target ? <span className="tabular-nums text-muted"> ({next.value ?? 0} z {next.target})</span> : null}</p>
      ) : (
        <p className="mt-3 text-sm text-muted">Wszystkie kamienie milowe zdobyte.</p>
      )}
      {sheet}
    </section>
  );
}
