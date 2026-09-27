import { useEffect, useMemo, useState } from "react";
import { useSprintSessionFlow } from "@/hooks/loadwise/useSprintSessionFlow";
import { upgradeSprintSession } from "@/lib/loadwise/sprint/sessionUpgrade";
import type { SprintExercise, SprintSession } from "@/lib/loadwise/sprint/types";
import { ActiveExerciseScreen } from "./ActiveExerciseScreen";
import { BlockExerciseList } from "./BlockExerciseList";
import { RestScreen } from "./RestScreen";
import { SessionOverview } from "./SessionOverview";

interface SprintSessionMinimalProps {
  session: SprintSession;
  onBack?: () => void;
  onComplete?: () => void;
}

function findNext(session: SprintSession, blockIndex: number, exerciseIndex: number, setIndex: number): SprintExercise | null {
  const current = session.blocks[blockIndex]?.exercises[exerciseIndex];
  if (current && setIndex + 1 < Math.max(1, current.sets ?? 1)) return current;
  const sameBlock = session.blocks[blockIndex]?.exercises[exerciseIndex + 1];
  if (sameBlock) return sameBlock;
  return session.blocks[blockIndex + 1]?.exercises[0] ?? null;
}

export function SprintSessionMinimal({ session: incomingSession, onBack, onComplete }: SprintSessionMinimalProps) {
  const session = useMemo(() => upgradeSprintSession(incomingSession), [incomingSession]);
  const flow = useSprintSessionFlow(session);
  const [openBlockIndex, setOpenBlockIndex] = useState<number | null>(null);
  const [showPlan, setShowPlan] = useState(() => flow.state.phase !== "idle");
  const nextExercise = findNext(session, flow.state.blockIndex, flow.state.exerciseIndex, flow.state.setIndex);

  useEffect(() => {
    if (flow.state.phase === "complete") onComplete?.();
  }, [flow.state.phase, onComplete]);

  if (flow.state.phase === "complete") {
    return <main className="mx-auto grid min-h-dvh max-w-md place-items-center bg-background p-6 text-center"><div><p className="text-sm font-semibold text-primary">Sesja ukończona</p><h1 className="mt-2 text-3xl font-bold">Dobra robota.</h1><button type="button" onClick={flow.reset} className="mt-6 min-h-11 px-4 text-sm font-semibold text-primary">Wróć do planu</button></div></main>;
  }

  if (!showPlan && flow.state.phase === "rest") {
    return <RestScreen seconds={flow.state.secondsRemaining} nextExercise={nextExercise} onContinue={flow.continueAfterRest} />;
  }

  if (!showPlan && flow.state.phase === "exercise" && flow.block && flow.exercise) {
    return <ActiveExerciseScreen block={flow.block} blockIndex={flow.state.blockIndex} blockCount={session.blocks.length} exercise={flow.exercise} exerciseIndex={flow.state.exerciseIndex} setIndex={flow.state.setIndex} nextExercise={nextExercise} onDone={flow.markDone} onExitToPlan={() => { setOpenBlockIndex(null); setShowPlan(true); }} />;
  }

  if (openBlockIndex !== null) {
    return <BlockExerciseList block={session.blocks[openBlockIndex]} onBack={() => setOpenBlockIndex(null)} />;
  }

  const canResume = flow.state.phase === "exercise" || flow.state.phase === "rest";
  return <SessionOverview session={session} completedBlocks={flow.completedBlocks} canResume={canResume} onBack={onBack} onOpenBlock={setOpenBlockIndex} onStart={() => { if (canResume) setShowPlan(false); else flow.start(); }} />;
}
