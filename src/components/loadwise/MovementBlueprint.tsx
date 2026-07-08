import type { TrainingExercise } from "@/lib/loadwise/types";

/**
 * System blueprintów ruchu.
 *
 * Zamiast osobnej grafiki dla każdego ćwiczenia mamy ograniczony zbiór
 * minimalistycznych diagramów SVG (blueprintType), które przypisujemy do
 * wielu ćwiczeń na podstawie nazwy/typu. Diagram pokazuje sylwetkę + strzałkę
 * kierunku głównego ruchu.
 */
export type BlueprintType =
  | "squat"
  | "hinge"
  | "lunge"
  | "push"
  | "pull"
  | "sprint"
  | "jump"
  | "core"
  | "calf"
  | "run"
  | "mobility"
  | "ball"
  | "generic";

const LABELS: Record<BlueprintType, string> = {
  squat: "Przysiad — w dół i w górę",
  hinge: "Zawias biodrowy — biodra w tył",
  lunge: "Wykrok — krok w dół",
  push: "Pchanie — od klatki",
  pull: "Ciągnięcie — do ciała",
  sprint: "Sprint — napęd do przodu",
  jump: "Skok — eksplozja w górę",
  core: "Core — stabilna linia tułowia",
  calf: "Łydki — wspięcie na palce",
  run: "Bieg — rytm ciągły",
  mobility: "Mobilność — pełen zakres",
  ball: "Piłka — kontrola i akcja",
  generic: "Kontrolowany ruch",
};

/** Przypisuje blueprintType do ćwiczenia na podstawie nazwy i parametrów. */
export function blueprintFor(e: TrainingExercise): BlueprintType {
  const t = `${e.name} ${e.technique ?? ""}`.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));

  if (has("nordic", "rdl", "martwy", "hip thrust", "zawias", "hinge", "good morning", "hamstring bridge", "bridge", "mostek"))
    return "hinge";
  if (has("przysiad", "squat", "goblet", "box squat"))
    return "squat";
  if (has("wykrok", "lunge", "split", "step-up", "wejście", "bułgar"))
    return "lunge";
  if (has("wspięcia", "wspiecia", "łydk", "lydk", "calf", "palce"))
    return "calf";
  if (has("pompk", "wyciskan", "push", "press", "sztanga nad głow", "ohp", "dip"))
    return "push";
  if (has("wiosłowan", "wioslowan", "podciąg", "podciag", "pull", "row", "face pull", "ściąg", "sciag"))
    return "pull";
  if (has("sprint", "przyspiesz", "akcelerac", "start", "lotny", "bieg z"))
    return "sprint";
  if (has("skok", "jump", "plyo", "pogo", "bound", "wyskok", "podskok", "rzut"))
    return "jump";
  if (has("plank", "deska", "core", "brzuch", "dead bug", "pallof", "copenhagen", "kolarz", "hollow"))
    return "core";
  if (has("interwał", "interwal", "tempo", "trucht", "jog", "aerob", "bieg", "wahad"))
    return "run";
  if (has("mobiln", "mobility", "rozciąg", "rozciag", "stretch", "aktywacj", "rozgrzew"))
    return "mobility";
  if (has("piłk", "pilk", "podani", "przyjęci", "przyjeci", "drybling", "strzał", "strzal", "finish", "prowadzenie", "żongl", "zongl"))
    return "ball";
  return "generic";
}

const STROKE = "hsl(var(--foreground))";
const ACCENT = "hsl(var(--primary))";

