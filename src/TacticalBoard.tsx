import { GOAL, offsideLine } from "./engine";
import type { Snapshot, Verdict, Vec } from "./engine";

const TONE = { best: "#34a06a", good: "#e8923a", poor: "#d85a5a" } as const;

function target(snap: Snapshot, o: { kind: string; targetId?: string }): Vec {
  if (o.kind === "shot") return { x: GOAL.x, y: GOAL.y };
  return snap.mates.find((m) => m.id === o.targetId)?.pos ?? snap.ball;
}

/** Tablica taktyczna z góry: piłkarz, koledzy, obrońcy, linia spalonego, wybór i lepsza opcja. */
export function TacticalBoard({ snap, verdict }: { snap: Snapshot; verdict: Verdict }) {
  const X0 = 48, W = 60, H = 68;
  const line = offsideLine(snap);
  const chosen = target(snap, verdict.chosen);
  const best = target(snap, verdict.best);
  const same = verdict.chosen === verdict.best;
  return (
    <svg viewBox={`${X0} -2 ${W} ${H + 4}`} className="w-full rounded-2xl bg-green-soft" role="img" aria-label="Tablica taktyczna">
      <defs>
        <marker id="ah" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="context-stroke" /></marker>
      </defs>
      <rect x="0" y="0" width="105" height={H} fill="none" stroke="white" strokeWidth="0.5" />
      <rect x="88.5" y="13.8" width="16.5" height="40.3" fill="none" stroke="white" strokeWidth="0.4" />
      <line x1={line} x2={line} y1="0" y2={H} stroke="#d85a5a" strokeWidth="0.4" strokeDasharray="1.5 1" />
      <text x={line - 0.8} y="3.5" fontSize="2.2" textAnchor="end" fill="#d85a5a">linia spalonego</text>
      {snap.defenders.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="1.3" fill="#e89494" stroke="#1d1d1f" strokeWidth="0.2" />)}
      <circle cx={snap.keeper.x} cy={snap.keeper.y} r="1.3" fill="#f0cf6b" stroke="#1d1d1f" strokeWidth="0.2" />
      {snap.mates.map((m) => (
        <g key={m.id}>
          <circle cx={m.pos.x} cy={m.pos.y} r="1.3" fill="#8fb3e8" stroke="#1d1d1f" strokeWidth="0.2" />
          <text x={m.pos.x} y={m.pos.y + 0.8} fontSize="2" textAnchor="middle" fontWeight="600" fill="#1d1d1f">{m.id}</text>
        </g>
      ))}
      {!same && (
        <line x1={snap.ball.x} y1={snap.ball.y} x2={best.x} y2={best.y} stroke={TONE.best} strokeWidth="0.7" strokeDasharray="1.6 1.2" markerEnd="url(#ah)" style={{ color: TONE.best }} />
      )}
      <line x1={snap.ball.x} y1={snap.ball.y} x2={chosen.x} y2={chosen.y} stroke={TONE[verdict.verdict]} strokeWidth="0.7" markerEnd="url(#ah)" />
      <circle cx={snap.ball.x} cy={snap.ball.y} r="1.5" fill="white" stroke="#1d1d1f" strokeWidth="0.3" />
    </svg>
  );
}
