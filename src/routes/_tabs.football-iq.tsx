import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  ChevronRight,
  Clock3,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  SkipForward,
  Target,
  UserRound,
} from "lucide-react";

import { AppHeader } from "@/components/loadwise/ui";
import type { SimPitchActor, SimPitchPath } from "@/components/football-iq/SimPitch";
import { SimPitch25D } from "@/components/football-iq/SimPitch25D";
import { TacticalPlannerControls } from "@/components/football-iq/TacticalPlannerControls";
import { useLoadwise } from "@/lib/loadwise/store";
import { toIQPositionGroup } from "@/lib/football-iq/positionMapping";
import { scenariosForPosition } from "@/lib/football-iq/simulation/scenarios";
import { TOPIC_LABELS } from "@/lib/football-iq/simulation/scenarioKit";
import { actorAt, evaluate, facingAt } from "@/lib/football-iq/simulation/engine";
import { choreograph } from "@/lib/football-iq/simulation/choreography";
import {
  applyPlanToActors,
  planActionPath,
  toolMovesBall,
  toolMovesActor,
  toolNeedsActor,
  type IQPlanAction,
  type IQPlannerPoint,
  type IQPlannerTool,
} from "@/lib/football-iq/planner";

import {
  ADVANCED_SEQUENCE_MS,
  advancedSequenceFor,
  buildChoice,
  canPlayDecision,
  decisionAnchorMs,
  decisionLessons,
  pointAlongPath,
  replayView,
  sequencePhaseOf,
  toolsForScenario,
  userDecisionPoint,
  type DecisionLesson,
  type ReplayVariant,
  type ReplayView,
} from "@/lib/football-iq/decision";
import type {
  SimChoice,
  SimResult,
  SimScenario,
  SimStage,
} from "@/lib/football-iq/simulation/types";
import type { IQPositionGroup } from "@/lib/football-iq/types";
import type { Level } from "@/lib/loadwise/types";

export const Route = createFileRoute("/_tabs/football-iq")({
  component: FootballIQScreen,
});

function FootballIQScreen() {
  const { state } = useLoadwise();
  const group = toIQPositionGroup(state.profile?.position);
  if (!group) return <NoPositionScreen />;
  return <Simulation group={group} level={state.profile?.level} />;
}

function NoPositionScreen() {
  const navigate = useNavigate();
  return (
    <div className="premium-flow iq-premium">
      <AppHeader title="BallWise IQ" subtitle="Mikrosymulacje decyzji boiskowych." />
      <div className="px-5">
        <div className="soft-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" /> Brak pozycji w profilu
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            Sytuacje są dopasowane do pozycji z profilu. Uzupełnij pozycję, aby korzystać z BallWise
            IQ.
          </p>
          <button
            onClick={() => navigate({ to: "/profil" })}
            className="mt-4 w-full rounded-xl bg-primary p-3 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
          >
            Przejdź do profilu
          </button>
        </div>
      </div>
    </div>
  );
}

const FLOW_STEPS = ["Sekwencja", "Druga decyzja", "Konsekwencja"] as const;
const REPLAY_BASE_MS = 6200;
const MATCH_DECISIONS = 8;
const MISTAKES_KEY = "ballwise-iq-mistakes-v1";

type IQMode = "quick" | "match" | "mistakes";

function replayStepOf(progress: number) {
  return sequencePhaseOf(progress);
}

function flowStepOf(stage: SimStage) {
  if (stage === "replay") return 2;
  if (stage === "decision") return 1;
  return 0;
}