function Body({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className="h-full w-full"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// Prosta figurka: głowa + tułów + kończyny w zależności od wzorca.
function Figure({ type }: { type: BlueprintType }) {
  const s = { stroke: STROKE, strokeWidth: 2.4, opacity: 0.85 };
  const acc = { stroke: ACCENT, strokeWidth: 3 };

  switch (type) {
    case "squat":
      return (
        <>
          <circle cx="60" cy="26" r="7" {...s} />
          <path d="M60 33 L60 62" {...s} />
          <path d="M60 62 L46 74 L46 92" {...s} />
          <path d="M60 62 L74 74 L74 92" {...s} />
          <path d="M60 42 L44 40 M60 42 L76 40" {...s} />
          <path d="M92 40 L92 78" {...acc} markerEnd="url(#ar)" />
          <path d="M92 78 L92 40" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "hinge":
      return (
        <>
          <circle cx="34" cy="34" r="7" {...s} />
          <path d="M40 38 L78 52" {...s} />
          <path d="M78 52 L78 92" {...s} />
          <path d="M62 46 L62 74" {...s} />
          <path d="M96 44 L96 84" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "lunge":
      return (
        <>
          <circle cx="58" cy="24" r="7" {...s} />
          <path d="M58 31 L58 60" {...s} />
          <path d="M58 60 L40 84 L40 96" {...s} />
          <path d="M58 60 L82 72 L82 96" {...s} />
          <path d="M60 40 L64 96" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "push":
      return (
        <>
          <circle cx="40" cy="60" r="7" {...s} />
          <path d="M46 60 L74 60" {...s} />
          <path d="M74 60 L74 44 M74 60 L74 76" {...s} />
          <path d="M50 66 L36 90 M50 54 L36 30" {...s} />
          <path d="M80 60 L104 60" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "pull":
      return (
        <>
          <circle cx="80" cy="60" r="7" {...s} />
          <path d="M74 60 L46 60" {...s} />
          <path d="M46 60 L46 44 M46 60 L46 76" {...s} />
          <path d="M70 54 L84 30 M70 66 L84 90" {...s} />
          <path d="M40 60 L16 60" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "sprint":
      return (
        <>
          <circle cx="42" cy="30" r="7" {...s} />
          <path d="M44 36 L60 58" {...s} />
          <path d="M60 58 L44 78 M60 58 L82 70" {...s} />
          <path d="M48 44 L30 52 M48 44 L70 40" {...s} />
          <path d="M20 92 L104 92" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "jump":
      return (
        <>
          <circle cx="60" cy="40" r="7" {...s} />
          <path d="M60 47 L60 72" {...s} />
          <path d="M60 72 L48 88 M60 72 L72 88" {...s} />
          <path d="M60 52 L44 44 M60 52 L76 44" {...s} />
          <path d="M60 30 L60 8" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "core":
      return (
        <>
          <circle cx="30" cy="54" r="7" {...s} />
          <path d="M36 56 L92 66" {...s} />
          <path d="M40 58 L36 78 M88 65 L86 84" {...s} />
          <path d="M20 92 L100 92" strokeDasharray="4 5" stroke={ACCENT} strokeWidth={2.4} />
        </>
      );
    case "calf":
      return (
        <>
          <circle cx="60" cy="30" r="7" {...s} />
          <path d="M60 37 L60 74" {...s} />
          <path d="M60 74 L52 90 M60 74 L68 90" {...s} />
          <path d="M92 82 L92 52" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "run":
      return (
        <>
          <circle cx="46" cy="32" r="7" {...s} />
          <path d="M48 38 L58 60" {...s} />
          <path d="M58 60 L46 82 M58 60 L74 76" {...s} />
          <path d="M52 46 L38 52 M52 46 L68 44" {...s} />
          <path d="M18 96 C34 88 44 96 60 92 S86 88 102 94" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "mobility":
      return (
        <>
          <circle cx="60" cy="30" r="7" {...s} />
          <path d="M60 37 L60 66" {...s} />
          <path d="M60 66 L48 90 M60 66 L72 90" {...s} />
          <path d="M38 50 C30 40 30 24 44 20" {...acc} markerEnd="url(#ar)" />
          <path d="M82 50 C90 40 90 24 76 20" {...acc} markerEnd="url(#ar)" />
        </>
      );
    case "ball":
      return (
        <>
          <circle cx="52" cy="28" r="7" {...s} />
          <path d="M52 35 L52 64" {...s} />
          <path d="M52 64 L42 86 M52 64 L64 82" {...s} />
          <path d="M52 44 L40 52 M52 44 L66 50" {...s} />
          <circle cx="86" cy="88" r="9" {...acc} />
          <path d="M66 78 L78 84" {...acc} markerEnd="url(#ar)" />
        </>
      );
    default:
      return (
        <>
          <circle cx="60" cy="30" r="7" {...s} />
          <path d="M60 37 L60 68" {...s} />
          <path d="M60 68 L50 90 M60 68 L70 90" {...s} />
          <path d="M60 46 L46 52 M60 46 L74 52" {...s} />
          <path d="M92 74 L92 44" {...acc} markerEnd="url(#ar)" />
        </>
      );
  }
}

export function MovementBlueprint({ type }: { type: BlueprintType }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
      <div className="mx-auto flex h-36 w-full max-w-[180px] items-center justify-center">
        <Body>
          <defs>
            <marker
              id="ar"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
            </marker>
          </defs>
          <Figure type={type} />
        </Body>
      </div>
      <div className="mt-1 text-center text-[11px] font-medium text-muted-foreground">
        {LABELS[type]}
      </div>
    </div>
  );
}
