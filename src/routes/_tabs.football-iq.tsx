import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Shuffle, UserRound } from "lucide-react";

import { AppHeader } from "@/components/loadwise/ui";
import type { SimPitchActor, SimPitchPath } from "@/components/football-iq/SimPitch";
import { SimPitch25D, type PitchPoint } from "@/components/football-iq/SimPitch25D";
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

const STAGE_TITLE: Record<SimStage, string> = {
  observation: "Obserwacja",
  reading: "Ustawienie · 1/4",
  reaction: "Reakcja · 2/4",
  decision: "Zagranie · 3/4",
  replay: "Skutek · 4/4",
};

const STAGE_HINT: Record<SimStage, string> = {
  observation: "Obserwuj układ i dotknij boiska, gdy widzisz moment na ruch.",
  reading: "Wskaż, gdzie chcesz znaleźć się po swoim ruchu.",
  reaction: "Przewidź, który rywal zareaguje i dokąd się przesunie.",
  decision: "Wybierz zagranie, zanim rywal zdąży skorygować ustawienie.",
  replay: "Porównaj swój zamiar, prognozę i rzeczywisty skutek.",
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

const DECISION_STEPS = ["Ustawienie", "Reakcja", "Zagranie", "Skutek"];
const REPLAY_STEPS = ["Twój zamiar", "Prognoza i reakcja", "Konsekwencja"];

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
  /** Pierwsza obserwacja: bez strzałek i podpowiedzi. */
  const [seenOnce, setSeenOnce] = useState(false);
  const [stage, setStage] = useState<SimStage>("observation");
  const [runId, setRunId] = useState(0);
  /** Naturalne tempo jest domyślne; 0,75× służy wyłącznie do powtórki. */
  const [rate, setRate] = useState(1);
  const [t, setT] = useState(0);
  const [observationDone, setObservationDone] = useState(false);
  const [timingMs, setTimingMs] = useState<number | null>(null);
  const [selfPoint, setSelfPoint] = useState({ x: 58, y: 97 });
  const [selfTarget, setSelfTarget] = useState<PitchPoint | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [predictionPoint, setPredictionPoint] = useState<PitchPoint | null>(null);
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
      setSelfTarget(null);
      setSelectedActorId(null);
      setPredictionPoint(null);
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
    setSelfTarget(null);
    setStage("reading");
  }

  const choiceBase = {
    timingMs,
    x: selfTarget?.x ?? selfPoint.x,
    y: selfTarget?.y ?? selfPoint.y,
    angleDeg: 0,
    foot: "right" as const,
  };

  function finish(actionId: string | null) {
    setResult(evaluate(scenario, { ...choiceBase, actionId }));
    setReplayStep(0);
    setStage("replay");
  }

  const predictedResult = useMemo(
    () => evaluate(scenario, { ...choiceBase, actionId: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario, timingMs, selfPoint.x, selfPoint.y, selfTarget?.x, selfTarget?.y],
  );

  // Rzeczywista reakcja wynika z ustawienia wybranego przez zawodnika.
  const reactionForView = result?.reaction ?? predictedResult.reaction;
  const keyOpponentId = reactionForView.moves[0]?.actorId;

  const actorName = (actorId: string | null | undefined) => {
    const actor = simActors.find((candidate) => candidate.id === actorId);
    if (!actor) return "zawodnik";
    return actor.label ?? (actor.kind === "opponent" ? "rywal" : "partner");
  };

  const actualMove = reactionForView.moves[0];
  const predictionDistance =
    predictionPoint && actualMove
      ? Math.hypot(predictionPoint.x - actualMove.x, predictionPoint.y - actualMove.y)
      : null;
  const predictionFeedback = selectedActorId
    ? selectedActorId !== keyOpponentId
      ? `Przewidziałeś ruch: ${actorName(selectedActorId)}. Kluczową reakcję wykonał ${actorName(keyOpponentId)}.`
      : predictionDistance !== null && predictionDistance <= 16
        ? `Trafnie przewidziałeś, kto zareaguje i w jakim kierunku się przesunie.`
        : `Dobrze wskazałeś rywala, ale jego rzeczywisty kierunek ruchu był inny.`
    : "Nie wskazałeś, który rywal zareaguje.";
  const intentSelection = selfTarget
    ? `Wybrałeś własny ruch. ${predictedResult.feedback.find((item) => item.key === "space")?.text ?? ""}`.trim()
    : "Nie wskazałeś docelowego ustawienia.";

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
    return simActors.map((a) => {
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
        const chosen = stage === "reading" ? selfPoint : (selfTarget ?? selfPoint);
        x = chosen.x;
        y = chosen.y;
      }
      return {
        id: a.id,
        kind: a.kind,
        label: a.label,
        showLabel:
          a.kind === "self" ||
          a.id === carrierId ||
          a.id === selectedActorId ||
          (stage === "replay" && replayStep >= 1 && a.id === keyOpponentId),
        x,
        y,
        facingDeg: facingAt(a.path, frozenT),
      };
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stage,
    t,
    selfPoint,
    selfTarget,
    result,
    simActors,
    replayStep,
    carrierId,
    keyOpponentId,
    selectedActorId,
    reactionForView.moves,
  ]);

  const paths: SimPitchPath[] = [];
  if (stage !== "observation" && selfTarget) {
    paths.push({
      points: [selfPoint, selfTarget],
      variant: "intent",
      label: "Twój ruch",
    });
  }

  const selectedActor = selectedActorId
    ? simActors.find((actor) => actor.id === selectedActorId)
    : undefined;
  if (
    selectedActor &&
    predictionPoint &&
    (stage === "reaction" || stage === "decision" || (stage === "replay" && replayStep <= 1))
  ) {
    paths.push({
      points: [actorAt(selectedActor.path, 1), predictionPoint],
      variant: "prediction",
      label: "Prognoza",
    });
  }

  const showReactionPath = stage === "replay" && replayStep >= 1;
  if (showReactionPath && keyOpponentId) {
    const keyActor = simActors.find((actor) => actor.id === keyOpponentId);
    const keyMove = reactionForView.moves.find((move) => move.actorId === keyOpponentId);
    if (keyActor && keyMove) {
      const start = actorAt(keyActor.path, 1);
      paths.push({
        points: [start, { x: keyMove.x, y: keyMove.y }],
        variant: "reaction",
        label: "Reakcja",
      });
    }
  }
  if (stage === "replay" && result && replayStep >= 2) {
    if (result.outcome.path) {
      paths.push({ points: result.outcome.path, variant: "user" });
    }
    if (result.alternative?.outcome.path) {
      paths.push({ points: result.alternative.outcome.path, variant: "alt" });
    }
  }

  const ctx = scenario.context;
  if (!started) {
    return (
      <BriefingScreen
        scenario={scenario}
        onReady={() => {
          resetRun(1);
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
      style={{
        height: "calc(100dvh - 5.75rem - env(safe-area-inset-bottom))",
      }}
    >
      {/* Pasek kontekstu */}
      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {ctx.minute}' · {ctx.scoreline} · {ctx.positionLabel}
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
          {STAGE_TITLE[stage]}
        </span>
      </div>

      {/* Cel nauki — widoczny stale, bez kolejnej ciężkiej karty. */}
      <div className="shrink-0 px-4 pb-1">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Cel sytuacji
        </p>
        <h1 className="mt-0.5 text-[17px] font-semibold leading-tight text-foreground">
          {scenario.title}
        </h1>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {stage === "observation"
            ? scenario.brief
            : stage === "replay"
              ? STAGE_HINT.replay
              : STAGE_HINT[stage]}
        </p>
      </div>

      {/* Boisko — replay na pełnej szerokości */}
      <div
        className={`min-h-[15rem] flex-1 py-2 ${stage === "replay" ? "px-0" : "px-3"}`}
        onPointerDown={stage === "observation" ? startMove : undefined}
      >
        <div
          className={`relative h-full overflow-hidden ${
            stage === "replay" ? "px-0" : "soft-card p-0.5"
          }`}
        >
          <SimPitch25D
            actors={actors}
            paths={paths}
            pulse={stage === "observation" && !observationDone && seenOnce}
            selectedActorId={selectedActorId ?? undefined}
            highlightedActorId={stage === "replay" && replayStep >= 1 ? keyOpponentId : undefined}
            selectableActorKinds={["opponent"]}
            onActorSelect={
              stage === "reaction"
                ? (actorId) => {
                    setSelectedActorId(actorId);
                    setPredictionPoint(null);
                  }
                : undefined
            }
            interactionEnabled={
              stage === "reading" || (stage === "reaction" && Boolean(selectedActorId))
            }
            interactionPoint={
              stage === "reading"
                ? (selfTarget ?? undefined)
                : stage === "reaction"
                  ? (predictionPoint ?? undefined)
                  : undefined
            }
            interactionVariant={stage === "reaction" ? "prediction" : "intent"}
            onInteractionPointChange={
              stage === "reading"
                ? setSelfTarget
                : stage === "reaction"
                  ? setPredictionPoint
                  : undefined
            }
          />
          <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2 rounded-full border border-border/60 bg-card/85 px-2.5 py-1 text-[9px] font-semibold text-muted-foreground shadow-sm backdrop-blur-md">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-primary" /> Ty
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-graphite" /> Zespół
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive/80" /> Rywal
            </span>
          </div>
        </div>
      </div>

      {/* Jedna aktualna akcja */}
      <div className="shrink-0 px-4 pb-3">
        {stage === "observation" && (
          <div className="soft-card p-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full bg-primary" style={{ width: `${t * 100}%` }} />
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
                    const self = simActors.find((actor) => actor.kind === "self");
                    if (self) setSelfPoint(actorAt(self.path, 1));
                    setSelfTarget(null);
                    setStage("reading");
                  }}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-[13px] font-bold uppercase tracking-wide text-primary-foreground active:scale-[0.99]"
                >
                  Zbuduj decyzję
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-foreground">
                  Dotknij, gdy rozpoczynasz swój ruch
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resetRun(rate === 0.75 ? 1 : 0.75);
                  }}
                  className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground"
                >
                  {rate === 0.75 ? "0,75×" : "1×"}
                </button>
              </div>
            )}
          </div>
        )}

        {stage === "reading" && (
          <div className="soft-card p-3">
            <DecisionStepper active={0} />
            <p className="mt-2 text-[13px] font-semibold text-foreground">
              Gdzie rozpoczynasz ruch?
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Dotknij boiska lub przeciągnij znacznik miejsca, w którym chcesz znaleźć się po ruchu.
            </p>
            <button
              disabled={!selfTarget}
              onClick={() => {
                setSelectedActorId(null);
                setPredictionPoint(null);
                setStage("reaction");
              }}
              className="mt-2 w-full rounded-xl bg-primary p-3 text-[13px] font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-40 active:scale-[0.99]"
            >
              {selfTarget ? "Zatwierdź ustawienie" : "Najpierw wskaż miejsce"}
            </button>
          </div>
        )}

        {stage === "reaction" && (
          <div className="soft-card p-3">
            <DecisionStepper active={1} />
            <p className="mt-2 text-[13px] font-semibold text-foreground">
              Kto zareaguje na Twój ruch?
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Dotknij rywala, a następnie przeciągnij punkt tam, gdzie według Ciebie się przesunie.
            </p>
            <button
              disabled={!selectedActorId || !predictionPoint}
              onClick={() => setStage("decision")}
              className="mt-2 w-full rounded-xl bg-primary p-3 text-[13px] font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-40 active:scale-[0.99]"
            >
              {selectedActorId && predictionPoint
                ? "Zatwierdź prognozę"
                : selectedActorId
                  ? "Wskaż kierunek rywala"
                  : "Najpierw wybierz rywala"}
            </button>
          </div>
        )}

        {stage === "decision" && (
          <div className="soft-card p-3">
            <DecisionStepper active={2} />
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${(decisionLeft / scenario.decisionMs) * 100}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[13px] font-semibold text-foreground">
              Co robisz po tej reakcji?
            </p>
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
            intentSelection={intentSelection}
            predictionFeedback={predictionFeedback}
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

function DecisionStepper({ active }: { active: number }) {
  return (
    <div className="grid grid-cols-4 gap-1" aria-label={`Etap ${active + 1} z 4`}>
      {DECISION_STEPS.map((label, index) => (
        <div key={label} className="min-w-0 text-center">
          <div
            className={`mx-auto grid h-5 w-5 place-items-center rounded-full border text-[9px] font-semibold ${
              index < active
                ? "border-primary bg-primary text-primary-foreground"
                : index === active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
            }`}
          >
            {index < active ? "✓" : index + 1}
          </div>
          <span
            className={`mt-0.5 block truncate text-[9px] ${
              index === active ? "font-semibold text-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
        </div>
      ))}
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
  result,
  intentSelection,
  predictionFeedback,
  step,
  onStep,
  onRestart,
  onNext,
}: {
  result: SimResult;
  intentSelection: string;
  predictionFeedback: string;
  step: number;
  onStep: (s: number) => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  const stepText =
    step === 0
      ? intentSelection
      : step === 1
        ? `${predictionFeedback} ${result.reaction.description}`
        : result.outcome.consequence;

  return (
    <div className="soft-card max-h-[38vh] overflow-y-auto p-3">
      <DecisionStepper active={3} />
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

      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{stepText}</p>

      {step >= 2 && (
        <>
          <div className="mt-2 space-y-1.5">
            {result.feedback.map((f) => (
              <div key={f.key} className="rounded-xl bg-secondary/60 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground">{f.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${VERDICT_CLASS[f.verdict]}`}
                  >
                    {VERDICT_LABEL[f.verdict]}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{f.text}</p>
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
                Przy tej reakcji rywala Twoje rozwiązanie było najlepsze z dostępnych.
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
