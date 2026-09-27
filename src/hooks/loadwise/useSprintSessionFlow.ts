import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PendingAdvance,
  SprintFlowState,
  SprintSession,
} from "@/lib/loadwise/sprint/types";

const INITIAL: SprintFlowState = {
  version: 1,
  phase: "idle",
  blockIndex: 0,
  exerciseIndex: 0,
  setIndex: 0,
  secondsRemaining: 0,
  pendingAdvance: null,
  updatedAt: 0,
};

function storageKey(sessionId: string): string {
  return `ballwise:sprint-flow:v1:${sessionId}`;
}

function load(sessionId: string): SprintFlowState {
  if (typeof window === "undefined") return INITIAL;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(sessionId)) ?? "null");
    return parsed?.version === 1 ? parsed : INITIAL;
  } catch {
    return INITIAL;
  }
}

export function useSprintSessionFlow(session: SprintSession) {
  const [state, setState] = useState<SprintFlowState>(() => load(session.id));

  const block = session.blocks[state.blockIndex] ?? null;
  const exercise = block?.exercises[state.exerciseIndex] ?? null;

  useEffect(() => {
    if (typeof window === "undefined" || state.phase === "idle") return;
    window.localStorage.setItem(storageKey(session.id), JSON.stringify(state));
  }, [session.id, state]);

  useEffect(() => {
    if (state.phase !== "rest" || state.secondsRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setState((current) => ({
        ...current,
        secondsRemaining: Math.max(0, current.secondsRemaining - 1),
        updatedAt: Date.now(),
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.phase, state.secondsRemaining]);

  const start = useCallback(() => {
    setState({ ...INITIAL, phase: "exercise", updatedAt: Date.now() });
  }, []);

  const applyAdvance = useCallback((pending: PendingAdvance) => {
    setState((current) => {
      if (pending === "next-set") {
        return { ...current, phase: "exercise", setIndex: current.setIndex + 1, secondsRemaining: 0, pendingAdvance: null, updatedAt: Date.now() };
      }

      const currentBlock = session.blocks[current.blockIndex];
      const nextExercise = current.exerciseIndex + 1;
      if (nextExercise < currentBlock.exercises.length) {
        return { ...current, phase: "exercise", exerciseIndex: nextExercise, setIndex: 0, secondsRemaining: 0, pendingAdvance: null, updatedAt: Date.now() };
      }

      const nextBlock = current.blockIndex + 1;
      if (nextBlock < session.blocks.length) {
        return { ...current, phase: "exercise", blockIndex: nextBlock, exerciseIndex: 0, setIndex: 0, secondsRemaining: 0, pendingAdvance: null, updatedAt: Date.now() };
      }

      return { ...current, phase: "complete", secondsRemaining: 0, pendingAdvance: null, updatedAt: Date.now() };
    });
  }, [session.blocks]);

  const markDone = useCallback(() => {
    if (!exercise) return;
    const sets = Math.max(1, exercise.sets ?? 1);
    const pending: PendingAdvance = state.setIndex + 1 < sets ? "next-set" : "next-exercise";
    const restSeconds = Math.max(0, exercise.restSeconds ?? 0);
    if (restSeconds > 0) {
      setState((current) => ({ ...current, phase: "rest", secondsRemaining: restSeconds, pendingAdvance: pending, updatedAt: Date.now() }));
    } else {
      applyAdvance(pending);
    }
  }, [applyAdvance, exercise, state.setIndex]);

  const continueAfterRest = useCallback(() => {
    applyAdvance(state.pendingAdvance);
  }, [applyAdvance, state.pendingAdvance]);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(storageKey(session.id));
    setState(INITIAL);
  }, [session.id]);

  const completedBlocks = useMemo(() => state.phase === "complete" ? session.blocks.length : state.blockIndex, [session.blocks.length, state.blockIndex, state.phase]);

  return { state, block, exercise, completedBlocks, start, markDone, continueAfterRest, skipRest: continueAfterRest, reset };
}

