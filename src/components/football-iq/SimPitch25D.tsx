import { memo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { SimActorKind } from "@/lib/football-iq/simulation/types";
import type { SimPitchActor, SimPitchPath } from "./SimPitch";

/**
 * Lekki renderer taktyczny. Statyczne boisko jest memoizowane, a warstwa
 * zawodników używa prostych znaczników zamiast kosztownych sylwetek SVG.
 */

const PW = 100;
const PH = 140;

export const IQ_PITCH_VIEWBOX = { width: 126, height: 100 } as const;
const VW = IQ_PITCH_VIEWBOX.width;
const VH = IQ_PITCH_VIEWBOX.height;
const TOP = 5;
const BOT = 95;

export type PitchPoint = { x: number; y: number };

/** Rzut punktu boiskowego na ekran. y = 0 to kierunek ataku. */
export function projectPitchPoint(x: number, y: number) {
  const d = Math.min(1, Math.max(0, y / PH));
  const depth = Math.pow(d, 1.22);
  const k = 0.6 + 0.56 * depth;
  return {
    x: VW / 2 + (x - PW / 2) * k,
    y: TOP + (BOT - TOP) * depth,
    s: 0.62 + 0.52 * depth,
  };
}

/** Odwrócenie rzutu potrzebne do dotykania i przeciągania po boisku. */
export function unprojectPitchPoint(x: number, y: number): PitchPoint {
  const depth = Math.min(1, Math.max(0, (y - TOP) / (BOT - TOP)));
  const d = Math.pow(depth, 1 / 1.22);
  const k = 0.6 + 0.56 * depth;
  return {
    x: Math.min(95, Math.max(5, PW / 2 + (x - VW / 2) / k)),
    y: Math.min(134, Math.max(6, d * PH)),
  };
}

function poly(points: [number, number][]) {
  return points
    .map(([x, y]) => {
      const p = projectPitchPoint(x, y);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");
}

function ellipsePoly(cx: number, cy: number, r: number, steps = 40) {
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
}

const PITCH_OUTLINE = poly([
  [3, 3],
  [PW - 3, 3],
  [PW - 3, PH - 3],
  [3, PH - 3],
]);
const HALFWAY_LINE = poly([
  [3, PH / 2],
  [PW - 3, PH / 2],
]);
const CENTRE_CIRCLE = ellipsePoly(PW / 2, PH / 2, 12);
const TOP_BOX = poly([
  [24, 3],
  [76, 3],
  [76, 23],
  [24, 23],
]);
const BOTTOM_BOX = poly([
  [24, PH - 23],
  [76, PH - 23],
  [76, PH - 3],
  [24, PH - 3],
]);
const STRIPES = Array.from({ length: 7 }, (_, i) => i).filter((i) => i % 2 === 1);

const StaticPitch = memo(function StaticPitch() {
  return (
    <>
      <defs>
        <marker id="sim25-arrow" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" className="fill-foreground" />
        </marker>
        <marker
          id="sim25-arrow-primary"
          markerWidth="4"
          markerHeight="4"
          refX="2.4"
          refY="2"
          orient="auto"
        >
          <path d="M0,0 L4,2 L0,4 Z" className="fill-primary" />
        </marker>
        <marker
          id="sim25-arrow-reaction"
          markerWidth="4"
          markerHeight="4"
          refX="2.4"
          refY="2"
          orient="auto"
        >
          <path d="M0,0 L4,2 L0,4 Z" className="fill-destructive" />
        </marker>
      </defs>

      <rect x="0" y="0" width={VW} height={VH} className="fill-[var(--pitch-grass)]" />
      {STRIPES.map((i) => (
        <polygon
          key={i}
          points={poly([
            [0, (PH / 7) * i],
            [PW, (PH / 7) * i],
            [PW, (PH / 7) * (i + 1)],
            [0, (PH / 7) * (i + 1)],
          ])}
          className="fill-[var(--pitch-grass-alt)]"
        />
      ))}

      <g fill="none" className="stroke-[var(--pitch-line)]" strokeWidth="0.7">
        <polygon points={PITCH_OUTLINE} />
        <polyline points={HALFWAY_LINE} />
        <polygon points={CENTRE_CIRCLE} />
        <polygon points={TOP_BOX} />
        <polygon points={BOTTOM_BOX} />
      </g>

      <text
        x={projectPitchPoint(8, PH / 2 - 18).x}
        y={projectPitchPoint(8, PH / 2 - 18).y}
        fontSize="3.1"
        className="fill-foreground/35"
        style={{ letterSpacing: "0.12em" }}
      >
        ATAK
      </text>
    </>
  );
});

type Props = {
  actors: SimPitchActor[];
  paths?: SimPitchPath[];
  pulse?: boolean;
  selectedActorId?: string;
  highlightedActorId?: string;
  selectableActorKinds?: SimActorKind[];
  onActorSelect?: (actorId: string) => void;
  interactionEnabled?: boolean;
  interactionPoint?: PitchPoint;
  interactionVariant?: "intent" | "prediction";
  onInteractionPointChange?: (point: PitchPoint) => void;
};

function pathStyle(variant: SimPitchPath["variant"]) {
  if (variant === "alt") {
    return { className: "stroke-primary", marker: "sim25-arrow-primary", dash: "2.2 1.8" };
  }
  if (variant === "reaction") {
    return { className: "stroke-destructive", marker: "sim25-arrow-reaction", dash: undefined };
  }
  if (variant === "prediction") {
    return { className: "stroke-destructive/75", marker: "sim25-arrow-reaction", dash: "2.2 1.8" };
  }
  if (variant === "intent") {
    return { className: "stroke-primary", marker: "sim25-arrow-primary", dash: undefined };
  }
  return { className: "stroke-foreground", marker: "sim25-arrow", dash: undefined };
}

function clientPointToPitch(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / VW, rect.height / VH);
  const renderedWidth = VW * scale;
  const renderedHeight = VH * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;
  const svgX = (clientX - rect.left - offsetX) / scale;
  const svgY = (clientY - rect.top - offsetY) / scale;
  return unprojectPitchPoint(svgX, svgY);
}

export function SimPitch25D({
  actors,
  paths,
  pulse,
  selectedActorId,
  highlightedActorId,
  selectableActorKinds,
  onActorSelect,
  interactionEnabled,
  interactionPoint,
  interactionVariant = "intent",
  onInteractionPointChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const updateInteraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactionEnabled || !svgRef.current) return;
    onInteractionPointChange?.(clientPointToPitch(svgRef.current, event.clientX, event.clientY));
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      className={`h-full w-full touch-none select-none rounded-[inherit] ${
        interactionEnabled ? "cursor-crosshair" : ""
      }`}
      role={onActorSelect || interactionEnabled ? "group" : "img"}
      aria-label={
        interactionEnabled
          ? "Interaktywne boisko taktyczne. Przeciągnij punkt decyzji."
          : onActorSelect
            ? "Wybierz zawodnika na boisku taktycznym"
            : "Animowane boisko taktyczne"
      }
      onPointerDown={(event) => {
        if (!interactionEnabled) return;
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateInteraction(event);
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) updateInteraction(event);
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current) return;
        updateInteraction(event);
        draggingRef.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <StaticPitch />

      {paths?.map((path, index) => {
        const style = pathStyle(path.variant);
        const projected = path.points.map((point) => projectPitchPoint(point.x, point.y));
        const middle = projected[Math.floor(projected.length / 2)];
        return (
          <g key={`${path.variant}-${index}`}>
            <polyline
              points={projected.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              className={style.className}
              strokeWidth={path.variant === "reaction" ? 1 : 1.05}
              strokeLinecap="round"
              strokeDasharray={style.dash}
              markerEnd={`url(#${style.marker})`}
            />
            {path.label && middle && (
              <g>
                <rect
                  x={middle.x - 9}
                  y={middle.y - 5.4}
                  width="18"
                  height="4.6"
                  rx="2.3"
                  className="fill-card/90 stroke-border"
                  strokeWidth="0.25"
                />
                <text
                  x={middle.x}
                  y={middle.y - 2.2}
                  textAnchor="middle"
                  fontSize="2.1"
                  className="fill-foreground/75"
                  style={{ fontWeight: 700 }}
                >
                  {path.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {actors.map((actor) => {
        const p = projectPitchPoint(actor.x, actor.y);
        if (actor.kind === "ball") {
          const r = 1.6 * p.s;
          return (
            <g key={actor.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                className="fill-card stroke-foreground"
                strokeWidth={0.7 * p.s}
              />
              <circle cx={p.x} cy={p.y} r={r * 0.38} className="fill-foreground" />
            </g>
          );
        }

        const radius = (actor.kind === "self" ? 3.25 : 2.7) * p.s;
        const fill =
          actor.kind === "self"
            ? "fill-primary"
            : actor.kind === "mate"
              ? "fill-graphite"
              : "fill-destructive/75";
        const selectable = Boolean(
          onActorSelect &&
          actor.kind !== "self" &&
          (!selectableActorKinds || selectableActorKinds.includes(actor.kind)),
        );
        const selected = actor.id === selectedActorId;
        const highlighted = actor.id === highlightedActorId;
        const label = actor.showLabel ? actor.label : undefined;

        return (
          <g
            key={actor.id}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            aria-label={selectable ? `Zaznacz: ${actor.label ?? "rywal"}` : undefined}
            className={selectable ? "cursor-pointer outline-none" : undefined}
            onPointerDown={
              selectable
                ? (event) => {
                    event.stopPropagation();
                    onActorSelect?.(actor.id);
                  }
                : undefined
            }
            onKeyDown={
              selectable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onActorSelect?.(actor.id);
                    }
                  }
                : undefined
            }
          >
            {selectable && <circle cx={p.x} cy={p.y} r={7.2 * p.s} className="fill-transparent" />}
            <ellipse
              cx={p.x}
              cy={p.y + radius * 1.15}
              rx={radius * 0.95}
              ry={radius * 0.3}
              className="fill-[var(--pitch-shadow)] opacity-15"
            />
            {actor.kind === "self" && pulse && (
              <circle cx={p.x} cy={p.y} r={radius * 2} className="fill-primary/10" />
            )}
            {selected && !highlighted && (
              <circle
                cx={p.x}
                cy={p.y}
                r={radius * 1.75}
                className="fill-transparent stroke-destructive"
                strokeWidth="0.75"
              />
            )}
            {highlighted && (
              <circle
                cx={p.x}
                cy={p.y}
                r={radius * 1.8}
                className="fill-destructive/8 stroke-destructive"
                strokeWidth="0.8"
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={radius}
              className={`${fill} stroke-card`}
              strokeWidth="0.7"
            />
            {actor.kind === "self" && (
              <text
                x={p.x}
                y={p.y + 0.75 * p.s}
                textAnchor="middle"
                fontSize={2.05 * p.s}
                className="fill-primary-foreground"
                style={{ fontWeight: 800 }}
              >
                TY
              </text>
            )}
            {label && (
              <text
                x={p.x}
                y={p.y - radius - 2.1 * p.s}
                textAnchor="middle"
                fontSize={2.15 * p.s}
                className="fill-foreground/70"
                style={{ fontWeight: 700 }}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}

      {interactionPoint &&
        (() => {
          const point = projectPitchPoint(interactionPoint.x, interactionPoint.y);
          const prediction = interactionVariant === "prediction";
          return (
            <g pointerEvents="none">
              <circle
                cx={point.x}
                cy={point.y}
                r="4.6"
                className={
                  prediction
                    ? "fill-destructive/8 stroke-destructive"
                    : "fill-primary/8 stroke-primary"
                }
                strokeWidth="0.7"
                strokeDasharray="1.6 1.2"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="1.35"
                className={prediction ? "fill-destructive" : "fill-primary"}
              />
            </g>
          );
        })()}
    </svg>
  );
}
