import type { TrainingExercise } from "@/lib/loadwise/types";
import { Activity } from "lucide-react";

/**
 * System blueprintów ruchu.
 *
 * Zamiast osobnej grafiki dla każdego ćwiczenia mamy registry
 * minimalistycznych inline SVG diagramów. Każdy diagram to sportowy
 * rysunek techniczny: cienkie linie sylwetki + niebieska strzałka kierunku
 * głównego ruchu. Jeśli dla danego blueprintType nie ma jeszcze SVG,
 * pokazujemy elegancki mały fallback (bez wielkiego pustego pola).
 */
export type BlueprintType =
  | "high_bar_squat"
  | "nordic_hamstring"
  | "hamstring_slider_curl"
  | "vertical_jump"
  | "bounds"
  | "sprint_acceleration"
  | "deceleration"
  | "pallof_press"
  | "dead_bug";

// Kolory pobierane z design tokens (oklch), nie hardkodowane.
const LINE = "var(--foreground)";
const ACCENT = "var(--primary)";

type BlueprintSpec = {
  title: string;
  directionLabel: string;
  Svg: () => JSX.Element;
};

function Canvas({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 200 130"
      fill="none"
      className="h-full w-full"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <marker
          id="mb-arrow"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5.5"
          markerHeight="5.5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

const body = { stroke: LINE, strokeWidth: 2.2, opacity: 0.55 } as const;
const bodyStrong = { stroke: LINE, strokeWidth: 2.4, opacity: 0.9 } as const;
const arrow = { stroke: ACCENT, strokeWidth: 3 } as const;

/** ------------------------- REGISTRY ------------------------- */

const high_bar_squat: BlueprintSpec = {
  title: "Przysiad — w dół i w górę",
  directionLabel: "Pion w dół i w górę",
  Svg: () => (
    <Canvas>
      {/* pozycja góra (jasna) */}
      <g {...body}>
        <circle cx="52" cy="30" r="7" />
        <path d="M52 37 L52 74" />
        <path d="M52 74 L42 100 M52 74 L62 100" />
        <path d="M36 44 L68 44" />
      </g>
      {/* pozycja dół (mocna) */}
      <g {...bodyStrong}>
        <circle cx="118" cy="46" r="7" />
        <path d="M118 53 L118 78" />
        <path d="M118 78 L104 92 L104 104 M118 78 L132 92 L132 104" />
        <path d="M102 60 L134 60" />
      </g>
      {/* strzałka pion */}
      <path d="M172 44 L172 100" {...arrow} markerEnd="url(#mb-arrow)" markerStart="url(#mb-arrow)" />
    </Canvas>
  ),
};

const nordic_hamstring: BlueprintSpec = {
  title: "Nordic — kontrolowany opad",
  directionLabel: "Opad tułowia w przód po łuku",
  Svg: () => (
    <Canvas>
      {/* klęk + stopy zablokowane */}
      <g {...bodyStrong}>
        <circle cx="70" cy="34" r="7" />
        <path d="M70 41 L92 78" />
        <path d="M92 78 L120 98" />
        {/* stopy zablokowane */}
        <path d="M112 100 L134 100" strokeWidth={3.4} />
        <path d="M120 98 L120 104" />
      </g>
      {/* łuk opadu w przód */}
      <path d="M70 34 C40 40 30 70 44 96" {...arrow} markerEnd="url(#mb-arrow)" fill="none" />
    </Canvas>
  ),
};

const hamstring_slider_curl: BlueprintSpec = {
  title: "Slider curl — pięty do bioder",
  directionLabel: "Pięty przesuwają się do bioder",
  Svg: () => (
    <Canvas>
      {/* leżenie na plecach, biodra wysoko */}
      <g {...bodyStrong}>
        <circle cx="40" cy="86" r="7" />
        <path d="M46 86 L84 86" />
        {/* biodra wysoko */}
        <path d="M84 86 L104 60" />
        <path d="M104 60 L128 92" />
        {/* stopy na sliderach */}
        <path d="M118 96 L140 96" strokeWidth={3.2} />
      </g>
      {/* strzałka pozioma pięty->biodra */}
      <path d="M150 100 L96 100" {...arrow} markerEnd="url(#mb-arrow)" />
    </Canvas>
  ),
};

const sprint_acceleration: BlueprintSpec = {
  title: "Akceleracja — mocne wypchnięcie",
  directionLabel: "Napęd do przodu",
  Svg: () => (
    <Canvas>
      {/* sylwetka mocno pochylona */}
      <g {...bodyStrong}>
        <circle cx="52" cy="34" r="7" />
        <path d="M56 40 L92 66" />
        {/* nogi napęd */}
        <path d="M92 66 L74 100 M92 66 L120 84" />
        {/* ramiona */}
        <path d="M66 50 L44 62 M66 50 L94 40" />
      </g>
      {/* podłoże + strzałka do przodu */}
      <path d="M30 108 L170 108" {...body} />
      <path d="M40 108 L168 108" {...arrow} markerEnd="url(#mb-arrow)" />
    </Canvas>
  ),
};

const bounds: BlueprintSpec = {
  title: "Bounds — długi rytmiczny skok",
  directionLabel: "Długi skok w przód",
  Svg: () => (
    <Canvas>
      {/* faza lotu */}
      <g {...bodyStrong}>
        <circle cx="96" cy="34" r="7" />
        <path d="M96 41 L96 66" />
        {/* jedna noga w przód, jedna w tył */}
        <path d="M96 66 L120 82 M96 66 L74 88" />
        <path d="M92 50 L70 44 M92 50 L118 42" />
      </g>
      {/* łuk lotu */}
      <path d="M34 104 C60 70 132 70 166 104" {...arrow} markerEnd="url(#mb-arrow)" fill="none" opacity={0.9} />
    </Canvas>
  ),
};

const deceleration: BlueprintSpec = {
  title: "Hamowanie — nisko i stabilnie",
  directionLabel: "Zatrzymanie, środek ciężkości nisko",
  Svg: () => (
    <Canvas>
      {/* sylwetka nisko, odchylona w tył */}
      <g {...bodyStrong}>
        <circle cx="104" cy="42" r="7" />
        <path d="M102 49 L88 74" />
        {/* szeroka baza nóg */}
        <path d="M88 74 L66 104 M88 74 L112 100" />
        <path d="M96 58 L118 50 M96 58 L74 66" />
      </g>
      {/* podłoże */}
      <path d="M34 110 L170 110" {...body} />
      {/* strzałka hamowania (w tył/w dół) */}
      <path d="M158 96 L128 96" {...arrow} markerEnd="url(#mb-arrow)" />
      <path d="M128 84 L128 104" stroke={ACCENT} strokeWidth={2.4} strokeDasharray="4 5" />
    </Canvas>
  ),
};

const blueprintRegistry: Record<BlueprintType, BlueprintSpec> = {
  high_bar_squat,
  nordic_hamstring,
  hamstring_slider_curl,
  sprint_acceleration,
  bounds,
  deceleration,
  // Bez własnego SVG jeszcze — użyją fallbacku.
  vertical_jump: undefined as unknown as BlueprintSpec,
  pallof_press: undefined as unknown as BlueprintSpec,
  dead_bug: undefined as unknown as BlueprintSpec,
};

/** Mapuje ćwiczenie na blueprintType na podstawie nazwy/techniki. */
export function blueprintFor(e: TrainingExercise): BlueprintType | null {
  const t = `${e.name} ${e.technique ?? ""}`.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));

  if (has("nordic")) return "nordic_hamstring";
  if (has("slider", "leg curl", "curl na sliderach", "nordic slider")) return "hamstring_slider_curl";
  if (has("high bar", "przysiad ze sztang", "back squat", "goblet", "przysiad")) return "high_bar_squat";
  if (has("bounds", "wieloskok", "skok naprzemienny")) return "bounds";
  if (has("cmj", "skok pionowy", "vertical jump", "wyskok")) return "vertical_jump";
  if (has("akcelerac", "sprint", "przyspiesz", "start", "wypchnięc")) return "sprint_acceleration";
  if (has("hamowan", "decel", "zatrzym")) return "deceleration";
  if (has("pallof")) return "pallof_press";
  if (has("dead bug", "martwy robak")) return "dead_bug";
  return null;
}

/** Elegancki fallback bez wielkiego pustego pola. */
function BlueprintFallback({ title }: { title?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Activity className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        {title && (
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
        )}
        <div className="text-xs text-muted-foreground">Diagram techniki w przygotowaniu</div>
      </div>
    </div>
  );
}

export function MovementBlueprint({
  blueprintType,
  title,
  directionLabel,
}: {
  blueprintType: BlueprintType | null;
  title?: string;
  directionLabel?: string;
}) {
  const spec = blueprintType ? blueprintRegistry[blueprintType] : undefined;

  if (!spec) {
    return <BlueprintFallback title={title} />;
  }

  const Svg = spec.Svg;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mx-auto flex h-[180px] w-full max-w-[280px] items-center justify-center">
        <Svg />
      </div>
      <div className="mt-1 flex flex-col items-center gap-0.5 text-center">
        <span className="text-sm font-medium text-foreground">{title ?? spec.title}</span>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary">
          {directionLabel ?? spec.directionLabel}
        </span>
      </div>
    </div>
  );
}
