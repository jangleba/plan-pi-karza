import { Check, Play, Redo2, RotateCcw, Undo2 } from "lucide-react";

import {
  toolDefinition,
  toolNeedsActor,
  type IQPlannerTool,
} from "@/lib/football-iq/planner";

type Props = {
  goalkeeper: boolean;
  tools: IQPlannerTool[];
  tool: IQPlannerTool;
  planLength: number;
  maxPlanActions: number;
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
  "motion-press grid h-11 w-11 place-items-center rounded-full border border-border/70 bg-secondary/60 text-foreground transition-[transform,opacity,background-color] duration-200 active:scale-[0.97] disabled:opacity-30 motion-reduce:transition-none";

export function TacticalPlannerControls({
  goalkeeper,
  tools,
  tool,
  planLength,
  maxPlanActions,
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
  const canChooseSolution = goalkeeper ? hasGoalkeeperPoint : planLength > 0;
  const instruction = goalkeeper
    ? hasGoalkeeperPoint
      ? "Miejsce ustawione. Teraz wybierz reakcję."
      : "Dotknij na boisku miejsca swojego ustawienia."
    : needsActor && !selectedActorLabel
      ? "Najpierw dotknij swojego zawodnika na boisku."
      : planLength === 0
        ? "Zaznacz zawodnika, wybierz ruch i przeciągnij go na boisku."
        : planLength >= maxPlanActions
          ? "Wariant gotowy. Teraz określ intencję i uruchom akcję."
          : "Możesz dodać kolejny ruch albo uruchomić ten wariant.";

  return (
    <div className="motion-enter pb-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {goalkeeper
              ? "Twój wariant bramkarza"
              : selectedActorLabel
                ? `Twój wariant · ${selectedActorLabel}`
                : "Twój wariant · wybierz zawodnika"}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            {instruction}
          </p>
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
        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold text-muted-foreground">
              1. Zbuduj własny wariant
            </p>
            <span className="text-[11px] font-medium text-primary">
              {planLength}/{maxPlanActions}{" "}
              {planLength === 1 ? "ruch" : "ruchy"}
            </span>
          </div>
          <div
            className="iq-tool-strip -mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
            role="radiogroup"
            aria-label="Narzędzie planu"
          >
            {tools.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === tool}
                onClick={() => onTool(id)}
                className={
                  "motion-press min-h-11 shrink-0 rounded-full border px-3.5 text-[14px] font-medium transition-[transform,background-color,border-color,color] duration-200 active:scale-[0.98] motion-reduce:transition-none " +
                  (id === tool
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/80 bg-card text-foreground")
                }
              >
                {toolDefinition(id).shortLabel}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {toolDefinition(tool).hint}
          </p>
        </div>
      )}

      {canChooseSolution ? (
        <>
          <p className="mt-3 text-[12px] font-semibold text-muted-foreground">
            2. Określ intencję zagrania
          </p>
          <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Akcja">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="radio"
                aria-checked={action.id === selectedActionId}
                onClick={() => onAction(action.id)}
                className={
                  "motion-press flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14px] font-medium leading-snug transition-[transform,background-color,border-color] duration-200 active:scale-[0.99] motion-reduce:transition-none " +
                  (action.id === selectedActionId
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/80 bg-card text-foreground")
                }
              >
                <span>{action.label}</span>
                {action.id === selectedActionId && (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-secondary/35 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
          Rozwiązania pojawią się dopiero po narysowaniu Twojego pierwszego
          ruchu.
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 mt-2 bg-background/95 px-1 pb-1 pt-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={onPlay}
          disabled={!canPlay}
          className="motion-press flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary p-3.5 text-[14px] font-semibold text-primary-foreground shadow-sm transition-[transform,opacity] duration-200 active:scale-[0.99] disabled:opacity-35 motion-reduce:transition-none"
        >
          <Play className="h-4 w-4" /> Uruchom mój wariant
        </button>
      </div>
    </div>
  );
}
