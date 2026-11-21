import { useEffect, useMemo, useRef, useState } from "react";
import { ARROW_LEGEND, HALF, TONE_HEX, placeDrill } from "./engine";
import type { Drill, Point } from "./engine";
import { DrillControls, dash, path, useDrillPlayer } from "./Pitch";

const PAD = 2;
const VW = HALF.w + PAD * 2, VH = HALF.h + PAD * 2;
const ASPECT = VW / VH;
const MIN_W = 10; // największe przybliżenie: ok. 10 m szerokości kadru

interface View { x: number; y: number; w: number }
const clampView = (v: View): View => {
  const w = Math.min(VW, Math.max(MIN_W, v.w)), h = w / ASPECT;
  return { w, x: Math.min(VW - PAD - w, Math.max(-PAD, v.x)), y: Math.min(VH - PAD - h, Math.max(-PAD, v.y)) };
};
const FULL: View = { x: -PAD, y: -PAD, w: VW };

/** Boisko: murawa w pasach, linie, pole karne i bramkowe, łuk, linia środkowa, bramka. Układ: bramka u góry. */
function PitchBase() {
  const { goalX: gx, boxW, boxD, sixW, sixD, spotD, circleR: R, goalW } = HALF;
  const a = Math.acos((boxD - spotD) / R), dx = R * Math.sin(a);
  const line = { fill: "none", stroke: "#ffffff", strokeWidth: 0.3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g>
      <rect x={-PAD} y={-PAD} width={VW} height={VH} fill="#e3efe6" />
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x="0" y={i * 5.25} width={HALF.w} height="5.25" fill={i % 2 ? "#cfe5d3" : "#d7eadb"} />)}
      <g {...line}>
        <rect x="0" y="0" width={HALF.w} height={HALF.h} />
        <rect x={gx - boxW / 2} y="0" width={boxW} height={boxD} />
        <rect x={gx - sixW / 2} y="0" width={sixW} height={sixD} />
        <path d={`M${gx - dx} ${boxD} A${R} ${R} 0 0 0 ${gx + dx} ${boxD}`} />
        <path d={`M${gx - R} ${HALF.h} A${R} ${R} 0 0 1 ${gx + R} ${HALF.h}`} />
      </g>
      <circle cx={gx} cy={spotD} r="0.3" fill="#ffffff" />
      <rect x={gx - goalW / 2} y="-2" width={goalW} height="2" fill="rgba(255,255,255,0.5)" stroke="#ffffff" strokeWidth="0.3" />
    </g>
  );
}

/** Ćwiczenie narysowane na boisku: pole ćwiczenia, bramki (te z boiska), stożki, strzałki, numery kroków. */
function DrillLayer({ drill, map }: { drill: Drill; map: (p: Point) => Point }) {
  const { corners } = useMemo(() => placeDrill(drill), [drill]);
  return (
    <g>
      <polygon points={corners.map((c) => `${c.x},${c.y}`).join(" ")} fill="rgba(255,255,255,0.18)" stroke="#ffffff" strokeWidth="0.25" strokeDasharray="1 0.8" />
      {drill.arrows.map((ar, i) => (
        <path key={i} d={path(ar.points.map(map), ar.style === "dribble")} fill="none" stroke="#1d1d1f" strokeWidth={ar.style === "shot" ? 0.6 : 0.28} strokeDasharray={dash(ar.style)} strokeLinecap="round" markerEnd="url(#hp-head)" />
      ))}
      {drill.cones.map((c, i) => {
        const p = map(c);
        return (
          <g key={i}>
            <polygon points={`${p.x},${p.y - 1} ${p.x + 0.9},${p.y + 0.8} ${p.x - 0.9},${p.y + 0.8}`} fill={TONE_HEX[c.color ?? "yellow"]} stroke="#1d1d1f" strokeWidth="0.15" />
            {c.label && <text x={p.x} y={p.y - 1.5} fontSize="1.8" textAnchor="middle" fill="#1d1d1f">{c.label}</text>}
          </g>
        );
      })}
      {drill.arrows.map((ar, i) => {
        if (!ar.step) return null;
        const p = map(ar.points[0]!);
        return <text key={`s${i}`} x={p.x + 0.8} y={p.y - 0.8} fontSize="2" fontWeight="600" fill="#1d1d1f">{ar.step}</text>;
      })}
    </g>
  );
}

/**
 * Ćwiczenie na połowie boiska z przybliżaniem: szczypnięcie (dwa palce) lub kółko myszy przybliża, przeciągnięcie przesuwa,
 * dwukrotne dotknięcie przełącza całość / pole ćwiczenia. Pod spodem ten sam odtwarzacz kroków co w szkicu.
 */
