import { useEffect, useMemo, useState } from "react";
import { BENCH_ETAS, BENCH_QUESTIONS, benchPlan, benchRoutine, loadBench, localISO, saveBench } from "./engine";
import type { BenchAnswers, BenchEta, BenchRoutine, Position } from "./engine";
import { ExerciseAnim } from "./exercises/ExerciseAnim";
import { beep, buzz, keepAwake, prepareAudio } from "./tools/feedback";

type Tab = "watch" | "warm" | "go";
const TABS: Array<[Tab, string]> = [["watch", "Obserwuj"], ["warm", "Rozgrzej"], ["go", "Wchodzę"]];
const SIDE = { L: "Lewa strona", P: "Prawa strona" } as const;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Prowadzona aktywacja: krok po kroku z animacją i licznikiem, pauza, wstecz/dalej. */
function Runner({ routine, onExit, onDone }: { routine: BenchRoutine; onExit: () => void; onDone: () => void }) {
  const { steps } = routine;
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(steps[0]!.seconds);
  const [paused, setPaused] = useState(false);
  const finished = i >= steps.length;
  const step = steps[Math.min(i, steps.length - 1)]!;

  useEffect(() => {
    if (paused || finished) return;
    const id = setInterval(() => setLeft((l) => (l > 1 ? l - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [paused, finished, i]);

  // koniec kroku → następny (osobny efekt, bez ustawiania stanu w funkcji aktualizującej)
  useEffect(() => {
    if (left > 0 || finished) return;
    const n = i + 1;
    if (n >= steps.length) { setI(n); beep(988, 160); buzz(120); return; }
    setI(n); setLeft(steps[n]!.seconds); beep(660, 90); buzz(40);
  }, [left, i, finished, steps]);

  const go = (n: number) => {
    const k = Math.max(0, Math.min(steps.length, n));
    setI(k); setPaused(false);
    if (k < steps.length) setLeft(steps[k]!.seconds);
  };
  const remaining = finished ? 0 : left + steps.slice(i + 1).reduce((s, x) => s + x.seconds, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">{finished ? "Aktywacja" : `Aktywacja · ${i + 1}/${steps.length}`}</span>
        <button onClick={onExit} className="text-sm text-muted">Wróć</button>
      </div>
      <div className="mb-5 flex gap-1" aria-hidden="true">
        {steps.map((_, k) => <div key={k} className={`h-0.5 flex-1 rounded-full ${k < i || finished ? "bg-accent" : k === i ? "bg-accent/50" : "bg-hairline"}`} />)}
      </div>

      {finished ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="bw-pop flex h-24 w-24 items-center justify-center rounded-full bw-grad text-4xl">✓</div>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight">Rozgrzany</h2>
          <p className="mt-2 text-sm text-muted">{routine.minutes} min</p>
        </div>
      ) : (
        <>
          <div key={step.id} className="bw-rise flex h-56 items-center justify-center overflow-hidden rounded-3xl border border-hairline bg-card">
            {step.anim ? <ExerciseAnim anim={step.anim} /> : (
              <div className="h-24 w-24 rounded-full border border-ink/25" style={{ animation: paused ? "none" : "bw-breathe 6s ease-in-out infinite" }} />
            )}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">{step.title}</h2>
            {step.side && <span className="rounded-full bw-sel px-3 py-1 text-xs font-medium">{SIDE[step.side]}</span>}
          </div>
          <p className="mt-2 text-base leading-relaxed text-ink/80">{step.cue}</p>
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="text-[64px] font-semibold leading-none tabular-nums tracking-tight">{left}</div>
            <div className="mt-2 text-xs text-muted">zostało {mmss(remaining)}</div>
          </div>
        </>
      )}

      <div className="flex gap-2">
        {finished ? (
          <button onClick={onDone} className="bw-grad flex-1 rounded-2xl py-4 text-base font-medium">Dalej</button>
        ) : (
          <>
            <button onClick={() => go(i - 1)} disabled={i === 0} className="rounded-2xl border border-hairline bg-card px-5 py-4 text-sm disabled:opacity-40">Wstecz</button>
            <button onClick={() => setPaused(!paused)} className="bw-grad flex-1 rounded-2xl py-4 text-base font-medium">{paused ? "Wznów" : "Pauza"}</button>
            <button onClick={() => go(i + 1)} className="rounded-2xl border border-hairline bg-card px-5 py-4 text-sm">{i >= steps.length - 1 ? "Koniec" : "Dalej"}</button>
          </>
        )}
      </div>
    </div>
  );
}

const next = "bw-grad mt-2 w-full rounded-2xl py-4 text-base font-medium";

/** Tryb ławki: obserwacja rywala → aktywacja przy linii → hasło i zdania na pierwsze minuty. */
export function Bench({ position, onClose }: { position: Position; onClose: () => void }) {
  const today = localISO();
  const [tab, setTab] = useState<Tab>("watch");
  const [answers, setAnswers] = useState<BenchAnswers>(() => loadBench(today));
  const [eta, setEta] = useState<BenchEta>(10);
  const [running, setRunning] = useState(false);
  const plan = useMemo(() => benchPlan(position, answers), [position, answers]);
  const routine = useMemo(() => benchRoutine(eta), [eta]);
  const questions = BENCH_QUESTIONS[position];

  useEffect(() => {
    let release = () => {};
    void keepAwake().then((r) => { release = r; });
    return () => release();
  }, []);

  const answer = (qid: string, oid: string) => {
    const a = { ...answers };
    if (a[qid] === oid) delete a[qid]; else a[qid] = oid;
    setAnswers(a);
    saveBench(today, a);
  };

  return (
    <div className="bw-sheet fixed inset-0 z-30 flex flex-col bg-canvas px-5 pb-8 pt-14">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">Tryb ławki</span>
        <button onClick={onClose} className="text-sm text-muted">Zamknij</button>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-hairline/70 p-1" role="tablist">
        {TABS.map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setRunning(false); }}
            className={`rounded-xl py-2 text-sm ${tab === k ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>
        ))}
      </div>

      {tab === "watch" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {questions.map((qu, n) => (
            <section key={qu.id} style={{ animationDelay: `${n * 60}ms` }} className="bw-rise mb-3 rounded-3xl border border-hairline bg-card p-5">
              <h2 className="mb-3 text-base font-semibold">{qu.ask}</h2>
              <div className="flex flex-wrap gap-2">
                {qu.options.map((op) => {
                  const on = answers[qu.id] === op.id;
                  return (
                    <button key={`${op.id}-${on}`} aria-pressed={on} onClick={() => answer(qu.id, op.id)}
                      className={`rounded-2xl px-4 py-3 text-[15px] ${on ? "bw-pop bw-sel font-semibold" : "bg-canvas text-ink"}`}>{op.label}</button>
                  );
                })}
              </div>
            </section>
          ))}
          <button onClick={() => setTab("warm")} className={next}>Dalej</button>
        </div>
      )}

      {tab === "warm" && (running ? (
        <Runner routine={routine} onExit={() => setRunning(false)} onDone={() => { setRunning(false); setTab("go"); }} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-5 grid grid-cols-2 gap-2">
            {BENCH_ETAS.map(([e, t]) => (
              <button key={e} aria-pressed={eta === e} onClick={() => setEta(e)}
                className={`rounded-2xl py-4 text-base ${eta === e ? "bw-sel font-semibold" : "border border-hairline bg-card text-ink"}`}>{t}</button>
            ))}
          </div>
          <div className="mb-1 flex items-baseline gap-3">
            <span className="text-[34px] font-semibold tabular-nums tracking-tight">{mmss(routine.seconds)}</span>
            <span className="text-sm text-muted">{routine.steps.length} kroków</span>
          </div>
          <p className="mb-6 text-sm text-muted">Pas 10–20 m przy linii bocznej, za zgodą trenera.</p>
          <button onClick={() => { prepareAudio(); setRunning(true); }} className="bw-grad w-full rounded-2xl py-4 text-base font-medium">Start</button>
        </div>
      ))}

      {tab === "go" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="text-xs uppercase tracking-wide text-muted">Hasło</p>
            <div key={plan.word} className="bw-rise mb-6 mt-1 text-[44px] font-semibold leading-tight tracking-tight">{plan.word}</div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Pierwsze 3 minuty</p>
            <ol className="mb-4 flex flex-col gap-2">
              {plan.lines.map((l, k) => (
                <li key={l} style={{ animationDelay: `${k * 60}ms` }} className="bw-rise flex gap-4 rounded-2xl border border-hairline bg-card px-5 py-4 text-[16px] leading-snug">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-xs tabular-nums text-muted">{k + 1}</span>
                  {l}
                </li>
              ))}
            </ol>
            <p className="text-center text-xs text-muted">
              {plan.answered === 0 ? "Bez obserwacji – ogólne wskazówki. Uzupełnij je w „Obserwuj”." : `Z ${plan.answered} z ${plan.total} obserwacji. Polecenia trenera mają pierwszeństwo.`}
            </p>
          </div>
          <button onClick={onClose} className={next}>Gotowe</button>
        </div>
      )}
    </div>
  );
}
