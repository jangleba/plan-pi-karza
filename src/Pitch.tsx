import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ARROW_COLOR, ARROW_LEGEND, TONE_HEX, buildTimeline, stateAt } from "./engine";
import type { Arrow, Drill, Point } from "./engine";

const PAD = 2;

export function path(points: Point[], dribble: boolean): string {
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

export function dash(style: Arrow["style"]): string | undefined {
  if (style === "pass") return "2 1.6";
  if (style === "run") return "0.3 1.2";
  if (style === "lob") return "3 1 0.4 1";
  return undefined;
}

const identity = (p: Point) => p;
export function DrillDrawing({ drill, map = identity, showActors = true, onlyStep = null }: { drill: Drill; map?: (p: Point) => Point; showActors?: boolean; onlyStep?: number | null }) {
  const id = useId().replace(/:/g, "");
  return <g>
    <defs>{Object.entries(ARROW_COLOR).map(([style, color]) => <marker key={style} id={`${id}-${style}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill={color} /></marker>)}</defs>
    {drill.targets?.map((t, i) => { const p = map(t); return <g key={`target${i}`}><rect x={p.x - t.width / 2} y={p.y - t.height / 2} width={t.width} height={t.height} rx="0.4" fill="#fff" fillOpacity="0.35" stroke="#2469db" strokeWidth="0.18" strokeDasharray="0.6 0.5" /><text x={p.x} y={p.y - t.height / 2 - 0.5} fontSize="1.3" textAnchor="middle" fill="#17424b">{t.label}</text></g>; })}
    {drill.stations?.map((s) => { const p = map(s); return <g key={s.id} transform={`translate(${p.x} ${p.y})`}><rect x="-1.6" y="-0.45" width="3.2" height="0.9" rx="0.2" transform={`rotate(${s.angle ?? 0})`} fill="#f4f5f4" stroke="#37464a" strokeWidth="0.25" /><text y="-1.8" textAnchor="middle" fontSize="1.25" fill="#17424b">{s.label}</text></g>; })}
    {drill.arrows.filter((a) => onlyStep === null || a.step === onlyStep).map((a, i) => <g key={`arrow${i}`}>
      <path d={path(a.points.map(map), a.style === "dribble")} fill="none" stroke={ARROW_COLOR[a.style]} strokeWidth={a.style === "shot" ? 0.55 : 0.3} strokeDasharray={dash(a.style)} strokeLinecap="round" markerEnd={`url(#${id}-${a.style})`} />
      {a.step && (() => { const p = map(a.points[Math.min(1, a.points.length - 1)]!); return <g><circle cx={p.x + 0.6} cy={p.y - 0.9} r="0.85" fill="#fff" stroke={ARROW_COLOR[a.style]} strokeWidth="0.15" /><text x={p.x + 0.6} y={p.y - 0.57} fontSize="1" fontWeight="600" textAnchor="middle" fill={ARROW_COLOR[a.style]}>{a.step}</text></g>; })()}
    </g>)}
    {drill.cones.map((c, i) => { const p = map(c); return <g key={`cone${i}`}><polygon points={`${p.x},${p.y - 0.7} ${p.x + 0.6},${p.y + 0.5} ${p.x - 0.6},${p.y + 0.5}`} fill={TONE_HEX[c.color ?? "yellow"]} stroke="#655b3a" strokeWidth="0.1" />{c.label && <text x={p.x} y={p.y - 1.2} fontSize="1.3" textAnchor="middle" fill="#17424b">{c.label}</text>}</g>; })}
    {showActors && <DrillActors drill={drill} map={map} />}
  </g>;
}

export function DrillActors({ drill, map = identity, positions, ball = drill.ballStart }: { drill: Drill; map?: (p: Point) => Point; positions?: Record<string, Point>; ball?: Point | null }) {
  return <g>{(drill.actors ?? []).map((a) => { const p = map(positions?.[a.id] ?? a); return <g key={a.id}><circle cx={p.x} cy={p.y} r="0.95" fill={a.kind === "defender" ? "#be5555" : a.kind === "partner" ? "#5b7087" : "#fff"} stroke="#17424b" strokeWidth="0.2" /><text x={p.x} y={p.y + 0.35} textAnchor="middle" fontSize="1" fontWeight="600" fill={a.kind === "player" ? "#17424b" : "#fff"}>{a.label}</text></g>; })}{ball && (() => { const p = map(ball); return <circle cx={p.x + 0.3} cy={p.y + 0.3} r="0.42" fill="#fff" stroke="#17424b" strokeWidth="0.2" />; })()}</g>;
}

export function DrillLegend({ drill }: { drill: Drill }) {
  const styles = [...new Set(drill.arrows.map((a) => a.style))];
  return <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">{styles.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><svg viewBox="0 0 20 8" className="h-2 w-5" aria-hidden="true"><path d={k === "dribble" ? "M0 4Q3 0 6 4T12 4T18 4" : k === "lob" ? "M0 6Q10 -3 18 6" : "M0 4H18"} fill="none" stroke={ARROW_COLOR[k]} strokeWidth={k === "shot" ? 2.5 : 1.8} strokeDasharray={k === "run" ? "1 3" : k === "pass" ? "4 2" : undefined} /></svg>{ARROW_LEGEND[k]}</span>)}</div>;
}

export function Pitch({ drill, children, showActors = true, onlyStep = null }: { drill: Drill; children?: ReactNode; showActors?: boolean; onlyStep?: number | null }) {
  const { width: w, height: h } = drill.field;
  return (
    <figure className="m-0">
      <svg
        viewBox={`${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`}
        className="w-full rounded-2xl bg-[#d7eadb]"
        role="img"
        aria-label={drill.title}
      >
        <rect x="0" y="0" width={w} height={h} fill="none" stroke="white" strokeWidth="0.5" />
        {drill.field.kind === "full" && <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="white" strokeWidth="0.4" />}
        {drill.goals?.map((g, i) => (
          <rect key={i} x={g.x - g.width / 2} y={g.y - 0.8} width={g.width} height="1.6" fill="white" stroke="#1d1d1f" strokeWidth="0.25" />
        ))}
        <DrillDrawing drill={drill} showActors={showActors} onlyStep={onlyStep} />
        {children}
      </svg>
      <DrillLegend drill={drill} />
    </figure>
  );
}

/** Stan odtwarzacza ćwiczenia: czas, start/pauza, prędkość; wspólny dla szkicu i widoku na połowie boiska. */
export function useDrillPlayer(drill: Drill) {
  const tl = useMemo(() => buildTimeline(drill), [drill]);
  const [playing, setPlaying] = useState(false); // domyślnie wstrzymane: kilka szkiców na ekranie nie obciąża telefonu
  const [slow, setSlow] = useState(false);
  const [t, setT] = useState(0);
  const [onlyStep, setOnlyStep] = useState<number | null>(null);
  const slowRef = useRef(slow);
  slowRef.current = slow;
  useEffect(() => { setPlaying(false); setT(0); setOnlyStep(null); }, [drill]);

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
  const notes = arrow ? drill.arrows.filter((a) => a.step === arrow.step).map((a) => a.note ?? ARROW_LEGEND[a.style]).join(" ") : "";
  const caption = arrow ? `Krok ${arrow.step ?? st.seg + 1}: ${notes}` : "Naciśnij ▶, żeby zobaczyć przebieg";
  const steps = [...new Set(drill.arrows.map((a, i) => a.step ?? i + 1))].sort((a, b) => a - b);
  const seekStep = (step: number | null) => { setPlaying(false); setOnlyStep(step); setT(step === null ? 0 : (tl.segs.find((s) => drill.arrows[s.arrow]!.step === step)?.t0 ?? 0) + 0.01); };
  return { tl, playing, setPlaying, slow, setSlow, t, setT, st, caption, shown: playing || t > 0, onlyStep, setOnlyStep, steps, seekStep };
}

/** Przyciski odtwarzacza: start/pauza, przewijanie, prędkość, podpis kroku. */
export function DrillControls({ p }: { p: ReturnType<typeof useDrillPlayer> }) {
  return (
    <>
      {p.tl.total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => { p.setOnlyStep(null); p.setPlaying((x) => !x); }} aria-label={p.playing ? "Pauza" : "Odtwórz"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent active:scale-90">{p.playing ? "❚❚" : "▶"}</button>
          <input type="range" min={0} max={Math.max(0, p.tl.total - 0.001)} step={0.05} value={p.t} onChange={(e) => { p.setPlaying(false); p.setOnlyStep(null); p.setT(Number(e.target.value)); }} aria-label="Przewiń ćwiczenie" className="min-w-0 flex-1 accent-[var(--color-accent)]" />
          <button onClick={() => p.setSlow((x) => !x)} aria-pressed={p.slow} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${p.slow ? "bw-sel font-medium" : "bg-canvas text-muted"}`}>{p.slow ? "0,5×" : "1×"}</button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5"><button onClick={() => p.seekStep(null)} aria-pressed={p.onlyStep === null} className="rounded-full bg-canvas px-3 py-2 text-xs">Cała akcja</button>{p.steps.map((step) => <button key={step} onClick={() => p.seekStep(step)} aria-pressed={p.onlyStep === step} aria-label={`Pokaż etap ${step}`} className={`h-8 min-w-8 rounded-full text-xs ${p.onlyStep === step ? "bg-accent-soft font-semibold text-accent" : "bg-canvas text-muted"}`}>{step}</button>)}</div>
      <p className="mt-1.5 min-h-[1.25rem] text-xs text-ink/80" role="status" aria-live="off">{p.caption}</p>
    </>
  );
}

/** Szkic z odtwarzaczem: zawodnik (kropka) i piłka przechodzą kroki ćwiczenia po strzałkach; start/pauza, prędkość, przewijanie. */
export function AnimatedPitch({ drill }: { drill: Drill }) {
  const p = useDrillPlayer(drill);
  return (
    <div>
      <Pitch drill={drill} showActors={!p.shown} onlyStep={p.onlyStep}>
        {p.shown && (
          drill.actors ? <DrillActors drill={drill} positions={p.st.players} ball={p.st.ball} /> : <>
            {p.st.ball && <circle cx={p.st.ball.x} cy={p.st.ball.y} r="0.75" fill="#fff" stroke="#1d1d1f" strokeWidth="0.25" />}
            <circle cx={p.st.player.x} cy={p.st.player.y} r="1.15" fill="var(--color-accent)" stroke="#fff" strokeWidth="0.35" />
          </>
        )}
      </Pitch>
      <DrillControls p={p} />
    </div>
  );
}
