import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clampPoint } from "./engine";
import { PlayerFigure } from "./PlayerFigure";
import type { BallState, MatchPlayer, Phase, Point, UserPlan } from "./types";

type DragState =
  | { type: "player"; id: string; start: Point; current: Point }
  | { type: "ball"; start: Point; current: Point }
  | null;

type Props = {
  players: MatchPlayer[];
  ball: BallState;
  plan: UserPlan;
  phase: Phase;
  progress: number;
  playbackProgress: number;
  onPlanChange: (plan: UserPlan) => void;
  onHint: (message: string) => void;
};

const interpolate = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

export function Pitch({ players, ball, plan, phase, progress, playbackProgress, onPlanChange, onHint }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const editable = phase === "plan";

  const toPoint = (event: ReactPointerEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 50, y: 75 };
    const rect = svg.getBoundingClientRect();
    return clampPoint({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 150,
    });
  };

  const positions = useMemo(() => {
    const map = new Map<string, Point>();
    players.forEach((player) => {
      const observed = phase === "observe" || phase === "countdown"
        ? interpolate(player.from ?? player, player, progress)
        : { x: player.x, y: player.y };
      const run = plan.runs.find((item) => item.playerId === player.id);
      const played = phase === "playback" && run ? interpolate(run.from, run.to, playbackProgress) : observed;
      map.set(player.id, played);
    });
    return map;
  }, [players, phase, progress, plan.runs, playbackProgress]);

  const ballPosition = useMemo(() => {
    const pass = plan.pass;
    if (phase === "playback" && pass) return interpolate(pass.from, pass.to, Math.min(1, playbackProgress * 1.25));
    if (drag?.type === "ball") return drag.current;
    if (ball.carrierId) return positions.get(ball.carrierId) ?? ball;
    return ball;
  }, [ball, drag, phase, plan.pass, playbackProgress, positions]);

  const startPlayerDrag = (event: ReactPointerEvent<SVGGElement>, player: MatchPlayer) => {
    if (!editable || player.team !== "home" || plan.runs.length >= 3 && !plan.runs.some((run) => run.playerId === player.id)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = positions.get(player.id) ?? player;
    setDrag({ type: "player", id: player.id, start: current, current });
    onHint(player.controlled ? "Przeciągnij TY w wybraną przestrzeń" : "Dodajesz ruch wspierający");
    navigator.vibrate?.(8);
  };

  const startBallDrag = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!editable) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ type: "ball", start: ballPosition, current: ballPosition });
    onHint("Puść na partnerze lub w wolnej przestrzeni");
    navigator.vibrate?.(8);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    setDrag({ ...drag, current: toPoint(event) });
  };

  const finishDrag = () => {
    if (!drag) return;
    if (drag.type === "player") {
      const nextRuns = plan.runs.filter((run) => run.playerId !== drag.id);
      const movedEnough = Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y) > 3;
      onPlanChange({ ...plan, runs: movedEnough ? [...nextRuns, { playerId: drag.id, from: drag.start, to: drag.current }] : nextRuns });
      onHint(movedEnough ? "Ruch zapisany" : "Przeciągnij dalej, aby zapisać ruch");
    } else {
      const receiver = players
        .filter((player) => player.team === "home")
        .find((player) => {
          const pos = positions.get(player.id) ?? player;
          return Math.hypot(pos.x - drag.current.x, pos.y - drag.current.y) < 7;
        });
      const target = receiver ? positions.get(receiver.id) ?? receiver : drag.current;
      onPlanChange({ ...plan, pass: { from: drag.start, to: target, receiverId: receiver?.id } });
      onHint(receiver ? `Podanie do numeru ${receiver.number}` : "Podanie w przestrzeń zapisane");
    }
    navigator.vibrate?.(18);
    setDrag(null);
  };

  const orientation = (player: MatchPlayer, point: Point) => {
    const from = player.from ?? player;
    const dx = point.x - from.x;
    const dy = point.y - from.y;
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return player.team === "home" ? 0 : 180;
    return Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  };

  return (
    <div className="bwiq-pitch-shell">
      <svg
        ref={svgRef}
        className="bwiq-pitch"
        viewBox="0 0 100 150"
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={() => setDrag(null)}
        aria-label="Interaktywne boisko Football IQ"
      >
        <defs>
          <pattern id="bwiq-stripes" width="20" height="150" patternUnits="userSpaceOnUse">
            <rect width="10" height="150" fill="#397b52" />
            <rect x="10" width="10" height="150" fill="#34754d" />
          </pattern>
          <filter id="bwiq-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy=".7" stdDeviation=".65" floodOpacity=".22" />
          </filter>
        </defs>
        <rect width="100" height="150" rx="4" fill="url(#bwiq-stripes)" />
        <g className="bwiq-lines" fill="none" stroke="rgba(255,255,255,.86)" strokeWidth=".55">
          <rect x="2.5" y="2.5" width="95" height="145" />
          <line x1="2.5" y1="75" x2="97.5" y2="75" />
          <circle cx="50" cy="75" r="10" />
          <circle cx="50" cy="75" r=".65" fill="rgba(255,255,255,.86)" />
          <rect x="23" y="2.5" width="54" height="24" />
          <rect x="36" y="2.5" width="28" height="9" />
          <path d="M39 26.5 A12 12 0 0 0 61 26.5" />
          <rect x="23" y="123.5" width="54" height="24" />
          <rect x="36" y="138.5" width="28" height="9" />
          <path d="M39 123.5 A12 12 0 0 1 61 123.5" />
        </g>

        {plan.runs.map((run, index) => (
          <g key={run.playerId} className="bwiq-route">
            <line x1={run.from.x} y1={run.from.y} x2={run.to.x} y2={run.to.y} stroke="#8bc9ff" strokeWidth=".75" strokeDasharray="2.2 1.8" />
            <circle cx={run.to.x} cy={run.to.y} r="1.2" fill="#8bc9ff" />
            <text x={run.to.x + 2} y={run.to.y - 1} fill="white" fontSize="2.4" fontWeight="850">{index + 1}</text>
          </g>
        ))}
        {plan.pass && (
          <g className="bwiq-route">
            <line x1={plan.pass.from.x} y1={plan.pass.from.y} x2={plan.pass.to.x} y2={plan.pass.to.y} stroke="white" strokeWidth=".72" />
            <circle cx={plan.pass.to.x} cy={plan.pass.to.y} r="1.35" fill="none" stroke="white" strokeWidth=".55" />
          </g>
        )}
        {drag && (
          <line x1={drag.start.x} y1={drag.start.y} x2={drag.current.x} y2={drag.current.y} stroke="#b9ddff" strokeWidth=".9" strokeDasharray={drag.type === "player" ? "2 1.5" : undefined} />
        )}

        <g filter="url(#bwiq-shadow)">
          {players.map((player) => {
            const point = drag?.type === "player" && drag.id === player.id ? drag.current : positions.get(player.id) ?? player;
            return (
              <PlayerFigure
                key={player.id}
                player={player}
                x={point.x}
                y={point.y}
                orientation={orientation(player, point)}
                selected={drag?.type === "player" && drag.id === player.id}
                planned={plan.runs.some((run) => run.playerId === player.id)}
                onPointerDown={(event) => startPlayerDrag(event, player)}
              />
            );
          })}
        </g>
        <g className="bwiq-ball" transform={`translate(${ballPosition.x} ${ballPosition.y})`}>
          <circle r="5.5" fill="transparent" onPointerDown={startBallDrag} />
          <circle r="1.25" fill="white" stroke="#10253e" strokeWidth=".35" />
          <path d="M0-.55 L.55-.15 L.35.5 L-.35.5 L-.55-.15 Z" fill="#10253e" />
        </g>
      </svg>
    </div>
  );
}
