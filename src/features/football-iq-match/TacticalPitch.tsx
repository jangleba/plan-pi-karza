import { useId, useMemo } from "react";
import type { MouseEvent } from "react";
import { positionAfterActions } from "./engine";
import type {
  ActionMode,
  MatchPlayer,
  PlannedAction,
  Point,
  Scenario,
} from "./types";

type Props = {
  scenario: Scenario;
  actions: PlannedAction[];
  selectedPlayerId: string;
  mode: ActionMode;
  interactive: boolean;
  playbackProgress?: number;
  onModeChange: (mode: ActionMode) => void;
  onPlayerSelect: (player: MatchPlayer) => void;
  onPitchSelect: (point: Point) => void;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: Point, to: Point, progress: number): Point => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress,
});

const frameAt = (
  scenario: Scenario,
  actions: PlannedAction[],
  progress: number,
) => {
  const positions = new Map(
    scenario.players.map((player) => [player.id, { x: player.x, y: player.y }]),
  );
  let ballCarrierId = scenario.ballCarrierId;
  let ball = positions.get(ballCarrierId) ?? { x: 50, y: 70 };
  const scaled = clamp(progress) * Math.max(1, actions.length);

  actions.forEach((action, index) => {
    const local = clamp(scaled - index);
    if (local <= 0) return;

    if (action.type === "pass") {
      ball = mix(action.from, action.to, local);
      if (local >= 1) ballCarrierId = action.targetId;
      return;
    }

    const point = mix(action.from, action.to, local);
    positions.set(action.playerId, point);
    if (ballCarrierId === action.playerId) ball = point;
  });

  if (progress >= 1) {
    const resolved = positionAfterActions(
      scenario.players,
      actions,
      scenario.ballCarrierId,
    );
    return resolved;
  }

  return { positions, ballCarrierId, ball };
};

const routePath = (from: Point, to: Point) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const curve = Math.min(7, Math.hypot(dx, dy) * 0.12);
  const control = {
    x: (from.x + to.x) / 2 + (dy > 0 ? -curve : curve),
    y: (from.y + to.y) / 2 + (dx > 0 ? curve : -curve),
  };
  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
};

