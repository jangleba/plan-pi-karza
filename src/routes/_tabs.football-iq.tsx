import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, Pencil, Play, RotateCcw, Shuffle, UserRound } from "lucide-react";

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
  buildChoice,
  canPlayDecision,
  decisionLessons,
  freezeTiming,
  pointAlongPath,
  replayView,
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

const REPLAY_STEPS = ["Zatrzymanie", "Reakcja", "Zagranie", "Skutek"];
/** Replay jest wolniejszy (0.75x), obserwacja zawsze 1.0x. */
const REPLAY_BASE_MS = 2600;
const REPLAY_RATE = 0.75;

function replayStepOf(progress: number) {
  return progress < 0.2 ? 0 : progress < 0.5 ? 1 : progress < 0.85 ? 2 : 3;
}

function Simulation({ group, level }: { group: IQPositionGroup; level?: Level }) {
  const pool = useMemo(() => scenariosForPosition(group, level), [group, level]);
  const [scenarioId, setScenarioId] = useState(pool[0].id);
  const scenario: SimScenario = useMemo(
    () => pool.find((s) => s.id === scenarioId) ?? pool[0],
    [pool, scenarioId],
  );
  const isGoalkeeper = group === "goalkeeper";
  const tools = useMemo(() => toolsForScenario(scenario.topic, group), [scenario.topic, group]);

  /** Tory rozwinięte do 6 klatek kluczowych — wspólna choreografia silnika. */
  const simActors = useMemo(() => choreograph(scenario), [scenario]);
  const selfSim = simActors.find((a) => a.kind === "self");

  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<SimStage>("observation");
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

  /** Zatrzymuje akcję dokładnie w bieżącej klatce i przechodzi do decyzji. */
  const freezeAt = useCallback(
    (rawT: number) => {
      const frozen = freezeTiming(rawT, scenario.observationMs);
      setT(frozen.t);
      setFreezeT(frozen.t);
      setTimingMs(frozen.timingMs);
      setSelectedActorId(isGoalkeeper ? undefined : selfSim?.id);
      setStage("decision");
    },
    [scenario.observationMs, isGoalkeeper, selfSim],
  );

  // Obserwacja: pełne observationMs w tempie 1.0x.
  useEffect(() => {
    if (!started || stage !== "observation") return;
    let raf = 0;
    const startedAt = performance.now();
    const total = Math.max(1, scenario.observationMs);
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt) / total);
      tRef.current = p;
      setT(p);
      if (p >= 1) {
        freezeAt(1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, stage, runId, scenario.observationMs, freezeAt]);

  const freezeSelf = selfSim ? actorAt(selfSim.path, freezeT) : { x: 50, y: 70 };

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
      if (a.kind === "ball" || a.kind === "self") continue;
      const p = actorAt(a.path, 0);
      const d = Math.hypot(p.x - bp.x, p.y - bp.y);
      if (d < bestD) {
        bestD = d;
        best = a.id;
      }
    }
    return best;
  }, [simActors, ball]);

  // Faza zagrania w replayu (0..1) i faza reakcji rywala (0..1).
  const reactionP = stage === "replay" ? Math.min(1, Math.max(0, (replayProgress - 0.2) / 0.3)) : 0;
  const playP = stage === "replay" ? Math.min(1, Math.max(0, (replayProgress - 0.5) / 0.35)) : 0;

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
        label: a.label,
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

  const canPlay = canPlayDecision({ group, selectedActionId, goalkeeperPoint, timingMs });

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
    setChoice(nextChoice);
    setResult(evaluate(scenario, nextChoice));
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
    const duration = REPLAY_BASE_MS / REPLAY_RATE;
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
    const index = pool.findIndex((item) => item.id === scenario.id);
    const next = pool[(index + 1) % pool.length];
    if (next.id === scenario.id) resetRun();
    else setScenarioId(next.id);
  };

  if (!started) {
    return (
      <BriefingScreen
        scenario={scenario}
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

  const stageLabel = stage === "replay" ? "Zrozum" : stage === "decision" ? "Zdecyduj" : "Zobacz";

  return (
    <div
      className="premium-flow iq-premium flex min-h-0 flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 5.75rem - env(safe-area-inset-bottom))" }}
    >
      <header className="shrink-0 px-5 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              Sytuacja {pool.findIndex((item) => item.id === scenario.id) + 1} / {pool.length}
            </p>
            <p className="mt-0.5 truncate text-[14px] font-semibold leading-tight text-foreground">
              {scenario.title}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-semibold text-foreground">
            {stageLabel}
          </span>
        </div>
        {stage === "observation" && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {scenario.brief}
          </p>
        )}
      </header>

      <div className="h-[44dvh] min-h-[15rem] shrink-0 overflow-hidden bg-card">
        <SimPitch25D
          actors={actors}
          paths={paths}
          pulse={false}
          selectedActorId={stage === "decision" ? selectedActorId : undefined}
          highlightedActorId={stage === "replay" && replayStep >= 1 ? keyOpponentId : undefined}
          selectableKinds={stage === "decision" && !isGoalkeeper ? ["self", "mate"] : undefined}
          onActorSelect={stage === "decision" && !isGoalkeeper ? setSelectedActorId : undefined}
          onPlanTarget={stage === "decision" ? addPlanAction : undefined}
          makePlannerPreview={stage === "decision" ? plannerPreview : undefined}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3 pt-3">
        {stage === "observation" && (
          <div className="motion-enter">
            <div className="h-1 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary" style={{ width: t * 100 + "%" }} />
            </div>
            <button
              type="button"
              onClick={() => freezeAt(tRef.current)}
              className="motion-press mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary p-4 text-[14px] font-bold uppercase tracking-wide text-primary-foreground"
            >
              <Hand className="h-4 w-4" /> Zatrzymaj i zdecyduj
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Zatrzymaj w chwili, w której chcesz działać.
            </p>
          </div>
        )}

        {stage === "decision" && (
          <TacticalPlannerControls
            goalkeeper={isGoalkeeper}
            tools={tools}
            tool={plannerTool}
            planLength={plan.length}
            selectedActorLabel={
              selectedActor?.label ??
              (selectedActor?.kind === "self" ? "Ty" : selectedActor ? "Partner" : undefined)
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
        )}

        {stage === "replay" && result && choice && view && (
          <ReplayPanel
            lessons={decisionLessons(scenario, result, choice)}
            view={view}
            hasAlternative={Boolean(result.alternative)}
            variant={replayVariant}
            step={replayStep}
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

function SourceLink({ scenario }: { scenario: SimScenario }) {
  const ref = scenario.sourceReference;
  if (!ref) return null;
  return ref.url ? (
    <a
      href={ref.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-block text-[11px] text-primary underline underline-offset-2"
    >
      Źródło: {ref.label}
    </a>
  ) : (
    <span className="mt-2 inline-block text-[11px] text-muted-foreground">Źródło: {ref.label}</span>
  );
}

function BriefingScreen({
  scenario,
  onReady,
  onShuffle,
  poolSize,
}: {
  scenario: SimScenario;
  onReady: () => void;
  onShuffle: () => void;
  poolSize: number;
}) {
  const ctx = scenario.context;
  return (
    <div className="premium-flow iq-premium">
      <AppHeader title="BallWise IQ" subtitle="Mikrosymulacje decyzji boiskowych." />
      <div className="space-y-3 px-5">
        <div className="soft-card p-5">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
            {TOPIC_LABELS[scenario.topic]}
          </span>
          <h2 className="mt-3 text-base font-bold text-foreground">{scenario.title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{scenario.brief}</p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {ctx.minute}' · {ctx.scoreline} · {ctx.phase} · {ctx.positionLabel}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{ctx.weightsNote}</p>
          <SourceLink scenario={scenario} />
          <button
            onClick={onReady}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary p-3.5 text-sm font-bold uppercase tracking-wide text-primary-foreground active:scale-[0.99]"
          >
            <Play className="h-4 w-4" /> Jestem gotowy
          </button>
          <button
            onClick={onShuffle}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary p-3 text-[13px] font-semibold text-foreground active:scale-[0.99]"
          >
            <Shuffle className="h-4 w-4" /> Inna sytuacja ({poolSize})
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
  onVariant: (v: ReplayVariant) => void;
  onReplay: () => void;
  onEdit: () => void;
  onNext: () => void;
}) {
  const done = step >= REPLAY_STEPS.length - 1;
  return (
    <div className="motion-enter">
      {hasAlternative && (
        <div
          className="flex gap-1 rounded-xl bg-secondary/70 p-1"
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
                "min-h-11 flex-1 rounded-lg text-[12px] font-semibold transition-colors " +
                (variant === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <h2 className="mt-3 text-[17px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
        {view.label}
      </h2>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground" aria-live="polite">
        {REPLAY_STEPS.map((label, i) => (
          <span key={label} className={i === step ? "text-foreground" : undefined}>
            {i > 0 && " → "}
            {label}
          </span>
        ))}
      </p>

      {done && (
        <div className="mt-3 rounded-xl border border-border/80 bg-secondary/55 px-3 py-2.5">
          {variant === "alt" ? (
            <dl className="space-y-2 text-[12px] leading-snug">
              {view.changed && (
                <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <dt className="font-semibold text-foreground">Co zmienić</dt>
                  <dd className="text-muted-foreground">{view.changed}</dd>
                </div>
              )}
              <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                <dt className="font-semibold text-foreground">Skutek</dt>
                <dd className="text-muted-foreground">{view.outcome.consequence}</dd>
              </div>
            </dl>
          ) : (
            <dl className="space-y-2 text-[12px] leading-snug">
              {lessons.map((lesson) => (
                <div key={lesson.key} className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <dt className="font-semibold text-foreground">{lesson.label}</dt>
                  <dd className="text-muted-foreground">{lesson.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!done}
        className="motion-press mt-3 min-h-12 w-full rounded-xl bg-primary p-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-40"
      >
        Następna sytuacja
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="motion-press flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-secondary text-[12px] font-semibold text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" /> Zmień decyzję
        </button>
        <button
          type="button"
          onClick={onReplay}
          className="motion-press flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-secondary text-[12px] font-semibold text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Powtórz
        </button>
      </div>
    </div>
  );
}
