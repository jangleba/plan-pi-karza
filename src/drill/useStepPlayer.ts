import { useEffect, useMemo, useRef, useState } from "react";
import { arrowsInOrder } from "../engine/drill";
import type { Drill } from "../engine/drill";
import { buildTimeline, stateAt } from "../engine/drillAnim";

const HOLD = 0.5; // s po końcu kroku, zanim zatrzyma się odtwarzanie

/**
 * Odtwarzacz ćwiczenia z krokami: „Cała akcja” gra wszystko w pętli, wybrany krok gra tylko ten krok (zawodnik i piłka startują tam,
 * gdzie skończył poprzedni) i zatrzymuje się. Bez dotknięcia nic się nie rusza (kilka rysunków nie obciąża telefonu).
 */
export function useStepPlayer(drill: Drill) {
  const tl = useMemo(() => buildTimeline(drill), [drill]);
  const steps = useMemo(() => arrowsInOrder(drill).map((a, i) => a.step ?? i + 1), [drill]);
  const [step, setStep] = useState<number | null>(null); // numer kroku albo null = cała akcja
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const range = useMemo(() => {
    if (step === null) return { t0: 0, t1: tl.total };
    const k = steps.indexOf(step), seg = tl.segs[k];
    return seg ? { t0: seg.t0, t1: seg.t1 + HOLD } : { t0: 0, t1: tl.total };
  }, [step, steps, tl]);
  const rangeRef = useRef(range), stepRef = useRef(step);
  rangeRef.current = range; stepRef.current = step;

  // zmiana ćwiczenia (lustro, wariant): od początku
  useEffect(() => { setPlaying(false); setT(0); setStep(null); }, [drill]);

  useEffect(() => {
    if (!playing || !tl.total) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      setT((x) => {
        const r = rangeRef.current, n = x + dt;
        if (n < r.t1) return Math.max(n, r.t0);
        if (stepRef.current === null) return r.t0; // cała akcja: pętla
        setPlaying(false);
        return r.t1;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, tl.total]);

  const selectStep = (n: number | null) => {
    setStep(n);
    const k = n === null ? -1 : steps.indexOf(n);
    setT(n === null ? 0 : tl.segs[k]?.t0 ?? 0);
    setPlaying(true);
  };
  const toggle = () => {
    if (!playing && t >= range.t1 - 0.01) setT(range.t0);
    setPlaying((p) => !p);
  };
  const st = stateAt(drill, tl, t);
  const shown = playing || t > 0.01;
  const caption = step !== null ? `Krok ${step}` : playing ? "Cała akcja" : "Dotknij ▶ albo numeru kroku";
  return { steps, step, playing, t, st, shown, caption, selectStep, toggle, hasAnim: tl.total > 0 };
}
