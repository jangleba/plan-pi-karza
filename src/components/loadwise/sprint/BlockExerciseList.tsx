import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { SprintBlock } from "@/lib/loadwise/sprint/types";
import { ExerciseArt } from "./ExerciseArt";

interface BlockExerciseListProps {
  block: SprintBlock;
  onBack: () => void;
}

export function BlockExerciseList({ block, onBack }: BlockExerciseListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-background px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-foreground">
      <header className="mb-5">
        <button type="button" onClick={onBack} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-primary" aria-label="Wróć do planu">
          <ChevronLeft className="h-6 w-6" strokeWidth={1.8} />
        </button>
        <h1 className="mt-1 text-center text-xl font-bold tracking-[-0.02em]">{block.title}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{block.exercises.length} kroków · ~{block.estimatedMinutes} min</p>
      </header>

      <section className="border-t border-border/70">
        {block.exercises.map((exercise, index) => {
          const open = openId === exercise.id;
          return (
            <article key={exercise.id} className="border-b border-border/70">
              <button type="button" onClick={() => setOpenId(open ? null : exercise.id)} className="grid min-h-[102px] w-full grid-cols-[2rem_7rem_minmax(0,1fr)_1.25rem] items-center gap-2 py-3 text-left" aria-expanded={open}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-xs font-bold">{index + 1}</span>
                <ExerciseArt exercise={exercise} compact decorative />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold leading-snug">{exercise.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{exercise.prescription}</span>
                </span>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
              </button>
              {open && (
                <div className="mb-4 ml-9 border-l border-border pl-4 text-sm">
                  {exercise.intent && <p><span className="font-semibold text-primary">Intencja: </span>{exercise.intent}</p>}
                  {exercise.avoid && <p className="mt-2 text-muted-foreground"><span className="font-semibold text-foreground">Nie rób: </span>{exercise.avoid}</p>}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

