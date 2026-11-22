import { ARROW_COLOR, TONE_HEX, arrowsInOrder, drillStart } from "../engine/drill";
import type { Arrow, Drill, Point } from "../engine/drill";
import { STROKE, arrowPath, badgePos, lobPath, penaltyArc } from "./draw";

const GREEN_A = "#3f9a4f", GREEN_B = "#46a456";
const CONE = "#f28c28";

/** Numer kroku strzałki (jawny albo kolejność). */
const stepOf = (a: Arrow, i: number) => a.step ?? i + 1;

export interface BoardAnim { player: Point; ball: Point | null }

/**
 * Rysunek ćwiczenia na prawdziwym boisku: murawa z liniami (pole karne, łuk, bramka z siatką), stożki, rebounder, odległości,
 * sześć rodzajów strzałek z numerkami kroków i znacznik START. `step` wyróżnia jeden krok (reszta przygaszona), `anim` pokazuje zawodnika i piłkę.
 */
export function DrillBoard({ drill, step = null, anim = null, compact = false }: { drill: Drill; step?: number | null; anim?: BoardAnim | null; compact?: boolean }) {
  const { width: w, height: h, kind } = drill.field;
  const half = kind === "half";
  const padT = half ? 4.5 : 2.5, pad = 2;
  const cx = drill.goals?.[0]?.x ?? w / 2;
  const ordered = arrowsInOrder(drill);
  const start = drillStart(drill);
  const dim = (n: number) => (step === null || step === n ? 1 : 0.22);

  return (
    <svg viewBox={`${-pad} ${-padT} ${w + pad * 2} ${h + padT + pad}`} className="w-full rounded-2xl" role="img" aria-label={drill.title}>
      <defs>
        <pattern id="db-grass" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="4" fill={GREEN_A} /><rect y="4" width="8" height="4" fill={GREEN_B} /></pattern>
        <pattern id="db-net" width="0.9" height="0.9" patternUnits="userSpaceOnUse"><path d="M0 0H0.9M0 0V0.9" stroke="#fff" strokeWidth="0.08" strokeOpacity="0.75" fill="none" /></pattern>
        <clipPath id="db-clip"><rect x={-pad} y={-padT} width={w + pad * 2} height={h + padT + pad} /></clipPath>
        {(Object.keys(ARROW_COLOR) as Array<keyof typeof ARROW_COLOR>).map((k) => (
          <marker key={k} id={`db-ah-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth={k === "shot" ? 2.1 : 1.6} markerHeight={k === "shot" ? 2.1 : 1.6} orient="auto"><path d="M0 0 L10 5 L0 10 z" fill={ARROW_COLOR[k]} /></marker>
        ))}
      </defs>
      <rect x={-pad} y={-padT} width={w + pad * 2} height={h + padT + pad} fill="url(#db-grass)" />
      <g clipPath="url(#db-clip)" fill="none" stroke="#fff" strokeWidth="0.28" strokeLinecap="round">
        {half ? (
          <>
            <line x1={-pad} x2={w + pad} y1="0" y2="0" strokeWidth="0.35" />
            <path d={`M${cx - 20.16},-1 V16.5 H${cx + 20.16} V-1`} />
            <path d={`M${cx - 9.16},0 V5.5 H${cx + 9.16} V0`} />
            <circle cx={cx} cy="11" r="0.3" fill="#fff" />
            <path d={penaltyArc(cx, 11, 9.15, 16.5)} />
          </>
        ) : (
          <rect x="0" y="0" width={w} height={h} strokeWidth="0.35" />
        )}
      </g>
      {drill.goals?.map((g, i) => (
        <g key={i}>
          <rect x={g.x - g.width / 2} y={-2.3} width={g.width} height="2.3" fill="url(#db-net)" stroke="#fff" strokeWidth="0.25" />
          <line x1={g.x - g.width / 2} x2={g.x + g.width / 2} y1="0" y2="0" stroke="#fff" strokeWidth="0.7" />
        </g>
      ))}
      {drill.distances?.map((d, i) => {
        const mx = (d.from.x + d.to.x) / 2, my = (d.from.y + d.to.y) / 2;
        return (
          <g key={`d${i}`} opacity="0.95">
            <line x1={d.from.x} y1={d.from.y} x2={d.to.x} y2={d.to.y} stroke="#e9eef2" strokeWidth="0.2" strokeDasharray="0.7 0.6" />
            <rect x={mx - 1.5} y={my - 0.7} width="3" height="1.4" rx="0.5" fill="#1f2a1f" fillOpacity="0.72" />
            <text x={mx} y={my + 0.4} fontSize="0.95" fontWeight="600" textAnchor="middle" fill="#fff">{d.label}</text>
          </g>
        );
      })}
      {drill.rebounders?.map((r, i) => {
        const rw = r.width ?? 2.6;
        return (
          <g key={`r${i}`} transform={`translate(${r.x} ${r.y}) rotate(${r.angle ?? 0})`}>
            <rect x={-rw / 2} y={-0.55} width={rw} height="1.1" rx="0.15" fill="#e7ebef" stroke="#2b2f33" strokeWidth="0.16" />
            <rect x={-rw / 2 + 0.2} y={-0.35} width={rw - 0.4} height="0.7" fill="url(#db-net)" stroke="none" />
          </g>
        );
      })}
      {drill.cones.map((c, i) => {
        const fill = c.color && c.color !== "yellow" ? TONE_HEX[c.color] : CONE;
        return (
          <g key={`c${i}`}>
            <ellipse cx={c.x} cy={c.y + 0.5} rx="0.75" ry="0.28" fill="#1d1d1f" opacity="0.28" />
            <polygon points={`${c.x},${c.y - 0.85} ${c.x + 0.7},${c.y + 0.5} ${c.x - 0.7},${c.y + 0.5}`} fill={fill} stroke="#fff" strokeWidth="0.14" strokeLinejoin="round" />
            <rect x={c.x - 0.72} y={c.y + 0.38} width="1.44" height="0.22" rx="0.1" fill="#fff" fillOpacity="0.9" />
            {c.label && <text x={c.x} y={c.y - 1.25} fontSize="1.05" fontWeight="600" textAnchor="middle" fill="#fff" stroke="#1f2a1f" strokeWidth="0.25" paintOrder="stroke">{c.label}</text>}
          </g>
        );
      })}
      {ordered.map((a, i) => {
        const n = stepOf(a, i), st = STROKE[a.style];
        return (
          <g key={`a${i}`} opacity={dim(n)}>
            <path d={arrowPath(a.style, a.points)} fill="none" stroke={ARROW_COLOR[a.style]} strokeWidth={st.w} strokeDasharray={st.dash} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#db-ah-${a.style})`} />
            {a.style === "lob" && (() => { const ap = lobPath(a.points).apex; return <ellipse cx={ap.x} cy={ap.y} rx="0.7" ry="0.34" fill="none" stroke={ARROW_COLOR.lob} strokeWidth="0.18" />; })()}
          </g>
        );
      })}
      {ordered.map((a, i) => {
        const n = stepOf(a, i), p = badgePos(a.style, a.points);
        return (
          <g key={`b${i}`} opacity={dim(n)}>
            <circle cx={p.x} cy={p.y} r="0.95" fill="#fff" stroke={ARROW_COLOR[a.style]} strokeWidth="0.32" />
            <text x={p.x} y={p.y + 0.42} fontSize="1.2" fontWeight="700" textAnchor="middle" fill="#1d1d1f">{n}</text>
          </g>
        );
      })}
      {start && !anim && (
        <g>
          <circle cx={start.x} cy={start.y} r="1.05" fill="#1d1d1f" stroke="#fff" strokeWidth="0.28" />
          <text x={start.x} y={start.y + 0.45} fontSize="1.25" fontWeight="700" textAnchor="middle" fill="#fff">{drill.playerNumber ?? 7}</text>
          {!compact && <><rect x={start.x - 1.7} y={start.y + 1.4} width="3.4" height="1.25" rx="0.62" fill="#fff" fillOpacity="0.92" /><text x={start.x} y={start.y + 2.3} fontSize="0.85" fontWeight="700" textAnchor="middle" fill="#1d1d1f">START</text></>}
        </g>
      )}
      {anim && (
        <g>
          {anim.ball && <circle cx={anim.ball.x} cy={anim.ball.y} r="0.6" fill="#fff" stroke="#1d1d1f" strokeWidth="0.2" />}
          <circle cx={anim.player.x} cy={anim.player.y} r="1.05" fill="#1d1d1f" stroke="#fff" strokeWidth="0.28" />
          <text x={anim.player.x} y={anim.player.y + 0.45} fontSize="1.25" fontWeight="700" textAnchor="middle" fill="#fff">{drill.playerNumber ?? 7}</text>
        </g>
      )}
    </svg>
  );
}