export function HalfPitchView({ drill }: { drill: Drill }) {
  const place = useMemo(() => placeDrill(drill), [drill]);
  const player = useDrillPlayer(drill);
  const fit = useMemo<View>(() => {
    const b = place.box, m = 4;
    const w = Math.min(VW, Math.max(b.x1 - b.x0 + 2 * m, (b.y1 - b.y0 + 2 * m) * ASPECT, MIN_W));
    return clampView({ x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - w / ASPECT / 2, w });
  }, [place]);

  const [view, setView] = useState<View>(FULL);
  const viewRef = useRef(view);
  viewRef.current = view;
  const svg = useRef<SVGSVGElement>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef({ dist: 0, moved: false, tapAt: 0, tapX: 0, tapY: 0 });
  const tween = useRef(0);

  const rectOf = () => svg.current!.getBoundingClientRect();
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const r = rectOf();
    setView((v) => {
      const w = Math.min(VW, Math.max(MIN_W, v.w * factor)), fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
      return clampView({ w, x: v.x + fx * v.w - fx * w, y: v.y + fy * (v.w / ASPECT) - fy * (w / ASPECT) });
    });
  };
  const zoomCenter = (factor: number) => { const r = rectOf(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor); };
  /** Płynne przejście kadru (ok. 0,25 s). */
  const animateTo = (to: View) => {
    cancelAnimationFrame(tween.current);
    const from = viewRef.current, t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 250), e = k * k * (3 - 2 * k);
      setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e });
      if (k < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(tween.current), []);

  // kółko myszy (musi być nasłuchem nie-pasywnym, żeby nie przewijać strony)
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0018)); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(tween.current);
    try { svg.current!.setPointerCapture(e.pointerId); } catch { /* wskaźnik już nieaktywny */ }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gest.current.moved = false;
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; gest.current.dist = Math.hypot(a!.x - b!.x, a!.y - b!.y); gest.current.moved = true; }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = rectOf();
    if (ptrs.current.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) gest.current.moved = gest.current.moved || Math.hypot(dx, dy) > 1;
      setView((v) => clampView({ ...v, x: v.x - (dx * v.w) / r.width, y: v.y - (dy * (v.w / ASPECT)) / r.height }));
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()], d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (gest.current.dist > 0 && d > 0) zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, gest.current.dist / d);
      gest.current.dist = d;
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const wasOne = ptrs.current.size === 1, g = gest.current;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) g.dist = 0;
    if (!wasOne || g.moved) return;
    const now = performance.now();
    if (now - g.tapAt < 320 && Math.hypot(e.clientX - g.tapX, e.clientY - g.tapY) < 30) {
      g.tapAt = 0;
      animateTo(viewRef.current.w < VW * 0.9 ? FULL : fit); // dwukrotne dotknięcie: całość ↔ pole ćwiczenia
    } else { g.tapAt = now; g.tapX = e.clientX; g.tapY = e.clientY; }
  };

  const zoomLabel = `×${(VW / view.w).toFixed(1).replace(".", ",")}`;
  const btn = "flex h-9 min-w-9 items-center justify-center rounded-full bg-card/90 px-3 text-sm font-medium text-ink shadow-sm backdrop-blur active:scale-90";
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-hairline">
        <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.w / ASPECT}`} className="block w-full touch-none select-none" role="img" aria-label={`${drill.title} na połowie boiska`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <defs>
            <marker id="hp-head" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3" markerHeight="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#1d1d1f" /></marker>
          </defs>
          <PitchBase />
          <DrillLayer drill={drill} map={place.map} />
          {player.shown && (() => {
            const pl = place.map(player.st.player), ball = player.st.ball ? place.map(player.st.ball) : null;
            return (
              <>
                {ball && <circle cx={ball.x} cy={ball.y} r="0.75" fill="#fff" stroke="#1d1d1f" strokeWidth="0.25" />}
                <circle cx={pl.x} cy={pl.y} r="1.15" fill="var(--color-accent)" stroke="#fff" strokeWidth="0.35" />
              </>
            );
          })()}
        </svg>
        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          <button onClick={() => zoomCenter(0.7)} aria-label="Przybliż" className={btn}>+</button>
          <button onClick={() => zoomCenter(1 / 0.7)} aria-label="Oddal" className={btn}>−</button>
        </div>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-card/85 px-2.5 py-1 text-[11px] tabular-nums text-muted backdrop-blur">{zoomLabel}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => animateTo(fit)} className="flex-1 rounded-xl bg-accent-soft py-2.5 text-sm font-medium text-accent active:scale-[0.98]">Przybliż do ćwiczenia</button>
        <button onClick={() => animateTo(FULL)} className="flex-1 rounded-xl bg-canvas py-2.5 text-sm text-muted active:scale-[0.98]">Cała połowa</button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted">Szczypnij, żeby przybliżyć, przeciągnij, żeby przesunąć. Dwa razy dotknij, żeby przełączyć między całością a polem ćwiczenia.</p>
      <DrillControls p={player} />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(Object.keys(ARROW_LEGEND) as Array<keyof typeof ARROW_LEGEND>).map((k) => <span key={k}>{ARROW_LEGEND[k]}</span>)}
      </div>
    </div>
  );
}
