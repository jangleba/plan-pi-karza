import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Undo2,
  Play,
  Pause,
  ChevronRight,
  Crosshair,
  MoveUpRight,
  Shield,
  Footprints,
  Goal,
  BookOpen,
  Check,
  Repeat2,
  HelpCircle,
  Flag,
  RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { evaluateDecision } from "./engine";
import { scenarios, scenarioVariant, variantLabels } from "./scenarios";
import { TacticalPitch } from "./TacticalPitch";
import { createPlayback } from "./playback";
import {
  actionGroups,
  modeHints,
  modeLabels,
  plannedActionMode,
  plannedState,
  planPass,
  planMovement,
} from "./planner";
import { loadIQHistory, saveIQAttempt } from "./history";
import type { IQAttempt } from "./history";
import type {
  ActionMode,
  Evaluation,
  EvaluationLevel,
  MatchPlayer,
  Phase,
  PlannedAction,
  Point,
} from "./types";
import { quickObservations, teachingMarkers } from "./teaching";
import { clampProgress, currentPlaybackStep } from "./transport";
import { LearningGuide } from "./LearningGuide";
import "./football-iq.css";

type Props = {
  initialScenario?: number;
  showOnboardingInitially?: boolean;
  onBack?: () => void;
  onComplete?: (result: { scenarioId: string; verdict: EvaluationLevel }) => void;
  historyOwner?: string;
};
const icons: Record<ActionMode, LucideIcon> = {
  pass: ArrowRight,
  through: MoveUpRight,
  cross: Repeat2,
  carry: Footprints,
  shot: Goal,
  hold: Pause,
  run: MoveUpRight,
  shift: Footprints,
  press: Crosshair,
  cover: Shield,
  mark: Flag,
};
const MAX_ACTIONS = 5;
const id = () => crypto.randomUUID();
export function FootballIQMatch({ initialScenario = 0, onBack, onComplete, historyOwner }: Props) {
  const [index, setIndex] = useState(
    ((initialScenario % scenarios.length) + scenarios.length) % scenarios.length,
  );
  const [variant, setVariant] = useState(0);
  const scenario = useMemo(() => scenarioVariant(scenarios[index], variant), [index, variant]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [training, setTraining] = useState<"learn" | "challenge">("learn");
  const [group, setGroup] = useState<"ball" | "move" | "defence">("ball");
  const [mode, setMode] = useState<ActionMode>("pass");
  const [selected, setSelected] = useState(scenario.controlledPlayerId);
  const [actions, setActions] = useState<PlannedAction[]>([]);
  const [hint, setHint] = useState(modeHints.pass);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [reference, setReference] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [history, setHistory] = useState<IQAttempt[]>([]);
  const [storageNote, setStorageNote] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [coachIndex, setCoachIndex] = useState(0);
  const markers = useMemo(() => teachingMarkers(scenario), [scenario]);
  const [transportRevision, setTransportRevision] = useState(0);
  const [comparisonProgress, setComparisonProgress] = useState(1);
  const playhead = useRef(0);
  const demoReturn = useRef<"intro" | "plan">("intro");
  const activeMarker = markers[Math.min(coachIndex, markers.length - 1)];
  const guideWasPaused = useRef(false);
  const openGuide = () => {
    guideWasPaused.current = paused;
    setPaused(true);
    setShowHelp(true);
  };
  const closeGuide = () => {
    setPaused(guideWasPaused.current);
    setShowHelp(false);
  };
  const attemptId = useRef("");
  const elapsed = useRef(0);
  const submittedSeconds = useRef(0);
  const recordResult = useRef(false);
  const playingRef = useRef({ paused: false, speed: 1 });
  playingRef.current = { paused, speed };
  const activeActions = reference || phase === "demo" ? scenario.referenceActions : actions;
  const comparisonActions = useMemo(
    () => [...actions, ...scenario.referenceActions],
    [actions, scenario],
  );
  const playback = useMemo(
    () => createPlayback(scenario, activeActions),
    [scenario, activeActions],
  );
  const state = useMemo(() => plannedState(scenario, actions), [scenario, actions]);
  const step = currentPlaybackStep(
    playback,
    phase === "feedback" ? comparisonProgress : progress,
    activeActions.length,
  );
  const guideMode =
    phase === "playback" || phase === "demo" || phase === "feedback"
      ? plannedActionMode(activeActions[step])
      : mode;
  const shownMarker =
    phase === "demo" || ((phase === "playback" || phase === "feedback") && reference)
      ? markers[Math.min(step, markers.length - 1)]
      : activeMarker;

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => {
    try {
      setHistory(loadIQHistory(historyOwner));
    } catch {
      setStorageNote("Historia jest niedostępna. Wynik pozostanie na tym ekranie.");
    }
  }, [historyOwner]);
  useEffect(() => {
    if (phase !== "plan") return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden && ready && !showHelp) elapsed.current += (now - last) / 1000;
      last = now;
    }, 100);
    return () => clearInterval(timer);
  }, [phase, ready, showHelp]);
  const finishRef = useRef<() => void>(() => {});
  finishRef.current = () => {
    if (phase === "demo") {
      setPaused(true);
      return;
    }
    setComparisonProgress(1);
    if (reference) {
      setPhase("feedback");
      return;
    }
    const result = evaluateDecision(scenario, actions, submittedSeconds.current);
    setEvaluation(result);
    setPhase("feedback");
    if (recordResult.current) {
      recordResult.current = false;
      onComplete?.({ scenarioId: scenario.id, verdict: result.level });
      const attempt: IQAttempt = {
        id: attemptId.current,
        scenarioId: scenario.id,
        variant,
        verdict: result.level,
        createdAt: new Date().toISOString(),
        decisionSeconds: submittedSeconds.current,
        mode: training,
      };
      try {
        if (saveIQAttempt(historyOwner, attempt)) {
          setHistory(loadIQHistory(historyOwner));
          setStorageNote("Wynik zapisany na tym urządzeniu.");
        } else setStorageNote("Wynik tej sesji.");
      } catch {
        setStorageNote("Nie udało się zapisać wyniku. Możesz kontynuować.");
      }
    }
  };
  useEffect(() => {
    if (!["playback", "demo"].includes(phase) || !ready) return;
    let raf = 0,
      last = performance.now();
    const animate = (time: number) => {
      if (!document.hidden && !playingRef.current.paused)
        playhead.current += (Math.max(0, time - last) / 1000) * playingRef.current.speed;
      last = time;
      const p = Math.min(1, playhead.current / Math.max(0.1, playback.duration));
      setProgress(p);
      if (p < 1 || playingRef.current.paused) raf = requestAnimationFrame(animate);
      else finishRef.current();
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [phase, playback, ready, transportRevision]);
  const begin = () => {
    attemptId.current = id();
    setActions([]);
    setEvaluation(null);
    setReference(false);
    playhead.current = 0;
    setProgress(0);
    setPaused(false);
    setCoachIndex(0);
    setPhase("plan");
    elapsed.current = 0;
    setSelected(scenario.controlledPlayerId);
    const g = scenario.defensive ? "defence" : "ball",
      m = scenario.defensive ? "press" : "pass";
    setGroup(g);
    setMode(m);
    setHint(modeHints[m]);
  };
  const submit = () => {
    if (phase !== "plan" || !ready) return;
    submittedSeconds.current = elapsed.current;
    recordResult.current = true;
    setReference(false);
    playhead.current = 0;
    setProgress(0);
    setPaused(false);
    setPhase("playback");
  };
  const changeMode = (m: ActionMode) => {
    setMode(m);
    setHint(modeHints[m]);
    if (m === "shot") {
      const finish = planMovement(
        scenario,
        actions,
        state.ballCarrierId,
        "shot",
        { x: 50, y: 3 },
        id(),
      );
      if (!finish) {
        setHint("Najpierw popraw pozycję lub znajdź dostępnego partnera. Strzał jest opcjonalny.");
        return;
      }
      add(finish);
    }
    if (["pass", "through", "cross", "carry", "shot", "hold"].includes(m))
      setSelected(state.ballCarrierId);
  };
  const changeGroup = (g: typeof group) => {
    setGroup(g);
    const first = actionGroups.find((x) => x.id === g)!.modes[0];
    changeMode(first);
    if (g !== "ball") setSelected(scenario.controlledPlayerId);
  };
  const add = (a: PlannedAction | null) => {
    if (actions.length >= MAX_ACTIONS) {
      setHint("Masz pięć działań. Odtwórz plan albo cofnij ostatnie.");
      return;
    }
    if (actions.some((x) => x.type === "shot")) {
      setHint("Strzał kończy akcję. Cofnij go, aby zmienić plan.");
      return;
    }
    if (!a) {
      setHint("Wybierz właściwego zawodnika lub działanie dla obecnego posiadania piłki.");
      return;
    }
    setActions((prev) => [...prev, a]);
    setCoachIndex(Math.min(actions.length + 1, Math.max(0, markers.length - 1)));
    setHint(
      a.type === "shot"
        ? "Zakończenie dodane. Sprawdź plan."
        : "Dodano: " + modeLabels[plannedActionMode(a)] + ".",
    );
    if (a.type === "pass") setSelected(a.targetId);
  };
  const playerSelect = (player: MatchPlayer) => {
    if (phase !== "plan") return;
    if (player.team === "away") {
      if (mode === "press" || mode === "mark") {
        if (mode === "press" && player.id !== state.ballCarrierId) {
          setHint("Pressing kieruj na rywala z piłką.");
          return;
        }
        add(
          planMovement(
            scenario,
            actions,
            selected,
            mode,
            state.positions.get(player.id)!,
            id(),
            player.id,
          ),
        );
      } else setHint("To rywal. W obronie możesz wskazać go jako cel pressingu lub krycia.");
      return;
    }
    if (mode === "pass" || mode === "through" || mode === "cross") {
      add(planPass(scenario, actions, player.id, id(), mode));
      return;
    }
    if (mode === "hold") {
      if (player.id !== state.ballCarrierId) {
        setHint("Utrzymać piłkę może tylko jej posiadacz.");
        return;
      }
      add(planMovement(scenario, actions, player.id, mode, state.positions.get(player.id)!, id()));
      return;
    }
    setSelected(player.id);
    setHint(modeHints[mode]);
  };
  const pointSelect = (point: Point) => {
    if (phase !== "plan") return;
    if (mode === "pass" || mode === "through" || mode === "cross") {
      setHint(modeHints[mode]);
      return;
    }
    if (mode === "press" || mode === "mark") {
      setHint("Dotknij konkretnego rywala.");
      return;
    }
    if (mode === "shot") {
      setHint("Strzał dodajesz przyciskiem. Nie trzeba zaznaczać celu na boisku.");
      return;
    }
    add(
      planMovement(
        scenario,
        actions,
        ["carry", "shot", "hold"].includes(mode) ? state.ballCarrierId : selected,
        mode,
        point,
        id(),
      ),
    );
  };
  const undo = () => {
    const rest = actions.slice(0, -1);
    setActions(rest);
    setSelected(plannedState(scenario, rest).ballCarrierId);
    setCoachIndex(Math.min(rest.length, Math.max(0, markers.length - 1)));
    setHint(modeHints[mode]);
  };
  const choose = (next: number, nextVariant = variant) => {
    setIndex((next + scenarios.length) % scenarios.length);
    setVariant(nextVariant);
    setPhase("intro");
    setCoachIndex(0);
    setActions([]);
    setEvaluation(null);
    setReference(false);
    playhead.current = 0;
    setProgress(0);
    setPaused(false);
  };
  const replay = (showReference: boolean) => {
    recordResult.current = false;
    setReference(showReference);
    playhead.current = 0;
    setProgress(0);
    setPaused(false);
    setPhase("playback");
  };
  const showDemo = () => {
    if (phase !== "intro" && phase !== "plan") return;
    demoReturn.current = phase;
    recordResult.current = false;
    playhead.current = 0;
    setProgress(0);
    setPaused(false);
    setPhase("demo");
  };
  const closeDemo = () => {
    setPhase(demoReturn.current);
    setPaused(false);
    setProgress(0);
    playhead.current = 0;
  };
  const seek = (value: number) => {
    const p = clampProgress(value);
    playhead.current = p * playback.duration;
    setProgress(p);
    setPaused(true);
    setTransportRevision((v) => v + 1);
    if (phase === "playback" && p === 1) finishRef.current();
  };
  const togglePlay = () => {
    if (progress >= 1) {
      playhead.current = 0;
      setProgress(0);
      setPaused(false);
    } else setPaused((v) => !v);
    setTransportRevision((v) => v + 1);
  };
  const modes = actionGroups.find((g) => g.id === group)!.modes;
  const noBall = scenario.players.find((p) => p.id === state.ballCarrierId)?.team !== "home";
  const lastFailure = playback.simulation?.events.find(
    (e) =>
      ["invalid", "interception", "blocked", "saved"].includes(e.kind) ||
      (e.kind === "tackle" && playback.simulation?.lost),
  );
  const referenceEvaluation = useMemo(
    () => evaluateDecision(scenario, scenario.referenceActions),
    [scenario],
  );
  const feedback = reference ? referenceEvaluation : evaluation;
  const verdict = reference ? "Wariant przykładowy" : evaluation?.label;
  const buttonIcon = (m: ActionMode) => {
    const Icon = icons[m];
    return <Icon size={18} strokeWidth={1.65} />;
  };
  return (
    <main className={"bwiq-app bwiq-app--" + phase}>
      <header className="bwiq-header">
        <button
          className="bwiq-icon-button"
          onClick={phase === "demo" ? closeDemo : onBack}
          aria-label="Wróć"
        >
          <ArrowLeft size={21} />
        </button>
        <div>
          <span className="bwiq-eyebrow">
            IQ · {index + 1}/{scenarios.length}
          </span>
          <h1>{phase === "feedback" ? "Twoja decyzja" : scenario.title}</h1>
        </div>
        <button className="bwiq-icon-button" aria-label="Wskazówki taktyczne" onClick={openGuide}>
          <HelpCircle size={20} />
        </button>
      </header>
      {showHelp && (
        <LearningGuide
          scenario={scenario}
          mode={guideMode}
          marker={shownMarker}
          onClose={closeGuide}
          onDemo={phase === "intro" || phase === "plan" ? showDemo : undefined}
        />
      )}
      <section className="bwiq-stage">
        <TacticalPitch
          scenario={scenario}
          actions={activeActions}
          selectedPlayerId={selected}
          mode={mode}
          interactive={phase === "plan"}
          playbackProgress={
            phase === "playback" || phase === "demo"
              ? progress
              : phase === "feedback"
                ? comparisonProgress
                : phase === "intro"
                  ? 0
                  : 1
          }
          playing={(phase === "playback" || phase === "demo") && !paused}
          focusOnActions={phase === "feedback"}
          cameraActions={comparisonActions}
          activeActionId={
            phase === "playback" || phase === "demo" ? activeActions[step]?.id : undefined
          }
          onPlayerSelect={playerSelect}
          onPitchSelect={pointSelect}
          onReadyChange={setReady}
          highlights={phase === "feedback" && !reference ? evaluation?.highlights : undefined}
          highlightGood={evaluation?.level === "strong"}
          teachingMarkers={
            shownMarker && ((training === "learn" && phase !== "playback") || phase === "demo")
              ? [shownMarker]
              : []
          }
          activeTeachingId={shownMarker?.id}
          onTeachingSelect={(markerId) => {
            setCoachIndex(markers.findIndex((m) => m.id === markerId));
          }}
        />
        {phase === "plan" && (
          <div className="bwiq-stage-badge">
            <BookOpen size={14} />
            {training === "learn" ? "Nauka · wskazówki" : "Samodzielnie"}
          </div>
        )}
        {phase === "plan" && training === "learn" && lastFailure && (
          <div className="bwiq-plan-warning">{lastFailure.text}</div>
        )}
      </section>
      {phase === "intro" && (
        <section className="bwiq-intro">
          <details className="bwiq-scenario-settings">
            <summary>
              Zmień sytuację <ChevronRight size={14} />
            </summary>
            <div className="bwiq-choice-row">
              <label>
                Sytuacja
                <select
                  aria-label="Sytuacja"
                  value={index}
                  onChange={(e) => choose(Number(e.target.value))}
                >
                  {scenarios.map((s, i) => (
                    <option key={s.id} value={i}>
                      {i + 1}. {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Wariant
                <select
                  aria-label="Wariant"
                  value={variant}
                  onChange={(e) => choose(index, Number(e.target.value))}
                >
                  {variantLabels.map((v, i) => (
                    <option key={v} value={i}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
          <div className="bwiq-training-toggle">
            {(["learn", "challenge"] as const).map((t) => (
              <button
                key={t}
                className={training === t ? "is-active" : ""}
                onClick={() => setTraining(t)}
              >
                {t === "learn" ? "Nauka" : "Samodzielnie"}
              </button>
            ))}
          </div>
          <div className="bwiq-cue-picker" role="group" aria-label="Wskazówki na boisku">
            {training === "learn" &&
              markers.map((m, i) => (
                <button
                  key={m.id}
                  className={coachIndex === i ? "is-active" : ""}
                  aria-pressed={coachIndex === i}
                  onClick={() => setCoachIndex(i)}
                >
                  <i>{m.letter}</i>
                  {m.label}
                </button>
              ))}
          </div>
          <p className="bwiq-quick-cue">
            {training === "learn"
              ? (activeMarker?.instruction ?? quickObservations[scenario.id])
              : "Znajdź przestrzeń i zaplanuj ruch."}
          </p>
          <div className="bwiq-intro-tools">
            <button className="bwiq-secondary" disabled={!ready} onClick={showDemo}>
              <Play size={15} />
              Zobacz ruch
            </button>
            <button className="bwiq-learn-link" onClick={openGuide}>
              Dlaczego? <ChevronRight size={15} />
            </button>
          </div>
          <div className="bwiq-start-row">
            <span>
              {history.length
                ? history.length +
                  " prób · " +
                  history.filter((x) => x.verdict === "strong").length +
                  " udanych"
                : training === "learn"
                  ? "Dotknij liter na boisku"
                  : "Zaplanuj własne rozwiązanie."}
            </span>
            <button className="bwiq-primary" disabled={!ready} onClick={begin}>
              {ready ? "Rozpocznij" : "Wczytywanie…"}
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
      )}
      {phase === "plan" && (
        <section className="bwiq-dock">
          {training === "learn" && activeMarker && (
            <div className="bwiq-coach-card">
              <div className="bwiq-coach-heading">
                <span>
                  <i>{activeMarker.letter}</i>
                  {activeMarker.label}
                </span>
                <button onClick={openGuide} aria-label="Dlaczego ten ruch?">
                  Dlaczego? <ChevronRight size={13} />
                </button>
                <button aria-label="Zobacz ruch z planu" disabled={!ready} onClick={showDemo}>
                  <Play size={15} />
                </button>
              </div>
              <p>{activeMarker.instruction}</p>
            </div>
          )}
          <div className="bwiq-groups" role="group" aria-label="Grupa działań">
            {actionGroups.map((g) => (
              <button
                className={group === g.id ? "is-active" : ""}
                key={g.id}
                onClick={() => changeGroup(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="bwiq-action-menu" role="group" aria-label="Działania">
            {modes.map((m) => (
              <button
                key={m}
                className={mode === m ? "is-active" : ""}
                aria-pressed={mode === m}
                disabled={(group === "ball" && noBall) || actions.some((a) => a.type === "shot")}
                onClick={() => changeMode(m)}
              >
                {buttonIcon(m)}
                <span>{modeLabels[m]}</span>
              </button>
            ))}
          </div>
          <p className="bwiq-hint" role="status">
            {hint}
          </p>
          <div className="bwiq-controls">
            <span>
              {actions.length}/{MAX_ACTIONS} kroków
            </span>
            <button
              className="bwiq-icon-button"
              disabled={!actions.length}
              aria-label="Cofnij"
              onClick={undo}
            >
              <Undo2 size={18} />
            </button>
            <button className="bwiq-primary" disabled={!ready || !actions.length} onClick={submit}>
              Odtwórz
              <Play size={15} />
            </button>
          </div>
        </section>
      )}
      {(phase === "playback" || phase === "demo") && (
        <section className="bwiq-transport">
          <div className="bwiq-live-cue">
            <small>
              {phase === "demo" ? "Pokaz" : reference ? "Przykład" : "Twój plan"} · {step + 1}/
              {activeActions.length}
            </small>
            <span>
              {phase === "demo" || reference
                ? shownMarker?.instruction
                : modeLabels[plannedActionMode(activeActions[step])]}
            </span>
          </div>
          <input
            className="bwiq-scrubber"
            type="range"
            min="0"
            max="1000"
            aria-label="Przebieg akcji"
            aria-valuetext={`${Math.round(progress * 100)}%`}
            value={Math.round(progress * 1000)}
            onChange={(e) => seek(Number(e.currentTarget.value) / 1000)}
          />
          <div className="bwiq-transport-buttons">
            <button
              className="bwiq-icon-button"
              onClick={togglePlay}
              aria-label={progress >= 1 ? "Odtwórz pokaz ponownie" : paused ? "Wznów" : "Pauza"}
            >
              {progress >= 1 ? (
                <RotateCcw size={19} />
              ) : paused ? (
                <Play size={19} />
              ) : (
                <Pause size={19} />
              )}
            </button>
            {[0.5, 1, 1.5].map((v) => (
              <button
                key={v}
                className={speed === v ? "is-active" : ""}
                aria-pressed={speed === v}
                onClick={() => setSpeed(v)}
              >
                {v}×
              </button>
            ))}
            {phase === "demo" && (
              <button
                className="bwiq-primary"
                onClick={demoReturn.current === "intro" ? begin : closeDemo}
              >
                {demoReturn.current === "intro" ? "Spróbuj" : "Wróć do planu"}
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>
      )}
      {phase === "feedback" && evaluation && (
        <section className="bwiq-feedback">
          <div className={"bwiq-verdict bwiq-verdict--" + feedback?.level}>
            <span>
              {feedback?.level === "strong" ? <Check size={18} /> : <Crosshair size={18} />}
            </span>
            <div>
              <small>{reference ? "Porównanie" : "Informacja zwrotna"}</small>
              <h2>{verdict}</h2>
            </div>
            <button
              className="bwiq-icon-button"
              aria-label="Odtwórz ponownie"
              onClick={() => replay(reference)}
            >
              <Play size={18} />
            </button>
          </div>
          <p>{feedback?.summary}</p>
          <div className="bwiq-compare-toggle" role="group" aria-label="Porównanie decyzji">
            <button
              aria-pressed={!reference}
              className={!reference ? "is-active" : ""}
              onClick={() => setReference(false)}
            >
              Twój plan
            </button>
            <button
              aria-pressed={reference}
              className={reference ? "is-active" : ""}
              onClick={() => setReference(true)}
            >
              Przykład
            </button>
          </div>
          <input
            className="bwiq-scrubber"
            type="range"
            min="0"
            max="1000"
            aria-label="Etap porównania"
            value={Math.round(comparisonProgress * 1000)}
            onChange={(e) =>
              setComparisonProgress(clampProgress(Number(e.currentTarget.value) / 1000))
            }
          />
          <details>
            <summary>
              Dlaczego ten wariant?
              <ChevronRight size={15} />
            </summary>
            <p>{feedback?.recommendation}</p>
            <p>{feedback?.timing}</p>
            <p>{feedback?.space}</p>
            <p>{feedback?.consequence}</p>
            {feedback?.events?.map((e, i) => (
              <div className="bwiq-event" key={i}>
                <span>{e.time.toFixed(1)} s</span>
                {e.text}
              </div>
            ))}
          </details>
          <div className="bwiq-feedback-actions">
            <button onClick={begin}>Powtórz</button>

            <button className="bwiq-primary" onClick={() => choose(index + 1)}>
              Dalej
              <ArrowRight size={15} />
            </button>
          </div>
          <small className="bwiq-storage-note">{storageNote}</small>
        </section>
      )}
    </main>
  );
}
