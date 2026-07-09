import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MovementBlueprint, blueprintFor } from "./MovementBlueprint";
import { ListChecks, AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";

function doseChip(e: TrainingExercise): string | null {
  if (e.sets && e.reps) return `${e.sets} × ${e.reps}`;
  if (e.reps) return e.reps;
  if (e.duration) return e.duration;
  if (e.sets) return `${e.sets} serie`;
  return null;
}

function rpeChip(e: TrainingExercise): string | null {
  if (e.rpe) return /rpe/i.test(e.rpe) ? e.rpe : `RPE ${e.rpe}`;
  const load = e.loadTarget ?? "";
  const m = load.match(/RPE\s*[\d.\-–]+/i);
  return m ? m[0] : null;
}

function restChip(e: TrainingExercise): string | null {
  const r = e.restAfterPair ?? e.restAfterExercise;
  if (!r) return null;
  return r.replace(/^przerwa:?\s*/i, "").trim();
}

// Technika → maksymalnie 3 krótkie cue'e. Rozbijamy technique/cue na zdania.
function techniqueCues(e: TrainingExercise): string[] {
  const source = e.technique || e.cue || "";
  if (!source) return [];
  return source
    .split(/(?<=[.!?])\s+|;|\n|•/)
    .map((s) => s.replace(/^[-–•\s]+/, "").replace(/[.]+$/, "").trim())
    .filter((s) => s.length > 2)
    .slice(0, 3);
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function ExerciseDetailSheet({
  exercise,
  open,
  onOpenChange,
}: {
  exercise: TrainingExercise | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!exercise) return null;
  const e = exercise;
  const dose = doseChip(e);
  const rpe = rpeChip(e);
  const rest = restChip(e);
  const cues = techniqueCues(e);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-md overflow-y-auto px-5 pb-8">
          <div className="pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              Szczegóły ćwiczenia
            </div>
            <DrawerTitle className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
              {e.label && (
                <span className="inline-flex h-6 min-w-[26px] items-center justify-center rounded-md bg-primary/10 px-1.5 text-[11px] font-bold text-primary">
                  {e.label}
                </span>
              )}
              {e.name}
            </DrawerTitle>

            {/* Chipy: dawka / RPE / przerwa */}
            {(dose || rpe || rest) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {dose && (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold tabular-nums text-foreground shadow-sm">
                    {dose}
                  </span>
                )}
                {rpe && (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-sm">
                    {rpe}
                  </span>
                )}
                {rest && (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                    ⏱ {rest}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Movement Blueprint */}
          <div className="mt-5">
            <MovementBlueprint blueprintType={blueprintFor(e)} />
          </div>

          <div className="mt-2 divide-y divide-border/50">
            {cues.length > 0 && (
              <Section
                icon={<ListChecks className="h-3.5 w-3.5" />}
                title="Technika"
              >
                <ul className="space-y-1.5">
                  {cues.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {e.commonMistake && (
              <Section
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                title="Najczęstszy błąd"
              >
                <p className="text-sm text-muted-foreground">{e.commonMistake}</p>
              </Section>
            )}

            {e.regression && (
              <Section
                icon={<ArrowDownRight className="h-3.5 w-3.5" />}
                title="Łatwiejsza wersja"
              >
                <p className="text-sm text-muted-foreground">{e.regression}</p>
              </Section>
            )}

            {e.progression && (
              <Section
                icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                title="Trudniejsza wersja"
              >
                <p className="text-sm text-muted-foreground">{e.progression}</p>
              </Section>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
