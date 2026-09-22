import { Play, Redo2, RotateCcw, Undo2 } from "lucide-react";

import { toolDefinition, toolNeedsActor, type IQPlannerTool } from "@/lib/football-iq/planner";

type Props = {
  goalkeeper: boolean;
  tools: IQPlannerTool[];
  tool: IQPlannerTool;
  planLength: number;
  selectedActorLabel?: string;
  hasGoalkeeperPoint: boolean;
  actions: { id: string; label: string }[];
  selectedActionId: string | null;
  canPlay: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTool: (tool: IQPlannerTool) => void;
  onAction: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onPlay: () => void;
};

const iconBtn =
  "motion-press grid h-11 w-11 place-items-center rounded-full bg-secondary text-foreground disabled:opacity-30";

export function TacticalPlannerControls({
  goalkeeper,
  tools,
  tool,
  planLength,
  selectedActorLabel,
  hasGoalkeeperPoint,
  actions,
  selectedActionId,
  canPlay,
  canUndo,
  canRedo,
  onTool,
  onAction,
  onUndo,
  onRedo,
  onClear,
  onPlay,
}: Props) {
  const needsActor = !goalkeeper && toolNeedsActor(tool);
  const instruction = goalkeeper
    ? hasGoalkeeperPoint
      ? "Wybierz akcję i dotknij strefy ustawienia"
      : "Dotknij strefy ustawienia, potem wybierz akcję"
    : needsActor && !selectedActorLabel
      ? "Dotknij granatowego zawodnika. Rywali nie można przesuwać."
      : toolDefinition(tool).hint;

  return (
    <div className="motion-enter">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-foreground">
            {goalkeeper
              ? "Twoja decyzja"
              : selectedActorLabel
                ? `Wybrany: ${selectedActorLabel}`
                : "Wybierz zawodnika"}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{instruction}</p>
        </div>
        {!goalkeeper && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Cofnij ostatni ruch"
              className={iconBtn}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Przywróć cofnięty ruch"
              className={iconBtn}
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={!planLength}
              aria-label="Wyczyść plan"
              className={iconBtn}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {!goalkeeper && tools.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Narzędzie planu">
          {tools.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === tool}
              onClick={() => onTool(id)}
              className={
                "motion-press min-h-11 rounded-full border px-3.5 text-[12px] font-semibold transition-colors " +
                (id === tool
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/80 bg-card text-foreground")
              }
            >
              {toolDefinition(id).shortLabel}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        Wybierz akcję
      </p>
      <div className="mt-1.5 grid gap-1.5" role="radiogroup" aria-label="Akcja">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="radio"
            aria-checked={action.id === selectedActionId}
            onClick={() => onAction(action.id)}
            className={
              "motion-press min-h-11 rounded-xl border px-3 py-2 text-left text-[12px] font-medium leading-snug transition-colors " +
              (action.id === selectedActionId
                ? "border-foreground bg-secondary text-foreground"
                : "border-border/80 bg-card text-foreground")
            }
          >
            {action.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onPlay}
        disabled={!canPlay}
        className="motion-press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary p-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-35"
      >
        <Play className="h-4 w-4" /> Odtwórz decyzję
      </button>
    </div>
  );
}
