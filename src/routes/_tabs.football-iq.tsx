import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Play, RotateCcw, Shuffle, UserRound } from "lucide-react";

import { AppHeader } from "@/components/loadwise/ui";
import { SimPitch, type SimPitchActor, type SimPitchPath } from "@/components/football-iq/SimPitch";
import { useLoadwise } from "@/lib/loadwise/store";
import { toIQPositionGroup } from "@/lib/football-iq/positionMapping";
import { scenariosForPosition } from "@/lib/football-iq/simulation/scenarios";
import { TOPIC_LABELS } from "@/lib/football-iq/simulation/scenarioKit";
import {
  CRITERION_LABELS,
  actorAt,
  evaluate,
} from "@/lib/football-iq/simulation/engine";
import type {
  SimFoot,
  SimResult,
  SimScenario,
  SimStage,
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
        title="BallWise IQ"
        subtitle="Mikrosymulacje decyzji boiskowych."
      />
      <div className="px-5">
        <div className="soft-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" /> Brak pozycji w profilu
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            Sytuacje są dopasowane do pozycji z profilu. Uzupełnij pozycję, aby
            korzystać z BallWise IQ.
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
  timing: "Timing",
  position: "Pozycja i ciało",
  reaction: "Reakcja rywala",
  decision: "Decyzja",
  replay: "Replay",
};

const STAGE_HINT: Record<SimStage, string> = {
  observation: "Dotknij boiska w momencie, w którym zaczynasz ruch.",
  timing: "",
  position:
    "Przesuń swój znacznik, obróć uchwytem kierunek ciała i wybierz nogę przyjmującą.",
  reaction: "Rywal reaguje na Twoje ustawienie.",
  decision: "Wybierz działanie, zanim piłka dojdzie.",
  replay: "Twoja decyzja i jedna lepsza alternatywa.",
};

