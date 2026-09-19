import { Play, Redo2, RotateCcw, Undo2 } from "lucide-react";

import {
  PLANNER_CATEGORIES,
  PLANNER_TOOLS,
  toolDefinition,
  toolNeedsActor,
  type IQPlanAction,
  type IQPlannerCategory,
  type IQPlannerTool,
} from "@/lib/football-iq/planner";

type Props = {
  category: IQPlannerCategory;
  tool: IQPlannerTool;
  plan: IQPlanAction[];
  selectedActorLabel?: string;
  canUndo: boolean;
  canRedo: boolean;
  onCategory: (category: IQPlannerCategory) => void;
  onTool: (tool: IQPlannerTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onPlay: () => void;
};

export function TacticalPlannerControls({
  category,
  tool,
  plan,
  selectedActorLabel,
  canUndo,
  canRedo,
  onCategory,
  onTool,
  onUndo,
  onRedo,
  onClear,
  onPlay,
}: Props) {
  const tools = PLANNER_TOOLS.filter((item) => item.category === category);
  const definition = toolDefinition(tool);
  const selectedPlayers = new Set(plan.map((action) => action.actorId).filter(Boolean)).size;
  const needsActor = toolNeedsActor(tool);

  return (
    <div className="motion-enter">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-foreground">
            {selectedActorLabel
              ? `Wybrany: ${selectedActorLabel}`
              : needsActor
                ? "Wybierz swojego zawodnika"
                : "Wskaż miejsce na boisku"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {plan.length
              ? `${plan.length} ${plan.length === 1 ? "akcja" : "akcje"} · ${selectedPlayers} ${selectedPlayers === 1 ? "zawodnik" : "zawodników"}`
              : "Zbuduj rozwiązanie bez gotowej podpowiedzi"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Cofnij ostatnią akcję"
            className="motion-press grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Przywróć cofniętą akcję"
            className="motion-press grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!plan.length}
            aria-label="Wyczyść plan"
            className="motion-press grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground disabled:opacity-30"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-1 rounded-xl bg-secondary/70 p-1">
        {PLANNER_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onCategory(item.id)}
            className={
              "min-w-0 flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors " +
              (item.id === category ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="-mx-5 mt-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5">
          {tools.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTool(item.id)}
              className={
                "motion-press rounded-full border px-3 py-2 text-[11px] font-semibold transition-colors " +
                (item.id === tool
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/80 bg-card text-foreground")
              }
            >
              {item.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 min-h-8 text-[11px] leading-snug text-muted-foreground">
        {needsActor && !selectedActorLabel
          ? "Najpierw dotknij granatowego zawodnika. Rywali nie można przesuwać."
          : definition.hint}
      </p>

      <button
        type="button"
        onClick={onPlay}
        disabled={!plan.length}
        className="motion-press mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary p-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-35"
      >
        <Play className="h-4 w-4" /> Odtwórz plan
      </button>
    </div>
  );
}
