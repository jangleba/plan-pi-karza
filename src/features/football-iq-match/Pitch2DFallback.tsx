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

const project = (point: Point): Point => {
  const t = Math.max(0, Math.min(1, point.y / 150));
  const depth = .12 * t + .88 * Math.pow(t, 1.22);
  const width = .56 + .44 * t;
  return { x: 50 + (point.x - 50) * width, y: 5 + 140 * depth };
};

const unproject = (point: Point): Point => {
  let low = 0;
  let high = 150;
  for (let index = 0; index < 18; index += 1) {
    const middle = (low + high) / 2;
    if (project({ x: 50, y: middle }).y < point.y) low = middle;
    else high = middle;
  }
  const y = (low + high) / 2;
  const width = .56 + .44 * (y / 150);
  return clampPoint({ x: 50 + (point.x - 50) / width, y });
};

const pathFromPoints = (points: Point[], close = false) =>
  points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ") + (close ? " Z" : "");

const sampledLine = (from: Point, to: Point, steps = 18) =>
  pathFromPoints(Array.from({ length: steps + 1 }, (_, index) => project(interpolate(from, to, index / steps))));

const projectedRect = (left: number, top: number, right: number, bottom: number) => {
  const steps = 12;
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) points.push(project({ x: left + (right - left) * index / steps, y: top }));
  for (let index = 1; index <= steps; index += 1) points.push(project({ x: right, y: top + (bottom - top) * index / steps }));
  for (let index = 1; index <= steps; index += 1) points.push(project({ x: right - (right - left) * index / steps, y: bottom }));
  for (let index = 1; index < steps; index += 1) points.push(project({ x: left, y: bottom - (bottom - top) * index / steps }));
  return pathFromPoints(points, true);
};

