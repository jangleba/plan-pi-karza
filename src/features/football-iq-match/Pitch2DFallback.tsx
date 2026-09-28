import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { analyzePassLane, clampPoint } from "./engine";
import { PlayerFigure } from "./PlayerFigure";
import type { ActionMode, BallState, MatchPlayer, Phase, PlannedAction, PlannedMove, Point, UserPlan } from "./types";

type DragState =
  | { pointerId: number; type: "player"; id: string; start: Point; current: Point }
  | { pointerId: number; type: "group"; id: string; start: Point; current: Point; moves: PlannedMove[] }
  | { pointerId: number; type: "ball"; start: Point; current: Point }
  | null;

type Props = {
  players: MatchPlayer[];
  ball: BallState;
  plan: UserPlan;
  phase: Phase;
  mode: ActionMode;
  progress: number;
  playbackProgress: number;
  onPlanChange: (plan: UserPlan) => void;
  onHint: (message: string) => void;
};

type WithoutIdentity<T> = T extends PlannedAction ? Omit<T, "id" | "order"> : never;
type DraftAction = WithoutIdentity<PlannedAction>;
type FrameBall = Point & { carrierId?: string };

const interpolate = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

const actionWeight = (action: PlannedAction) => {
  if (action.type === "pass") {
    return Math.max(0.32, Math.hypot(action.to.x - action.from.x, action.to.y - action.from.y) / 52);
  }
  const longestMove = action.moves.reduce(
    (maximum, move) => Math.max(maximum, Math.hypot(move.to.x - move.from.x, move.to.y - move.from.y)),
    0,
  );
  return Math.max(0.52, longestMove / 22);
};

const actionActors = (action: PlannedAction) => {
  const actors = new Set<string>();
  if (action.type === "pass") {
    actors.add("ball");
    if (action.passerId) actors.add(`player:${action.passerId}`);
    if (action.receiverId) actors.add(`player:${action.receiverId}`);
  } else {
    action.moves.forEach((move) => actors.add(`player:${move.playerId}`));
  }
  return actors;
};

const actionSchedule = (actions: PlannedAction[]) => {
  const weights = actions.map(actionWeight);
  const actors = actions.map(actionActors);
  const starts: number[] = [];
  actions.forEach((_, index) => {
    if (index === 0) {
      starts.push(0);
      return;
    }
    let start = starts[index - 1] + weights[index - 1] * 0.78;
    for (let prior = 0; prior < index; prior += 1) {
      const dependent = [...actors[index]].some((actor) => actors[prior].has(actor));
      if (dependent) start = Math.max(start, starts[prior] + weights[prior]);
    }
    starts.push(start);
  });
  const total = Math.max(0.001, (starts.at(-1) ?? 0) + (weights.at(-1) ?? 0));
  return { starts, weights, total };
};

const actionProgress = (globalProgress: number, index: number, actions: PlannedAction[]) => {
  if (!actions.length || globalProgress <= 0) return 0;
  if (globalProgress >= 1) return 1;
  const { starts, weights, total } = actionSchedule(actions);
  return smooth((globalProgress - starts[index] / total) / Math.max(0.001, weights[index] / total));
};

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

const getLine = (role: string) => {
  const normalized = role.toUpperCase();
  if (["LO", "PO", "ŚO", "SO"].includes(normalized)) return "defence";
  if (["DP", "ŚP", "SP", "ŚPO", "SPO"].includes(normalized)) return "midfield";
  return normalized === "BR" ? "goalkeeper" : "attack";
};

