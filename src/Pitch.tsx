import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ARROW_LEGEND, TONE_HEX, buildTimeline, stateAt } from "./engine";
import type { Arrow, Drill, Point } from "./engine";

const PAD = 2;

function path(points: Point[], dribble: boolean): string {
  if (!dribble || points.length < 2) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  }
  // falista linia: kolejne odcinki z zakrzywieniem
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 1.6));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const nx = -(b.y - a.y), ny = b.x - a.x, len = Math.hypot(nx, ny) || 1;
      const off = (k % 2 ? 0.3 : -0.3);
      d += ` Q${(a.x + (b.x - a.x) * (t - 0.5 / n)) + (nx / len) * off},${(a.y + (b.y - a.y) * (t - 0.5 / n)) + (ny / len) * off} ${x},${y}`;
    }
  }
  return d;
}

function dash(style: Arrow["style"]): string | undefined {
  if (style === "pass") return "2 1.6";
  if (style === "shot") return "0.8 1";
  return undefined;
}

export function Pitch({ drill, children }: { drill: Drill; children?: ReactNode }) {
  const { width: w, height: h } = drill.field;
  return (
    <figure className="m-0">
      <svg
        viewBox={`${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`}
        className="w-full rounded-2xl bg-hairline"
        role="img"
        aria-label={drill.title}
      >
        <defs>
          <marker id="head" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3" markerHeight="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="#1d1d1f" />
          </marker>
        </defs>
        <rect x="0" y="0" width={w} height={h} fill="none" stroke="white" strokeWidth="0.5" />
        {drill.field.kind !== "patch" && <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="white" strokeWidth="0.4" />}
        {drill.goals?.map((g, i) => (
          <rect key={i} x={g.x - g.width / 2} y={g.y - 0.8} width={g.width} height="1.6" fill="white" stroke="#1d1d1f" strokeWidth="0.25" />
        ))}
        {drill.arrows.map((a, i) => (
          <path
            key={i}
            d={path(a.points, a.style === "dribble")}
            fill="none"
            stroke="#1d1d1f"
            strokeWidth={a.style === "shot" ? 0.7 : 0.3}
            strokeDasharray={dash(a.style)}
            strokeLinecap="round"
            markerEnd="url(#head)"
          />
        ))}
        {drill.cones.map((c, i) => (
          <g key={i}>
            <polygon
              points={`${c.x},${c.y - 1} ${c.x + 0.9},${c.y + 0.8} ${c.x - 0.9},${c.y + 0.8}`}
              fill={TONE_HEX[c.color ?? "yellow"]}
              stroke="#1d1d1f"
              strokeWidth="0.15"
            />
            {c.label && (
              <text x={c.x} y={c.y - 1.6} fontSize="1.8" textAnchor="middle" fill="#1d1d1f">{c.label}</text>
            )}
          </g>
        ))}
        {drill.arrows.map((a, i) =>
          a.step ? (
            <text key={`s${i}`} x={a.points[0]!.x + 0.8} y={a.points[0]!.y - 0.8} fontSize="2" fontWeight="600" fill="#1d1d1f">
              {a.step}
            </text>
          ) : null,
        )}
        {children}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(Object.keys(ARROW_LEGEND) as Array<keyof typeof ARROW_LEGEND>).map((k) => (
          <span key={k}>{ARROW_LEGEND[k]}</span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Szkic z odtwarzaczem: zawodnik (kropka) i piłka przechodzą kroki ćwiczenia po strzałkach; start/pauza, prędkość, przewijanie. */
export function AnimatedPitch({ drill }: { drill: Drill }) {
  const tl = useMemo(() => buildTimeline(drill), [drill]);
  const [playing, setPlaying] = useState(false); // domyślnie wstrzymane: kilka szkiców na ekranie nie obciąża telefonu
  const [slow, setSlow] = useState(false);
  const [t, setT] = useState(0);
  const slowRef = useRef(slow);
  slowRef.current = slow;

  useEffect(() => {
    if (!playing || !tl.total) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); // po zgaszeniu ekranu nie „przeskakuje” do przodu
      last = now;
      setT((x) => (x + dt * (slowRef.current ? 0.5 : 1)) % tl.total);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, tl.total]);

  const st = stateAt(drill, tl, t);
  const arrow = st.seg >= 0 ? drill.arrows[tl.segs[st.seg]!.arrow]! : null;
  const caption = arrow ? `Krok ${arrow.step ?? st.seg + 1}: ${arrow.note ?? ARROW_LEGEND[arrow.style]}` : "Naciśnij ▶, żeby zobaczyć przebieg";
  const shown = playing || t > 0;

  return (
    <div>
      <Pitch drill={drill}>
        {shown && (
          <>
            {st.ball && <circle cx={st.ball.x} cy={st.ball.y} r="0.75" fill="#fff" stroke="#1d1d1f" strokeWidth="0.25" />}
            <circle cx={st.player.x} cy={st.player.y} r="1.15" fill="var(--color-accent)" stroke="#fff" strokeWidth="0.35" />
          </>
        )}
      </Pitch>
      {tl.total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pauza" : "Odtwórz"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent active:scale-90">{playing ? "❚❚" : "▶"}</button>
          <input type="range" min={0} max={tl.total} step={0.05} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} aria-label="Przewiń ćwiczenie" className="min-w-0 flex-1 accent-[var(--color-accent)]" />
          <button onClick={() => setSlow((x) => !x)} aria-pressed={slow} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${slow ? "bw-sel font-medium" : "bg-canvas text-muted"}`}>{slow ? "0,5×" : "1×"}</button>
        </div>
      )}
      <p className="mt-1.5 min-h-[1.25rem] text-xs text-ink/80" role="status" aria-live="off">{caption}</p>
    </div>
  );
}
