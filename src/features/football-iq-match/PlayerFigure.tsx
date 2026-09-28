import type { PointerEvent as ReactPointerEvent } from "react";
import awayPlayer from "./assets/player-away.png";
import goalkeeperPlayer from "./assets/player-goalkeeper.png";
import homePlayer from "./assets/player-home.png";
import type { MatchPlayer } from "./types";

type Props = {
  player: MatchPlayer;
  selected?: boolean;
  planned?: boolean;
  x: number;
  y: number;
  scale?: number;
  orientation?: number;
  onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void;
};

export function PlayerFigure({ player, selected, planned, x, y, scale = 1, orientation = 0, onPointerDown }: Props) {
  const home = player.team === "home";
  const ring = player.goalkeeper ? "#f3a15d" : home ? "#73b9ff" : "#ff8072";
  const sprite = player.goalkeeper ? goalkeeperPlayer : home ? homePlayer : awayPlayer;
  const facing = orientation >= 0 && orientation < 180 ? 1 : -1;
  const numberColor = home || player.goalkeeper ? "#ffffff" : "#0b2b4f";

  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      onPointerDown={onPointerDown}
      className="bwiq-player"
      role="button"
      aria-label={`${player.role}, numer ${player.number}${player.controlled ? ", kontrolowany zawodnik" : ""}`}
    >
      <circle r="8" fill="transparent" />
      <ellipse cx=".65" cy="3.65" rx="4.5" ry="1.5" fill="#061c20" opacity=".34" transform="rotate(-7 .65 3.65)" />
      <ellipse
        cx="0"
        cy="3.05"
        rx="4.75"
        ry="1.72"
        fill={selected || player.controlled ? "rgba(115,185,255,.2)" : "rgba(7,26,47,.18)"}
        stroke={selected ? "#ffffff" : ring}
        strokeWidth={selected || player.controlled ? "1.08" : ".8"}
        strokeDasharray="5.4 1.4"
      />
      <ellipse cx="0" cy="3.05" rx="3.55" ry="1.15" fill="none" stroke={ring} strokeWidth=".3" opacity=".85" />
      {(selected || planned) && <ellipse cx="0" cy="3.05" rx="5.35" ry="2.05" fill="none" stroke="#d9efff" strokeWidth=".38" opacity=".8" />}

      <g transform={`translate(0 2.65) scale(${facing} 1)`}>
        <image href={sprite} x="-4.5" y="-12" width="9" height="12.65" preserveAspectRatio="xMidYMax meet" />
      </g>
      <text x="0" y="-4.55" textAnchor="middle" fontSize="1.65" fontWeight="900" fill={numberColor} stroke="rgba(4,20,35,.35)" strokeWidth=".12" paintOrder="stroke">
        {player.number}
      </text>

      {player.controlled && (
        <g transform="translate(0 7.05)">
          <rect x="-3.8" y="-1.8" width="7.6" height="3.5" rx="1.75" fill="#eef8ff" stroke="#8fc9f8" strokeWidth=".3" />
          <text y=".75" textAnchor="middle" fontSize="2.1" fontWeight="900" fill="#0c6ed6">TY</text>
        </g>
      )}
    </g>
  );
}
