import { useCallback, useRef, useState } from "react";
import type { SimActorKind } from "@/lib/football-iq/simulation/types";

const W = 100;
const H = 140;

export type SimPitchActor = {
  id: string;
  kind: SimActorKind;
  label?: string;
  x: number;
  y: number;
};

export type SimPitchPath = {
  points: { x: number; y: number }[];
  variant: "user" | "alt";
};

type Props = {
  actors: SimPitchActor[];
  ghost?: { x: number; y: number; angleDeg: number } | null;
  interactive?: boolean;
  onGhostMove?: (x: number, y: number) => void;
  onAngleChange?: (deg: number) => void;
  paths?: SimPitchPath[];
  /** Podpowiedź dotyku w fazie obserwacji. */
  pulse?: boolean;
};

export function SimPitch({
  actors,
  ghost,
  interactive = false,
  onGhostMove,
  onAngleChange,
  paths,
  pulse,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<"none" | "move" | "rotate">("none");

  const toPoint = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const y = ((clientY - r.top) / r.height) * H;
    return {
      x: Math.max(4, Math.min(W - 4, x)),
      y: Math.max(4, Math.min(H - 4, y)),
    };
  }, []);

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!interactive || mode === "none" || !ghost) return;
    const p = toPoint(e.clientX, e.clientY);
    if (mode === "move") {
      onGhostMove?.(p.x, p.y);
    } else {
      const deg =
        (Math.atan2(p.x - ghost.x, ghost.y - p.y) * 180) / Math.PI;
      onAngleChange?.(Math.round(deg));
    }
  }

  const handle = ghost
    ? {
        x: ghost.x + Math.sin((ghost.angleDeg * Math.PI) / 180) * 14,
        y: ghost.y - Math.cos((ghost.angleDeg * Math.PI) / 180) * 14,
      }
    : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none select-none"
      onPointerMove={handleMove}
      onPointerUp={(e) => {
        setMode("none");
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => setMode("none")}
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

      {/* Półprzezroczysty znacznik zawodnika */}
      {ghost && (
        <g>
          <circle
            cx={ghost.x}
            cy={ghost.y}
            r="9"
            className="fill-primary/10 stroke-primary/40"
            strokeWidth="0.6"
            strokeDasharray="2 1.5"
          />
          <line
            x1={ghost.x}
            y1={ghost.y}
            x2={handle!.x}
            y2={handle!.y}
            className="stroke-primary"
            strokeWidth="1"
          />
          <circle
            cx={ghost.x}
            cy={ghost.y}
            r="4.4"
            className="fill-primary/60 stroke-background"
            strokeWidth="0.8"
          />
          {interactive && (
            <>
              <circle
                cx={ghost.x}
                cy={ghost.y}
                r="11"
                fill="transparent"
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                  setMode("move");
                }}
              />
              <circle
                cx={handle!.x}
                cy={handle!.y}
                r="3.4"
                className="fill-background stroke-primary"
                strokeWidth="1"
              />
              <circle
                cx={handle!.x}
                cy={handle!.y}
                r="8"
                fill="transparent"
                onPointerDown={(e) => {
                  e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                  setMode("rotate");
                }}
              />
            </>
          )}
        </g>
      )}

      {actors.map((a) => {
        if (a.kind === "ball") {
          return (
            <circle
              key={a.id}
              cx={a.x}
              cy={a.y}
              r="2.2"
              className="fill-foreground stroke-background"
              strokeWidth="0.6"
            />
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
              <circle
                cx={a.x}
                cy={a.y}
                r="8"
                className="fill-primary/15"
              />
            )}
            <circle
              cx={a.x}
              cy={a.y}
              r="4.4"
              className={`${cls} stroke-background`}
              strokeWidth="0.8"
            />
            <text
              x={a.x}
              y={a.y + 1.5}
              fontSize="4"
              textAnchor="middle"
              className={textCls}
              style={{ fontWeight: 700 }}
            >
              {a.kind === "self" ? "T" : a.kind === "mate" ? "P" : "R"}
            </text>
            {a.label && (
              <text
                x={a.x}
                y={a.y + 10}
                fontSize="3.4"
                textAnchor="middle"
                className="fill-foreground/60"
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
