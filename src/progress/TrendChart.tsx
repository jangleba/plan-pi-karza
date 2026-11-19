import { useMemo, useRef, useState } from "react";
import type { Better, TrendTone } from "../engine";
import { TREND_HEX } from "./trend";
import { monotonePath, niceTicks, timeFraction } from "./chart";
import { shortDate } from "./metrics";

export interface Pt { date: string; value: number }

const fmt = (v: number, dec: number) => v.toFixed(dec).replace(".", ",");

/** Wykres trendu: gładka linia, siatka i osie, przerywana linia początku zakresu, znacznik rekordu, odczyt po dotknięciu/przesunięciu. */
export function TrendChart({ points, tone, unit = "", dec = 1, better = "higher" }: { points: Pt[]; tone: TrendTone; unit?: string; dec?: number; better?: Better }) {
  const W = 320, H = 168, L = 40, R = 12, T = 10, B = 26;
  const color = TREND_HEX[tone];
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const g = useMemo(() => {
    const vals = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 3);
    const lo = ticks[0]!, hi = ticks[ticks.length - 1]!;
    const from = points[0]!.date, to = points[points.length - 1]!.date;
    const x = (d: string) => (points.length === 1 ? L + (W - L - R) / 2 : L + timeFraction(d, from, to) * (W - L - R));
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    const xy = points.map((p) => [x(p.date), y(p.value)] as [number, number]);
    let best = 0;
    points.forEach((p, i) => { if (better === "higher" ? p.value > points[best]!.value : p.value < points[best]!.value) best = i; });
    return { ticks, xy, y, best, from, to, hi, lo };
  }, [points, better]);

  const idx = active ?? points.length - 1;
  const cur = points[idx]!;
  const first = points[0]!;
  const delta = points.length > 1 ? cur.value - first.value : 0;
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let bi = 0, bd = Infinity;
    g.xy.forEach(([x], i) => { const d = Math.abs(x - px); if (d < bd) { bd = d; bi = i; } });
    setActive(bi);
  };
  const baseline = g.y(first.value);
  const line = monotonePath(g.xy);
  const area = points.length > 1 ? `${line} L${g.xy[g.xy.length - 1]![0].toFixed(2)},${H - B} L${g.xy[0]![0].toFixed(2)},${H - B} Z` : "";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="tabular-nums text-muted">{shortDate(cur.date)}</span>
        <span className="tabular-nums">
          <span className="text-[15px] font-semibold" style={{ color }}>{fmt(cur.value, dec)}{unit}</span>
          {points.length > 1 && <span className="ml-2 text-muted">{delta >= 0 ? "+" : "−"}{fmt(Math.abs(delta), dec)}{unit} od {shortDate(first.date)}</span>}
        </span>
      </div>
      <svg
        ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ touchAction: "pan-y" }} role="img" aria-label="Wykres trendu"
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "mouse") move(e); }}
        onPointerLeave={() => setActive(null)} onPointerUp={() => setActive(null)} onPointerCancel={() => setActive(null)}
      >
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={g.y(t)} y2={g.y(t)} stroke="var(--color-hairline)" strokeWidth="1" />
            <text x={L - 6} y={g.y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-muted)" className="tabular-nums">{fmt(t, g.ticks.every(Number.isInteger) ? 0 : dec)}</text>
          </g>
        ))}
        {points.length > 1 && <line x1={L} x2={W - R} y1={baseline} y2={baseline} stroke={color} strokeOpacity="0.45" strokeDasharray="3 4" strokeWidth="1" />}
        {area && <path d={area} fill={color} fillOpacity="0.07" />}
        <path d={line} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={g.xy[i]![0]} cy={g.xy[i]![1]} r={i === idx ? 4.5 : 2.4} fill={i === idx ? color : "var(--color-card)"} stroke={color} strokeWidth="1.75" />
        ))}
        {points.length > 1 && (
          <g>
            <circle cx={g.xy[g.best]![0]} cy={g.xy[g.best]![1]} r="8" fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1" />
            <text x={g.xy[g.best]![0] + (g.xy[g.best]![0] > (L + W - R) / 2 ? -13 : 13)} y={g.xy[g.best]![1] + 3} textAnchor={g.xy[g.best]![0] > (L + W - R) / 2 ? "end" : "start"} fontSize="9" fontWeight="600" fill={color}>PR</text>
          </g>
        )}
        {active !== null && <line x1={g.xy[idx]![0]} x2={g.xy[idx]![0]} y1={T} y2={H - B} stroke={color} strokeOpacity="0.35" strokeWidth="1" />}
        <text x={L} y={H - 8} fontSize="10" fill="var(--color-muted)" className="tabular-nums">{shortDate(g.from)}</text>
        {points.length > 1 && <text x={W - R} y={H - 8} textAnchor="end" fontSize="10" fill="var(--color-muted)" className="tabular-nums">{shortDate(g.to)}</text>}
      </svg>
    </div>
  );
}

/** Mały wykres bez osi (do kafelków). */
export function Sparkline({ points, tone }: { points: Pt[]; tone: TrendTone }) {
  const W = 120, H = 34, P = 3;
  const color = TREND_HEX[tone];
  if (points.length < 2) return <div className="h-[34px] rounded-lg bg-canvas" aria-hidden />;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const from = points[0]!.date, to = points[points.length - 1]!.date;
  const xy = points.map((p) => [P + timeFraction(p.date, from, to) * (W - 2 * P), P + (1 - (p.value - lo) / (hi - lo || 1)) * (H - 2 * P)] as [number, number]);
  const last = xy[xy.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[34px] w-full" aria-hidden>
      <path d={monotonePath(xy)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}
