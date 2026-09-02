import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Shuffle, UserRound } from "lucide-react";

import { AppHeader } from "@/components/loadwise/ui";
import {
  SimPitch,
  type SimPitchActor,
  type SimPitchPath,
} from "@/components/football-iq/SimPitch";
import { SimPitch25D } from "@/components/football-iq/SimPitch25D";
import { useLoadwise } from "@/lib/loadwise/store";
import { toIQPositionGroup } from "@/lib/football-iq/positionMapping";
import { scenariosForPosition } from "@/lib/football-iq/simulation/scenarios";
import { TOPIC_LABELS } from "@/lib/football-iq/simulation/scenarioKit";
import { actorAt, evaluate, facingAt } from "@/lib/football-iq/simulation/engine";
import { choreograph } from "@/lib/football-iq/simulation/choreography";

import type {
  SimResult,
  SimScenario,
  SimStage,
  SimVerdict,
} from "@/lib/football-iq/simulation/types";
import type { IQPositionGroup } from "@/lib/football-iq/types";

export const Route = createFileRoute("/_tabs/football-iq")({
  component: FootballIQScreen,
});

function FootballIQScreen() {
  const { state } = useLoadwise();
  const group = toIQPositionGroup(state.profile?.position);
  if (!group) return <NoPositionScreen />;
  return <Simulation group={group} />;
}

