import { BookOpen, Check, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { SprintBlock, SprintExercise } from "@/lib/loadwise/sprint/types";
import { ExerciseArt } from "./ExerciseArt";

interface ActiveExerciseScreenProps {
  block: SprintBlock;
  blockIndex: number;
  blockCount: number;
  exercise: SprintExercise;
  exerciseIndex: number;
  setIndex: number;
  nextExercise: SprintExercise | null;
  onDone: () => void;
  onExitToPlan: () => void;
}

export function ActiveExerciseScreen({ block, blockIndex, blockCount, exercise, exerciseIndex, setIndex, nextExercise, onDone, onExitToPlan }: ActiveExerciseScreenProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sets = Math.max(1, exercise.sets ?? 1);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-foreground">
      <header>
        <div className="flex min-h-11 items-center justify-between text-sm font-semibold">
          <button type="button" onClick={onExitToPlan} className="text-primary">Plan</button>
          <span>{blockIndex + 1} z {blockCount} · {block.title}</span>
          <button type="button" className="grid h-10 w-10 place-items-center text-primary" aria-label="Więcej opcji"><MoreHorizontal /></button>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: blockCount }).map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= blockIndex ? "bg-primary" : "bg-secondary"}`} />)}
        </div>
      </header>

      <section className="mt-6">
        <p className="text-sm font-medium text-muted-foreground">Krok {exerciseIndex + 1} z {block.exercises.length}{sets > 1 ? ` · Seria ${setIndex + 1}/${sets}` : ""}</p>
        <h1 className="mt-2 text-[30px] font-bold leading-[1.05] tracking-[-0.035em]">{exercise.title}</h1>
        <p className="mt-2 text-base font-medium text-muted-foreground">{exercise.prescription}</p>
      </section>

      <div className="mt-5 flex min-h-[220px] items-center justify-center">
        <ExerciseArt exercise={exercise} />
      </div>

      <section className="mt-4 divide-y divide-border/70 border-y border-border/70">
        {exercise.intent && <div className="py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Intencja</p><p className="mt-1 text-sm font-semibold">{exercise.intent}</p></div>}
        {exercise.howTo?.[0] && <div className="py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Jak</p><p className="mt-1 text-sm">{exercise.howTo.join(" ")}</p></div>}
        {exercise.avoid && <div className="py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nie rób</p><p className="mt-1 text-sm">{exercise.avoid}</p></div>}
      </section>

      {detailsOpen && exercise.details && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{exercise.details}</p>}

      <div className="mt-auto pt-4">
        {nextExercise && <div className="flex min-h-14 items-center gap-3 border-y border-border/70 py-2"><ExerciseArt exercise={nextExercise} compact decorative /><div><span className="text-xs text-muted-foreground">Dalej</span><p className="text-sm font-semibold">{nextExercise.title}</p></div></div>}
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><BookOpen className="h-5 w-5" />Technika</button>
          <button type="button" onClick={onDone} className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"><Check className="h-5 w-5" />Gotowe</button>
        </div>
      </div>
    </main>
  );
}