function IQFlowProgress({ stage }: { stage: SimStage }) {
  const current = flowStepOf(stage);
  return (
    <nav className="mt-2.5 flex items-center" aria-label="Etapy sytuacji">
      {FLOW_STEPS.map((label, index) => {
        const active = index === current;
        const complete = index < current;
        return (
          <div key={label} className="flex min-w-0 flex-1 items-center last:flex-none">
            <span
              aria-current={active ? "step" : undefined}
              className={
                "whitespace-nowrap text-[12px] font-medium transition-colors duration-200 motion-reduce:transition-none " +
                (active
                  ? "text-primary"
                  : complete
                    ? "text-foreground/65"
                    : "text-muted-foreground/65")
              }
            >
              {label}
            </span>
            {index < FLOW_STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={
                  "mx-1.5 h-px min-w-2 flex-1 " + (index < current ? "bg-primary/45" : "bg-border")
                }
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function AdvancedPhaseBar({
  phases,
  current,
}: {
  phases: readonly [string, string, string, string, string];
  current: number;
}) {
  return (
    <div className="iq-phase-strip" aria-label={`Faza ${current + 1} z ${phases.length}`}>
      {phases.map((label, index) => (
        <div
          key={label}
          className={
            "iq-phase-item " +
            (index === current ? "is-active" : index < current ? "is-complete" : "")
          }
        >
          <span className="iq-phase-number">{index + 1}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function PitchLegend() {
  return (
    <div className="mt-2 flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <i className="h-2.5 w-2.5 rounded-full border border-foreground/35 bg-card" /> Twoi
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="h-2.5 w-2.5 rounded-full bg-foreground/85" /> Rywale
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="h-2.5 w-2.5 rounded-full border-2 border-foreground bg-background" /> Piłka
      </span>
    </div>
  );
}

function shortPosition(label: string) {
  const value = label.toLocaleLowerCase("pl");
  if (value.includes("bramkar")) return "BR";
  if (value.includes("stoper") || value.includes("środkowy obrońca")) return "ŚO";
  if (value.includes("boczny obrońca") || value.includes("wahadł")) return "BO";
  if (value.includes("skrzyd")) return "SK";
  if (value.includes("napast")) return "9";
  if (value.includes("pomoc")) return "8";
  if (value.includes("obroń")) return "O";
  return label.slice(0, 3).toLocaleUpperCase("pl");
}

function Simulation({ group, level }: { group: IQPositionGroup; level?: Level }) {
  const allPool = useMemo(() => scenariosForPosition(group, level), [group, level]);
  const [mode, setMode] = useState<IQMode | null>(null);
  const [mistakeIds, setMistakeIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(MISTAKES_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const mistakePool = useMemo(
    () => allPool.filter((item) => mistakeIds.includes(item.id)),
    [allPool, mistakeIds],
  );
  const pool = mode === "mistakes" && mistakePool.length ? mistakePool : allPool;
  const [scenarioId, setScenarioId] = useState(allPool[0].id);
  const [matchDecision, setMatchDecision] = useState(1);
  const [completedDecisions, setCompletedDecisions] = useState(0);
  const scenario: SimScenario = useMemo(
    () => pool.find((s) => s.id === scenarioId) ?? pool[0],
    [pool, scenarioId],
  );
  const isGoalkeeper = group === "goalkeeper";
  const tools = useMemo(() => toolsForScenario(scenario.topic, group), [scenario.topic, group]);
  const sequence = useMemo(() => advancedSequenceFor(scenario.topic), [scenario.topic]);
  const selfRole = shortPosition(scenario.context.positionLabel);

  /** Tory rozwinięte do 6 klatek kluczowych — wspólna choreografia silnika. */
  const simActors = useMemo(() => choreograph(scenario), [scenario]);
  const selfSim = simActors.find((a) => a.kind === "self");
  const decisionActorIds = useMemo(
    () =>
      scenario.actors
        .filter((actor) => actor.kind === "self" || actor.kind === "mate")
        .map((actor) => actor.id),
    [scenario],
  );

  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<SimStage>("observation");
  const [sequencePlaying, setSequencePlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const [t, setT] = useState(0);
  const [freezeT, setFreezeT] = useState(1);
  const [timingMs, setTimingMs] = useState<number | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);
  const [choice, setChoice] = useState<SimChoice | null>(null);
  const [replayStep, setReplayStep] = useState(0);
  const [replayProgress, setReplayProgress] = useState(0);
  const [replayRun, setReplayRun] = useState(0);
  const [replayVariant, setReplayVariant] = useState<ReplayVariant>("user");
  const [plannerTool, setPlannerTool] = useState<IQPlannerTool>(tools[0] ?? "position");
  const [plan, setPlan] = useState<IQPlanAction[]>([]);
  const [redoPlan, setRedoPlan] = useState<IQPlanAction[]>([]);
  const [replayPlan, setReplayPlan] = useState<IQPlanAction[]>([]);
  const [selectedActorId, setSelectedActorId] = useState<string>();
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [goalkeeperPoint, setGoalkeeperPoint] = useState<IQPlannerPoint | null>(null);

  const tRef = useRef(0);
  const scenarioRef = useRef(scenario.id);

  const resetRun = useCallback(() => {
    setResult(null);
    setChoice(null);
    setTimingMs(null);
    setT(0);
    tRef.current = 0;
    setFreezeT(1);
    setReplayStep(0);
    setReplayProgress(0);
    setReplayVariant("user");
    setStage("observation");
    setPlan([]);
    setRedoPlan([]);
    setReplayPlan([]);
    setSelectedActorId(undefined);
    setSelectedActionId(null);
    setGoalkeeperPoint(null);
    setSequencePlaying(true);
    setRunId((i) => i + 1);
  }, []);

  useEffect(() => {
    setPlannerTool(tools[0] ?? "position");
  }, [tools]);

  useEffect(() => {
    if (scenarioRef.current === scenario.id) return;
    scenarioRef.current = scenario.id;
    if (started) resetRun();
  }, [scenario.id, started, resetRun]);

  /** Kończy pełną sekwencję. Timing użytkownika nie jest mierzony ani oceniany. */
  const finishSequence = useCallback(() => {
    setSequencePlaying(false);
    setT(1);
    tRef.current = 1;
    setFreezeT(1);
    setTimingMs(decisionAnchorMs(scenario));
    setSelectedActorId(isGoalkeeper ? undefined : selfSim?.id);
    setSelectedActionId(scenario.actions[0]?.id ?? null);
    setStage("decision");
  }, [scenario, isGoalkeeper, selfSim]);

  // Pełna sekwencja ma stały, czytelny rytm. Nie jest testem obserwacji ani refleksu.
  useEffect(() => {
    if (!started || stage !== "observation" || !sequencePlaying) return;
    let raf = 0;
    const total = Math.min(7_000, Math.max(ADVANCED_SEQUENCE_MS, scenario.observationMs));
    const startedAt = performance.now() - tRef.current * total;
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt) / total);
      tRef.current = p;
      setT(p);
      if (p >= 1) {
        finishSequence();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, stage, sequencePlaying, runId, scenario.observationMs, finishSequence]);

  const freezeSelf = useMemo(
    () => (selfSim ? actorAt(selfSim.path, freezeT) : { x: 50, y: 70 }),
    [selfSim, freezeT],
  );

  const reactionForView = result?.reaction;
  const keyOpponentId = reactionForView?.moves[0]?.actorId;
  const view = result ? replayView(result, replayVariant) : null;

  const ball = simActors.find((a) => a.kind === "ball");
  const carrierId = useMemo(() => {
    if (!ball) return undefined;
    const bp = actorAt(ball.path, 0);
    let best: string | undefined;
    let bestD = Infinity;
    for (const a of simActors) {
      if (a.kind === "ball") continue;
      const p = actorAt(a.path, 0);
      const d = Math.hypot(p.x - bp.x, p.y - bp.y);
      if (d < bestD) {
        bestD = d;
        best = a.id;
      }
    }
    return best;
  }, [simActors, ball]);

  // Replay ma pięć faz: struktura, reakcja, rotacja, zagranie i konsekwencja.
  const reactionP =
    stage === "replay" ? Math.min(1, Math.max(0, (replayProgress - 0.18) / 0.24)) : 0;
  const playP =
    stage === "replay" ? Math.min(1, Math.max(0, (replayProgress - 0.38) / 0.44)) : 0;

  const actors: SimPitchActor[] = useMemo(() => {
    const frozenT = stage === "observation" ? t : freezeT;
    const baseActors = simActors.map((a) => {
      let { x, y } = actorAt(a.path, frozenT);
      const move = reactionForView?.moves.find((m) => m.actorId === a.id);
      if (stage === "replay" && move && a.kind === "opponent") {
        x += (move.x - x) * reactionP;
        y += (move.y - y) * reactionP;
      }
      return {
        id: a.id,
        kind: a.kind,
        label: a.kind === "self" ? `TY • ${selfRole}` : a.label,
        showLabel: a.kind === "self" || a.id === carrierId || a.id === keyOpponentId,
        x,
        y,
        facingDeg: facingAt(a.path, frozenT),
      };
    });
    if (stage !== "replay") return baseActors;
    if (replayVariant === "alt") {
      const ballPoint = view?.path ? pointAlongPath(view.path, playP) : null;
      return ballPoint
        ? baseActors.map((a) => (a.kind === "ball" ? { ...a, x: ballPoint.x, y: ballPoint.y } : a))
        : baseActors;
    }
    return replayPlan.length ? applyPlanToActors(baseActors, replayPlan, playP) : baseActors;
  }, [
    stage,
    t,
    freezeT,
    simActors,
    reactionForView,
    reactionP,
    playP,
    carrierId,
    keyOpponentId,
    replayPlan,
    replayVariant,
    view,
    selfRole,
  ]);

  const selectedActor = actors.find(
    (actor) => actor.id === selectedActorId && (actor.kind === "self" || actor.kind === "mate"),
  );

  const originForTool = useCallback(
    (tool: IQPlannerTool): IQPlannerPoint | null => {
      if (toolMovesBall(tool)) {
        const lastBallAction = [...plan].reverse().find((action) => toolMovesBall(action.tool));
        if (lastBallAction) return lastBallAction.to;
        const pitchBall = actors.find((actor) => actor.kind === "ball");
        if (pitchBall) return { x: pitchBall.x, y: pitchBall.y };
      }
      if (selectedActor) return { x: selectedActor.x, y: selectedActor.y };
      return null;
    },
    [actors, plan, selectedActor],
  );

  const plannerPreview = useCallback(
    (point: IQPlannerPoint) => {
      if (isGoalkeeper) {
        return planActionPath({ id: "preview", tool: "position", from: freezeSelf, to: point });
      }
      if (toolNeedsActor(plannerTool) && !selectedActor) return null;
      const from = originForTool(plannerTool) ?? point;
      return planActionPath({
        id: "preview",
        tool: plannerTool,
        actorId: selectedActor?.id,
        from,
        to: point,
      });
    },
    [isGoalkeeper, freezeSelf, originForTool, plannerTool, selectedActor],
  );

  const addPlanAction = useCallback(
    (point: IQPlannerPoint) => {
      if (isGoalkeeper) {
        setGoalkeeperPoint({ x: point.x, y: point.y });
        return;
      }
      if (toolNeedsActor(plannerTool) && !selectedActor) return;
      const from = originForTool(plannerTool) ?? point;
      const action: IQPlanAction = {
        id: `plan-${Date.now()}-${plan.length}`,
        tool: plannerTool,
        actorId: selectedActor?.id,
        from,
        to: point,
      };
      setPlan((current) => {
        if (!toolMovesActor(plannerTool) || !selectedActor) return [...current, action];
        return [
          ...current.filter(
            (item) => !(item.actorId === selectedActor.id && toolMovesActor(item.tool)),
          ),
          action,
        ];
      });
      setRedoPlan([]);
    },
    [isGoalkeeper, originForTool, plan.length, plannerTool, selectedActor],
  );

  const undoPlan = useCallback(() => {
    setPlan((current) => {
      const action = current.at(-1);
      if (!action) return current;
      setRedoPlan((redo) => [action, ...redo]);
      return current.slice(0, -1);
    });
  }, []);

  const restorePlan = useCallback(() => {
    setRedoPlan((current) => {
      const [action, ...rest] = current;
      if (!action) return current;
      setPlan((items) => [...items, action]);
      return rest;
    });
  }, []);

  const canPlay = canPlayDecision({
    group,
    selectedActionId,
    goalkeeperPoint,
    timingMs,
    planLength: plan.length,
  });

  const playPlan = useCallback(() => {
    if (!selectedActionId || timingMs == null) return;
    const point = userDecisionPoint({
      plan,
      selfId: selfSim?.id,
      goalkeeperPoint,
      freezeSelf,
    });
    const nextChoice = buildChoice({ timingMs, point, actionId: selectedActionId });
    const snapshot: IQPlanAction[] = plan.map((action) => ({ ...action }));
    if (isGoalkeeper && goalkeeperPoint && selfSim) {
      snapshot.push({
        id: "gk-position",
        tool: "position",
        actorId: selfSim.id,
        from: freezeSelf,
        to: goalkeeperPoint,
      });
    }
    const nextResult = evaluate(scenario, nextChoice);
    const shouldRepeat = nextResult.feedback.some((item) => item.verdict === "poor");
    setChoice(nextChoice);
    setResult(nextResult);
    setCompletedDecisions((value) => value + 1);
    if (shouldRepeat && typeof window !== "undefined") {
      setMistakeIds((current) => {
        const next = [scenario.id, ...current.filter((id) => id !== scenario.id)].slice(0, 20);
        window.localStorage.setItem(MISTAKES_KEY, JSON.stringify(next));
        return next;
      });
    }
    setReplayPlan(snapshot);
    setReplayVariant("user");
    setReplayStep(0);
    setReplayProgress(0);
    setStage("replay");
    setReplayRun((i) => i + 1);
  }, [
    selectedActionId,
    timingMs,
    plan,
    selfSim,
    goalkeeperPoint,
    freezeSelf,
    isGoalkeeper,
    scenario,
  ]);

  useEffect(() => {
    if (stage !== "replay") return;
    let raf = 0;
    const startedAt = performance.now();
    const duration = REPLAY_BASE_MS;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setReplayProgress(progress);
      setReplayStep(replayStepOf(progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, replayRun, replayVariant]);

  const paths: SimPitchPath[] = [];
  if (stage === "decision") {
    paths.push(...plan.map((action, index) => planActionPath(action, index + 1)));
    if (isGoalkeeper && goalkeeperPoint) {
      paths.push(
        planActionPath({ id: "gk", tool: "position", from: freezeSelf, to: goalkeeperPoint }),
      );
    }
  }
  if (stage === "replay" && result) {
    if (replayStep >= 1 && keyOpponentId) {
      const keyActor = simActors.find((actor) => actor.id === keyOpponentId);
      const keyMove = result.reaction.moves.find((move) => move.actorId === keyOpponentId);
      if (keyActor && keyMove) {
        paths.push({ points: [actorAt(keyActor.path, freezeT), keyMove], variant: "reaction" });
      }
    }
    if (replayStep >= 2) {
      if (replayVariant === "user") {
        paths.push(...replayPlan.map((action, index) => planActionPath(action, index + 1)));
        if (view?.path) paths.push({ points: view.path, variant: "user" });
      } else if (view?.path) {
        paths.push({ points: view.path, variant: "alt" });
      }
    }
  }

  const goNext = () => {
    if (mode === "match" && matchDecision >= MATCH_DECISIONS) {
      setStarted(false);
      setMode(null);
      setMatchDecision(1);
      return;
    }
    const index = pool.findIndex((item) => item.id === scenario.id);
    const next = pool[(index + 1) % pool.length];
    if (mode === "match") setMatchDecision((value) => value + 1);
    if (next.id === scenario.id) resetRun();
    else setScenarioId(next.id);
  };

  if (!mode) {
    return (
      <IQHomeScreen
        mistakeCount={mistakeIds.length}
        completedDecisions={completedDecisions}
        onSelect={(nextMode) => {
          if (nextMode === "mistakes" && mistakePool.length === 0) return;
          const nextPool = nextMode === "mistakes" ? mistakePool : allPool;
          setMode(nextMode);
          setScenarioId(nextPool[0]?.id ?? allPool[0].id);
          setMatchDecision(1);
          setCompletedDecisions(0);
          setStarted(false);
        }}
      />
    );
  }

  if (!started) {
    return (
      <BriefingScreen
        scenario={scenario}
        mode={mode}
        matchDecisions={MATCH_DECISIONS}
        onBack={() => setMode(null)}
        onReady={() => {
          resetRun();
          setStarted(true);
        }}
        onShuffle={() => {
          const i = pool.findIndex((s) => s.id === scenario.id);
          setScenarioId(pool[(i + 1) % pool.length].id);
        }}
        poolSize={pool.length}
      />
    );
  }

  const compactLessons = result && choice ? decisionLessons(scenario, result, choice) : [];
  const resultStatus = result?.feedback.some((item) => item.verdict === "poor")
    ? "Ryzykowne"
    : result?.feedback.every((item) => item.verdict === "good")
      ? "Optymalne"
      : "Możliwe";
  const visibleTools = tools.slice(0, 3);

  if (started) {
    return (
      <div className="fixed inset-0 z-[80] flex h-[100dvh] w-full flex-col overflow-hidden bg-graphite text-graphite-foreground">
        <section className="relative h-[66.667dvh] min-h-0 shrink-0 overflow-hidden bg-graphite">
          <div className="absolute inset-0">
            <SimPitch25D
              actors={actors}
              paths={paths}
              pulse={stage === "observation"}
              selectedActorId={stage === "decision" ? selectedActorId : undefined}
              highlightedActorId={stage === "replay" && replayStep === 1 ? keyOpponentId : undefined}
              highlightedActorLabel={
                stage === "replay" && replayStep === 1 ? reactionForView?.label : undefined
              }
              selectableKinds={
                stage === "decision" && !isGoalkeeper ? ["self", "mate"] : undefined
              }
              selectableActorIds={stage === "decision" ? decisionActorIds : undefined}
              onActorSelect={
                stage === "decision" && !isGoalkeeper ? setSelectedActorId : undefined
              }
              onPlanTarget={stage === "decision" ? addPlanAction : undefined}
              makePlannerPreview={stage === "decision" ? plannerPreview : undefined}
            />
          </div>

          <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-black/32 px-3 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.55rem)] text-white backdrop-blur-sm">
            <button
              type="button"
              onClick={() => {
                setStarted(false);
                setMode(null);
              }}
              className="pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/42 backdrop-blur-md"
              aria-label="Zakończ ćwiczenie"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 pt-0.5 text-center drop-shadow-sm">
              <p className="truncate text-[14px] font-semibold">{scenario.title}</p>
              <p className="mt-0.5 text-[11px] font-medium text-white/75">
                {mode === "match"
                  ? `Mecz IQ · decyzja ${matchDecision}/${MATCH_DECISIONS}`
                  : mode === "mistakes"
                    ? "Moje błędy"
                    : "Szybka sytuacja"}
              </p>
            </div>
            <span className="grid h-11 min-w-11 shrink-0 place-items-center rounded-full bg-black/42 px-2 text-[12px] font-bold backdrop-blur-md">
              {selfRole}
            </span>
          </header>

          {stage === "replay" && (
            <div className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+4.3rem)] z-20 flex -translate-x-1/2 rounded-full bg-black/55 p-1 text-[11px] font-semibold text-white backdrop-blur-md">
              <button
                type="button"
                onClick={() => {
                  setReplayVariant("user");
                  setReplayRun((value) => value + 1);
                }}
                className={
                  "min-h-9 rounded-full px-3 " +
                  (replayVariant === "user" ? "bg-white text-graphite" : "text-white/75")
                }
              >
                Twój ruch
              </button>
              <button
                type="button"
                disabled={!result?.alternative}
                onClick={() => {
                  setReplayVariant("alt");
                  setReplayRun((value) => value + 1);
                }}
                className={
                  "min-h-9 rounded-full px-3 disabled:opacity-35 " +
                  (replayVariant === "alt" ? "bg-[#f2d64b] text-[#071b33]" : "text-white/75")
                }
              >
                Lepsza opcja
              </button>
            </div>
          )}
        </section>

        <section className="flex h-[33.333dvh] min-h-0 shrink-0 flex-col overflow-hidden bg-[#071b33] px-4 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-3 text-white">
          {stage === "observation" && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f2d64b]">
                    Obserwuj · moment {sequencePhaseOf(t) + 1}/5
                  </p>
                  <h2 className="mt-1 line-clamp-2 text-[18px] font-semibold leading-tight">
                    {sequence.question}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSequencePlaying((playing) => !playing)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/8"
                  aria-label={sequencePlaying ? "Pauza" : "Kontynuuj"}
                >
                  {sequencePlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1.5" aria-label="Postęp akcji">
                {sequence.phases.map((label, index) => (
                  <span
                    key={label}
                    className={
                      "h-1.5 rounded-full " +
                      (index <= sequencePhaseOf(t) ? "bg-[#f2d64b]" : "bg-white/16")
                    }
                  />
                ))}
              </div>
              <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-white/68">
                Śledź ustawienie swojej pozycji, piłkę i ruch najbliższej linii.
              </p>
              <button
                type="button"
                onClick={finishSequence}
                className="mt-auto flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f2d64b] px-4 text-[14px] font-bold text-[#071b33] active:scale-[0.99]"
              >
                Podejmij decyzję <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {stage === "decision" && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f2d64b]">
                    Twoja decyzja
                  </p>
                  <h2 className="mt-1 line-clamp-1 text-[17px] font-semibold leading-tight">
                    Wskaż ruch bezpośrednio na boisku
                  </h2>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={undoPlan}
                    disabled={!plan.length}
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/18 bg-white/7 disabled:opacity-30"
                    aria-label="Cofnij ruch"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {!isGoalkeeper && (
                <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Tryb decyzji">
                  {visibleTools.map((toolId) => (
                    <button
                      key={toolId}
                      type="button"
                      role="radio"
                      aria-checked={plannerTool === toolId}
                      onClick={() => setPlannerTool(toolId)}
                      className={
                        "min-h-10 truncate rounded-lg border px-2 text-[11px] font-semibold " +
                        (plannerTool === toolId
                          ? "border-[#f2d64b] bg-[#f2d64b] text-[#071b33]"
                          : "border-white/18 bg-white/7 text-white/82")
                      }
                    >
                      {toolId === "position"
                        ? "Ruch"
                        : toolId === "press" || toolId === "counterpress"
                          ? "Pressing"
                          : toolId === "cover" || toolId === "block_lane"
                            ? "Asekuracja"
                            : toolId === "pass" || toolId.includes("pass")
                              ? "Podanie"
                              : toolId === "run" || toolId.includes("run")
                                ? "Bieg"
                                : toolId.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Zachowanie">
                {scenario.actions.slice(0, 4).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedActionId === action.id}
                    onClick={() => setSelectedActionId(action.id)}
                    className={
                      "min-h-9 truncate rounded-lg border px-2 text-left text-[11px] font-medium " +
                      (selectedActionId === action.id
                        ? "border-white/75 bg-white/16 text-white"
                        : "border-white/12 bg-transparent text-white/64")
                    }
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={playPlan}
                disabled={!canPlay}
                className="mt-auto flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#f2d64b] px-4 text-[14px] font-bold text-[#071b33] active:scale-[0.99] disabled:opacity-35"
              >
                Oceń decyzję <Play className="h-4 w-4 fill-current" />
              </button>
            </div>
          )}

          {stage === "replay" && result && choice && view && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                    Analiza · moment {mode === "match" ? matchDecision : pool.findIndex((item) => item.id === scenario.id) + 1}
                  </p>
                  <h2 className="mt-1 text-[19px] font-semibold">{resultStatus}</h2>
                </div>
                <span
                  className={
                    "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase " +
                    (resultStatus === "Optymalne"
                      ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-200"
                      : resultStatus === "Ryzykowne"
                        ? "border-red-300/35 bg-red-400/12 text-red-200"
                        : "border-[#f2d64b]/40 bg-[#f2d64b]/10 text-[#f2d64b]")
                  }
                >
                  {resultStatus}
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                {compactLessons.slice(0, 2).map((lesson, index) => (
                  <p key={lesson.key} className="line-clamp-1 text-[12px] leading-snug text-white/78">
                    <span className={index === 0 ? "text-[#f2d64b]" : "text-emerald-300"}>
                      {index === 0 ? "• " : "✓ "}
                    </span>
                    {lesson.text}
                  </p>
                ))}
                {compactLessons[2] && (
                  <p className="line-clamp-1 rounded-lg bg-white/8 px-2.5 py-2 text-[11px] text-white/72">
                    <span className="font-semibold text-white">Sygnał: </span>
                    {compactLessons[2].text}
                  </p>
                )}
              </div>

              <div className="mt-auto grid grid-cols-[0.9fr_1.4fr] gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setChoice(null);
                    setReplayPlan([]);
                    setReplayProgress(0);
                    setReplayVariant("user");
                    setStage("decision");
                  }}
                  className="min-h-11 rounded-xl border border-white/20 bg-white/8 px-3 text-[12px] font-semibold"
                >
                  Zagraj ponownie
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#f2d64b] px-3 text-[12px] font-bold text-[#071b33]"
                >
                  {mode === "match" && matchDecision >= MATCH_DECISIONS
                    ? "Zakończ Mecz IQ"
                    : "Następna sytuacja"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div
      className="premium-flow iq-premium flex min-h-0 flex-col overflow-hidden bg-background"
      style={{ height: "calc(100dvh - 5.75rem - env(safe-area-inset-bottom))" }}
    >
      <header className="shrink-0 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.625rem)]">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
              {scenario.title}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Zaawansowana · {pool.findIndex((item) => item.id === scenario.id) + 1} z {pool.length}
            </p>
          </div>
          <span className="max-w-[45%] shrink-0 truncate rounded-full border border-border/70 bg-card px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
            {TOPIC_LABELS[scenario.topic]}
          </span>
        </div>
        <IQFlowProgress stage={stage} />
        {stage === "observation" && (
          <p className="mt-2 text-[13px] font-medium leading-snug text-foreground/80">
            {sequence.question}
          </p>
        )}
      </header>

      <div className="mx-3 h-[clamp(18rem,52dvh,32rem)] shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <SimPitch25D
          actors={actors}
          paths={paths}
          pulse={false}
          selectedActorId={stage === "decision" ? selectedActorId : undefined}
          highlightedActorId={stage === "replay" && replayStep === 1 ? keyOpponentId : undefined}
          highlightedActorLabel={
            stage === "replay" && replayStep === 1 ? reactionForView?.label : undefined
          }
          selectableKinds={stage === "decision" && !isGoalkeeper ? ["self", "mate"] : undefined}
          onActorSelect={stage === "decision" && !isGoalkeeper ? setSelectedActorId : undefined}
          onPlanTarget={stage === "decision" ? addPlanAction : undefined}
          makePlannerPreview={stage === "decision" ? plannerPreview : undefined}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
        <PitchLegend />
        <AdvancedPhaseBar
          phases={sequence.phases}
          current={stage === "observation" ? sequencePhaseOf(t) : stage === "replay" ? replayStep : 3}
        />

        {stage === "observation" && (
          <div className="motion-enter mt-3 flex min-h-full flex-col">
            <div className="rounded-xl border border-border/70 bg-card px-3.5 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-primary">
                Faza {sequencePhaseOf(t) + 1} z 5 · {sequence.phases[sequencePhaseOf(t)]}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {scenario.brief}
              </p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSequencePlaying((playing) => !playing)}
                className="motion-press flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border/70 bg-secondary/60 text-[14px] font-medium text-foreground"
              >
                {sequencePlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {sequencePlaying ? "Pauza" : "Kontynuuj"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setT(0);
                  tRef.current = 0;
                  setSequencePlaying(true);
                  setRunId((value) => value + 1);
                }}
                className="motion-press flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border/70 bg-secondary/60 text-[14px] font-medium text-foreground"
              >
                <RotateCcw className="h-4 w-4" /> Od początku
              </button>
            </div>
            <button
              type="button"
              onClick={finishSequence}
              className="motion-press mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary p-3.5 text-[14px] font-semibold text-primary-foreground"
            >
              <SkipForward className="h-4 w-4" /> Przejdź do drugiej decyzji
            </button>
          </div>
        )}

        {stage === "decision" && (
          <div className="motion-enter mt-3">
            <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                Druga decyzja
              </p>
              <p className="mt-1 text-[14px] font-medium leading-snug text-foreground">
                {sequence.question}
              </p>
            </div>
            <div className="mt-3">
              <TacticalPlannerControls
                goalkeeper={isGoalkeeper}
                tools={tools}
                tool={plannerTool}
                planLength={plan.length}
                selectedActorLabel={
                  selectedActor?.label ??
                  (selectedActor?.kind === "self" ? "TY" : selectedActor ? "Partner" : undefined)
                }
                hasGoalkeeperPoint={Boolean(goalkeeperPoint)}
                actions={scenario.actions.map((a) => ({ id: a.id, label: a.label }))}
                selectedActionId={selectedActionId}
                canPlay={canPlay}
                canUndo={Boolean(plan.length)}
                canRedo={Boolean(redoPlan.length)}
                onTool={setPlannerTool}
                onAction={setSelectedActionId}
                onUndo={undoPlan}
                onRedo={restorePlan}
                onClear={() => {
                  setPlan([]);
                  setRedoPlan([]);
                }}
                onPlay={playPlan}
              />
            </div>
          </div>
        )}

        {stage === "replay" && result && choice && view && (
          <ReplayPanel
            lessons={decisionLessons(scenario, result, choice)}
            view={view}
            hasAlternative={Boolean(result.alternative)}
            variant={replayVariant}
            step={replayStep}
            totalSteps={sequence.phases.length}
            onVariant={(v) => {
              setReplayVariant(v);
              setReplayProgress(0);
              setReplayStep(0);
            }}
            onReplay={() => setReplayRun((i) => i + 1)}
            onEdit={() => {
              setResult(null);
              setChoice(null);
              setReplayPlan([]);
              setReplayProgress(0);
              setReplayStep(0);
              setReplayVariant("user");
              setStage("decision");
            }}
            onNext={goNext}
          />
        )}
      </div>
    </div>
  );
}

function IQHomeScreen({
  mistakeCount,
  completedDecisions,
  onSelect,
}: {
  mistakeCount: number;
  completedDecisions: number;
  onSelect: (mode: IQMode) => void;
}) {
  return (
    <div className="premium-flow iq-premium min-h-full bg-background pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <AppHeader title="Football IQ" subtitle="Trenuj decyzje meczowe na swojej pozycji." />
      <main className="px-4">
        <section className="rounded-2xl border border-border/70 bg-card p-2 shadow-sm">
          <button
            type="button"
            onClick={() => onSelect("quick")}
            className="motion-press flex min-h-[5.25rem] w-full items-center gap-3 rounded-xl px-3 text-left active:scale-[0.99]"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <Clock3 className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-foreground">Szybkie sytuacje</span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">Jedna akcja · 2–3 min</span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => onSelect("match")}
            className="motion-press relative flex min-h-[7.75rem] w-full overflow-hidden rounded-xl bg-[#071b33] p-4 text-left text-white active:scale-[0.99]"
          >
            <span className="relative z-10 min-w-0 flex-1 pr-20">
              <span className="inline-flex rounded-full bg-[#f2d64b] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#071b33]">
                Główny tryb
              </span>
              <span className="mt-3 block text-[22px] font-semibold leading-none">Mecz IQ</span>
              <span className="mt-1.5 block text-[13px] leading-snug text-white/68">
                Ciągła symulacja decyzji Twojej pozycji
              </span>
            </span>
            <span className="absolute bottom-3 right-3 grid h-16 w-16 place-items-center rounded-2xl border border-[#f2d64b]/35 bg-[#f2d64b]/10 text-[#f2d64b]">
              <BrainCircuit className="h-8 w-8" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelect("mistakes")}
            disabled={!mistakeCount}
            className="motion-press mt-1 flex min-h-[5.25rem] w-full items-center gap-3 rounded-xl px-3 text-left active:scale-[0.99] disabled:opacity-45"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <Target className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-foreground">Moje błędy</span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">
                {mistakeCount ? `${mistakeCount} momentów do powtórzenia` : "Pojawią się po pierwszym treningu"}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </section>

        <section className="mt-3 flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-foreground">
              {completedDecisions ? `${completedDecisions} ukończonych decyzji` : "Trening dopasowany do pozycji"}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Bez testu refleksu. Liczy się struktura, ruch i konsekwencja.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function SourceLink({ scenario }: { scenario: SimScenario }) {
  const ref = scenario.sourceReference;
  if (!ref) return null;
  return ref.url ? (
    <a
      href={ref.url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 inline-block text-[12px] text-primary underline underline-offset-2"
    >
      Źródło: {ref.label}
    </a>
  ) : (
    <span className="mt-3 inline-block text-[12px] text-muted-foreground">Źródło: {ref.label}</span>
  );
}

function BriefingScreen({
  scenario,
  mode,
  matchDecisions,
  onBack,
  onReady,
  onShuffle,
  poolSize,
}: {
  scenario: SimScenario;
  mode: IQMode;
  matchDecisions: number;
  onBack: () => void;
  onReady: () => void;
  onShuffle: () => void;
  poolSize: number;
}) {
  const ctx = scenario.context;
  if (mode) {
    return (
      <div className="premium-flow iq-premium flex h-[calc(100dvh-5.75rem-env(safe-area-inset-bottom))] min-h-0 flex-col overflow-hidden bg-background">
        <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.65rem)]">
          <button
            type="button"
            onClick={onBack}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-sm"
            aria-label="Wróć"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold leading-tight text-foreground">
              {mode === "match" ? "Mecz IQ" : mode === "mistakes" ? "Moje błędy" : "Szybka sytuacja"}
            </h1>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {mode === "match" ? `${matchDecisions} kolejnych decyzji` : "Jedna akcja · natychmiastowa analiza"}
            </p>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/45 bg-[var(--pitch-grass)] shadow-sm">
            <div className="absolute inset-[8%] rounded-[0.7rem] border-2 border-white/65" />
            <div className="absolute inset-y-[8%] left-1/2 w-px bg-white/65" />
            <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/65" />
            <div className="absolute inset-x-0 bottom-0 bg-[#071b33]/88 px-4 py-4 text-white backdrop-blur-sm">
              <span className="inline-flex rounded-full bg-[#f2d64b] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#071b33]">
                {TOPIC_LABELS[scenario.topic]}
              </span>
              <h2 className="mt-2 line-clamp-2 text-[22px] font-semibold leading-tight">{scenario.title}</h2>
              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-white/72">{scenario.brief}</p>
            </div>
          </div>

          <div className="mt-3 grid shrink-0 grid-cols-3 gap-2">
            <div className="rounded-xl bg-card px-2 py-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Pozycja</p>
              <p className="mt-1 truncate text-[12px] font-semibold text-foreground">{ctx.positionLabel}</p>
            </div>
            <div className="rounded-xl bg-card px-2 py-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Faza</p>
              <p className="mt-1 truncate text-[12px] font-semibold text-foreground">{ctx.phase}</p>
            </div>
            <div className="rounded-xl bg-card px-2 py-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Decyzje</p>
              <p className="mt-1 text-[12px] font-semibold text-foreground">
                {mode === "match" ? matchDecisions : 1}
              </p>
            </div>
          </div>

          <p className="mt-3 shrink-0 text-center text-[12px] leading-snug text-muted-foreground">
            Sterujesz tylko zachowaniem swojej pozycji. Pozostali zawodnicy poruszają się automatycznie.
          </p>

          <div className="mt-3 grid shrink-0 grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={onReady}
              className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-[#071b33] px-4 text-[14px] font-semibold text-white"
            >
              <Play className="h-4 w-4 fill-current" />
              {mode === "match" ? "Rozpocznij mecz" : "Rozpocznij akcję"}
            </button>
            <button
              type="button"
              onClick={onShuffle}
              className="grid h-13 w-13 place-items-center rounded-xl border border-border/70 bg-card text-foreground"
              aria-label="Zmień sytuację"
            >
              <Shuffle className="h-4 w-4" />
            </button>
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="premium-flow iq-premium min-h-full bg-background pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <AppHeader
        title={mode === "match" ? "Mecz IQ" : mode === "mistakes" ? "Moje błędy" : "Szybka sytuacja"}
        subtitle={mode === "match" ? `Seria ${matchDecisions} decyzji dla Twojej pozycji.` : "Jedna sytuacja. Jedna konkretna lekcja."}
      />
      <div className="space-y-3 px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-[13px] font-semibold text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć do Football IQ
        </button>
        <div className="soft-card border border-border/70 bg-card/90 p-5 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1.5 text-[12px] font-semibold text-primary">
              Poziom zaawansowany
            </span>
            <span className="inline-flex rounded-full border border-border/70 bg-secondary/70 px-3 py-1.5 text-[12px] font-medium text-foreground">
              {TOPIC_LABELS[scenario.topic]}
            </span>
          </div>
          <h2 className="mt-4 text-[22px] font-semibold leading-tight text-foreground">
            {scenario.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{scenario.brief}</p>

          <div className="mt-4 flex flex-wrap gap-2 text-[12px] text-muted-foreground">
            <span className="rounded-lg bg-secondary/65 px-2.5 py-1.5">
              {ctx.minute}' · {ctx.scoreline}
            </span>
            <span className="rounded-lg bg-secondary/65 px-2.5 py-1.5">{ctx.positionLabel}</span>
            <span className="rounded-lg bg-secondary/65 px-2.5 py-1.5">{ctx.phase}</span>
          </div>

          <div className="mt-4 border-l-2 border-primary/35 pl-3">
            <p className="text-[12px] font-semibold text-foreground">Kontekst decyzji</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {ctx.weightsNote}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-y border-border/70 py-3 text-center">
            {[
              ["1", "Sekwencja"],
              ["2", "Druga decyzja"],
              ["3", "Konsekwencja"],
            ].map(([number, label]) => (
              <div key={number}>
                <p className="text-[11px] font-semibold text-primary">{number}</p>
                <p className="mt-0.5 text-[12px] font-medium text-foreground">{label}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[13px] leading-snug text-muted-foreground">
            Prześledź pięć faz akcji, zaplanuj kolejną decyzję i porównaj jej konsekwencję z
            lepszym wariantem.
          </p>
          <SourceLink scenario={scenario} />
          <button
            onClick={onReady}
            className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary p-3.5 text-[15px] font-semibold text-primary-foreground shadow-sm transition-[transform,opacity] duration-200 active:scale-[0.99] motion-reduce:transition-none"
          >
            <Play className="h-4 w-4" /> Uruchom sekwencję
          </button>
          <button
            onClick={onShuffle}
            className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-transparent p-3 text-[14px] font-medium text-foreground transition-[transform,background-color] duration-200 active:scale-[0.99] motion-reduce:transition-none"
          >
            <Shuffle className="h-4 w-4" /> Zmień sytuację ({poolSize})
          </button>
        </div>
      </div>
    </div>
  );
}

function ReplayPanel({
  lessons,
  view,
  hasAlternative,
  variant,
  step,
  totalSteps,
  onVariant,
  onReplay,
  onEdit,
  onNext,
}: {
  lessons: DecisionLesson[];
  view: ReplayView;
  hasAlternative: boolean;
  variant: ReplayVariant;
  step: number;
  totalSteps: number;
  onVariant: (v: ReplayVariant) => void;
  onReplay: () => void;
  onEdit: () => void;
  onNext: () => void;
}) {
  const done = step >= totalSteps - 1;
  const rows =
    variant === "alt"
      ? [
          view.changed ? { label: "Co zmienić", text: view.changed } : null,
          { label: "Dlaczego", text: view.outcome.consequence },
        ].filter((row): row is { label: string; text: string } => Boolean(row?.text))
      : lessons.map((lesson) => ({ label: lesson.label, text: lesson.text }));

  return (
    <div className="motion-enter pb-1">
      {hasAlternative && (
        <div
          className="flex gap-1 rounded-xl border border-border/70 bg-secondary/55 p-1"
          role="tablist"
          aria-label="Wariant replayu"
        >
          {(
            [
              ["user", "Twój wybór"],
              ["alt", "Lepsza odpowiedź"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={variant === id}
              onClick={() => onVariant(id)}
              className={
                "min-h-12 flex-1 rounded-lg px-2 text-[14px] font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.99] motion-reduce:transition-none " +
                (variant === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <h2 className="mt-3 text-[18px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
        {view.label}
      </h2>
      {done && (
        <div className="mt-3 rounded-xl border border-border/80 bg-card px-3.5 py-3 shadow-sm">
          <h3 className="text-[14px] font-semibold text-foreground">
            {variant === "alt" ? "Dlaczego lepiej w tej sytuacji" : "Co z tego wynika"}
          </h3>
          <dl className="mt-2.5 space-y-2.5 text-[13px] leading-relaxed">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[5.75rem_1fr] gap-2.5">
                <dt className="font-semibold text-foreground">{row.label}</dt>
                <dd className="text-muted-foreground">{row.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="motion-press flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-secondary/60 text-[14px] font-medium text-foreground transition-[transform,background-color] duration-200 active:scale-[0.99] motion-reduce:transition-none"
        >
          <Pencil className="h-3.5 w-3.5" /> Zmień decyzję
        </button>
        <button
          type="button"
          onClick={onReplay}
          className="motion-press flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-secondary/60 text-[14px] font-medium text-foreground transition-[transform,background-color] duration-200 active:scale-[0.99] motion-reduce:transition-none"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Powtórz
        </button>
      </div>
      <div className="sticky bottom-0 z-10 -mx-1 mt-2 bg-background/95 px-1 pb-1 pt-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={onNext}
          disabled={!done}
          className="motion-press min-h-12 w-full rounded-xl bg-primary p-3.5 text-[14px] font-semibold text-primary-foreground shadow-sm transition-[transform,opacity] duration-200 active:scale-[0.99] disabled:opacity-40 motion-reduce:transition-none"
        >
          Następna sytuacja
        </button>
      </div>
    </div>
  );
}
