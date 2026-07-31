import { useCallback, useRef, useState } from "react";
import type { IQDecision, IQScenario, IQTarget } from "@/lib/football-iq/types";

const W = 100;
const H = 140;

type Props = {
  scenario: IQScenario;
  decision: IQDecision | null;
  onDecision: (d: IQDecision | null) => void;
  /** Po ocenie boisko jest zablokowane i pokazuje najlepsze rozwiązanie. */
  locked?: boolean;
  best?: IQTarget;
};

function useSvgPoint(ref: React.RefObject<SVGSVGElement | null>) {
  return useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      const y = ((clientY - r.top) / r.height) * H;
      return {
        x: Math.max(2, Math.min(W - 2, x)),
        y: Math.max(2, Math.min(H - 2, y)),
      };
    },
    [ref],
  );
}

export function PitchView({
  scenario,
  decision,
  onDecision,
  locked = false,
  best,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const toPoint = useSvgPoint(svgRef);
  const [dragging, setDragging] = useState(false);

  const self = scenario.markers.find((m) => m.kind === "self");
  const tapMode =
    scenario.interaction === "pass" || scenario.interaction === "press";

  const selectableIds = new Set(scenario.targets.map((t) => t.id));

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    if (locked || tapMode) return;
    const p = toPoint(e.clientX, e.clientY);
    onDecision({ x: p.x, y: p.y });
  }

  function selectMarker(id: string, x: number, y: number) {
    if (locked || !tapMode) return;
    if (!selectableIds.has(id)) {
      onDecision({ x, y });
      return;
    }
    onDecision({ x, y, targetId: id });
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full touch-none select-none rounded-2xl"
      style={{ aspectRatio: `${W} / ${H}` }}
      onPointerDown={(e) => {
        if (tapMode || locked) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        handlePointer(e);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        handlePointer(e);
      }}
      onPointerUp={(e) => {
        setDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => setDragging(false)}
    >
      {/* Murawa */}
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

      {/* Kierunek ataku */}
      <g className="fill-foreground/45">
        <text
          x="6"
          y={H / 2 - 16}
          fontSize="4"
          className="fill-foreground/50"
          style={{ letterSpacing: "0.12em" }}
        >
          ATAK
        </text>
        <path d="M7 62 L9.6 68 L4.4 68 Z" />
      </g>

      {/* Najlepsze rozwiązanie po ocenie */}
      {locked && best && (
        <g>
          <circle
            cx={best.x}
            cy={best.y}
            r={(best.radius ?? 12) * 0.7}
            className="fill-primary/15 stroke-primary"
            strokeWidth="0.8"
            strokeDasharray="2 1.5"
          />
          {self && scenario.interaction !== "zone" && (
            <line
              x1={self.x}
              y1={self.y}
              x2={best.x}
              y2={best.y}
              className="stroke-primary"
              strokeWidth="1"
              strokeDasharray="2.5 2"
            />
          )}
        </g>
      )}

      {/* Decyzja zawodnika */}
      {decision && scenario.interaction === "move" && self && (
        <g>
          <defs>
            <marker
              id="iq-arrow"
              markerWidth="4"
              markerHeight="4"
              refX="2.4"
              refY="2"
              orient="auto"
            >
              <path d="M0,0 L4,2 L0,4 Z" className="fill-foreground" />
            </marker>
          </defs>
          <line
            x1={self.x}
            y1={self.y}
            x2={decision.x}
            y2={decision.y}
            className="stroke-foreground"
            strokeWidth="1.4"
            strokeLinecap="round"
            markerEnd="url(#iq-arrow)"
          />
        </g>
      )}
      {decision && scenario.interaction === "zone" && (
        <circle
          cx={decision.x}
          cy={decision.y}
          r="7"
          className="fill-foreground/15 stroke-foreground"
          strokeWidth="1"
        />
      )}

      {/* Znaczniki */}
      {scenario.markers.map((mk) => {
        if (mk.kind === "ball") {
          return (
            <circle
              key={mk.id}
              cx={mk.x}
              cy={mk.y}
              r="2.2"
              className="fill-foreground stroke-background"
              strokeWidth="0.6"
            />
          );
        }
        const selected = decision?.targetId === mk.id;
        const isSelf = mk.kind === "self";
        const cls = isSelf
          ? "fill-primary"
          : mk.kind === "mate"
            ? "fill-accent"
            : "fill-destructive/85";
        const textCls = isSelf
          ? "fill-primary-foreground"
          : mk.kind === "mate"
            ? "fill-accent-foreground"
            : "fill-background";
        const tappable =
          tapMode &&
          !locked &&
          ((scenario.interaction === "pass" && mk.kind === "mate") ||
            (scenario.interaction === "press" && mk.kind === "opponent"));
        return (
          <g
            key={mk.id}
            onPointerDown={
              tappable ? () => selectMarker(mk.id, mk.x, mk.y) : undefined
            }
            style={{ cursor: tappable ? "pointer" : "default" }}
          >
            {tappable && (
              <circle cx={mk.x} cy={mk.y} r="11" fill="transparent" />
            )}
            {selected && (
              <circle
                cx={mk.x}
                cy={mk.y}
                r="7.5"
                className="fill-none stroke-foreground"
                strokeWidth="1.2"
              />
            )}
            <circle
              cx={mk.x}
              cy={mk.y}
              r="4.4"
              className={`${cls} stroke-background`}
              strokeWidth="0.8"
            />
            <text
              x={mk.x}
              y={mk.y + 1.5}
              fontSize="4"
              textAnchor="middle"
              className={textCls}
              style={{ fontWeight: 700 }}
            >
              {isSelf ? "T" : mk.kind === "mate" ? "P" : "R"}
            </text>
            {mk.label && (
              <text
                x={mk.x}
                y={mk.y + 10}
                fontSize="3.4"
                textAnchor="middle"
                className="fill-foreground/60"
              >
                {mk.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
