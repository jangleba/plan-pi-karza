import { ARROW_COLOR, TONE_HEX, arrowsInOrder, drillStart } from "../engine/drill";
import type { Arrow, Drill, Point } from "../engine/drill";
import { placeDrill, HALF } from "../engine/halfPitch";
import { STROKE, arrowPath, lobPath, penaltyArc } from "./draw";
import { BADGE_R, coneAtStart, layoutOf, placeBadges } from "../engine/drillLayout";

const GREEN_A = "#478f3f", GREEN_B = "#4c9643";
const CONE = "#f28c28";

/** Numer kroku strzałki (jawny albo kolejność). */
const stepOf = (a: Arrow, i: number) => a.step ?? i + 1;

export interface BoardAnim { player: Point; ball: Point | null; players?: Record<string, Point> }

/**
 * Rysunek ćwiczenia na prawdziwym boisku: murawa z liniami (pole karne, łuk, bramka z siatką), stożki, rebounder, odległości,
 * sześć rodzajów strzałek z numerkami kroków i znacznik START. `step` wyróżnia jeden krok (reszta przygaszona), `anim` pokazuje zawodnika i piłkę.
 */
export function DrillBoard({ drill, step = null, anim = null, compact = false, layout = "pitch", className = "w-full rounded-2xl" }: { drill: Drill; step?: number | null; anim?: BoardAnim | null; compact?: boolean; /** „pitch”: szeroka połowa boiska z ćwiczeniem ustawionym przed bramką (jak we wzorcu); „window”: samo pole ćwiczenia. */ layout?: "pitch" | "window"; className?: string }) {
  const { width: w, height: h, kind } = drill.field;
  const pitch = layout === "pitch";
  const half = kind === "half";
  // zawsze na połowie boiska: z bramką – przed nią, bez bramki – po prawej stronie, nad linią środkową
  const place = pitch ? (drill.goals?.length ? placeDrill(drill).box : { x0: drill.field.origin?.x ?? Math.max(2, 61 - w), y0: drill.field.origin?.y ?? Math.max(-3, 24 - h) }) : null;
  const ox = place?.x0 ?? 0, oy = place?.y0 ?? 0;
  const padT = half ? 4.5 : 2.5, pad = 2;
  // małe pole (np. 18×14 m) rysujemy w oknie nie mniejszym niż 34×22 m, żeby symbole nie były przerośnięte
  const vw0 = w + pad * 2, vh0 = h + padT + pad;
  const exX = Math.max(0, (34 - vw0) / 2), exY = Math.max(0, (22 - vh0) / 2);
  const vx = -pad - exX, vy = -padT - exY, vw = vw0 + exX * 2, vh = vh0 + exY * 2;
  const PH = pitch ? Math.max(32, oy + h + 3 + 5.5) : 32; // wysokość widoku: pole ćwiczenia nigdy nie wychodzi za kadr
  const cx = drill.goals?.[0]?.x ?? w / 2;
  const ordered = arrowsInOrder(drill);
  const lay = layoutOf(drill, { startPill: !compact });
  const start = drillStart(drill);
  const dim = (n: number) => (step === null || step === n ? 1 : 0.22);

  return (
    <svg viewBox={pitch ? `2 -5.5 64 ${PH}` : `${vx} ${vy} ${vw} ${vh}`} className={className} preserveAspectRatio="xMidYMid meet" role="img" aria-label={drill.title}>
      <defs>
        <pattern id="db-grass" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="8" fill={GREEN_A} /><rect x="4" width="4" height="8" fill={GREEN_B} /></pattern>
        <pattern id="db-net" width="0.9" height="0.9" patternUnits="userSpaceOnUse"><path d="M0 0H0.9M0 0V0.9" stroke="#fff" strokeWidth="0.08" strokeOpacity="0.75" fill="none" /></pattern>
        <clipPath id="db-clip"><rect x={pitch ? 2 : vx} y={pitch ? -5.5 : vy} width={pitch ? 64 : vw} height={pitch ? PH : vh} /></clipPath>
        {(Object.keys(ARROW_COLOR) as Array<keyof typeof ARROW_COLOR>).map((k) => (
          <marker key={k} id={`db-ah-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth={k === "shot" ? 1.7 : k === "touch" ? 1.3 : 1.15} markerHeight={k === "shot" ? 1.7 : k === "touch" ? 1.3 : 1.15} orient="auto"><path d="M0 0 L10 5 L0 10 z" fill={ARROW_COLOR[k]} /></marker>
        ))}
      </defs>
      <rect x={pitch ? 2 : vx} y={pitch ? -5.5 : vy} width={pitch ? 64 : vw} height={pitch ? PH : vh} fill="url(#db-grass)" />
      <g clipPath="url(#db-clip)" fill="none" stroke="#fff" strokeOpacity="0.92" strokeWidth="0.2" strokeLinecap="round">
        {pitch ? (
          <>
            <path d={`M0,${40} V0 H${HALF.w} V${40}`} strokeWidth="0.22" />
            <path d="M0,1 A1,1 0 0 0 1,0 M67,0 A1,1 0 0 0 68,1" />
            <path d={`M${HALF.goalX - HALF.boxW / 2},0 V${HALF.boxD} H${HALF.goalX + HALF.boxW / 2} V0`} />
            <path d={`M${HALF.goalX - HALF.sixW / 2},0 V${HALF.sixD} H${HALF.goalX + HALF.sixW / 2} V0`} />
            <circle cx={HALF.goalX} cy={HALF.spotD} r="0.22" fill="#fff" />
            <path d={penaltyArc(HALF.goalX, HALF.spotD, HALF.circleR, HALF.boxD)} />
            <path d={`M2,${PH - 6.7} H66 M${HALF.goalX - 5.5},${PH - 6.7} A5.5 5.5 0 0 1 ${HALF.goalX + 5.5},${PH - 6.7}`} />
            {kind === "patch" && !drill.cones.length && <rect x={ox} y={oy} width={w} height={h} strokeWidth="0.3" strokeDasharray="1.2 0.8" fill="#fff" fillOpacity="0.06" />}
            {!drill.goals?.length && (
              <g><rect x={HALF.goalX - 3.66} y="-2.3" width="7.32" height="2.3" fill="url(#db-net)" strokeWidth="0.25" /><line x1={HALF.goalX - 3.66} x2={HALF.goalX + 3.66} y1="0" y2="0" strokeWidth="0.7" /></g>
            )}
          </>
        ) : half ? (
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
      <g transform={`translate(${ox} ${oy})`}>
      {drill.goals?.map((g, i) => (
        <g key={i}>
          <rect x={g.x - g.width / 2} y={-2.3} width={g.width} height="2.3" fill="url(#db-net)" stroke="#fff" strokeWidth="0.25" />
          <line x1={g.x - g.width / 2} x2={g.x + g.width / 2} y1="0" y2="0" stroke="#fff" strokeWidth="0.7" />
        </g>
      ))}
      {drill.distances?.map((d, i) => {
        const dl = lay.distanceLabels.get(i)!, mx = dl.tx, my = (dl.y0 + dl.y1) / 2;
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
      {drill.targets?.map((t, i) => (
        <g key={`t${i}`}>
          <rect x={t.x - t.width / 2} y={t.y - t.height / 2} width={t.width} height={t.height} rx="0.4" fill="#fff" fillOpacity="0.22" stroke="#fff" strokeWidth="0.16" strokeDasharray="0.6 0.5" />
          <text x={lay.targetLabels.get(i)!.tx} y={lay.targetLabels.get(i)!.ty} fontSize="0.9" fontWeight="500" textAnchor="middle" fill="#fff" fillOpacity="0.9">{t.label}</text>
        </g>
      ))}
      {drill.stations?.map((r) => (
        <g key={r.id} transform={`translate(${r.x} ${r.y}) rotate(${r.angle ?? 0})`}>
          <rect x="-1.4" y={-0.55} width="2.8" height="1.1" rx="0.15" fill="#e7ebef" stroke="#2b2f33" strokeWidth="0.16" />
          <rect x="-1.2" y={-0.35} width="2.4" height="0.7" fill="url(#db-net)" stroke="none" />
        </g>
      ))}
      {drill.cones.map((c, i) => {
        if (coneAtStart(drill, c)) return null;
        const fill = c.color && c.color !== "yellow" ? TONE_HEX[c.color] : CONE;
        return (
          <g key={`c${i}`}>
            <ellipse cx={c.x} cy={c.y + 0.5} rx="0.75" ry="0.28" fill="#1d1d1f" opacity="0.28" />
            <polygon points={`${c.x},${c.y - 0.85} ${c.x + 0.7},${c.y + 0.5} ${c.x - 0.7},${c.y + 0.5}`} fill={fill} stroke="#fff" strokeWidth="0.14" strokeLinejoin="round" />
            <rect x={c.x - 0.72} y={c.y + 0.38} width="1.44" height="0.22" rx="0.1" fill="#fff" fillOpacity="0.9" />
            {c.label && lay.coneLabels.get(i) && <text x={lay.coneLabels.get(i)!.tx} y={lay.coneLabels.get(i)!.ty} fontSize="1.05" fontWeight="600" textAnchor="middle" fill="#fff" stroke="#1f2a1f" strokeWidth="0.25" paintOrder="stroke">{c.label}</text>}
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
      {(() => { const spread = placeBadges(drill, ordered, { startPill: !compact, layout: lay }); return ordered.map((a, i) => {
        const n = stepOf(a, i), p = spread[i]!;
        return (
          <g key={`b${i}`} opacity={dim(n)}>
            <circle cx={p.x} cy={p.y} r={BADGE_R - 0.13} fill="#fff" stroke={ARROW_COLOR[a.style]} strokeWidth="0.26" />
            <text x={p.x} y={p.y + 0.38} fontSize="1.05" fontWeight="700" textAnchor="middle" fill="#1d1d1f">{n}</text>
          </g>
        );
      }); })()}
      {drill.actors && drill.actors.filter((a) => a.id !== "me").map((a) => { const p = anim?.players?.[a.id] ?? a; return (
        <g key={a.id}>
          <circle cx={p.x} cy={p.y} r="1" fill={a.kind === "defender" ? "#c0392b" : "#5b7087"} stroke="#fff" strokeWidth="0.26" />
          <text x={p.x} y={p.y + 0.4} fontSize="1.1" fontWeight="700" textAnchor="middle" fill="#fff">{a.label}</text>
        </g>
      ); })}
      {drill.actors && !anim && lay.ball && <circle cx={lay.ball.x} cy={lay.ball.y} r="0.6" fill="#fff" stroke="#1d1d1f" strokeWidth="0.2" />}
      {start && !anim && (
        <g>
          <circle cx={start.x} cy={start.y} r="1.05" fill="#1d1d1f" stroke="#fff" strokeWidth="0.28" />
          <text x={start.x} y={start.y + 0.45} fontSize="1.25" fontWeight="700" textAnchor="middle" fill="#fff">{drill.playerNumber ?? 7}</text>
          {lay.start?.pill && <><rect x={lay.start.pill.x0} y={lay.start.pill.y0} width={lay.start.pill.x1 - lay.start.pill.x0} height={lay.start.pill.y1 - lay.start.pill.y0} rx="0.62" fill="#fff" fillOpacity="0.92" /><text x={lay.start.pill.tx} y={lay.start.pill.ty - 0.08} fontSize="0.85" fontWeight="700" textAnchor="middle" fill="#1d1d1f">START</text></>}
        </g>
      )}
      {anim && (
        <g>
          {anim.ball && <circle cx={anim.ball.x} cy={anim.ball.y} r="0.6" fill="#fff" stroke="#1d1d1f" strokeWidth="0.2" />}
          <circle cx={anim.player.x} cy={anim.player.y} r="1.05" fill="#1d1d1f" stroke="#fff" strokeWidth="0.28" />
          <text x={anim.player.x} y={anim.player.y + 0.45} fontSize="1.25" fontWeight="700" textAnchor="middle" fill="#fff">{drill.playerNumber ?? 7}</text>
        </g>
      )}
      </g>
    </svg>
  );
}
