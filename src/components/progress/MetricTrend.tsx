import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDate } from "@/lib/loadwise/labels";
import { changeOf, type MetricSeries } from "@/lib/progress/progress";

/**
 * Wykres „Zmiana w czasie" — wyłącznie realne pomiary użytkownika.
 * Bez pomiarów nie rysujemy żadnego przebiegu.
 */
export function MetricTrend({ series }: { series: MetricSeries[] }) {
  const [id, setId] = useState<string | null>(series[0]?.id ?? null);
  const current = useMemo(
    () => series.find((s) => s.id === id) ?? series[0] ?? null,
    [series, id],
  );

  if (!current) {
    return (
      <section className="soft-card p-4">
        <h2 className="text-sm font-semibold">Zmiana w czasie</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nie masz jeszcze żadnego zapisanego pomiaru.
        </p>
        <Link
          to="/vision-lab"
          className="mt-3 flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
        >
          Wykonaj pierwszy test
        </Link>
      </section>
    );
  }

  const c = changeOf(current);
  const values = current.points.map((p) => p.value);
  const best = current.lowerIsBetter ? Math.min(...values) : Math.max(...values);
  const first = current.points[0]!;

  return (
    <section className="soft-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Zmiana w czasie</h2>
        <span className="text-[11px] text-muted-foreground">
          {current.points.length} pomiar(y)
        </span>
      </div>

      <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {series.map((s) => (
          <button
            key={s.id}
            onClick={() => setId(s.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors duration-200 ${
              s.id === current.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {current.points.length < 2 ? (
        <div className="mt-3 rounded-xl bg-muted/50 p-3">
          <div className="text-lg font-bold leading-none">
            {first.value}
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              {current.unit}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Punkt bazowy · {formatDate(first.date)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Masz punkt odniesienia. Powtórz test, aby zobaczyć kierunek zmiany.
          </p>
        </div>
      ) : (
        <>
          <LineChart series={current} />
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Cell
              label="start"
              value={`${first.value} ${current.unit}`}
              sub={formatDate(first.date)}
            />
            <Cell label="rekord" value={`${best} ${current.unit}`} />
            <Cell
              label="ostatni"
              value={`${c.latest.value} ${current.unit}`}
              sub={formatDate(c.latest.date)}
            />
          </dl>
          {c.changePct != null && (
            <p
              className={`mt-2 text-xs font-medium ${
                c.improved ? "text-primary" : "text-destructive"
              }`}
            >
              {c.improved ? "Poprawa" : "Regres"} {Math.abs(c.changePct).toFixed(1)}%
              względem poprzedniego pomiaru
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function LineChart({ series }: { series: MetricSeries }) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [len, setLen] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const W = 300;
  const H = 120;
  const PAD = 10;

  const values = series.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = series.points.map((p, i) => ({
    x: PAD + (i / (series.points.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((p.value - min) / span) * (H - PAD * 2),
  }));
  const d = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  useEffect(() => {
    setDrawn(false);
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [series.id]);

  const point = active != null ? series.points[active] : null;

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full text-primary"
        role="img"
        aria-label={`Wykres zmian: ${series.label}`}
      >
        <path
          d={`${d} L${coords[coords.length - 1]!.x},${H} L${coords[0]!.x},${H} Z`}
          fill="currentColor"
          opacity={drawn ? 0.07 : 0}
          className="motion-safe:transition-opacity motion-safe:duration-300"
        />
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len || undefined}
          strokeDashoffset={drawn ? 0 : len}
          style={{ transition: "stroke-dashoffset 350ms ease-out" }}
        />
        {coords.map((cc, i) => (
          <circle
            key={series.points[i]!.date + i}
            cx={cc.x}
            cy={cc.y}
            r={active === i ? 5.5 : 3.5}
            fill="currentColor"
            className="motion-safe:transition-all motion-safe:duration-200"
            onPointerDown={() => setActive(i === active ? null : i)}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(series.points[0]!.date)}</span>
        <span>{formatDate(series.points[series.points.length - 1]!.date)}</span>
      </div>
      {point && (
        <div className="mt-1 text-xs font-medium">
          {formatDate(point.date)}: {point.value} {series.unit}
        </div>
      )}
    </div>
  );
}
