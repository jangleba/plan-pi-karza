import { useState } from "react";
import { Pitch } from "./Pitch";
import { pushWeightLog } from "./lib/sync";
import { MasCard, loadMas } from "./MasCard";
import { CueTrainer } from "./CueTrainer";
import { EXERCISES, RECOVERY, bodyweightTemplate, drillsFor, adaptSession, addEvents, estimate1RM, firstNumber, loadLog, saveLog, strainOf, suggestNext, masTestSession, mesoPhase, runSession, templateFor } from "./engine";
import type { CheckIn, DayPlan, HistoryEvent, Level, Mas, Position, Suggestion } from "./engine";

const KIND_TITLE: Record<string, string> = {
  strength: "Siła", run: "Bieganie", sprint: "Sprint",
  technique: "Technika z piłką", activation: "Aktywacja", recovery: "Regeneracja",
};

export function SessionSheet({
  day, checkIn, weekInCycle, level, position, hasGym, onClose,
}: { day: DayPlan; checkIn: CheckIn; weekInCycle: number; level: Level; position?: Position; hasGym: boolean; onClose: () => void }) {
  const [mas, setMas] = useState<Mas | null>(loadMas);
  const [log, setLog] = useState(loadLog);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Suggestion[] | null>(null);
  const s = day.session;
  const module = s?.kind === "strength" || s?.kind === "sprint" ? s.kind : null;
  const found = module
    ? module === "strength" && !hasGym
      ? { template: bodyweightTemplate(level, mesoPhase(weekInCycle)), deload: mesoPhase(weekInCycle) === "deload" }
      : templateFor(module, weekInCycle, position)
    : null;
  const run = s?.kind === "run" ? (mas ? runSession(mas, mesoPhase(weekInCycle), level, checkIn, position) : masTestSession()) : null;
  const adapted = found ? adaptSession(found.template, checkIn, found.deload) : null;

  const finish = () => {
    const events: HistoryEvent[] = s ? [{ date: day.date, type: "session", key: s.kind, value: 1 }] : [];
    if (!adapted || !found) { addEvents(events); onClose(); return; }
    const strain = strainOf(checkIn);
    const next = { ...log };
    const out: Suggestion[] = [];
    adapted.blocks.forEach((b, bi) =>
      b.items.forEach((i, ii) => {
        const kg = Number((weights[`${bi}-${ii}`] ?? "").replace(",", "."));
        if (!(kg > 0) || !EXERCISES[i.exerciseId]?.loaded) return;
        next[i.exerciseId] = { kg, reps: firstNumber(i.reps), date: day.date };
        events.push({ date: day.date, type: "strength", key: i.exerciseId, value: Math.round(estimate1RM(kg, firstNumber(i.reps)) * 10) / 10 });
        const sug = suggestNext(i.exerciseId, kg, strain, found.deload);
        if (sug) out.push(sug);
      }),
    );
    addEvents(events);
    setLog(next);
    saveLog(next);
    void pushWeightLog(next);
    if (out.length) setSummary(out); else onClose();
  };

  const decide = (sug: Suggestion, accept: boolean) => {
    const next = { ...log };
    const cur = next[sug.exerciseId];
    if (cur) next[sug.exerciseId] = { ...cur, next: accept ? sug.to : sug.from };
    setLog(next);
    saveLog(next);
    void pushWeightLog(next);
    setSummary((summary ?? []).filter((x) => x !== sug));
    if ((summary ?? []).length <= 1) onClose();
  };

  if (summary) {
    return (
      <div className="fixed inset-0 z-30 flex items-end bg-black/25">
        <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 pb-10 shadow-xl">
          <h2 className="text-xl font-semibold">Dobra robota</h2>
          <p className="mb-4 text-sm text-muted">Propozycje na następną sesję.</p>
          {summary.map((sug) => (
            <div key={sug.exerciseId} className="mb-3 rounded-2xl bg-canvas p-3">
              <div className="text-sm font-medium">{EXERCISES[sug.exerciseId]?.name}</div>
              <div className="text-xs text-muted">{sug.from} kg · {sug.text}</div>
              {sug.to !== sug.from ? (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => decide(sug, true)} className="flex-1 rounded-xl bg-ink py-1.5 text-sm font-medium text-card">Przyjmij {sug.to} kg</button>
                  <button onClick={() => decide(sug, false)} className="flex-1 rounded-xl bg-card py-1.5 text-sm text-muted">Zostaję</button>
                </div>
              ) : (
                <button onClick={() => decide(sug, false)} className="mt-2 w-full rounded-xl bg-card py-1.5 text-sm text-muted">OK</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/25" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 pb-10 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/10" />
        <h2 className="text-xl font-semibold">{s ? KIND_TITLE[s.kind] : "Dzień"}</h2>
        {adapted ? (
          <>
            <p className="text-sm text-muted">
              {adapted.name}{found?.deload ? " · rozładowanie" : ""}
            </p>
            {adapted.notes.map((n) => (
              <p key={n} className="mt-3 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-muted">{n}</p>
            ))}
            <ol className="mt-4 flex flex-col gap-3">
              {adapted.blocks.map((b, bi) => (
                <li key={bi} className="rounded-2xl bg-canvas p-3">
                  {b.items.map((i, ii) => {
                    const e = EXERCISES[i.exerciseId];
                    const key = `${bi}-${ii}`;
                    const prev = log[i.exerciseId];
                    const placeholder = prev ? String(prev.next ?? prev.kg) : "kg";
                    const rm = prev ? estimate1RM(prev.kg, prev.reps) : null;
                    const target = i.pctRM && rm ? Math.round(rm * ((i.pctRM[0] + i.pctRM[1]) / 200) * 2) / 2 : null;
                    return (
                      <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{e?.name ?? i.exerciseId}</div>
                          <div className="text-xs text-muted">
                            {i.sets} × {i.reps}
                            {i.pctRM ? ` · ${i.pctRM[0]}–${i.pctRM[1]}% maks.${target ? ` (≈ ${target} kg)` : ""}` : ""}
                            {i.note ? ` · ${i.note}` : ""}
                          </div>
                        </div>
                        {e?.loaded && (
                          <input
                            inputMode="decimal"
                            placeholder={placeholder}
                            value={weights[key] ?? ""}
                            onChange={(ev) => setWeights({ ...weights, [key]: ev.target.value })}
                            className="w-16 rounded-lg bg-card px-2 py-1.5 text-right text-sm outline-none"
                          />
                        )}
                      </div>
                    );
                  })}
                </li>
              ))}
            </ol>
          </>
        ) : run ? (
          <>
            <p className="text-sm text-muted">{run.title}</p>
            <MasCard onChange={setMas} />
            {run.notes.map((n) => (
              <p key={n} className="mt-3 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-muted">{n}</p>
            ))}
            <div className="mt-4 rounded-2xl bg-canvas p-3 text-sm">
              <div className="text-xs text-muted">Rozgrzewka</div>
              <div>{run.warmup}</div>
            </div>
            {run.blocks.map((b) => (
              <div key={b.label} className="mt-3 rounded-2xl bg-canvas p-3 text-sm">
                <div className="font-medium">{b.label}</div>
                <div className="text-xs text-muted">
                  {b.reps > 1 ? `${b.sets > 1 ? `${b.sets} serie × ` : ""}${b.reps} powt. · praca ${b.workS} s, przerwa ${b.restS} s` : `${Math.round(b.workS / 60)} min`}
                  {" · "}tempo {b.paceText} · ok. {b.distanceM} m {b.reps > 1 ? "na odcinek" : ""}
                </div>
              </div>
            ))}
          </>
        ) : s?.kind === "technique" ? (
          <>
            <p className="text-sm text-muted">Szkice do przeglądu trenera</p>
            <div className="mt-4 flex flex-col gap-5">
              {drillsFor(position).map((d) => (
                <div key={d.id}>
                  <div className="mb-2 text-sm font-medium">{d.title}</div>
                  <Pitch drill={d} />
                  <p className="mt-2 text-xs text-muted">{d.dose}</p>
                  <ul className="mt-1 list-disc pl-4 text-sm">
                    {d.points.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              ))}
              <CueTrainer />
            </div>
          </>
        ) : s?.kind === "recovery" ? (
          <>
            <p className="text-sm text-muted">{RECOVERY.title} · ok. {RECOVERY.minutes} min</p>
            <h3 className="mb-1 mt-4 text-sm font-semibold">Najważniejsze</h3>
            <ul className="list-disc pl-4 text-sm">{RECOVERY.foundation.map((x) => <li key={x}>{x}</li>)}</ul>
            <h3 className="mb-1 mt-4 text-sm font-semibold">Opcjonalnie</h3>
            <ul className="list-disc pl-4 text-sm text-muted">{RECOVERY.optional.map((x) => <li key={x}>{x}</li>)}</ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Szablon tej sesji jest w przygotowaniu.
          </p>
        )}
        <button
          onClick={finish}
          className="mt-6 w-full rounded-2xl bg-ink py-3 text-sm font-medium text-white"
        >
          Koniec sesji
        </button>
      </div>
    </div>
  );
}
