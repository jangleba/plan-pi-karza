import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adjust, display, isDone, isRunning, remaining, start } from "./timer";
import { activeSeconds, markSet, pauseRun, resumeRun, setTimer, startTimer, totals, type WorkoutRun } from "./run";
import { completeRun, saveRun } from "./store";

/**
 * Tryb treningowy na telefon: duże przyciski, odliczanie przerw, ekran nie gaśnie (gdzie przeglądarka na to pozwala).
 * Każda zmiana jest od razu zapisywana na urządzeniu; czas liczony jest z zegara, więc po powrocie z tła, po
 * zablokowaniu ekranu albo po ponownym otwarciu aplikacji pokazuje się poprawnie. Nie obiecujemy alarmu przy
 * zablokowanym ekranie – przeglądarka może wtedy wstrzymać stronę.
 */
const RESTS = [60, 90, 120, 180];

interface WakeLockSentinel { release: () => Promise<void>; released?: boolean }
type WakeNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } };

function useWakeLock(active: boolean): "on" | "unsupported" | "off" {
  const [state, setState] = useState<"on" | "unsupported" | "off">(() => (typeof navigator !== "undefined" && (navigator as WakeNav).wakeLock ? "off" : "unsupported"));
  useEffect(() => {
    const nav = navigator as WakeNav;
    if (!active || !nav.wakeLock) return;
    let lock: WakeLockSentinel | null = null, alive = true;
    const held = () => !!lock && !lock.released;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || held()) return;
      try { lock = await nav.wakeLock!.request("screen"); if (alive) setState("on"); } catch { if (alive) setState("off"); }
    };
    // blokada jest zwalniana przez system po przejściu w tło – trzeba ją wziąć ponownie po powrocie;
    // Safari na iOS wymaga do tego gestu użytkownika, więc ponawiamy też przy pierwszym dotknięciu ekranu
    const onVis = () => { if (document.visibilityState === "visible") void acquire(); else if (alive) setState("off"); };
    const onTouch = () => { if (!held()) void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("pointerdown", onTouch, true);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); document.removeEventListener("pointerdown", onTouch, true); void lock?.release().catch(() => undefined); };
  }, [active]);
  return state;
}

/** Krótki sygnał końca przerwy: wibracja (Android) i dźwięk, jeśli przeglądarka pozwoliła na dźwięk po dotknięciu. */
function useCue() {
  const ctx = useRef<AudioContext | null>(null);
  const unlock = () => {
    try {
      const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!ctx.current && A) ctx.current = new A();
      void ctx.current?.resume();
    } catch { /* bez dźwięku */ }
  };
  const play = () => {
    navigator.vibrate?.([180, 80, 180]);
    const c = ctx.current;
    if (!c || c.state !== "running") return;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.35);
  };
  return { unlock, play };
}

