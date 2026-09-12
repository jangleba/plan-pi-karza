import { useRef } from "react";
import type { SimPitchActor, SimPitchPath } from "./SimPitch";

/**
 * Renderer 2.5D: te same współrzędne boiskowe (100 x 140) rzutowane
 * na lekko perspektywiczną, jasną murawę. Bez WebGL i bez zależności.
 * Stary płaski renderer (SimPitch) pozostaje jako fallback.
 */

const PW = 100;
const PH = 140;

// Szeroki kadr taktyczny lepiej wykorzystuje ekran telefonu niż pionowy plan 1:1.
// Współrzędne scenariusza nadal opisują pełne boisko 100 × 140.
export const IQ_PITCH_VIEWBOX = { width: 126, height: 100 } as const;
const VW = IQ_PITCH_VIEWBOX.width;
const VH = IQ_PITCH_VIEWBOX.height;
const TOP = 5;
const BOT = 95;

/** Rzut punktu boiskowego na ekran. y = 0 to daleki koniec (kierunek ataku). */
export function projectPitchPoint(x: number, y: number) {
  const d = Math.min(1, Math.max(0, y / PH)); // 0 = daleko, 1 = blisko
  const depth = Math.pow(d, 1.22);
  const k = 0.6 + 0.56 * depth; // zwężenie perspektywiczne
  return {
    x: VW / 2 + (x - PW / 2) * k,
    y: TOP + (BOT - TOP) * depth,
    /** Skala głębi dla sylwetek. */
    s: 0.62 + 0.52 * depth,
  };
}

