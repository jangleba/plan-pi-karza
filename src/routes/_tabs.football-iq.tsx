import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Brain, Eye, Pencil, Play, RotateCcw, Shuffle, UserRound } from "lucide-react";

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
  closestScenarioActionId,
  planActionPath,
  planSummary,
  toolMovesBall,
  toolMovesActor,
  toolNeedsActor,
  type IQPlanAction,
  type IQPlannerCategory,
  type IQPlannerPoint,
  type IQPlannerTool,
} from "@/lib/football-iq/planner";

import type { SimResult, SimScenario, SimStage } from "@/lib/football-iq/simulation/types";
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

const REPLAY_STEPS = ["Ruch", "Okno", "Podanie"];

function Simulation({ group, level }: { group: IQPositionGroup; level?: Level }) {
  const pool = useMemo(() => scenariosForPosition(group, level), [group, level]);
  const [scenarioId, setScenarioId] = useState(pool[0].id);
  const scenario: SimScenario = useMemo(
    () => pool.find((s) => s.id === scenarioId) ?? pool[0],
    [pool, scenarioId],
  );

  /** Tory rozwinięte do 6 klatek kluczowych — wspólna choreografia silnika. */
  const simActors = useMemo(() => choreograph(scenario), [scenario]);

  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<SimStage>("observation");
  const [runId, setRunId] = useState(0);
  /** Pierwsze odtworzenie jest krótkie i czytelne — bez sztucznego spowalniania. */
  const [rate, setRate] = useState(1.15);
  const [t, setT] = useState(0);
  const [observationDone, setObservationDone] = useState(false);
  const [timingMs, setTimingMs] = useState<number | null>(null);
  const [selfPoint, setSelfPoint] = useState({ x: 58, y: 97 });
  const [result, setResult] = useState<SimResult | null>(null);
  const [replayStep, setReplayStep] = useState(0);
  const [plannerCategory, setPlannerCategory] = useState<IQPlannerCategory>("ball");
  const [plannerTool, setPlannerTool] = useState<IQPlannerTool>("pass");
  const [plan, setPlan] = useState<IQPlanAction[]>([]);
  const [redoPlan, setRedoPlan] = useState<IQPlanAction[]>([]);
  const [replayPlan, setReplayPlan] = useState<IQPlanAction[]>([]);
  const [selectedActorId, setSelectedActorId] = useState<string>();
  const [planProgress, setPlanProgress] = useState(0);

  const startRef = useRef(0);
  const scenarioRef = useRef(scenario.id);

  const resetRun = useCallback(
    (nextRate: number) => {
      const self = simActors.find((a) => a.kind === "self");
      const start = self ? actorAt(self.path, 0) : { x: 58, y: 97 };
      setResult(null);
      setTimingMs(null);
      setT(0);
      setObservationDone(false);
      setReplayStep(0);
      setSelfPoint(start);
      setRate(nextRate);
      setStage("observation");
      setPlan([]);
      setRedoPlan([]);
      setReplayPlan([]);
      setSelectedActorId(undefined);
      setPlanProgress(0);
      setRunId((i) => i + 1);
    },
    [simActors],
  );

  useEffect(() => {
    if (scenarioRef.current === scenario.id) return;
    scenarioRef.current = scenario.id;
    if (started) resetRun(1.15);
  }, [scenario.id, started, resetRun]);

  // Krótka obserwacja przechodzi prosto do decyzji. Nie zatrzymujemy gracza na dwóch
  // dodatkowych ekranach wyboru zawodnika i oglądania reakcji.
  useEffect(() => {
    if (!started || stage !== "observation" || observationDone) return;
    let raf = 0;
    startRef.current = performance.now();
    const total = Math.min(3600, scenario.observationMs / Math.max(1, rate));
    const tick = (now: number) => {
      const p = Math.min(1, (now - startRef.current) / total);
      setT(p);
      if (p >= 1) {
        setObservationDone(true);
        const bestWindow = [...scenario.timingWindows].sort((a, b) => b.quality - a.quality)[0];
        const idealMs = bestWindow
          ? Math.round((bestWindow.fromMs + bestWindow.toMs) / 2)
          : Math.round(scenario.observationMs * 0.62);
        const idealT = Math.min(1, idealMs / Math.max(1, scenario.observationMs));
        const self = simActors.find((actor) => actor.kind === "self");
        if (self) {
          setSelfPoint(actorAt(self.path, idealT));
          setSelectedActorId(self.id);
        }
        setTimingMs(idealMs);
        setStage("decision");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, stage, runId, observationDone, scenario, simActors, rate]);

  const choiceBase = useMemo(
    () => ({
      timingMs,
      x: selfPoint.x,
      y: selfPoint.y,
      angleDeg: 0,
      foot: "right" as const,
    }),
    [selfPoint.x, selfPoint.y, timingMs],
  );

  const currentReaction = () => evaluate(scenario, { ...choiceBase, actionId: null }).reaction;

  // Kluczowy rywal = ten, który reaguje na nasz moment startu.
  const reactionForView = result?.reaction ?? currentReaction();
  const keyOpponentId = reactionForView.moves[0]?.actorId;

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

  // Pozycje zawodników w bieżącej fazie.
  const actors: SimPitchActor[] = useMemo(() => {
    const frozenT = stage === "observation" ? t : 1;
    const applyReaction = stage === "replay" && replayStep >= 1;
    const baseActors = simActors.map((a) => {
      const base = actorAt(a.path, frozenT);
      let { x, y } = base;
      const move = applyReaction
        ? reactionForView.moves.find((m) => m.actorId === a.id)
        : undefined;
      if (move) {
        x = move.x;
        y = move.y;
      }
      if (a.kind === "self" && stage !== "observation") {
        x = selfPoint.x;
        y = selfPoint.y;
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

    return stage === "replay" && replayPlan.length
      ? applyPlanToActors(baseActors, replayPlan, planProgress)
      : baseActors;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stage,
    t,
    selfPoint,
    result,
    simActors,
    replayStep,
    carrierId,
    keyOpponentId,
    replayPlan,
    planProgress,
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
    [originForTool, plannerTool, selectedActor],
  );

  const addPlanAction = useCallback(
    (point: IQPlannerPoint) => {
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
        if (!toolMovesActor(plannerTool) || !selectedActor) {
          return [...current, action];
        }
        return [
          ...current.filter(
            (item) => !(item.actorId === selectedActor.id && toolMovesActor(item.tool)),
          ),
          action,
        ];
      });
      setRedoPlan([]);
    },
    [originForTool, plan.length, plannerTool, selectedActor],
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

  const playPlan = useCallback(() => {
    if (!plan.length) return;
    const snapshot = plan.map((action) => ({ ...action }));
    const actionId = closestScenarioActionId(snapshot, scenario.actions);
    setResult(evaluate(scenario, { ...choiceBase, actionId }));
    setReplayPlan(snapshot);
    setReplayStep(0);
    setPlanProgress(0);
    setStage("replay");
  }, [choiceBase, plan, scenario]);

  useEffect(() => {
    if (stage !== "replay" || !replayPlan.length) return;
    let raf = 0;
    const startedAt = performance.now();
    const duration = 1550;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setPlanProgress(eased);
      setReplayStep(progress < 0.42 ? 0 : progress < 0.82 ? 1 : 2);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, replayPlan]);

  const paths: SimPitchPath[] = [];
  const visiblePlan = stage === "replay" ? replayPlan : stage === "decision" ? plan : [];
  paths.push(...visiblePlan.map((action, index) => planActionPath(action, index + 1)));
  const showReactionPath = stage === "replay" && replayStep === 1;
  const reactionPathProgress = 1;
  if (showReactionPath && keyOpponentId && reactionPathProgress > 0.08) {
    const keyActor = simActors.find((actor) => actor.id === keyOpponentId);
    const keyMove = reactionForView.moves.find((move) => move.actorId === keyOpponentId);
    if (keyActor && keyMove) {
      const start = actorAt(keyActor.path, 1);
      paths.push({
        points: [
          start,
          {
            x: start.x + (keyMove.x - start.x) * reactionPathProgress,
            y: start.y + (keyMove.y - start.y) * reactionPathProgress,
          },
        ],
        variant: "reaction",
      });
    }
  }
  if (stage === "replay" && result && replayStep >= 2 && !replayPlan.length) {
    if (result.outcome.path) {
      paths.push({ points: result.outcome.path, variant: "user" });
    }
    if (result.alternative?.outcome.path) {
      paths.push({ points: result.alternative.outcome.path, variant: "alt" });
    }
  }

  if (!started) {
    return (
      <BriefingScreen
        scenario={scenario}
        onReady={() => {
          resetRun(1.15);
          setStarted(true);
        }}
        onShuffle={() => {
          const i = pool.findIndex((s) => s.id === scenario.id);
          const next = pool[(i + 1) % pool.length];
          setScenarioId(next.id);
        }}
        poolSize={pool.length}
      />
    );
  }

  return (
    <div
      className="premium-flow iq-premium flex min-h-0 flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 5.75rem - env(safe-area-inset-bottom))" }}
    >
      <header className="shrink-0 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[25px] font-medium tracking-[-0.045em] text-foreground">
              Football IQ
            </h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Sytuacja {pool.findIndex((item) => item.id === scenario.id) + 1} / {pool.length}
            </p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-[11px] font-semibold text-foreground">
            {stage === "replay" ? "Zrozum" : stage === "decision" ? "Wybierz" : "Zobacz"}
          </span>
        </div>
        <div className="mt-3 border-t border-border/70 pt-3">
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            {scenario.title}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {stage === "replay"
              ? "Zobacz, co otworzyło okno i jaki był skutek decyzji."
              : scenario.brief}
          </p>
        </div>
      </header>

      <div className="min-h-[clamp(12rem,37dvh,17rem)] flex-1 overflow-hidden bg-card">
        <SimPitch25D
          actors={actors}
          paths={paths}
          pulse={stage === "observation" && !observationDone}
          selectedActorId={stage === "decision" ? selectedActorId : undefined}
          highlightedActorId={stage === "replay" && replayStep === 1 ? keyOpponentId : undefined}
          selectableKinds={stage === "decision" ? ["self", "mate"] : undefined}
          onActorSelect={stage === "decision" ? setSelectedActorId : undefined}
          onPlanTarget={stage === "decision" ? addPlanAction : undefined}
          makePlannerPreview={stage === "decision" ? plannerPreview : undefined}
        />
      </div>

      <div className="max-h-[44dvh] shrink-0 overflow-y-auto overscroll-contain px-5 pb-3 pt-3">
        {stage === "observation" && (
          <div className="motion-enter">
            <div className="h-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-100"
                style={{ width: t * 100 + "%" }}
              />
            </div>
            <p className="mt-3 text-[15px] font-semibold text-foreground">
              Obserwuj ruch bez podpowiedzi
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Za chwilę wybierzesz zagranie. Szukaj ruchu, który otwiera przestrzeń.
            </p>
          </div>
        )}

        {stage === "decision" && (
          <TacticalPlannerControls
            category={plannerCategory}
            tool={plannerTool}
            plan={plan}
            selectedActorLabel={
              selectedActor?.label ??
              (selectedActor?.kind === "self" ? "Ty" : selectedActor ? "Partner" : undefined)
            }
            canUndo={Boolean(plan.length)}
            canRedo={Boolean(redoPlan.length)}
            onCategory={(category) => {
              setPlannerCategory(category);
              const firstTool = {
                ball: "pass",
                movement: "run",
                defending: "press",
                reading: "scan",
              } satisfies Record<IQPlannerCategory, IQPlannerTool>;
              setPlannerTool(firstTool[category]);
            }}
            onTool={setPlannerTool}
            onUndo={undoPlan}
            onRedo={restorePlan}
            onClear={() => {
              setPlan([]);
              setRedoPlan([]);
            }}
            onPlay={playPlan}
          />
        )}

        {stage === "replay" &&
          result &&
          (replayPlan.length ? (
            <PlanReplayPanel
              plan={replayPlan}
              result={result}
              ready={replayStep >= 2}
              onEdit={() => {
                setResult(null);
                setReplayPlan([]);
                setPlanProgress(0);
                setReplayStep(0);
                setStage("decision");
              }}
              onNext={() => {
                const index = pool.findIndex((item) => item.id === scenario.id);
                setResult(null);
                setT(0);
                setObservationDone(false);
                setStage("observation");
                setScenarioId(pool[(index + 1) % pool.length].id);
              }}
            />
          ) : (
            <ReplayPanel
              result={result}
              step={replayStep}
              onStep={setReplayStep}
              onRestart={() => resetRun(1.15)}
              onNext={() => {
                const index = pool.findIndex((item) => item.id === scenario.id);
                setResult(null);
                setT(0);
                setObservationDone(false);
                setStage("observation");
                setScenarioId(pool[(index + 1) % pool.length].id);
              }}
            />
          ))}
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

function PlanReplayPanel({
  plan,
  result,
  ready,
  onEdit,
  onNext,
}: {
  plan: IQPlanAction[];
  result: SimResult;
  ready: boolean;
  onEdit: () => void;
  onNext: () => void;
}) {
  const summary = planSummary(plan);
  const lessons = [
    { label: "Sygnał", text: summary.signal, Icon: Eye },
    { label: "Decyzja", text: summary.decision, Icon: Brain },
    { label: "Efekt", text: summary.effect, Icon: BarChart3 },
  ];

  return (
    <div className="motion-enter">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
        Analiza planu · {plan.length} {plan.length === 1 ? "akcja" : "akcji"}
      </p>
      <h2 className="mt-1 text-[19px] font-semibold leading-tight tracking-[-0.03em] text-foreground">
        {summary.title}
      </h2>

      <div className="mt-3 grid grid-cols-3 divide-x divide-border/80 border-y border-border/70 py-3">
        {lessons.map(({ label, text, Icon }) => (
          <div key={label} className="px-2 text-center first:pl-0 last:pr-0">
            <span className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <p className="mt-1.5 text-[10px] font-semibold text-foreground">{label}</p>
            <p className="mt-1 text-[9px] leading-snug text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>

      {ready && (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">Silnik sytuacji: </span>
          {result.outcome.consequence}
        </p>
      )}

      <div className="mt-3 grid grid-cols-[0.8fr_1.2fr] gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="motion-press flex items-center justify-center gap-1.5 rounded-xl bg-secondary p-3 text-[12px] font-semibold text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" /> Zmień plan
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!ready}
          className="motion-press rounded-xl bg-primary p-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          Następna sytuacja
        </button>
      </div>
    </div>
  );
}

function ReplayPanel({
  result,
  step,
  onStep,
  onRestart,
  onNext,
}: {
  result: SimResult;
  step: number;
  onStep: (s: number) => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (step >= REPLAY_STEPS.length - 1) return;
    const id = window.setTimeout(() => onStep(step + 1), 850);
    return () => window.clearTimeout(id);
  }, [step, onStep]);

  const stepText =
    step === 0
      ? result.feedback.find((item) => item.key === "timing")?.text
      : step === 1
        ? result.reaction.description
        : result.outcome.consequence;
  const selectedLabel = result.action?.label ?? "Brak decyzji";
  const timing = result.feedback.find((item) => item.key === "timing")?.text;
  const space = result.feedback.find((item) => item.key === "space")?.text;
  const consequence = result.feedback.find((item) => item.key === "consequence")?.text;

  return (
    <div className="motion-enter">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
        Twój wybór
      </p>
      <h2 className="mt-1 text-[21px] font-medium leading-tight tracking-[-0.035em] text-foreground">
        {selectedLabel}
      </h2>
      <p className="mt-1.5 min-h-10 text-[12px] leading-relaxed text-muted-foreground">
        {stepText}
      </p>

      <div className="mt-3 grid grid-cols-3 border-y border-border/70">
        {REPLAY_STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onStep(i)}
            className={
              "relative py-2.5 text-[11px] font-semibold transition-colors " +
              (i === step ? "text-foreground" : "text-muted-foreground")
            }
          >
            {label}
            {i === step && (
              <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {step >= 2 && result.alternative && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">
            Alternatywa: {result.alternative.action.label}.
          </span>{" "}
          {result.alternative.changed}
        </p>
      )}

      {step >= 2 && (
        <div className="mt-3 rounded-xl border border-border/80 bg-secondary/55 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
            Zabierz na boisko
          </p>
          <dl className="mt-2 space-y-2 text-[11px] leading-snug">
            {timing && (
              <div className="grid grid-cols-[4.5rem_1fr] gap-2">
                <dt className="font-semibold text-foreground">Kiedy</dt>
                <dd className="text-muted-foreground">{timing}</dd>
              </div>
            )}
            {space && (
              <div className="grid grid-cols-[4.5rem_1fr] gap-2">
                <dt className="font-semibold text-foreground">Zauważ</dt>
                <dd className="text-muted-foreground">{space}</dd>
              </div>
            )}
            {consequence && (
              <div className="grid grid-cols-[4.5rem_1fr] gap-2">
                <dt className="font-semibold text-foreground">Skutek</dt>
                <dd className="text-muted-foreground">{consequence}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={step < 2}
        className="motion-press mt-3 w-full rounded-xl bg-primary p-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-40"
      >
        Następna sytuacja
      </button>
      <button
        type="button"
        onClick={onRestart}
        className="mt-2 flex w-full items-center justify-center gap-2 py-1 text-[11px] font-medium text-muted-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Obejrzyj jeszcze raz
      </button>
    </div>
  );
}
