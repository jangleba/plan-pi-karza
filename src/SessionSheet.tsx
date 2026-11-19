import { useState } from "react";
import { Pitch } from "./Pitch";
import { Sheet } from "./Sheet";
import { pushWeightLog } from "./lib/sync";
import { MasCard, loadMas, saveMasDistance } from "./MasCard";
import { RunTracker } from "./RunTracker";
import { SessionBlocks } from "./SessionBlocks";
import { ExerciseSheet } from "./exercises/ExerciseSheet";
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
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState(loadLog);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Suggestion[] | null>(null);
  const s = day.session;
  const [info, setInfo] = useState<{ id: string; note?: string } | null>(null);
  const both = !!s && day.isClub;
  const [view, setView] = useState<"own" | "club">(s ? "own" : "club");
  const module = s?.kind === "strength" || s?.kind === "sprint" ? s.kind : null;
  const found = module
    ? module === "strength" && !hasGym
      ? { template: bodyweightTemplate(level, mesoPhase(weekInCycle)), deload: mesoPhase(weekInCycle) === "deload" }
      : (() => {
          const t = templateFor(module, weekInCycle, position);
          // lekki sprint (dzień przed meczem, przerwa w sezonie) = mniej serii
          return t && s?.variant === "light" ? { ...t, deload: true } : t;
        })()
    : null;
  const run = s?.kind === "run" ? (mas ? runSession(mas, s?.variant === "light" ? "deload" : mesoPhase(weekInCycle), level, checkIn, position) : masTestSession()) : null;
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
      <Sheet title="Dobra robota" onClose={onClose}>
          <p className="mb-4 text-sm text-muted">Propozycje na następną sesję.</p>
          {summary.map((sug) => (
            <div key={sug.exerciseId} className="mb-3 rounded-2xl bg-canvas p-3">
              <div className="text-sm font-medium">{EXERCISES[sug.exerciseId]?.name}</div>
              <div className="text-xs text-muted">{sug.from} kg · {sug.text}</div>
              {sug.to !== sug.from ? (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => decide(sug, true)} className="flex-1 rounded-xl bw-grad py-1.5 text-sm font-medium">Przyjmij {sug.to} kg</button>
                  <button onClick={() => decide(sug, false)} className="flex-1 rounded-xl bg-card py-1.5 text-sm text-muted">Zostaję</button>
                </div>
              ) : (
                <button onClick={() => decide(sug, false)} className="mt-2 w-full rounded-xl bg-card py-1.5 text-sm text-muted">OK</button>
              )}
            </div>
          ))}
      </Sheet>
    );
  }


  const club = view === "club" || !s;
  return (
    <>
    <Sheet title={club ? "Trening klubowy" : KIND_TITLE[s.kind]} onClose={onClose}>
        {both && <DayTabs own={KIND_TITLE[s!.kind]!} view={view} onView={setView} />}
        {club ? (
          <div className="min-h-[34vh]">
            <p className="mt-3 text-[15px] leading-snug">Ten trening prowadzi trener klubu.</p>
            <p className="mt-2 text-sm text-muted">Planuję najwyżej dwa treningi dziennie: klubowy i jeden indywidualny.</p>
            {!s && <button onClick={onClose} className="mt-6 w-full rounded-2xl bw-grad py-4 text-base font-medium">OK</button>}
          </div>
        ) : adapted ? (
          <>
            <p className="text-sm text-muted">
              {adapted.name}{found?.deload ? " · rozładowanie" : ""}
            </p>
            {adapted.notes.map((n) => (
              <p key={n} className="mt-3 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-muted">{n}</p>
            ))}
            <SessionBlocks blocks={adapted.blocks} mode={module === "sprint" ? "sequence" : "alternate"} log={log} weights={weights} onWeight={(k, v) => setWeights({ ...weights, [k]: v })} onOpen={(id, note) => setInfo({ id, note })} />
          </>
        ) : run ? (
          <>
            <p className="text-sm text-muted">{run.title}</p>
            <MasCard mas={mas} onChange={setMas} />
            <button onClick={() => setRunning(true)} className="mt-3 w-full rounded-2xl bw-grad py-3 text-sm font-medium">
              {run.isTest ? "Rozpocznij test z GPS" : "Rozpocznij bieg z GPS"}
            </button>
            {running && (
              <RunTracker
                session={run}
                onClose={() => setRunning(false)}
                onFinish={(r) => {
                  if (run.isTest && r.distanceAt5min) setMas(saveMasDistance(Math.round(r.distanceAt5min)));
                  setRunning(false);
                }}
              />
            )}
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
        {!club && (
          <button
            onClick={finish}
            className="mt-6 w-full rounded-2xl bw-grad py-4 text-base font-medium"
          >
            Koniec sesji
          </button>
        )}
    </Sheet>
    {info && <ExerciseSheet id={info.id} note={info.note} onClose={() => setInfo(null)} />}
    </>
  );
}

/** Przełącznik dnia z dwoma treningami: indywidualny / klubowy. */
function DayTabs({ own, view, onView }: { own: string; view: "own" | "club"; onView: (v: "own" | "club") => void }) {
  const cls = (on: boolean) => `rounded-xl py-1.5 text-sm ${on ? "bg-card font-medium shadow-sm" : "text-muted"}`;
  return (
    <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-hairline/70 p-1">
      <button onClick={() => onView("own")} className={cls(view === "own")}>{own}</button>
      <button onClick={() => onView("club")} className={cls(view === "club")}>Klub</button>
    </div>
  );
}
