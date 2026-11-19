import { useEffect, useMemo, useRef, useState } from "react";
import { ANIMS, type Anim, type AnimKey } from "./anims";
import { shapesFor, viewFor } from "./draw";
import { jointsAt, loopLength } from "./player";

/** Pętla animacji ćwiczenia: sylwetka z kresek, spokojny kolor, szanuje „ogranicz ruch”. */
export function ExerciseAnim({ anim: key }: { anim: AnimKey }) {
  const anim = ANIMS[key] as Anim;
  const view = useMemo(() => viewFor(anim), [anim]);
  const [t, setT] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setT(anim.frames[0]![1] + (anim.frames[0]![2] ?? 0) + anim.frames[1]![1] * 0.999); return; }
    const t0 = performance.now();
    let last = 0;
    const loop = (now: number) => {
      raf.current = requestAnimationFrame(loop);
      if (now - last < 32) return; // ok. 30 kl./s wystarcza dla kresek
      last = now;
      setT((now - t0) / 1000);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [anim]);

  const { j, alpha } = jointsAt(anim, t % loopLength(anim));
  const shapes = shapesFor(j, anim, view);
  const col = (role: "near" | "far" | "prop") => (role === "prop" ? "var(--color-muted, #8a8f98)" : "var(--color-ink, #1d1d1f)");
  return (
    <svg viewBox={view.box.join(" ")} className="h-full w-full" role="img" aria-label="Animacja ćwiczenia" preserveAspectRatio="xMidYMid meet">
      {shapes.map((s, n) =>
        s.k === "line" ? (
          <line key={n} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={col(s.role)} strokeWidth={s.w} strokeLinecap="round"
            opacity={s.role === "far" ? 0.38 * alpha : s.role === "prop" ? 0.55 : alpha} />
        ) : (
          <circle key={n} cx={s.c[0]} cy={s.c[1]} r={s.r} fill={s.fill ? col(s.role) : "none"} stroke={col(s.role)} strokeWidth={3 * view.unit}
            opacity={s.role === "prop" ? 0.55 : alpha} />
        ),
      )}
    </svg>
  );
}