function PlayerFigure({
  player,
  point,
  selected,
  onSelect,
}: {
  player: MatchPlayer;
  point: Point;
  selected: boolean;
  onSelect: () => void;
}) {
  const main = player.goalkeeper
    ? "#ef7f34"
    : player.team === "home"
      ? "#073b67"
      : "#f5f1e8";
  const trim = player.goalkeeper
    ? "#9b3f1b"
    : player.team === "home"
      ? "#53a9e8"
      : "#c8c3ba";
  const numberColor = player.team === "away" ? "#193a54" : "#ffffff";

  return (
    <g
      className={`bwiq-player${selected ? " is-selected" : ""}`}
      transform={`translate(${point.x} ${point.y})`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      role="button"
      aria-label={`Zawodnik ${player.number}, ${player.role}`}
    >
      <ellipse
        className="bwiq-player-shadow"
        cx="0"
        cy="3.5"
        rx="3.5"
        ry="1.4"
      />
      {selected && (
        <ellipse
          className="bwiq-selection-ring"
          cx="0"
          cy="2.2"
          rx="4.7"
          ry="3"
        />
      )}
      <rect x="-5" y="-7" width="10" height="14" fill="transparent" />
      <circle cx="0" cy="-3.1" r="1.35" fill="#d9a47f" />
      <path
        d="M-2.2-1.9 Q0-3 2.2-1.9 L1.55 1.9 Q0 2.7-1.55 1.9Z"
        fill={main}
        stroke={trim}
        strokeWidth=".38"
      />
      <path
        d="M-1.75-.9 L-3.55 1.2"
        stroke={main}
        strokeWidth="1.05"
        strokeLinecap="round"
      />
      <path
        d="M1.75-.9 L3.35 1.55"
        stroke={main}
        strokeWidth="1.05"
        strokeLinecap="round"
      />
      <path
        d="M-1.1 1.65 L-2.25 4.65"
        stroke={main}
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path
        d="M1.1 1.65 L2.45 4.5"
        stroke={main}
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <text
        x="0"
        y=".2"
        textAnchor="middle"
        fill={numberColor}
        fontSize="1.65"
        fontWeight="900"
      >
        {player.number}
      </text>
      {player.controlled && (
        <g className="bwiq-you-label" transform="translate(0 -8.2)">
          <rect x="-3.2" y="-2" width="6.4" height="3.1" rx=".8" />
          <text x="0" y=".25" textAnchor="middle">
            TY
          </text>
        </g>
      )}
    </g>
  );
}

export function TacticalPitch({
  scenario,
  actions,
  selectedPlayerId,
  mode,
  interactive,
  playbackProgress = 0,
  onModeChange,
  onPlayerSelect,
  onPitchSelect,
}: Props) {
  const markerId = useId().replace(/:/g, "");
  const frame = useMemo(
    () => frameAt(scenario, actions, interactive ? 1 : playbackProgress),
    [scenario, actions, interactive, playbackProgress],
  );

  const handlePitchClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onPitchSelect({
      x: Math.max(
        3,
        Math.min(97, ((event.clientX - bounds.left) / bounds.width) * 100),
      ),
      y: Math.max(
        8,
        Math.min(134, ((event.clientY - bounds.top) / bounds.height) * 140),
      ),
    });
  };

  return (
    <div className="bwiq-pitch-wrap">
      <svg
        className="bwiq-pitch"
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
        onClick={handlePitchClick}
        aria-label="Interaktywne boisko taktyczne"
      >
        <defs>
          <linearGradient id={`${markerId}-grass`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#397c43" />
            <stop offset="1" stopColor="#2f703d" />
          </linearGradient>
          <marker
            id={`${markerId}-blue-arrow`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10Z" fill="#43a8f2" />
          </marker>
          <marker
            id={`${markerId}-white-arrow`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10Z" fill="#ffffff" />
          </marker>
          <filter
            id={`${markerId}-shadow`}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feDropShadow
              dx="0"
              dy="1.2"
              stdDeviation="1.1"
              floodColor="#062d28"
              floodOpacity=".28"
            />
          </filter>
        </defs>

        <rect width="100" height="140" fill={`url(#${markerId}-grass)`} />
        {Array.from({ length: 10 }).map((_, index) => (
          <rect
            key={index}
            x={index * 10}
            width="10"
            height="140"
            fill={index % 2 ? "rgba(255,255,255,.025)" : "rgba(0,0,0,.025)"}
          />
        ))}

        <g className="bwiq-field-lines">
          <rect x="2.2" y="3" width="95.6" height="134" />
          <rect x="22" y="3" width="56" height="27" />
          <rect x="36" y="3" width="28" height="11" />
          <path d="M35 30 Q50 44 65 30" />
          <circle
            cx="50"
            cy="24"
            r=".7"
            fill="rgba(255,255,255,.85)"
            stroke="none"
          />
          <path d="M2.2 119 H97.8" />
          <path d="M39 137 Q50 124 61 137" />
          <path d="M42 3 V0 H58 V3" />
        </g>

        <g className="bwiq-routes">
          {actions.map((action, index) => (
            <g key={action.id}>
              <path
                d={routePath(action.from, action.to)}
                className={`bwiq-route bwiq-route--${action.type}`}
                markerEnd={`url(#${markerId}-${action.type === "pass" ? "white" : "blue"}-arrow)`}
              />
              <g
                transform={`translate(${action.from.x + 2} ${action.from.y - 2})`}
              >
                <circle className="bwiq-route-order" r="1.8" />
                <text
                  className="bwiq-route-order-text"
                  textAnchor="middle"
                  y=".65"
                >
                  {index + 1}
                </text>
              </g>
            </g>
          ))}
        </g>

        <g filter={`url(#${markerId}-shadow)`}>
          {scenario.players.map((player) => (
            <PlayerFigure
              key={player.id}
              player={player}
              point={frame.positions.get(player.id) ?? player}
              selected={interactive && player.id === selectedPlayerId}
              onSelect={() => interactive && onPlayerSelect(player)}
            />
          ))}
        </g>

        <g
          className="bwiq-ball"
          transform={`translate(${frame.ball.x} ${frame.ball.y})`}
        >
          <circle r="1.45" fill="white" stroke="#123650" strokeWidth=".34" />
          <path d="M0-.7 .65-.2 .4.6-.4.6-.65-.2Z" fill="#123650" />
        </g>
      </svg>

      {interactive && (
        <div
          className="bwiq-action-menu"
          role="group"
          aria-label="Rodzaj działania"
        >
          <button
            className={mode === "run" ? "active" : ""}
            type="button"
            onClick={() => onModeChange("run")}
          >
            <i>↗</i>
            <span>Bieg</span>
          </button>
          <button
            className={mode === "pass" ? "active" : ""}
            type="button"
            onClick={() => onModeChange("pass")}
          >
            <i>●</i>
            <span>Podanie</span>
          </button>
          <button
            className={mode === "shift" ? "active" : ""}
            type="button"
            onClick={() => onModeChange("shift")}
          >
            <i>↔</i>
            <span>Przesuń</span>
          </button>
        </div>
      )}
    </div>
  );
}