function Simulation({ group }: { group: IQPositionGroup }) {
  const pool = useMemo(() => scenariosForPosition(group), [group]);
  const [index, setIndex] = useState(0);
  const scenario: SimScenario = pool[index % pool.length];

  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<SimStage>("observation");
  const [runId, setRunId] = useState(0);
  /** Pierwsze odtworzenie zawsze w 0,75×. */
  const [rate, setRate] = useState(0.75);
  const [t, setT] = useState(0);
  const [observationDone, setObservationDone] = useState(false);
  const [timingMs, setTimingMs] = useState<number | null>(null);
  const [ghost, setGhost] = useState({ x: 58, y: 97, angleDeg: 30 });
  const [foot, setFoot] = useState<SimFoot>("right");
  const [reactionT, setReactionT] = useState(0);
  const [reactionDone, setReactionDone] = useState(false);
  const [decisionLeft, setDecisionLeft] = useState(scenario.decisionMs);
  const [result, setResult] = useState<SimResult | null>(null);
  const [replayAlt, setReplayAlt] = useState(false);

  const startRef = useRef(0);

  const resetRun = useCallback(
    (nextRate: number) => {
      setResult(null);
      setTimingMs(null);
      setT(0);
      setObservationDone(false);
      setReactionT(0);
      setReactionDone(false);
      setGhost({ x: 58, y: 97, angleDeg: 30 });
      setFoot("right");
      setDecisionLeft(scenario.decisionMs);
      setRate(nextRate);
      setStage("observation");
      setRunId((i) => i + 1);
    },
    [scenario.decisionMs],
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
    const self = scenario.actors.find((a) => a.kind === "self")!;
    const pos = actorAt(self.path, p);
    setGhost({ x: pos.x, y: pos.y, angleDeg: 30 });
    setStage("position");
  }

  function finish(actionId: string | null) {
    const r = evaluate(scenario, {
      timingMs,
      x: ghost.x,
      y: ghost.y,
      angleDeg: ghost.angleDeg,
      foot,
      actionId,
    });
    setResult(r);
    setReplayAlt(false);
    setStage("replay");
  }

  function currentReaction() {
    return evaluate(scenario, {
      timingMs,
      x: ghost.x,
      y: ghost.y,
      angleDeg: ghost.angleDeg,
      foot,
      actionId: null,
    }).reaction;
  }

  // Pozycje zawodników w bieżącej fazie.
  const actors: SimPitchActor[] = useMemo(() => {
    const frozenT = stage === "observation" ? t : 1;
    return scenario.actors.map((a) => {
      const base = actorAt(a.path, frozenT);
      let { x, y } = base;
      const move =
        result || stage === "reaction" || stage === "decision"
          ? (result?.reaction ?? currentReaction())?.moves.find(
              (m) => m.actorId === a.id,
            )
          : undefined;
      if (move) {
        const k = stage === "reaction" ? reactionT : 1;
        x = base.x + (move.x - base.x) * k;
        y = base.y + (move.y - base.y) * k;
      }
      if (a.kind === "self" && stage !== "observation") {
        return { id: a.id, kind: a.kind, label: a.label, x: ghost.x, y: ghost.y };
      }
      return { id: a.id, kind: a.kind, label: a.label, x, y };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, t, reactionT, ghost, result, scenario]);

  const paths: SimPitchPath[] = [];
  if (stage === "replay" && result) {
    if (result.outcome.path) {
      paths.push({ points: result.outcome.path, variant: "user" });
    }
    if (replayAlt && result.alternative?.outcome.path) {
      paths.push({ points: result.alternative.outcome.path, variant: "alt" });
    }
  }

  const ctx = scenario.context;

  if (!started) {
    return (
      <BriefingScreen
        scenario={scenario}
        onReady={() => {
          resetRun(0.75);
          setStarted(true);
        }}
        onShuffle={() => {
          setIndex((i) => (i + 1) % pool.length);
          resetRun(0.75);
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
            {stage === "observation" ? scenario.brief : STAGE_HINT[stage]}
          </p>
        </div>
      </div>

      {/* Boisko */}
      <div
        className="min-h-0 flex-1 px-4 py-2"
        onPointerDown={stage === "observation" ? startMove : undefined}
      >
        <div className="soft-card h-full overflow-hidden p-1.5">
          <SimPitch
            actors={actors}
            ghost={stage === "position" ? ghost : null}
            interactive={stage === "position"}
            onGhostMove={(x, y) => setGhost((g) => ({ ...g, x, y }))}
            onAngleChange={(deg) => setGhost((g) => ({ ...g, angleDeg: deg }))}
            paths={paths}
            pulse={stage === "observation" && !observationDone}
          />
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
                    setStage("position");
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
                    setRate((r) => (r === 0.75 ? 1 : 0.75));
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

        {stage === "position" && (
          <div className="soft-card p-3">
            <div className="flex gap-2">
              {(["left", "right"] as SimFoot[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFoot(f)}
                  className={`flex-1 rounded-xl py-2 text-[12px] font-semibold ${
                    foot === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {f === "left" ? "Przyjęcie lewą" : "Przyjęcie prawą"}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setReactionDone(false);
                setReactionT(0);
                setStage("reaction");
              }}
              className="mt-2 w-full rounded-xl bg-primary p-3 text-[13px] font-bold uppercase tracking-wide text-primary-foreground active:scale-[0.99]"
            >
              Zatwierdź ustawienie
            </button>
          </div>
        )}

        {stage === "reaction" && (
          <div className="soft-card p-3">
            <p className="text-center text-[12px] font-semibold text-muted-foreground">
              {reactionDone ? currentReaction().description : "Rywal reaguje…"}
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
                style={{ width: `${(decisionLeft / scenario.decisionMs) * 100}%` }}
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
            showAlt={replayAlt}
            onShowAlt={() => setReplayAlt(true)}
            onRestart={() => resetRun(1)}
            onNext={() => {
              setIndex((i) => (i + 1) % pool.length);
              resetRun(0.75);
              setStarted(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SourceBadge({ scenario }: { scenario: SimScenario }) {
  if (scenario.status === "sourced" && scenario.sourceReference) {
    return (
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        <BookOpen className="mr-1 inline h-3 w-3" />
        Źródło: {scenario.sourceReference.label}. Materiał nie jest zatwierdzony
        indywidualnie przez trenera eksperta.
      </p>
    );
  }
  return (
    <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
      <BookOpen className="mr-1 inline h-3 w-3" />
      Wersja robocza (draft) — bez źródła i bez akceptacji eksperta.
    </p>
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
      <AppHeader title="BallWise IQ" subtitle="Mikrosymulacje decyzji boiskowych." />
      <div className="space-y-3 px-5">
        <div className="soft-card p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
              {TOPIC_LABELS[scenario.topic]}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                scenario.status === "sourced"
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {scenario.status === "sourced" ? "Ze źródłem" : "Draft"}
            </span>
          </div>
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
          <SourceBadge scenario={scenario} />
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
  showAlt,
  onShowAlt,
  onRestart,
  onNext,
}: {
  result: SimResult;
  showAlt: boolean;
  onShowAlt: () => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  return (
    <div className="soft-card max-h-[38vh] overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-foreground">
          {result.action ? result.action.label : "Brak decyzji"} ·{" "}
          {result.reaction.label}
        </span>
        <span className="text-[12px] font-bold text-primary">
          {result.total}/100
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        {result.outcome.consequence}
      </p>

      <div className="mt-2 space-y-1.5">
        {result.criteria.map((c) => (
          <div key={c.criterion}>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{CRITERION_LABELS[c.criterion]}</span>
              <span className="font-semibold text-foreground">{c.score}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary"
                style={{ width: `${c.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {!showAlt ? (
        <button
          onClick={onShowAlt}
          className="mt-3 w-full rounded-xl bg-primary p-3 text-[13px] font-bold uppercase tracking-wide text-primary-foreground active:scale-[0.99]"
        >
          Pokaż lepszą alternatywę
        </button>
      ) : (
        <>
          <div className="mt-3 rounded-xl bg-secondary p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Alternatywa
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
          <div className="mt-2 flex gap-2">
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
          </div>
        </>
      )}
    </div>
  );
}
