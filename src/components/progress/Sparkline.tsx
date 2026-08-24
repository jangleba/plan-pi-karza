import type { MetricPoint } from "@/lib/progress/progress";

/** Minimalistyczny wykres rozwoju w czasie (bez osi, bez ozdobników). */
export function Sparkline({
  points,
  lowerIsBetter,
  height = 48,
}: {
  points: MetricPoint[];
  lowerIsBetter: boolean;
  height?: number;
}) {
  if (points.length < 2) return null;
  const w = 100;
  const h = height;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p.value - min) / span) * (h - 8) - 4;
    return { x, y };
  });
  const d = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const last = coords[coords.length - 1]!;
  const first = points[0]!.value;
  const lastVal = points[points.length - 1]!.value;
  const better = lowerIsBetter ? lastVal < first : lastVal > first;
  const stroke = better ? "text-primary" : "text-muted-foreground";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`h-12 w-full ${stroke}`}
      role="img"
      aria-label="Wykres rozwoju wyniku w czasie"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last.x} cy={last.y} r={2.4} fill="currentColor" />
    </svg>
  );
}
