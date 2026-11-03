export type SketchKind = "pitch" | "track" | "play" | "strength" | "fuel" | "measure";

/** Architectural line work. Decorative: never a control, chart or measurement overlay. */
export function SurfaceSketch({ kind, className = "" }: { kind: SketchKind; className?: string }) {
  const field = kind === "pitch" || kind === "fuel";
  return (
    <svg
      className={`bw-surface-sketch ${className}`}
      data-sketch={kind}
      viewBox="0 0 160 160"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g
        vectorEffect="non-scaling-stroke"
        stroke="currentColor"
        strokeWidth=".8"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        {field && (
          <>
            {/* One quiet end of a 68 m pitch; markings retain their real proportions. */}
            <path d="M10 150V24h140v126M38.49 24v33.97h83.02V24M61.14 24v11.32h37.72V24" />
            <path d="M64.96 57.97a18.84 18.84 0 0 0 30.08 0M72.46 24v-5h15.08v5" />
            <circle cx="80" cy="46.65" r=".75" fill="currentColor" stroke="none" />
          </>
        )}
        {kind === "track" && (
          <>
            <path d="M25-12v82a85 85 0 0 0 85 85h62M37-12v82a73 73 0 0 0 73 73h62M49-12v82a61 61 0 0 0 61 61h62M61-12v82a49 49 0 0 0 49 49h62" />
            <path d="M17 31h52M17 43h52" />
          </>
        )}
        {kind === "play" && (
          <>
            <path d="M30 12h108v136H30M30 80h108M69 12v23h69" />
            <path d="M44 123l68-66M46 48l65 68" strokeDasharray="4 5" />
            <path d="M102 58l10-1-2 10M101 116h10v-10M41 123h6M44 120v6M109 48h6M112 45v6" />
          </>
        )}
        {kind === "strength" && (
          <g transform="rotate(-25 80 80)">
            <path d="M12 80h136M38 48v64M44 42v76M116 42v76M122 48v64M44 69h72M44 91h72M27 50h11v60H27zM122 50h11v60h-11z" />
            <path d="M12 34h136M12 29v10M148 29v10" strokeDasharray="3 4" />
          </g>
        )}
        {kind === "measure" && (
          <g transform="rotate(-25 80 80)">
            <path d="M18 43v74M142 43v74M18 80h124M27 75l-9 5 9 5M133 75l9 5-9 5M48 64v8M80 60v12M112 64v8" />
          </g>
        )}
      </g>
    </svg>
  );
}