function poly(points: [number, number][]) {
  return points.map(([x, y]) => {
    const p = projectPitchPoint(x, y);
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(" ");
}

function ellipsePoly(cx: number, cy: number, r: number, steps = 40) {
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
}

function shortestDelta(from: number, to: number) {
  let d = ((to - from + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

type Props = {
  actors: SimPitchActor[];
  paths?: SimPitchPath[];
  pulse?: boolean;
  selectedActorId?: string;
  highlightedActorId?: string;
  onActorSelect?: (actorId: string) => void;
};

type FacingState = { x: number; y: number; deg: number };

export function SimPitch25D({
  actors,
  paths,
  pulse,
  selectedActorId,
  highlightedActorId,
  onActorSelect,
}: Props) {
  const facingRef = useRef<Map<string, FacingState>>(new Map());

  /** Kierunek sylwetki: z keyframe (facingDeg) lub z trajektorii, obrót najkrótszą drogą. */
  const facingOf = (a: SimPitchActor) => {
    const prev = facingRef.current.get(a.id);
    let target = prev?.deg ?? 0;
    if (typeof a.facingDeg === "number") {
      target = a.facingDeg;
    } else if (prev) {
      const dx = a.x - prev.x;
      const dy = a.y - prev.y;
      if (Math.hypot(dx, dy) > 0.05) target = (Math.atan2(dx, -dy) * 180) / Math.PI;
    }
    const base = prev?.deg ?? target;
    const deg = base + shortestDelta(base, target) * 0.28;
    facingRef.current.set(a.id, { x: a.x, y: a.y, deg });
    return deg;
  };

  const stripes = Array.from({ length: 7 }, (_, i) => i);
  const sorted = [...actors].sort((a, b) => a.y - b.y);

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none select-none rounded-[inherit]"
      role={onActorSelect ? "group" : "img"}
      aria-label={
        onActorSelect
          ? "Wybierz zawodnika na animowanym boisku taktycznym"
          : "Animowane boisko taktyczne: Ty, Twój zespół, rywale i piłka"
      }
    >
      <defs>
        <linearGradient id="sim25-surface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--pitch-grass-alt)" />
          <stop offset="1" stopColor="var(--pitch-grass)" />
        </linearGradient>
        <radialGradient id="sim25-focus" cx="50%" cy="54%" r="58%">
          <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.06" />
          <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
        </radialGradient>
        <marker id="sim25-arrow" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" className="fill-foreground" />
        </marker>
        <marker id="sim25-arrow-alt" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" className="fill-primary" />
        </marker>
        <marker id="sim25-arrow-reaction" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" className="fill-destructive" />
        </marker>
      </defs>

      <rect x="0" y="0" width={VW} height={VH} fill="url(#sim25-surface)" />

      {/* Murawa */}
      <polygon
        points={poly([
          [0, 0],
          [PW, 0],
          [PW, PH],
          [0, PH],
        ])}
        fill="url(#sim25-surface)"
      />
      {stripes.map((i) =>
        i % 2 === 0 ? null : (
          <polygon
            key={i}
            points={poly([
              [0, (PH / 7) * i],
              [PW, (PH / 7) * i],
              [PW, (PH / 7) * (i + 1)],
              [0, (PH / 7) * (i + 1)],
            ])}
            style={{ fill: "var(--pitch-grass-alt)" }}
          />
        ),
      )}
      <rect x="0" y="0" width={VW} height={VH} fill="url(#sim25-focus)" />

      {/* Linie */}
      <g fill="none" style={{ stroke: "var(--pitch-line)" }} strokeWidth="0.7">
        <polygon points={poly([[3, 3], [PW - 3, 3], [PW - 3, PH - 3], [3, PH - 3]])} />
        <polyline points={poly([[3, PH / 2], [PW - 3, PH / 2]])} />
        <polygon points={ellipsePoly(PW / 2, PH / 2, 12)} />
        <polygon points={poly([[24, 3], [76, 3], [76, 23], [24, 23]])} />
        <polygon points={poly([[24, PH - 23], [76, PH - 23], [76, PH - 3], [24, PH - 3]])} />
      </g>

      <g>
        <text
          x={projectPitchPoint(8, PH / 2 - 18).x}
          y={projectPitchPoint(8, PH / 2 - 18).y}
          fontSize="3.2"
          className="fill-foreground/40"
          style={{ letterSpacing: "0.12em" }}
        >
          ATAK
        </text>
      </g>

      {/* Trasy zagrań */}
      {paths?.map((p, i) => (
        <polyline
          key={i}
          points={p.points.map((pt) => {
            const q = projectPitchPoint(pt.x, pt.y);
            return `${q.x},${q.y}`;
          }).join(" ")}
          fill="none"
          className={
            p.variant === "alt"
              ? "stroke-primary"
              : p.variant === "reaction"
                ? "stroke-destructive"
                : "stroke-foreground"
          }
          strokeWidth={p.variant === "reaction" ? 1 : p.variant === "alt" ? 0.9 : 1.1}
          strokeLinecap="round"
          strokeDasharray={p.variant === "alt" ? "2.2 1.8" : undefined}
          markerEnd={`url(#${
            p.variant === "alt"
              ? "sim25-arrow-alt"
              : p.variant === "reaction"
                ? "sim25-arrow-reaction"
                : "sim25-arrow"
          })`}
        />
      ))}

      {/* Zawodnicy i piłka — kolejność wg głębi (dalsi najpierw) */}
      {sorted.map((a) => {
        const p = projectPitchPoint(a.x, a.y);
        if (a.kind === "ball") {
          const r = 1.7 * p.s;
          return (
            <g key={a.id}>
              <ellipse
                cx={p.x}
                cy={p.y + r * 0.9}
                rx={r * 1.1}
                ry={r * 0.42}
                style={{ fill: "var(--pitch-shadow)", opacity: 0.18 }}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                className="fill-background stroke-foreground"
                strokeWidth={0.7 * p.s}
              />
              <circle cx={p.x} cy={p.y} r={r * 0.42} className="fill-foreground" />
            </g>
          );
        }

        const f = (facingOf(a) * Math.PI) / 180;
        const s = p.s;
        const body =
          a.kind === "self"
            ? "fill-primary"
            : a.kind === "mate"
              ? "fill-graphite"
              : "fill-destructive/75";
        const open = Math.abs(Math.cos(f)); // 1 = barki na wprost, 0 = profil
        const sw = (1.05 + 0.95 * open) * s; // pół-szerokość barków
        const legDx = (0.55 + 0.5 * open) * s;
        const headDx = Math.sin(f) * 0.45 * s;
        const hipY = p.y - 5.1 * s;
        const shoY = p.y - 8.1 * s;
        const headY = p.y - 9.6 * s;
        const label = a.showLabel ? a.label : undefined;
        const labelWidth = label
          ? Math.min(28 * s, Math.max(10 * s, (label.length * 1.45 + 4) * s))
          : 0;
        const labelHeight = 4.8 * s;
        const labelY =
          a.kind === "opponent" ? headY - 6.2 * s : p.y + 2.3 * s;
        const selectable = Boolean(
          onActorSelect && a.kind !== "self",
        );
        const selected = a.id === selectedActorId;
        const highlighted = a.id === highlightedActorId;

        return (
          <g
            key={a.id}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            aria-label={
              selectable
                ? `Zaznacz: ${a.label ?? (a.kind === "opponent" ? "rywal" : "partner")}`
                : undefined
            }
            className={selectable ? "cursor-pointer outline-none" : undefined}
            onPointerDown={
              selectable
                ? (event) => {
                    event.stopPropagation();
                    onActorSelect?.(a.id);
                  }
                : undefined
            }
            onKeyDown={
              selectable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onActorSelect?.(a.id);
                    }
                  }
                : undefined
            }
          >
            {selectable && (
              <circle
                cx={p.x}
                cy={p.y - 4.8 * s}
                r={7.5 * s}
                className="fill-transparent"
              />
            )}
            {/* Cień kontaktowy */}
            <ellipse
              cx={p.x}
              cy={p.y + 0.5 * s}
              rx={2.5 * s}
              ry={0.85 * s}
              style={{ fill: "var(--pitch-shadow)", opacity: 0.16 }}
            />
            {a.kind === "self" && pulse && (
              <ellipse cx={p.x} cy={p.y} rx={6 * s} ry={2.2 * s} className="fill-primary/12" />
            )}
            {a.kind === "self" && (
              <ellipse
                cx={p.x}
                cy={p.y}
                rx={4.4 * s}
                ry={1.6 * s}
                fill="none"
                className="stroke-primary"
                strokeWidth={0.35 * s}
              />
            )}
            {selected && !highlighted && (
              <ellipse
                cx={p.x}
                cy={p.y - 4.8 * s}
                rx={5.2 * s}
                ry={7.2 * s}
                className="fill-primary/10 stroke-primary"
                strokeWidth={0.75 * s}
                strokeDasharray={`${1.8 * s} ${1.2 * s}`}
              />
            )}
            {highlighted && (
              <ellipse
                cx={p.x}
                cy={p.y - 4.8 * s}
                rx={5.5 * s}
                ry={7.5 * s}
                className="fill-destructive/10 stroke-destructive"
                strokeWidth={0.85 * s}
              />
            )}
            {/* Nogi */}
            <path
              d={`M ${p.x} ${hipY} L ${p.x - legDx} ${p.y} M ${p.x} ${hipY} L ${p.x + legDx} ${p.y}`}
              fill="none"
              className={body.replace("fill-", "stroke-")}
              strokeWidth={0.75 * s}
              strokeLinecap="round"
            />
            {/* Tułów */}
            <path
              d={`M ${p.x - sw * 0.55} ${hipY} L ${p.x - sw} ${shoY} L ${p.x + sw} ${shoY} L ${p.x + sw * 0.55} ${hipY} Z`}
              className={body}
            />
            {/* Linia barków */}
            <line
              x1={p.x - sw}
              y1={shoY}
              x2={p.x + sw}
              y2={shoY}
              className={body.replace("fill-", "stroke-")}
              strokeWidth={0.6 * s}
              strokeLinecap="round"
            />
            {/* Głowa */}
            <circle cx={p.x + headDx} cy={headY} r={1.05 * s} className={body} />
            {/* Kierunek ustawienia */}
            <line
              x1={p.x + headDx}
              y1={shoY - 0.6 * s}
              x2={p.x + headDx + Math.sin(f) * 1.9 * s}
              y2={shoY - 0.6 * s + Math.cos(f) * 0.9 * s}
              className={body.replace("fill-", "stroke-")}
              strokeWidth={0.45 * s}
              strokeLinecap="round"
              opacity={0.6}
            />
            {label && (
              <g>
                <rect
                  x={p.x - labelWidth / 2}
                  y={labelY}
                  width={labelWidth}
                  height={labelHeight}
                  rx={labelHeight / 2}
                  className="fill-background/90 stroke-border"
                  strokeWidth={0.35 * s}
                />
                <text
                  x={p.x}
                  y={labelY + 3.25 * s}
                  fontSize={2.35 * s}
                  textAnchor="middle"
                  className="fill-foreground/75"
                  style={{ fontWeight: 700 }}
                >
                  {label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
