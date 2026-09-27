import type { SprintExercise } from "@/lib/loadwise/sprint/types";
import { ExerciseArt } from "./ExerciseArt";

interface RestScreenProps {
  seconds: number;
  nextExercise: SprintExercise | null;
  onContinue: () => void;
}

function formatted(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RestScreen({ seconds, nextExercise, onContinue }: RestScreenProps) {
  const ready = seconds === 0;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-foreground">
      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold text-muted-foreground">Przerwa</p>
        <div className="mt-4 font-mono text-[64px] font-bold tracking-[-0.06em] text-primary">{formatted(seconds)}</div>
        {nextExercise && <div className="mt-10 w-full border-y border-border/70 py-4 text-left"><p className="text-xs text-muted-foreground">Dalej</p><div className="mt-2 flex items-center gap-3"><ExerciseArt exercise={nextExercise} compact decorative /><div><p className="text-sm font-semibold">{nextExercise.title}</p><p className="mt-1 text-xs text-muted-foreground">{nextExercise.prescription}</p></div></div></div>}
      </section>
      <div className="flex justify-end">
        <button type="button" onClick={onContinue} className={`min-h-11 rounded-xl px-5 text-sm font-semibold ${ready ? "bg-primary text-primary-foreground" : "text-primary"}`}>{ready ? "Dalej" : "Pomiń przerwę"}</button>
      </div>
    </main>
  );
}

