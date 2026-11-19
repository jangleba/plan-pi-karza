import type { TrendTone } from "./engine";

export const TREND_HEX: Record<TrendTone, string> = {
  green: "#3f9a6b",
  orange: "#d08a3c",
  red: "#c0504d",
  neutral: "#8a99ad",
};

export interface Point { label: string; value: number }

/** Wykres liniowy (nie słupkowy); kolor linii z trendu. */
export function LineChart({ points, tone, unit = "" }: { points: Point[]; tone: TrendTone; unit?: string }) {
  const W = 300, H = 110, PX = 8, PY = 14;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => PX + (points.length === 1 ? (W - 2 * PX) / 2 : (i * (W - 2 * PX)) / (points.length - 1));
  const y = (v: number) => H - PY - ((v - min) / span) * (H - 2 * PY);
  const color = TREND_HEX[tone];
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Wykres liniowy">
      <line x1={PX} x2={W - PX} y1={H - PY} y2={H - PY} stroke="#dbe5f1" strokeWidth="1" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4 : 2.5} fill={color} />
      ))}
      <text x={W - PX} y={Math.max(10, y(last.value) - 8)} textAnchor="end" fontSize="11" fill={color} fontWeight="600">
        {Math.round(last.value * 10) / 10}{unit}
      </text>
    </svg>
  );
}
