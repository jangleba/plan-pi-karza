import { useMemo, useState } from "react";
import type { ClubView } from "./clubs";
import { CENTER, POLAND_KM, RADIUS, TINT_FILL, TINT_INK, radarDots, ringsFor } from "./viz";

const WEDGE = "M150 150 L150 22 A128 128 0 0 1 238.5 57.5 Z";

/**
 * Radar: Ty pośrodku, kluby jako kolorowe kropki w kierunku geograficznym i odległości (skala = wybrany promień).
 * Obraca się, kropki wyskakują po kolei, dotknięcie kropki pokazuje klub i przycisk „Napisz”. Dostępna alternatywa: lista kart pod spodem.
 */
export function RadarViz({ place, radiusKm, clubs, sent, scanning, onPick, onSetup }: {
  place: { name: string; lat: number; lon: number } | null; radiusKm: number | null; clubs: ClubView[]; sent: Record<string, string>;
  scanning: boolean; onPick: (clubId: string) => void; onSetup: () => void;
}) {
  const maxKm = radiusKm ?? POLAND_KM;
  const dots = useMemo(() => (place ? radarDots(place, clubs, maxKm) : []), [place, clubs, maxKm]);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = dots.find((d) => d.id === picked) ?? null;

  return (
    <div className="bw-rise overflow-hidden rounded-3xl border border-hairline bg-radar">
      <svg viewBox="0 0 300 300" className="mx-auto block w-full max-w-[340px] select-none" role="img"
        aria-label={place ? `Radar klubów w promieniu ${radiusKm === null ? "całej Polski" : `${radiusKm} km`} od miejscowości ${place.name}: ${dots.length} klubów` : "Radar klubów – wybierz miejscowość"}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#f5faff" stroke="#c9def6" strokeWidth="1.5" />
        {ringsFor(maxKm).slice(0, 3).map((km, i) => (
          <g key={km}>
            <circle cx={CENTER} cy={CENTER} r={(RADIUS * (i + 1)) / 4} fill="none" stroke="#c9def6" strokeWidth="1" strokeDasharray="3 5" />
            <text x={CENTER + 4} y={CENTER - (RADIUS * (i + 1)) / 4 + 11} fontSize="9" fill="#7ea3cf">{km} km</text>
          </g>
        ))}
        <line x1={CENTER} y1={CENTER - RADIUS} x2={CENTER} y2={CENTER + RADIUS} stroke="#dbe9fa" />
        <line x1={CENTER - RADIUS} y1={CENTER} x2={CENTER + RADIUS} y2={CENTER} stroke="#dbe9fa" />
        <text x={CENTER} y={CENTER - RADIUS - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#7ea3cf">N</text>

        {scanning && (
          <g className="bw-sweep" aria-hidden="true">
            <path d={WEDGE} fill="#8ec1f0" fillOpacity="0.22" />
            <line x1={CENTER} y1={CENTER} x2={CENTER} y2={CENTER - RADIUS} stroke="#5b9fe0" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
          </g>
        )}

        {dots.map((d, i) => (
          <g key={d.id} className="bw-dotin" style={{ animationDelay: `${300 + i * 140}ms`, cursor: "pointer", outline: "none" }} role="button" tabIndex={0}
            aria-label={`${d.name}, ok. ${d.distanceKm} km`} onClick={() => setPicked(picked === d.id ? null : d.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(picked === d.id ? null : d.id); } }}>
            {picked === d.id && <circle cx={d.x} cy={d.y} r="21" fill="none" stroke={TINT_INK[d.tint]} strokeOpacity="0.45" strokeWidth="2" />}
            <circle cx={d.x} cy={d.y} r="16" fill={TINT_FILL[d.tint]} stroke="#fff" strokeWidth="2.5" />
            <text x={d.x} y={d.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill={TINT_INK[d.tint]}>{d.label}</text>
            {sent[d.id] && (<g><circle cx={d.x + 12} cy={d.y - 12} r="6.5" fill="#2e9e62" stroke="#fff" strokeWidth="1.5" /><path d={`M${d.x + 9} ${d.y - 12} l2.2 2.2 l4 -4.2`} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></g>)}
          </g>
        ))}

        {/* Ty */}
        <circle className="bw-ping" cx={CENTER} cy={CENTER} r="11" fill="#5b9fe0" />
        <circle cx={CENTER} cy={CENTER} r="11" fill="#2f6fb3" stroke="#fff" strokeWidth="2.5" />
        <text x={CENTER} y={CENTER + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff">Ty</text>

        {!place && (
          <g role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={onSetup} onKeyDown={(e) => { if (e.key === "Enter") onSetup(); }} aria-label="Wybierz miejscowość">
            <rect x="70" y="236" width="160" height="34" rx="17" fill="#dbe9fa" stroke="#c3d9f3" />
            <text x={CENTER} y="257" textAnchor="middle" fontSize="12" fontWeight="600" fill="#1f4d80">Wybierz miejscowość</text>
          </g>
        )}
      </svg>
      {sel ? (
        <div className={`bw-pop bw-t${sel.tint} bw-tint mx-3 mb-3 flex items-center gap-3 rounded-2xl px-4 py-3`}>
          <span className="bw-tint-dot flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">{sel.label}</span>
          <span className="min-w-0 flex-1"><span className="bw-tint-ink block truncate text-[15px] font-semibold">{sel.name}</span><span className="bw-tint-ink block text-xs opacity-80">ok. {sel.distanceKm} km od {place?.name}</span></span>
          <button onClick={() => onPick(sel.id)} className="rounded-xl bg-white/80 px-3.5 py-2 text-sm font-semibold text-ink">Napisz</button>
        </div>
      ) : (
        <p className="px-4 pb-4 text-center text-xs text-muted">{dots.length > 0 ? "Dotknij kropki, by zobaczyć klub" : scanning ? "Radar skanuje okolicę…" : ""}</p>
      )}
    </div>
  );
}
