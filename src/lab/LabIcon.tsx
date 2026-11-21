import type { LabTest } from "../engine";

/** Małe ikony liniowe testów (jeden kolor, cienka kreska); delikatny ruch tylko w ikonie. */
export function LabIcon({ test }: { test: LabTest["key"] }) {
  const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden="true">
      {test === "cmj" && (
        <g {...P}>
          <path d="M8 35 h24" opacity="0.5" />
          <g className="bw-lift">
            <circle cx="20" cy="9" r="3.2" />
            <path d="M20 13 v9 M20 16 l-5 3 M20 16 l5 3 M20 22 l-4 8 M20 22 l4 8" />
          </g>
        </g>
      )}
      {test === "broad-jump" && (
        <g {...P}>
          <path d="M6 33 h28" opacity="0.5" />
          <path d="M9 29 C 15 12, 25 12, 31 29" strokeDasharray="3 3" />
          <path d="M31 29 l-1 -5 m1 5 l-5 -1" />
          <circle cx="9" cy="29" r="1.6" fill="currentColor" stroke="none" />
        </g>
      )}
      {test === "sprint" && (
        <g {...P}>
          <path className="bw-draw" pathLength={100} d="M6 14 h14" />
          <path className="bw-draw" pathLength={100} d="M10 21 h18" style={{ animationDelay: "120ms" }} />
          <path className="bw-draw" pathLength={100} d="M6 28 h12" style={{ animationDelay: "240ms" }} />
          <path d="M26 12 l8 9 -8 9 z" />
        </g>
      )}
      {test === "yoyo-ir1" && (
        <g {...P}>
          <path d="M9 30 l3 -12 3 12 z" /><path d="M25 30 l3 -12 3 12 z" />
          <g className="bw-shuttle"><path d="M12 12 h16 m-4 -3.5 l4 3.5 -4 3.5" /></g>
        </g>
      )}
    </svg>
  );
}
