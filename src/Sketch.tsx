import type { ReactNode } from "react";

export type SketchKind = "plan" | "lab" | "iq" | "fuel" | "progres";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Delikatne szkice liniowe (jeden kolor, cienka kreska). */
const DRAWINGS: Record<SketchKind, ReactNode> = {
  // piłka i dwa stożki
  plan: (
    <g {...P}>
      <circle cx="26" cy="30" r="14" />
      <path d="M26 22 l7 5 -3 8 h-8 l-3 -8 z" />
      <path d="M26 22 V16 M33 27 l6 -2 M30 35 l4 6 M22 35 l-4 6 M19 27 l-6 -2" />
      <path d="M44 56 l5 -14 5 14 z M42 56 h14" />
      <path d="M8 56 h26" strokeDasharray="1 3" />
    </g>
  ),
  // stoper i łuk skoku
  lab: (
    <g {...P}>
      <circle cx="32" cy="36" r="17" />
      <path d="M32 36 V25 M32 36 l7 5" />
      <path d="M28 14 h8 M32 14 v5" />
      <path d="M46 20 l3 -3" />
      <path d="M6 58 q10 -22 26 -8" strokeDasharray="1 3" />
    </g>
  ),
  // tablica taktyczna: boisko, zawodnicy, strzałka
  iq: (
    <g {...P}>
      <rect x="6" y="12" width="52" height="40" rx="2" />
      <path d="M32 12 v40" />
      <circle cx="32" cy="32" r="7" />
      <circle cx="18" cy="24" r="2.4" />
      <circle cx="44" cy="40" r="2.4" />
      <path d="M20 26 q12 14 22 12" strokeDasharray="2 2.5" />
      <path d="M38 36 l5 2 -3 4" />
    </g>
  ),
  // jabłko z listkiem i miska
  fuel: (
    <g {...P}>
      <path d="M32 24 c-8 -6 -18 2 -14 14 c3 9 9 14 14 12 c5 2 11 -3 14 -12 c4 -12 -6 -20 -14 -14 z" />
      <path d="M32 24 c0 -5 2 -8 6 -10" />
      <path d="M38 14 c4 0 6 2 7 5 c-4 1 -7 -1 -7 -5 z" />
      <path d="M8 58 h48" strokeDasharray="1 3" />
    </g>
  ),
  // wykres liniowy
  progres: (
    <g {...P}>
      <path d="M8 10 v44 h48" />
      <path d="M14 44 l10 -9 8 5 10 -14 10 -9" />
      <circle cx="52" cy="17" r="2.2" />
      <path d="M8 54 h48" strokeDasharray="1 3" />
    </g>
  ),
};

export function Sketch({ kind, className = "h-16 w-16" }: { kind: SketchKind; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0 text-muted/70`} aria-hidden="true">
      {DRAWINGS[kind]}
    </svg>
  );
}

/** Nagłówek zakładki: tytuł po lewej, mały szkic po prawej. */
export function PageHeader({ title, sub, kind }: { title: string; sub?: ReactNode; kind: SketchKind }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      <Sketch kind={kind} />
    </header>
  );
}

export function Empty({ kind, children }: { kind: SketchKind; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-hairline px-4 py-6 text-center">
      <Sketch kind={kind} className="mb-2 h-14 w-14" />
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

/** Ledwo widoczny wzór boiska za treścią. */
export function Backdrop() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-0 h-full w-full text-ink opacity-[0.03]"
      viewBox="0 0 400 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="30" y="60" width="340" height="680" rx="6" />
        <path d="M30 400 H370" />
        <circle cx="200" cy="400" r="62" />
        <rect x="110" y="60" width="180" height="96" />
        <rect x="110" y="644" width="180" height="96" />
        <path d="M158 156 a42 42 0 0 0 84 0" />
        <path d="M158 644 a42 42 0 0 1 84 0" />
      </g>
    </svg>
  );
}