export function Pitch2DFallback({
  players,
  ball,
  plan: userPlan,
  phase,
  mode,
  progress,
  playbackProgress,
  onPlanChange: commitPlan,
  onHint,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const editable = phase === "plan";

  const actions = useMemo(
    () => [...userPlan.actions].sort((left, right) => left.order - right.order),
    [userPlan.actions],
  );

  const appendAction = (action: DraftAction) => {
    const order = userPlan.actions.reduce((maximum, item) => Math.max(maximum, item.order), 0) + 1;
    commitPlan({
      ...userPlan,
      actions: [
        ...userPlan.actions,
        { ...action, id: `fallback-${action.type}-${Date.now().toString(36)}`, order } as PlannedAction,
      ],
    });
    return order;
  };

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

  const frame = useMemo(() => {
    const map = new Map<string, Point>();
    players.forEach((player) => {
      const observed = phase === "observe" || phase === "countdown"
        ? interpolate(player.from ?? player, player, progress)
        : { x: player.x, y: player.y };
      map.set(player.id, observed);
    });
    const logicalBall: FrameBall = { x: ball.x, y: ball.y, carrierId: ball.carrierId };
    const initialCarrier = logicalBall.carrierId ? map.get(logicalBall.carrierId) : undefined;
    if (initialCarrier) Object.assign(logicalBall, initialCarrier);

    const globalProgress = phase === "playback"
      ? playbackProgress
      : ["plan", "intent", "feedback", "compare"].includes(phase) ? 1 : 0;
    const schedule = actionSchedule(actions);
    let timelineProgress = globalProgress;
    actions.forEach((action, actionIndex) => {
      const localProgress = actionProgress(timelineProgress, actionIndex, actions);
      if (localProgress <= 0) return;
      if (action.type === "pass") {
        const passerId = action.passerId ?? logicalBall.carrierId;
        const passerTeam = players.find((player) => player.id === passerId)?.team ?? "home";
        const defenders = players
          .filter((player) => player.team !== passerTeam)
          .map((player) => ({ ...player, ...(map.get(player.id) ?? player) }));
        const lane = analyzePassLane(action, defenders);
        const intercepted = ["playback", "feedback", "compare"].includes(phase) && lane.clearance < 3.4;
        const target = intercepted ? lane.point : action.to;
        Object.assign(logicalBall, interpolate(action.from, target, localProgress));
        logicalBall.carrierId = localProgress >= 1 ? (intercepted ? lane.interceptorId : action.receiverId) : undefined;
        if (intercepted && localProgress >= 1) {
          const interceptionEnd = (schedule.starts[actionIndex] + schedule.weights[actionIndex]) / schedule.total;
          timelineProgress = Math.min(timelineProgress, interceptionEnd);
        }
        return;
      }
      action.moves.forEach((move) => {
        const point = interpolate(move.from, move.to, localProgress);
        map.set(move.playerId, point);
        if (logicalBall.carrierId === move.playerId) Object.assign(logicalBall, point);
      });
    });
    const finalCarrier = logicalBall.carrierId ? map.get(logicalBall.carrierId) : undefined;
    if (finalCarrier) Object.assign(logicalBall, finalCarrier);
    return { positions: map, ball: logicalBall };
  }, [actions, ball, phase, playbackProgress, players, progress]);

  const positions = frame.positions;
  const ballPosition = drag?.type === "ball" ? drag.current : frame.ball;

  const startPlayerDrag = (event: ReactPointerEvent<SVGGElement>, player: MatchPlayer) => {
    if (!editable || mode === "pass" || player.team !== "home" || userPlan.actions.length >= 8) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = positions.get(player.id) ?? player;
    if (mode === "group") {
      const line = getLine(player.role);
      const moves = players
        .filter((item) => item.team === "home" && !item.goalkeeper && getLine(item.role) === line)
        .map((item) => {
          const from = positions.get(item.id) ?? item;
          return { playerId: item.id, from: { ...from }, to: { ...from } };
        });
      setDrag({ pointerId: event.pointerId, type: "group", id: player.id, start: current, current, moves });
      onHint(`Przesuwasz całą linię: ${line === "defence" ? "obrona" : line === "midfield" ? "pomoc" : "atak"}`);
    } else {
      setDrag({ pointerId: event.pointerId, type: "player", id: player.id, start: current, current });
      onHint(player.controlled ? "Przeciągnij TY w wybraną przestrzeń" : "Dodajesz ruch wspierający");
    }
    navigator.vibrate?.(8);
  };

  const startBallDrag = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!editable || mode !== "pass" || userPlan.actions.length >= 8) return;
    const carrier = players.find((player) => player.id === ball.carrierId);
    if (carrier && carrier.team !== "home") {
      onHint("Rywal ma piłkę — zaplanuj pressing albo zabezpieczenie");
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, type: "ball", start: ballPosition, current: ballPosition });
    onHint("Puść na partnerze lub w wolnej przestrzeni");
    navigator.vibrate?.(8);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag && drag.pointerId === event.pointerId) setDrag({ ...drag, current: toPoint(event) });
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.type === "player") {
      const movedEnough = Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y) > 3;
      if (movedEnough) {
        const order = appendAction({ type: "run", moves: [{ playerId: drag.id, from: drag.start, to: drag.current }] });
        onHint(`Ruch zapisany jako krok ${order}`);
      } else onHint("Przeciągnij dalej, aby zapisać ruch");
    } else if (drag.type === "group") {
      const dx = drag.current.x - drag.start.x;
      const dy = drag.current.y - drag.start.y;
      const movedEnough = Math.hypot(dx, dy) > 3;
      if (movedEnough) {
        const order = appendAction({
          type: "group",
          moves: drag.moves.map((move) => ({
            playerId: move.playerId,
            from: move.from,
            to: clampPoint({ x: move.from.x + dx, y: move.from.y + dy }),
          })),
        });
        onHint(`Przesunięcie linii zapisane jako krok ${order}`);
      } else onHint("Przeciągnij dalej, aby przesunąć linię");
    } else {
      const movedEnough = Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y) > 3;
      if (!movedEnough) {
        onHint("Przeciągnij piłkę dalej, aby zapisać podanie");
        setDrag(null);
        return;
      }
      const receiver = players.filter((player) => player.team === "home").find((player) => {
        const pos = positions.get(player.id) ?? player;
        return Math.hypot(pos.x - drag.current.x, pos.y - drag.current.y) < 7;
      });
      const target = receiver ? positions.get(receiver.id) ?? receiver : drag.current;
      const order = appendAction({
        type: "pass",
        from: drag.start,
        to: { x: target.x, y: target.y },
        passerId: ball.carrierId,
        receiverId: receiver?.id,
      });
      onHint(receiver ? `Podanie do numeru ${receiver.number} zapisane jako krok ${order}` : `Podanie w przestrzeń zapisane jako krok ${order}`);
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
  const movementRoutes = actions.flatMap((action) => action.type === "pass"
    ? []
    : action.moves.map((move, moveIndex) => ({ action, move, moveIndex })));
  const passRoutes = actions.filter((action): action is Extract<PlannedAction, { type: "pass" }> => action.type === "pass");
  const plannedPlayerIds = new Set(movementRoutes.map(({ move }) => move.playerId));
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
        onPointerCancel={(event) => {
          if (drag?.pointerId === event.pointerId) setDrag(null);
        }}
        aria-label="Interaktywne boisko Football IQ w widoku 2,5D"
      >
        <defs>
          <clipPath id="bwiq-field-clip"><polygon points={fieldPoints} /></clipPath>
          <linearGradient id="bwiq-stadium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e8f0ec" />
            <stop offset=".16" stopColor="#dbe8e0" />
            <stop offset="1" stopColor="#cdded4" />
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
        <polygon points={fieldPoints} fill="#4f9851" />
        <g clipPath="url(#bwiq-field-clip)">
          {Array.from({ length: 10 }, (_, index) => {
            const left = index * 10;
            const right = left + 10;
            const stripe = [project({ x: left, y: 0 }), project({ x: right, y: 0 }), project({ x: right, y: 150 }), project({ x: left, y: 150 })];
            return <polygon key={left} points={stripe.map((point) => `${point.x},${point.y}`).join(" ")} fill={index % 2 ? "#59a45a" : "#4f9851"} />;
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

        {movementRoutes.map(({ action, move, moveIndex }) => {
          const target = project(move.to);
          return (
            <g key={`${action.id}-${move.playerId}`} className="bwiq-route">
              <path d={sampledLine(move.from, move.to)} fill="none" stroke={action.type === "group" ? "#c4e4f8" : "#e5f5ff"} strokeWidth="1.05" strokeDasharray=".01 2.25" strokeLinecap="round" />
              <circle cx={target.x} cy={target.y} r="1.45" fill="#8bc9ff" stroke="white" strokeWidth=".35" />
              {moveIndex === 0 && <text x={target.x + 2} y={target.y - 1} fill="white" fontSize="2.4" fontWeight="850">{action.order}</text>}
            </g>
          );
        })}
        {passRoutes.map((pass) => {
          const target = project(pass.to);
          return (
            <g key={pass.id} className="bwiq-route">
              <path d={sampledLine(pass.from, pass.to)} fill="none" stroke="white" strokeWidth=".82" />
              <circle cx={target.x} cy={target.y} r="1.35" fill="none" stroke="white" strokeWidth=".55" />
              <text x={target.x + 2} y={target.y - 1} fill="white" fontSize="2.4" fontWeight="850">{pass.order}</text>
            </g>
          );
        })}
        {drag && <path d={sampledLine(drag.start, drag.current)} fill="none" stroke="#d8efff" strokeWidth="1" strokeDasharray={drag.type === "player" ? ".01 2" : undefined} strokeLinecap="round" />}

        <g filter="url(#bwiq-shadow)">
          {renderedPlayers.map((player) => {
            const groupMove = drag?.type === "group" ? drag.moves.find((move) => move.playerId === player.id) : undefined;
            const logical = drag?.type === "player" && drag.id === player.id
              ? drag.current
              : drag?.type === "group" && groupMove
                ? clampPoint({
                    x: groupMove.from.x + drag.current.x - drag.start.x,
                    y: groupMove.from.y + drag.current.y - drag.start.y,
                  })
                : positions.get(player.id) ?? player;
            const selected = drag?.type === "player" && drag.id === player.id
              || drag?.type === "group" && Boolean(groupMove);
            const visible = project(logical);
            return (
              <PlayerFigure
                key={player.id}
                player={player}
                x={visible.x}
                y={visible.y}
                scale={scaleAt(logical)}
                orientation={orientation(player, logical)}
                selected={selected}
                planned={plannedPlayerIds.has(player.id)}
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
