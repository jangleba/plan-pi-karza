import { ChevronLeft, ChevronRight, PlayCircle } from "lucide-react";
import type { SprintSession } from "@/lib/loadwise/sprint/types";

interface SessionOverviewProps {
  session: SprintSession;
  completedBlocks: number;
  canResume: boolean;
  onBack?: () => void;
  onOpenBlock: (index: number) => void;
  onStart: () => void;
}

export function SessionOverview({ session, completedBlocks, canResume, onBack, onOpenBlock, onStart }: SessionOverviewProps) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-background px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-foreground">
      <header className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-primary" aria-label="Wróć">
            <ChevronLeft className="h-6 w-6" strokeWidth={1.8} />
          </button>
          <button type="button" onClick={onStart} className="flex min-h-11 items-center gap-2 px-1 text-sm font-semibold text-primary">
            <PlayCircle className="h-6 w-6 fill-primary text-primary-foreground" />
            {canResume ? "Wznów" : "Rozpocznij"}
          </button>
        </div>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em]">{session.title}</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{session.estimatedMinutes} min · {session.blocks.length} bloków</p>
        <div className="mt-4 flex gap-1" aria-label={`Ukończono ${completedBlocks} z ${session.blocks.length} bloków`}>
          {session.blocks.map((block, index) => (
            <span key={block.id} className={`h-1.5 flex-1 rounded-full ${index < completedBlocks ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>
      </header>

      <section aria-label="Plan sesji" className="border-t border-border/70">
        {session.blocks.map((block, index) => {
          const done = index < completedBlocks;
          const active = index === completedBlocks && canResume;
          return (
            <button key={block.id} type="button" onClick={() => onOpenBlock(index)} className="grid min-h-[78px] w-full grid-cols-[3.25rem_minmax(0,1fr)_1.5rem] items-center gap-3 border-b border-border/70 py-3 text-left">
              <span className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold ${done ? "bg-primary text-primary-foreground" : active ? "ring-2 ring-primary bg-primary/10 text-primary" : "bg-secondary text-foreground"}`}>
                {done ? "✓" : block.number}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug">{block.title}</span>
                <span className="mt-1 block text-xs font-medium text-muted-foreground">{block.exercises.length} {block.exercises.length === 1 ? "ćwiczenie" : "ćwiczeń"} · ~{block.estimatedMinutes} min</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
            </button>
          );
        })}
      </section>
    </main>
  );
}