const projectedCircle = (center: Point, radius: number, start = 0, end = Math.PI * 2) => {
  const points = Array.from({ length: 49 }, (_, index) => {
    const angle = start + (end - start) * index / 48;
    return project({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  });
  return pathFromPoints(points, Math.abs(end - start - Math.PI * 2) < .01);
};

const scaleAt = (point: Point) => .72 + Math.max(0, Math.min(1, point.y / 150)) * .42;

export function Pitch2DFallback({ players, ball, plan, phase, progress, playbackProgress, onPlanChange, onHint }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const editable = phase === "plan";

  const toPoint = (event: ReactPointerEvent): Point => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 50, y: 75 };
    const cursor = svg.createSVGPoint();
    cursor.x = event.clientX;
    cursor.y = event.clientY;
    const local = cursor.matrixTransform(matrix.inverse());
    return unproject({ x: local.x, y: local.y });
  };

  const positions = useMemo(() => {
    const map = new Map<string, Point>();
    players.forEach((player) => {
      const observed = phase === "observe" || phase === "countdown"
        ? interpolate(player.from ?? player, player, progress)
        : { x: player.x, y: player.y };
      const run = plan.runs.find((item) => item.playerId === player.id);
      map.set(player.id, phase === "playback" && run ? interpolate(run.from, run.to, playbackProgress) : observed);
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
    if (drag) setDrag({ ...drag, current: toPoint(event) });
  };

  const finishDrag = () => {
    if (!drag) return;
    if (drag.type === "player") {
      const nextRuns = plan.runs.filter((run) => run.playerId !== drag.id);
      const movedEnough = Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y) > 3;
      onPlanChange({ ...plan, runs: movedEnough ? [...nextRuns, { playerId: drag.id, from: drag.start, to: drag.current }] : nextRuns });
      onHint(movedEnough ? "Ruch zapisany" : "Przeciągnij dalej, aby zapisać ruch");
    } else {
      const receiver = players.filter((player) => player.team === "home").find((player) => {
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
    if (Math.abs(dx) + Math.abs(dy) < .5) return player.team === "home" ? 0 : 180;
    return Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  };

  const renderedPlayers = [...players].sort((first, second) => {
    const firstPoint = positions.get(first.id) ?? first;
    const secondPoint = positions.get(second.id) ?? second;
    return firstPoint.y - secondPoint.y;
  });
  const projectedBall = project(ballPosition);
  const fieldCorners = [project({ x: 2.5, y: 2.5 }), project({ x: 97.5, y: 2.5 }), project({ x: 97.5, y: 147.5 }), project({ x: 2.5, y: 147.5 })];
  const fieldPoints = fieldCorners.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="bwiq-pitch-shell">
      <svg
        ref={svgRef}
        className="bwiq-pitch"
        viewBox="0 0 100 150"
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={() => setDrag(null)}
        aria-label="Interaktywne boisko Football IQ w widoku 2,5D"
      >
        <defs>
          <clipPath id="bwiq-field-clip"><polygon points={fieldPoints} /></clipPath>
          <linearGradient id="bwiq-stadium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#071b24" />
            <stop offset=".16" stopColor="#183c32" />
            <stop offset="1" stopColor="#0d2f25" />
          </linearGradient>
          <linearGradient id="bwiq-light" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".14" />
            <stop offset=".42" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="1" stopColor="#061912" stopOpacity=".16" />
          </linearGradient>
          <radialGradient id="bwiq-glow" cx="48%" cy="28%" r="78%">
            <stop offset="0" stopColor="#d8f5bd" stopOpacity=".12" />
            <stop offset="1" stopColor="#03130d" stopOpacity=".16" />
          </radialGradient>
          <filter id="bwiq-grain" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency=".42" numOctaves="2" seed="17" />
            <feColorMatrix values="0 0 0 0 .55 0 0 0 0 .7 0 0 0 0 .42 0 0 0 .18 0" />
          </filter>
          <filter id="bwiq-shadow" x="-45%" y="-45%" width="190%" height="190%">
            <feDropShadow dx=".5" dy="1" stdDeviation=".75" floodColor="#03130e" floodOpacity=".42" />
          </filter>
        </defs>

        <rect width="100" height="150" fill="url(#bwiq-stadium)" />
        <polygon points={fieldPoints} fill="#34784e" />
        <g clipPath="url(#bwiq-field-clip)">
          {Array.from({ length: 10 }, (_, index) => {
            const left = index * 10;
            const right = left + 10;
            const stripe = [project({ x: left, y: 0 }), project({ x: right, y: 0 }), project({ x: right, y: 150 }), project({ x: left, y: 150 })];
            return <polygon key={left} points={stripe.map((point) => `${point.x},${point.y}`).join(" ")} fill={index % 2 ? "#397f53" : "#34764c"} />;
          })}
          <rect width="100" height="150" fill="url(#bwiq-light)" />
          <rect width="100" height="150" filter="url(#bwiq-grain)" opacity=".16" />
          <rect width="100" height="150" fill="url(#bwiq-glow)" />
        </g>

        <g className="bwiq-lines" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth=".56" strokeLinejoin="round">
          <path d={projectedRect(2.5, 2.5, 97.5, 147.5)} />
          <path d={sampledLine({ x: 2.5, y: 75 }, { x: 97.5, y: 75 })} />
          <path d={projectedCircle({ x: 50, y: 75 }, 10)} />
          <path d={projectedRect(23, 2.5, 77, 26.5)} />
          <path d={projectedRect(36, 2.5, 64, 11.5)} />
          <path d={projectedRect(23, 123.5, 77, 147.5)} />
          <path d={projectedRect(36, 138.5, 64, 147.5)} />
          <path d={projectedCircle({ x: 50, y: 75 }, .6)} fill="white" />
        </g>

        {plan.runs.map((run, index) => {
          const target = project(run.to);
          return (
            <g key={run.playerId} className="bwiq-route">
              <path d={sampledLine(run.from, run.to)} fill="none" stroke="#e5f5ff" strokeWidth="1.05" strokeDasharray=".01 2.25" strokeLinecap="round" />
              <circle cx={target.x} cy={target.y} r="1.45" fill="#8bc9ff" stroke="white" strokeWidth=".35" />
              <text x={target.x + 2} y={target.y - 1} fill="white" fontSize="2.4" fontWeight="850">{index + 1}</text>
            </g>
          );
        })}
        {plan.pass && (() => {
          const target = project(plan.pass.to);
          return (
            <g className="bwiq-route">
              <path d={sampledLine(plan.pass.from, plan.pass.to)} fill="none" stroke="white" strokeWidth=".82" />
              <circle cx={target.x} cy={target.y} r="1.35" fill="none" stroke="white" strokeWidth=".55" />
            </g>
          );
        })()}
        {drag && <path d={sampledLine(drag.start, drag.current)} fill="none" stroke="#d8efff" strokeWidth="1" strokeDasharray={drag.type === "player" ? ".01 2" : undefined} strokeLinecap="round" />}

        <g filter="url(#bwiq-shadow)">
          {renderedPlayers.map((player) => {
            const logical = drag?.type === "player" && drag.id === player.id ? drag.current : positions.get(player.id) ?? player;
            const visible = project(logical);
            return (
              <PlayerFigure
                key={player.id}
                player={player}
                x={visible.x}
                y={visible.y}
                scale={scaleAt(logical)}
                orientation={orientation(player, logical)}
                selected={drag?.type === "player" && drag.id === player.id}
                planned={plan.runs.some((run) => run.playerId === player.id)}
                onPointerDown={(event) => startPlayerDrag(event, player)}
              />
            );
          })}
        </g>
        <g className="bwiq-ball" transform={`translate(${projectedBall.x} ${projectedBall.y}) scale(${scaleAt(ballPosition)})`}>
          <circle r="5.5" fill="transparent" onPointerDown={startBallDrag} />
          <ellipse cx=".4" cy="1.05" rx="1.55" ry=".65" fill="#03120d" opacity=".3" />
          <circle r="1.28" fill="white" stroke="#10253e" strokeWidth=".35" />
          <path d="M0-.55 L.55-.15 L.35.5 L-.35.5 L-.55-.15 Z" fill="#10253e" />
        </g>
      </svg>
    </div>
  );
}
