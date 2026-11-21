import { useEffect, useRef, useState } from "react";

/** Liczba narastająca do wartości (ok. 0,7 s, wolna na końcu); przy ograniczeniu ruchu od razu docelowa. */
export function useCountUp(target: number, ms = 700): number {
  const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [v, setV] = useState(reduce ? target : 0);
  const from = useRef(reduce ? target : 0);
  useEffect(() => {
    if (reduce) { setV(target); from.current = target; return; }
    let raf = 0;
    const t0 = performance.now(), a = from.current;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduce]);
  return v;
}
