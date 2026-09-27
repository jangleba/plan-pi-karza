import type { PointerEvent as ReactPointerEvent } from "react";
import type { MatchPlayer } from "./types";

type Props = {
  player: MatchPlayer;
  selected?: boolean;
  planned?: boolean;
  x: number;
  y: number;
  orientation?: number;
  onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void;
};

export function PlayerFigure({ player, selected, planned, x, y, orientation = 0, onPointerDown }: Props) {
  const dark = player.team === "away";
  const shirt = player.goalkeeper ? (dark ? "#1d8a56" : "#f07b35") : dark ? "#102d52" : "#f8fafc";
  const detail = dark ? "#e8eef5" : "#102d52";

  return (
    <g
      transform={`translate(${x} ${y}) rotate(${orientation})`}
      onPointerDown={onPointerDown}
      className="bwiq-player"
      role="button"
      aria-label={`${player.role}, numer ${player.number}${player.controlled ? ", kontrolowany zawodnik" : ""}`}
    >
      <circle r="5.6" fill="transparent" />
      {(selected || player.controlled || planned) && (
        <circle r={player.controlled ? 4.6 : 4.2} fill="none" stroke={selected ? "#73b9ff" : "#b9daf7"} strokeWidth="0.8" />
      )}
      <ellipse cx="0" cy="1.9" rx="2.5" ry="1.2" fill="#071a2f" opacity="0.16" />
      <circle cx="0" cy="-2.6" r="1.05" fill="#b87955" />
      <path d="M-1.9-1.5 L1.9-1.5 L1.45 1.2 L-1.45 1.2 Z" fill={shirt} stroke={detail} strokeWidth="0.28" />
      <path d="M-1.45 1.1 L-.35 1.1 L-.45 3.3 L-1.45 3.3 Z M.35 1.1 L1.45 1.1 L1.45 3.3 L.45 3.3 Z" fill={detail} />
      <path d="M-1.8-.8 L-3 .5 M1.8-.8 L3 .5" stroke="#b87955" strokeWidth="0.65" strokeLinecap="round" />
      <text y="0.2" textAnchor="middle" fontSize="1.65" fontWeight="800" fill={detail}>{player.number}</text>
      {player.controlled && (
        <g transform={`rotate(${-orientation}) translate(0 7.4)`}>
          <rect x="-3.6" y="-1.8" width="7.2" height="3.5" rx="1.75" fill="#eaf5ff" stroke="#a8d2f7" strokeWidth="0.25" />
          <text y="0.75" textAnchor="middle" fontSize="2.1" fontWeight="850" fill="#0c6ed6">TY</text>
        </g>
      )}
    </g>
  );
}
