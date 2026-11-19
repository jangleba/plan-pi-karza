import { GOAL, offsideLine } from "./engine";
import type { Snapshot, Verdict, Vec } from "./engine";

const C = { mate: "#2f6fb3", me: "#1f4f86", def: "#c8443f", gk: "#e0b23a", chosen: "#1d1d1f", best: "#2e9e62", bad: "#c8443f" };

function target(snap: Snapshot, o: { kind: string; targetId?: string }): Vec {
  if (o.kind === "shot") return { x: GOAL.x, y: GOAL.y };
  return snap.mates.find((m) => m.id === o.targetId)?.pos ?? snap.ball;
}

/** Tablica taktyczna z góry: pozycje, linia spalonego, Twój wybór i lepsza opcja. */
export function TacticalBoard({ snap, verdict }: { snap: Snapshot; verdict: Verdict }) {
  const X0 = 48, W = 60, H = 68;
  const line = offsideLine(snap);
  const chosen = target(snap, verdict.chosen);
  const best = target(snap, verdict.best);
  const same = verdict.chosen === verdict.best;
  const chosenColor = verdict.verdict === "poor" ? C.bad : C.chosen;
  const dot = (p: Vec, fill: string, label?: string, r = 1.5) => (
    <g>
      <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke="white" strokeWidth="0.45" />
      {label && <text x={p.x} y={p.y + 0.75} fontSize="2" textAnchor="middle" fontWeight="700" fill="white">{label}</text>}
    </g>
  );
  return (
    <svg viewBox={`${X0} -2 ${W} ${H + 4}`} className="w-full rounded-2xl" role="img" aria-label="Tablica taktyczna">
      <defs>
        <pattern id="tb-stripes" width="10.5" height="68" patternUnits="userSpaceOnUse">
          <rect width="5.25" height="68" fill="#e7f2e9" /><rect x="5.25" width="5.25" height="68" fill="#eef6ef" />
        </pattern>
        <marker id="tb-head" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="context-stroke" /></marker>
      </defs>
      <rect x={X0} y="-2" width={W} height={H + 4} fill="url(#tb-stripes)" />
      <g fill="none" stroke="white" strokeWidth="0.45">
        <rect x="0" y="0" width="105" height={H} />
        <line x1="52.5" x2="52.5" y1="0" y2={H} />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" />
        <rect x="99.5" y="24.84" width="5.5" height="18.32" />
        <circle cx="52.5" cy="34" r="9.15" />
      </g>
      <rect x="105" y={GOAL.y - 3.66} width="1.4" height="7.32" fill="white" stroke="#c9d3df" strokeWidth="0.2" />
      <line x1={line} x2={line} y1="0" y2={H} stroke={C.def} strokeWidth="0.35" strokeDasharray="1.4 1" opacity="0.8" />
      <text x={line - 0.8} y="3.6" fontSize="2" textAnchor="end" fill={C.def}>linia spalonego</text>
      {!same && <line x1={snap.ball.x} y1={snap.ball.y} x2={best.x} y2={best.y} stroke={C.best} strokeWidth="0.7" strokeDasharray="1.6 1.1" markerEnd="url(#tb-head)" />}
      <line x1={snap.ball.x} y1={snap.ball.y} x2={chosen.x} y2={chosen.y} stroke={chosenColor} strokeWidth="0.7" markerEnd="url(#tb-head)" />
      {snap.defenders.map((d, i) => <g key={i}>{dot(d, C.def)}</g>)}
      {dot(snap.keeper, C.gk)}
      {snap.mates.map((m) => <g key={m.id}>{dot(m.pos, C.mate, m.id)}</g>)}
      {dot(snap.ball, C.me, "Ty", 1.8)}
    </svg>
  );
}
