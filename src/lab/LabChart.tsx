import { monotonePath, timeFraction, type XY } from "../progress/chart";

/**
 * Wykres wyników testu w kolorze akcentu (bez nowych kolorów): linia rysuje się przy wejściu, punkty pojawiają się kolejno,
 * ostatni ma delikatny pierścień. Zawsze „wyżej = lepiej” (przy czasach oś jest odwrócona), więc poprawa wygląda jak wzrost.
 * Mały (kafelek) albo duży (karta testu, z linią najlepszego wyniku i datami).
 */
export function LabChart({ points, better, big = false }: { points: Array<{ date: string; value: number }>; better: "up" | "down"; big?: boolean }) {
  const W = big ? 300 : 120, H = big ? 100 : 36, P = big ? 10 : 4;
  if (points.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H * (big ? 1 : 1) }} aria-hidden="true">
        <line x1={P} x2={W - P} y1={H / 2} y2={H / 2} stroke="var(--color-hairline)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
      </svg>
    );
  }
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const from = points[0]!.date, to = points[points.length - 1]!.date;
  const norm = (v: number) => (better === "up" ? (v - lo) / span : (hi - v) / span); // 1 = najlepszy wynik na wykresie
  const yOf = (v: number) => P + (1 - norm(v)) * (H - 2 * P - (big ? 8 : 0));
  const xy = points.map((p, i) => [P + (points.length === 1 ? 0.5 : timeFraction(p.date, from, to)) * (W - 2 * P), yOf(p.value)] as XY);
  const last = xy[xy.length - 1]!;
  const line = monotonePath(xy);
  const best = better === "up" ? hi : lo;
  const dateLabel = (iso: string) => iso.slice(8) + "." + iso.slice(5, 7);
  const key = `${points.length}-${points.at(-1)!.value}`; // zmiana danych odtwarza animację

  return (
    <svg key={key} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Wykres wyników testu">
      {points.length > 1 && (
        <>
          <path d={`${line} L${last[0]},${H - (big ? 14 : P)} L${xy[0]![0]},${H - (big ? 14 : P)} Z`} fill="var(--color-accent)" fillOpacity="0.08" className="bw-fade-in" style={{ animationDelay: "500ms", animationFillMode: "both" }} />
          <path d={line} pathLength={100} fill="none" stroke="var(--color-accent)" strokeWidth={big ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" className="bw-draw" style={{ animationDuration: "0.9s" }} />
        </>
      )}
      {big && points.length > 1 && (
        <g>
          <line x1={P} x2={W - P} y1={yOf(best)} y2={yOf(best)} stroke="var(--color-hairline)" strokeWidth="1" strokeDasharray="3 4" />
          <text x={W - P - 9} y={yOf(best) - 3} textAnchor="end" fontSize="8" fill="var(--color-muted)">najlepszy</text>
        </g>
      )}
      {xy.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === xy.length - 1 ? (big ? 4 : 3) : big ? 2.6 : 0} fill="var(--color-accent)" className="bw-fade-in" style={{ animationDelay: `${300 + i * 90}ms`, animationFillMode: "both" }} />
      ))}
      <circle cx={last[0]} cy={last[1]} r={big ? 4 : 3} fill="none" stroke="var(--color-accent)" strokeWidth="1.2" className="bw-ring" style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: "900ms", animationIterationCount: 2 }} />
      {big && (
        <g fontSize="8" fill="var(--color-muted)">
          <text x={P} y={H - 2}>{dateLabel(from)}</text>
          {points.length > 1 && <text x={W - P} y={H - 2} textAnchor="end">{dateLabel(to)}</text>}
        </g>
      )}
    </svg>
  );
}
