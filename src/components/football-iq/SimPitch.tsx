import { useRef } from "react";
import type { SimActorKind } from "@/lib/football-iq/simulation/types";

const W = 100;
const H = 140;

export type SimPitchActor = {
  id: string;
  kind: SimActorKind;
  label?: string;
  /** Podpis widoczny tylko dla sterowanego, posiadacza piłki i kluczowego rywala. */
  showLabel?: boolean;
  x: number;
  y: number;
};

export type SimPitchPath = {
  points: { x: number; y: number }[];
  variant: "user" | "alt";
};

type Props = {
  actors: SimPitchActor[];
  paths?: SimPitchPath[];
  /** Podpowiedź dotyku w fazie obserwacji. */
  pulse?: boolean;
};

export function SimPitch({ actors, paths, pulse }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none select-none"
    >
      <rect x="0" y="0" width={W} height={H} rx="4" className="fill-secondary" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x="0"
          y={(H / 6) * i}
          width={W}
          height={H / 12}
          className="fill-foreground/[0.03]"
        />
      ))}
      <g className="stroke-foreground/25" strokeWidth="0.6" fill="none">
        <rect x="3" y="3" width={W - 6} height={H - 6} rx="2" />
        <line x1="3" y1={H / 2} x2={W - 3} y2={H / 2} />
        <circle cx={W / 2} cy={H / 2} r="12" />
        <rect x="24" y="3" width="52" height="20" />
        <rect x="24" y={H - 23} width="52" height="20" />
      </g>
      <g>
        <text
          x="6"
          y={H / 2 - 16}
          fontSize="4"
          className="fill-foreground/45"
          style={{ letterSpacing: "0.12em" }}
        >
          ATAK
        </text>
        <path d="M7 62 L9.6 68 L4.4 68 Z" className="fill-foreground/45" />
      </g>

      <defs>
        <marker
          id="sim-arrow"
          markerWidth="4"
          markerHeight="4"
          refX="2.4"
          refY="2"
          orient="auto"
        >
          <path d="M0,0 L4,2 L0,4 Z" className="fill-foreground" />
        </marker>
        <marker
          id="sim-arrow-alt"
          markerWidth="4"
          markerHeight="4"
          refX="2.4"
          refY="2"
          orient="auto"
        >
          <path d="M0,0 L4,2 L0,4 Z" className="fill-primary" />
        </marker>
      </defs>

      {paths?.map((p, i) => (
        <polyline
          key={i}
          points={p.points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
          fill="none"
          className={p.variant === "alt" ? "stroke-primary" : "stroke-foreground"}
          strokeWidth={p.variant === "alt" ? 1.1 : 1.4}
          strokeLinecap="round"
          strokeDasharray={p.variant === "alt" ? "2.5 2" : undefined}
          markerEnd={`url(#${p.variant === "alt" ? "sim-arrow-alt" : "sim-arrow"})`}
        />
      ))}

      {actors.map((a) => {
        if (a.kind === "ball") {
          return (
            <g key={a.id}>
              {/* Piłka: +25% i kontrastowy obrys */}
              <circle
                cx={a.x}
                cy={a.y}
                r="1.9"
                className="fill-background stroke-foreground"
                strokeWidth="1.1"
              />
              <circle cx={a.x} cy={a.y} r="1.05" className="fill-foreground" />
            </g>
          );
        }
        const cls =
          a.kind === "self"
            ? "fill-primary"
            : a.kind === "mate"
              ? "fill-accent"
              : "fill-destructive/85";
        const textCls =
          a.kind === "self"
            ? "fill-primary-foreground"
            : a.kind === "mate"
              ? "fill-accent-foreground"
              : "fill-background";
        return (
          <g key={a.id}>
            {a.kind === "self" && pulse && (
              <circle cx={a.x} cy={a.y} r="6" className="fill-primary/15" />
            )}
            {a.kind === "self" && (
              // Cienki niebieski pierścień sterowanego zawodnika
              <circle
                cx={a.x}
                cy={a.y}
                r="5"
                fill="none"
                className="stroke-primary"
                strokeWidth="0.4"
              />
            )}
            <circle
              cx={a.x}
              cy={a.y}
              r="2.9"
              className={`${cls} stroke-background`}
              strokeWidth="0.8"
            />
            <text
              x={a.x}
              y={a.y + 1}
              fontSize="2.6"
              textAnchor="middle"
              className={textCls}
              style={{ fontWeight: 700 }}
            >
              {a.kind === "self" ? "T" : a.kind === "mate" ? "P" : "R"}
            </text>
            {a.showLabel && a.label && (
              <text
                x={a.x}
                y={a.y + 8.4}
                fontSize="2.8"
                textAnchor="middle"
                className="fill-foreground/70"
                style={{ fontWeight: 600 }}
              >
                {a.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