export function WorkoutMode({ initial, onMinimize, onFinished }: { initial: WorkoutRun; onMinimize: () => void; onFinished: () => void }) {
  const [run, setRunState] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [rest, setRest] = useState(90);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const wake = useWakeLock(run.status === "active");
  const cue = useCue();
  const firedFor = useRef<number | null>(null);

  const update = (f: (r: WorkoutRun, t: number) => WorkoutRun) => {
    const t = Date.now();
    setRunState((r) => { const n = f(r, t); if (n !== r) saveRun(n); return n; });
    setNow(t);
  };

  // odświeżanie wyświetlacza; po powrocie do aplikacji natychmiast (czas i tak wynika z zegara)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    const onVis = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // koniec przerwy: jeden sygnał na odliczanie
  useEffect(() => {
    const t = run.timer;
    if (!t || !isRunning(t) || firedFor.current === t.runningSince) return;
    if (isDone(t, now)) { firedFor.current = t.runningSince; cue.play(); }
  }, [now, run.timer, cue]);

  const paused = run.pausedSince !== null;
  const tot = totals(run);
  const t = run.timer;
  const left = t ? remaining(t, now) : 0;
  const mins = Math.floor(activeSeconds(run, now) / 60);

  const finish = () => {
    if (tot.done < tot.total && !confirmEnd) { setConfirmEnd(true); return; }
    completeRun(run);
    onFinished();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label="Tryb treningowy">
      <header className="flex items-center gap-3 border-b border-hairline bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onMinimize} className="rounded-full px-2 py-2 text-sm text-accent" aria-label="Zminimalizuj trening">‹ Wróć</button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-semibold">{run.title}</p>
          <p className="text-xs text-muted tabular-nums">{mins} min · {tot.done}/{tot.total} serii{paused ? " · pauza" : ""}</p>
        </div>
        <button onClick={() => update((r, n) => (paused ? resumeRun(r, n) : pauseRun(r, n)))} className="rounded-full bg-btn px-3 py-2 text-sm font-medium text-btn-ink">{paused ? "Wznów" : "Pauza"}</button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-40 pt-4">
        <section className="mb-4 rounded-3xl border border-hairline bg-card p-5 text-center" aria-live="polite">
          {t ? (
            <>
              <p className="text-sm text-muted">{t.label ?? "Przerwa"}</p>
              <p className={`mt-1 text-[72px] font-semibold leading-none tabular-nums tracking-tight ${left === 0 ? "text-accent" : ""}`}>{display(left)}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button onClick={() => update((r, n) => setTimer(r, r.timer ? adjust(r.timer, -15_000, n) : null, n))} className="h-14 rounded-2xl bg-canvas text-base font-medium">−15 s</button>
                <button onClick={() => update((r, n) => setTimer(r, r.timer && !isRunning(r.timer) && remaining(r.timer, n) > 0 ? start(r.timer, n) : null, n))} className="h-14 rounded-2xl bg-canvas text-base font-medium">{isRunning(t) || left === 0 ? "Pomiń" : "Start"}</button>
                <button onClick={() => update((r, n) => setTimer(r, r.timer ? adjust(r.timer, 15_000, n) : null, n))} className="h-14 rounded-2xl bg-canvas text-base font-medium">+15 s</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Przerwa po serii</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {RESTS.map((s) => <button key={s} onClick={() => setRest(s)} aria-pressed={rest === s} className={`h-12 rounded-2xl text-sm font-medium ${rest === s ? "bw-sel" : "bg-canvas"}`}>{s < 120 ? `${s} s` : `${s / 60} min`}</button>)}
              </div>
            </>
          )}
          <p className="mt-3 text-[11px] text-muted">{wake === "on" ? "Ekran nie zgaśnie podczas treningu." : "Ekran może zgasnąć – czas i postęp i tak zapisują się poprawnie."}</p>
        </section>

        <ul className="space-y-3">
          {run.items.map((i) => {
            const full = i.setsDone >= i.setsTotal;
            return (
              <li key={i.key} className={`rounded-3xl border bg-card p-4 ${full ? "border-sel-border" : "border-hairline"}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[17px] font-semibold leading-snug">{i.label}</p>
                  <p className="shrink-0 text-sm tabular-nums text-muted">{i.setsDone}/{i.setsTotal}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button disabled={full || paused} onClick={() => { cue.unlock(); update((r, n) => { const m = markSet(r, i.key, n); return m.items.some((x) => x.setsDone < x.setsTotal) ? startTimer(m, rest * 1000, "Przerwa", n) : setTimer(m, null, n); }); }}
                    className="h-14 flex-1 rounded-2xl bw-grad text-base font-semibold disabled:opacity-40">{full ? "Zrobione ✓" : `Seria ${i.setsDone + 1} zrobiona`}</button>
                  <button disabled={i.setsDone === 0} onClick={() => update((r, n) => markSet(r, i.key, n, true))} className="h-14 w-14 rounded-2xl bg-canvas text-lg disabled:opacity-30" aria-label={`Cofnij serię: ${i.label}`}>↺</button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-hairline bg-card/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {confirmEnd && <p className="mb-2 text-center text-sm text-muted">Zrobiono {tot.done} z {tot.total} serii. Zapisać jako częściowo wykonany?</p>}
        <button onClick={finish} className="h-14 w-full rounded-2xl bg-ink text-base font-semibold text-card">{confirmEnd ? "Tak, zakończ i zapisz" : "Zakończ trening"}</button>
        {confirmEnd && <button onClick={() => setConfirmEnd(false)} className="mt-2 h-11 w-full rounded-2xl text-sm text-muted">Wróć do treningu</button>}
      </footer>
    </div>,
    document.body,
  );
}
