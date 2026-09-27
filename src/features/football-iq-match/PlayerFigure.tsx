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
  const home = player.team === "home";
  const shirt = player.goalkeeper ? (home ? "#f17c36" : "#2a9663") : home ? "#0b2b4f" : "#f7fafc";
  const shorts = player.goalkeeper ? "#173956" : home ? "#f7fafc" : "#0b2b4f";
  const shirtDetail = home || player.goalkeeper ? "#ffffff" : "#0b2b4f";
  const skin = "#b97956";

  return (
    <g
      transform={`translate(${x} ${y})`}
      onPointerDown={onPointerDown}
      className="bwiq-player"
      role="button"
      aria-label={`${player.role}, numer ${player.number}${player.controlled ? ", kontrolowany zawodnik" : ""}`}
    >
      <circle r="7" fill="transparent" />
      {(selected || player.controlled || planned) && (
        <circle r={player.controlled ? 5.8 : 5.4} fill="rgba(115,185,255,.13)" stroke={selected ? "#73b9ff" : "#b9daf7"} strokeWidth="0.8" />
      )}
      <g transform={`rotate(${orientation})`} aria-hidden="true">
        <path d="M0-7.2 L-1-5.6 H1 Z" fill={selected || planned ? "#8bc9ff" : "rgba(255,255,255,.74)"} />
      </g>
      <g>
        <ellipse cx="0" cy="4.6" rx="3.2" ry="1.05" fill="#071a2f" opacity="0.18" />
        <path d="M-1.35-3.35 Q0-4.55 1.35-3.35 L1.05-2.7 H-1.05 Z" fill="#39281f" />
        <circle cx="0" cy="-3" r="1.35" fill={skin} />
        <path d="M-.55-1.9 H.55 L.75-1.25 H-.75 Z" fill={skin} />
        <path d="M-2.6-1.4 Q0-2.25 2.6-1.4 L2.05 1.45 Q0 2.05-2.05 1.45 Z" fill={shirt} stroke="rgba(7,26,47,.45)" strokeWidth=".24" />
        <path d="M-2.42-1.25 L-3.45.6" stroke={shirt} strokeWidth="1.05" strokeLinecap="round" />
        <path d="M2.42-1.25 L3.45.6" stroke={shirt} strokeWidth="1.05" strokeLinecap="round" />
        <circle cx="-3.62" cy=".85" r=".48" fill={skin} />
        <circle cx="3.62" cy=".85" r=".48" fill={skin} />
        {!home && !player.goalkeeper && <path d="M-.8-1.7 L.35 1.65" stroke="#4ca3e6" strokeWidth=".58" opacity=".9" />}
        <text y=".35" textAnchor="middle" fontSize="1.9" fontWeight="900" fill={shirtDetail}>{player.number}</text>
        <path d="M-2.05 1.35 Q0 1.85 2.05 1.35 L1.75 2.75 H.2 L0 2.2 L-.2 2.75 H-1.75 Z" fill={shorts} stroke="rgba(7,26,47,.45)" strokeWidth=".24" />
        <path d="M-1.25 2.65 L-1.42 4.15 M1.25 2.65 L1.42 4.15" stroke={skin} strokeWidth=".82" strokeLinecap="round" />
        <path d="M-1.43 3.55 L-1.52 4.35 M1.43 3.55 L1.52 4.35" stroke={home ? "#0b2b4f" : "#f7fafc"} strokeWidth=".9" />
        <path d="M-1.55 4.25 L-2.25 4.5 M1.55 4.25 L2.25 4.5" stroke="#12243a" strokeWidth=".68" strokeLinecap="round" />
      </g>
      {player.controlled && (
        <g transform="translate(0 8.2)">
          <rect x="-3.8" y="-1.8" width="7.6" height="3.5" rx="1.75" fill="#eaf5ff" stroke="#a8d2f7" strokeWidth="0.25" />
          <text y="0.75" textAnchor="middle" fontSize="2.1" fontWeight="900" fill="#0c6ed6">TY</text>
        </g>
      )}
    </g>
  );
}