function NoPositionScreen() {
  const navigate = useNavigate();
  return (
    <div>
      <AppHeader
        title="Loadwise IQ"
        subtitle="Mikrosymulacje decyzji boiskowych."
      />
      <div className="px-5">
        <div className="soft-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" /> Brak pozycji w profilu
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            Sytuacje są dopasowane do pozycji z profilu. Uzupełnij pozycję, aby
            korzystać z Loadwise IQ.
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

const STAGE_TITLE: Record<SimStage, string> = {
  observation: "Obserwacja",
  reaction: "Reakcja rywala",
  decision: "Decyzja",
  replay: "Replay",
};

const STAGE_HINT: Record<SimStage, string> = {
  observation: "Dotknij boiska w momencie, w którym zaczynasz ruch.",
  reaction: "Rywal reaguje na Twój moment startu.",
  decision: "Wybierz działanie, zanim piłka dojdzie.",
  replay: "Twoja decyzja i jedna lepsza alternatywa.",
};

const VERDICT_CLASS: Record<SimVerdict, string> = {
  good: "bg-primary/10 text-primary",
  mixed: "bg-secondary text-foreground",
  poor: "bg-destructive/10 text-destructive",
};

const VERDICT_LABEL: Record<SimVerdict, string> = {
  good: "Dobrze",
  mixed: "Do poprawy",
  poor: "Błąd",
};

const REPLAY_STEPS = ["Twój moment", "Kluczowy ruch rywala", "Konsekwencja"];

function Simulation({ group }: { group: IQPositionGroup }) {
  const pool = useMemo(() => scenariosForPosition(group), [group]);
  const [scenarioId, setScenarioId] = useState(pool[0].id);
  const scenario: SimScenario = useMemo(
    () => pool.find((s) => s.id === scenarioId) ?? pool[0],
    [pool, scenarioId],
  );

  /** Tory rozwinięte do 6 klatek kluczowych — wspólna choreografia silnika. */
  const simActors = useMemo(() => choreograph(scenario), [scenario]);

  const [started, setStarted] = useState(false);
  /** Pierwsza obserwacja: bez strzałek i podpowiedzi. */
  const [seenOnce, setSeenOnce] = useState(false);
  const [stage, setStage] = useState<SimStage>("observation");
  const [runId, setRunId] = useState(0);
  /** Pierwsze odtworzenie zawsze w 0,75×. */
  const [rate, setRate] = useState(0.75);
  const [t, setT] = useState(0);
  const [observationDone, setObservationDone] = useState(false);
  const [timingMs, setTimingMs] = useState<number | null>(null);
  const [selfPoint, setSelfPoint] = useState({ x: 58, y: 97 });
  const [reactionT, setReactionT] = useState(0);
  const [reactionDone, setReactionDone] = useState(false);
  const [decisionLeft, setDecisionLeft] = useState(scenario.decisionMs);
  const [result, setResult] = useState<SimResult | null>(null);
  const [replayStep, setReplayStep] = useState(0);

  const startRef = useRef(0);

  const resetRun = useCallback(
    (nextRate: number) => {
      const self = simActors.find((a) => a.kind === "self");
      const start = self ? actorAt(self.path, 0) : { x: 58, y: 97 };
      setResult(null);
      setTimingMs(null);
      setT(0);
      setObservationDone(false);
      setReactionT(0);
      setReactionDone(false);
      setReplayStep(0);
      setSelfPoint(start);
      setDecisionLeft(scenario.decisionMs);
      setRate(nextRate);
      setStage("observation");
      setRunId((i) => i + 1);
    },
    [scenario, simActors],
  );

  // Faza obserwacji — animacja w czasie rzeczywistym, bez automatycznego przejścia dalej.
  useEffect(() => {
    if (!started || stage !== "observation" || observationDone) return;
    let raf = 0;
    startRef.current = performance.now();
    const total = scenario.observationMs / rate;
    const tick = (now: number) => {
      const p = Math.min(1, (now - startRef.current) / total);
      setT(p);
      if (p >= 1) {
        setObservationDone(true);
        setSeenOnce(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, stage, runId, observationDone, scenario.observationMs, rate]);

  // Faza reakcji rywala — animacja kończy się przyciskiem, nie automatem.
  useEffect(() => {
    if (stage !== "reaction") return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / (900 / rate));
      setReactionT(p);
      if (p >= 1) {
        setReactionDone(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, rate]);

  // Okno decyzyjne — startuje dopiero po świadomym przejściu do decyzji.
  useEffect(() => {
    if (stage !== "decision") return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const left = scenario.decisionMs - (now - start);
      setDecisionLeft(Math.max(0, left));
      if (left <= 0) {
        finish(null);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  function startMove() {
    if (!started || stage !== "observation" || observationDone) return;
    const elapsed = (performance.now() - startRef.current) * rate;
    const ms = Math.round(Math.min(scenario.observationMs, elapsed));
    setTimingMs(ms);
    const p = Math.min(1, ms / scenario.observationMs);
    setT(p);
    setSeenOnce(true);
    const self = simActors.find((a) => a.kind === "self")!;
    setSelfPoint(actorAt(self.path, p));
    setReactionT(0);
    setReactionDone(false);
    setStage("reaction");
  }

  const choiceBase = {
    timingMs,
    x: selfPoint.x,
    y: selfPoint.y,
    angleDeg: 0,
    foot: "right" as const,
  };

  function finish(actionId: string | null) {
    setResult(evaluate(scenario, { ...choiceBase, actionId }));
    setReplayStep(0);
    setStage("replay");
  }

  const currentReaction = () =>
    evaluate(scenario, { ...choiceBase, actionId: null }).reaction;

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
    const applyReaction =
      stage === "reaction" ||
      stage === "decision" ||
      (stage === "replay" && replayStep >= 1);
    return simActors.map((a) => {
      const base = actorAt(a.path, frozenT);
      let { x, y } = base;
      const move = applyReaction
        ? reactionForView.moves.find((m) => m.actorId === a.id)
        : undefined;
      if (move) {
        const k = stage === "reaction" ? reactionT : 1;
        x = base.x + (move.x - base.x) * k;
        y = base.y + (move.y - base.y) * k;
      }
      if (a.kind === "self" && stage !== "observation") {
        x = selfPoint.x;
        y = selfPoint.y;
      }
      return {
        id: a.id,
        kind: a.kind,
        label: a.label,
        showLabel:
          a.kind === "self" || a.id === carrierId || a.id === keyOpponentId,
        x,
        y,
        facingDeg: facingAt(a.path, frozenT),
      };
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, t, reactionT, selfPoint, result, simActors, replayStep, carrierId, keyOpponentId]);

  const paths: SimPitchPath[] = [];
  if (stage === "replay" && result && replayStep >= 2) {
    if (result.outcome.path) {
      paths.push({ points: result.outcome.path, variant: "user" });
    }
    if (result.alternative?.outcome.path) {
      paths.push({ points: result.alternative.outcome.path, variant: "alt" });
    }
  }

  const ctx = scenario.context;
  /** 2.5D wdrożone na razie tylko dla scenariusza wzorcowego; reszta na starym rendererze. */
  const use25D = scenario.id === "shadow-receive-6";


  if (!started) {
    return (
      <BriefingScreen
        scenario={scenario}
        onReady={() => {
          resetRun(0.75);
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
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col overflow-hidden">
      {/* Pasek kontekstu */}
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {ctx.minute}' · {ctx.scoreline} · {ctx.positionLabel}
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
          {STAGE_TITLE[stage]}
        </span>
      </div>

      {/* Karta instrukcji */}
      <div className="px-4">
        <div className="soft-card px-3 py-2.5">
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            {scenario.title}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            {stage === "observation"
              ? scenario.brief
              : stage === "replay"
                ? REPLAY_STEPS[replayStep]
                : STAGE_HINT[stage]}
          </p>
        </div>
      </div>

      {/* Boisko — replay na pełnej szerokości */}
      <div
        className={`min-h-0 flex-1 py-2 ${stage === "replay" ? "px-0" : "px-4"}`}
        onPointerDown={stage === "observation" ? startMove : undefined}
      >
        <div
          className={`h-full overflow-hidden ${
            stage === "replay" ? "px-0" : "soft-card p-1.5"
          }`}
        >
          {use25D ? (
            <SimPitch25D
              actors={actors}
              paths={paths}
              pulse={stage === "observation" && !observationDone && seenOnce}
            />
          ) : (
            <SimPitch
              actors={actors}
              paths={paths}
              pulse={stage === "observation" && !observationDone && seenOnce}
            />
          )}

        </div>
      </div>

      {/* Jedna aktualna akcja */}
      <div className="px-4 pb-2">
        {stage === "observation" && (
          <div className="soft-card p-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary"
                style={{ width: `${t * 100}%` }}
              />
            </div>
            {observationDone ? (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => resetRun(rate)}
                  className="rounded-xl bg-secondary px-3 py-2.5 text-[12px] font-semibold text-foreground"
                >
                  Odtwórz ponownie
                </button>
                <button
                  onClick={() => {
                    setTimingMs(null);
                    setReactionT(0);
                    setReactionDone(false);
                    setStage("reaction");
                  }}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-[13px] font-bold uppercase tracking-wide text-primary-foreground active:scale-[0.99]"
                >
                  Przejdź do decyzji
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-foreground">
                  Dotknij boiska w momencie startu
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resetRun(rate === 0.75 ? 1 : 0.75);
                  }}
                  className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground"
                >
                  {rate === 0.75 ? "0,75×" : "1,0×"}
                </button>
              </div>
            )}
          </div>
        )}

        {stage === "reaction" && (
          <div className="soft-card p-3">
            <p className="text-center text-[12px] font-semibold text-muted-foreground">
              {reactionDone ? reactionForView.description : "Rywal reaguje…"}
            </p>
            <button
              disabled={!reactionDone}
              onClick={() => setStage("decision")}
              className="mt-2 w-full rounded-xl bg-primary p-3 text-[13px] font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-40 active:scale-[0.99]"
            >
              Podejmij decyzję
            </button>
          </div>
        )}

        {stage === "decision" && (
          <div className="soft-card p-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${(decisionLeft / scenario.decisionMs) * 100}%`,
                }}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {scenario.actions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => finish(a.id)}
                  className="rounded-xl bg-secondary px-2 py-3 text-[12px] font-semibold text-foreground active:scale-[0.99]"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "replay" && result && (
          <ReplayPanel
            result={result}
            step={replayStep}
            onStep={setReplayStep}
            onRestart={() => resetRun(1)}
            onNext={() => {
              const i = pool.findIndex((s) => s.id === scenario.id);
              setScenarioId(pool[(i + 1) % pool.length].id);
              setStarted(false);
            }}
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
    <span className="mt-2 inline-block text-[11px] text-muted-foreground">
      Źródło: {ref.label}
    </span>
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
    <div>
      <AppHeader
        title="Loadwise IQ"
        subtitle="Mikrosymulacje decyzji boiskowych."
      />
      <div className="space-y-3 px-5">
        <div className="soft-card p-5">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
            {TOPIC_LABELS[scenario.topic]}
          </span>
          <h2 className="mt-3 text-base font-bold text-foreground">
            {scenario.title}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {scenario.brief}
          </p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {ctx.minute}' · {ctx.scoreline} · {ctx.phase} · {ctx.positionLabel}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {ctx.weightsNote}
          </p>
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
  const stepText =
    step === 0
      ? `${result.action ? result.action.label : "Brak decyzji"} — moment startu i Twoje ustawienie.`
      : step === 1
        ? result.reaction.description
        : result.outcome.consequence;

  return (
    <div className="soft-card max-h-[38vh] overflow-y-auto p-3">
      <div className="flex gap-1.5">
        {REPLAY_STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => onStep(i)}
            className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold ${
              i === step
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
        {stepText}
      </p>

      {step >= 2 && (
        <>
          <div className="mt-2 space-y-1.5">
            {result.feedback.map((f) => (
              <div key={f.key} className="rounded-xl bg-secondary/60 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground">
                    {f.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${VERDICT_CLASS[f.verdict]}`}
                  >
                    {VERDICT_LABEL[f.verdict]}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {f.text}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-xl bg-secondary p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lepsza alternatywa
            </div>
            {result.alternative ? (
              <>
                <p className="mt-1 text-[12px] font-semibold text-foreground">
                  {result.alternative.action.label}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                  {result.alternative.changed}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                Przy tej reakcji rywala Twoje rozwiązanie było najlepsze z
                dostępnych.
              </p>
            )}
          </div>
        </>
      )}

      <div className="mt-2 flex gap-2">
        {step < 2 ? (
          <button
            onClick={() => onStep(step + 1)}
            className="flex-1 rounded-xl bg-primary p-3 text-[13px] font-bold uppercase tracking-wide text-primary-foreground active:scale-[0.99]"
          >
            Dalej: {REPLAY_STEPS[step + 1]}
          </button>
        ) : (
          <>
            <button
              onClick={onRestart}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary p-3 text-[13px] font-semibold text-foreground active:scale-[0.99]"
            >
              <RotateCcw className="h-4 w-4" /> Powtórz
            </button>
            <button
              onClick={onNext}
              className="flex-1 rounded-xl bg-primary p-3 text-[13px] font-bold uppercase tracking-wide text-primary-foreground active:scale-[0.99]"
            >
              Następna
            </button>
          </>
        )}
      </div>
    </div>
  );
}
