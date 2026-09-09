import { useEffect, useRef, useState } from "react";
import type { MetricPoint } from "@/lib/progress/progress";

/** Wykres rysowany animacją stroke-dashoffset. */
export function AnimatedChart({
  points,
  lowerIsBetter,
  height = 56,
}: {
  points: MetricPoint[];
  lowerIsBetter: boolean;
  height?: number;
}) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [len, setLen] = useState(0);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (!pathRef.current) return;
    setLen(pathRef.current.getTotalLength());
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [points]);

  if (points.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        Jeden pomiar — wykres pojawi się po powtórzeniu testu.
      </p>
    );
  }

  const w = 100;
  const h = height;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * w,
    y: h - ((p.value - min) / span) * (h - 10) - 5,
  }));
  const d = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const area = `${d} L${w},${h} L0,${h} Z`;
  const last = coords[coords.length - 1]!;
  const better = lowerIsBetter
    ? values[values.length - 1]! < values[0]!
    : values[values.length - 1]! > values[0]!;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`h-14 w-full ${better ? "text-primary" : "text-muted-foreground"}`}
      role="img"
      aria-label="Wykres zmian wyniku testu"
    >
      <path d={area} fill="currentColor" opacity={drawn ? 0.08 : 0} style={{ transition: "opacity 280ms ease-out" }} />
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={len || undefined}
        strokeDashoffset={drawn ? 0 : len}
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
      />
      <circle
        cx={last.x}
        cy={last.y}
        r={2.6}
        fill="currentColor"
        opacity={drawn ? 1 : 0}
        style={{ transition: "opacity 200ms 500ms ease-out" }}
      />
    </svg>
  );
}
