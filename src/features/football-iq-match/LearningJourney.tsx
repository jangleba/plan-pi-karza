import { attackReplay } from "./attackReplay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleHelp,
  History,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import { decisionOptions, OPTION_MARKS, optionPaths, situationLine } from "./decisionOptions";
import {
  momentLabel,
  momentOf,
  nextContext,
  nextDefinition,
  pickerItems,
  startLines,
} from "./journeyGuide";
import { loadFieldTask, pickFieldTask, saveFieldTask, type FieldTask } from "./fieldTask";
import {
  qualityLabels,
  REVIEW_COLORS,
  reviewDecision,
  type DecisionReview,
} from "./decisionReview";
import { iqSources, situationBank, situationFor } from "./situationBank";
import { FootballIQJourney } from "./FootballIQJourney";
import { TacticalPitch } from "./TacticalPitch";
import { advancedJourneyBank } from "./advancedJourneyBank";
import { roleLabels, rolesForPosition } from "./journeyBank";
import {
  chooseJourney,
  createJourneyForRules,
  journeyDuration,
  journeyFrame,
  sampleJourney,
  journeyVerdict,
} from "./journeyEngine";
import { liveChoice as legacyChoice } from "./liveJourney";
import { attackChoice } from "./attackJourney";
const liveChoice: typeof legacyChoice = (s, ...args) =>
  s.rulesVersion === 9 ? attackChoice(s, ...args) : legacyChoice(s, ...args);
import { lessonGoal, lessonTakeaway, LIVE_BANK_VERSION, ATTACK_BANK_VERSION } from "./liveLesson";
import {
  createJourneyBackup,
  loadJourneyHistory,
  loadJourneyDraft,
  makeJourneyAttempt,
  restoreJourney,
  saveJourneyAttempt,
  saveJourneyDraft,
  makeJourneyDraft,
} from "./journeyHistory";
import { downloadText } from "../browser-lab/download";
import type { JourneyChoice, JourneyDefinition, JourneyMode, JourneySession } from "./journeyTypes";
import type { PlannedAction, Point } from "./types";
import "./learning.css";

type Props = React.ComponentProps<typeof FootballIQJourney>;
type Phase = "intro" | "decision" | "playing" | "feedback" | "summary";
type Sheet = "help" | "roles" | "settings" | "history" | null;
const EMPTY: PlannedAction[] = [];
const CARRY_TAP_RADIUS = 14;
const newId = () => `iq8-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
function startDefinition(position?: string, index?: number) {
  const roles = rolesForPosition(position);
  // First hand-placed situation of the player's own position.
  return (
    advancedJourneyBank[index ?? -1] ??
    pickerItems(position)[0]?.def ??
    advancedJourneyBank.find(
      (d) => d.role === roles[0] && d.concept === "third-player" && d.context === 0,
    )!
  );
}
function initial(props: Props) {
  const fresh = () => ({
    session: createJourneyForRules(startDefinition(props.position, props.initialScenario), 9),
    mode: "learn" as JourneyMode,
    id: newId(),
    resumed: false,
    firstVisit: true,
    error: "",
  });
  if (!props.historyOwner) return fresh();
  try {
    const draft = loadJourneyDraft(props.historyOwner);
    if (draft && [LIVE_BANK_VERSION, ATTACK_BANK_VERSION].includes(draft.bankVersion))
      return {
        session: restoreJourney(draft),
        mode: draft.mode,
        id: draft.id,
        resumed: true,
        firstVisit: false,
        error: "",
      };
    return {
      ...fresh(),
      firstVisit: !loadJourneyHistory(props.historyOwner).some((r) =>
        [LIVE_BANK_VERSION, ATTACK_BANK_VERSION].includes(r.bankVersion),
      ),
    };
  } catch {
    return {
      ...fresh(),
      error:
        "Nie udało się odczytać zapisu. Zachowaj kopię w archiwum przed rozpoczęciem nowej lekcji.",
    };
  }
}
export function LearningJourney(props: Props) {
  const { historyOwner, onComplete } = props;
  const [boot] = useState(() => initial(props));
  const [session, setSession] = useState(boot.session),
    [mode, setMode] = useState<JourneyMode>(boot.mode);
  const [phase, setPhase] = useState<Phase>(
    boot.session.outcome ? "summary" : boot.resumed ? "decision" : "intro",
  );
  const [id, setId] = useState(boot.id),
    [error, setError] = useState(boot.error),
    [saved, setSaved] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null),
    [pickAll, setPickAll] = useState(false),
    [optionKey, setOptionKey] = useState<string | null>(null),
    [revealed, setRevealed] = useState(false),
    [fieldTask, setFieldTask] = useState<FieldTask | null>(null);
  const [draft, setDraft] = useState<JourneyChoice | null>(null),
    [ready, setReady] = useState(false);
  const [archive, setArchive] = useState(false),
    [replay, setReplay] = useState<JourneySession | null>(null),
    [review, setReview] = useState<DecisionReview | null>(null);
  const [paused, setPaused] = useState(false),
    [playTime, setPlayTime] = useState(0);
  const [transfer, setTransfer] = useState(false);
  const playhead = useRef(0),
    range = useRef({ from: 0, to: 0 }),
    current = useRef(session),
    returnPhase = useRef<Phase>("feedback");
  const decisionStart = useRef(performance.now()),
    dialog = useRef<HTMLDialogElement>(null),
    completed = useRef(new Set<string>());
  const allowedReplacement = useRef(false);
  const guided = mode === "learn" && !transfer;
  // Only TY is controlled: the player learns their own position, with and without the ball.
  const actor = "you";
  const controlled = useMemo(() => ({ ...session, controlledId: actor }), [session, actor]);
  const displayed = replay ?? review?.before ?? session;
  current.current = displayed;
  const sampleFrame = useCallback(() => sampleJourney(current.current, playhead.current), []);
  const idleFrame = useMemo(
    () => journeyFrame(displayed.world, displayed.players, journeyDuration(displayed)),
    [displayed],
  );
  const isPlaying = phase === "playing";
  const playable = ready && phase === "decision" && !sheet && !error;
  const own = controlled.world.carrierId === actor && !controlled.world.looseBall;
  const liveFrame = isPlaying ? sampleFrame() : idleFrame;
  const carrier = displayed.players.find((p) => p.id === liveFrame.ballCarrierId)!;
  const you = displayed.players.find((p) => p.id === "you")!;
  useEffect(() => {
    document.body.classList.toggle("iq-learning-focus", !archive);
    return () => document.body.classList.remove("iq-learning-focus");
  }, [archive]);
  useEffect(() => {
    if (sheet) dialog.current?.showModal();
    else dialog.current?.close();
  }, [sheet]);
  useEffect(() => {
    if (phase === "decision") decisionStart.current = performance.now();
  }, [phase, session.step]);
  useEffect(() => {
    if (!isPlaying || paused || !ready || sheet || archive) return;
    let frame = 0,
      last = performance.now(),
      hud = last;
    const tick = (now: number) => {
      const delta = document.hidden ? 0 : Math.max(0, (now - last) / 1000);
      last = now;
      playhead.current = Math.min(range.current.to, playhead.current + delta);
      if (now - hud > 100 || playhead.current >= range.current.to) {
        setPlayTime(playhead.current);
        hud = now;
      }
      if (playhead.current >= range.current.to) {
        setPhase(returnPhase.current);
        setReplay(null);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      last = performance.now();
    };
    document.addEventListener("visibilitychange", visibility);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [isPlaying, paused, ready, sheet, archive]);
  useEffect(() => {
    if (
      session.step === 0 ||
      boot.error ||
      error ||
      replay ||
      (session.outcome && completed.current.has(id))
    )
      return;
    try {
      const previousDraft = loadJourneyDraft(historyOwner);
      if (previousDraft && previousDraft.id !== id && !allowedReplacement.current)
        throw new Error("Inna akcja jest niedokończona.");
      if (
        previousDraft?.id === id &&
        previousDraft.choices.some((c, i) => c.id !== session.decisions[i]?.choiceId)
      )
        throw new Error("Zapis zmienił się na innym urządzeniu.");
      if (session.outcome) {
        if (!completed.current.has(id)) {
          saveJourneyAttempt(historyOwner, makeJourneyAttempt(session, mode, id));
          if (!previousDraft || previousDraft.id === id || allowedReplacement.current)
            saveJourneyDraft(historyOwner, session, mode, id);
          completed.current.add(id);
          setSaved(!!historyOwner);
          const task = pickFieldTask(
            session.definition,
            session.attack?.finish,
            loadFieldTask(historyOwner),
          );
          saveFieldTask(historyOwner, task);
          setFieldTask(task);
          onComplete?.({
            scenarioId: session.definition.id,
            verdict: journeyVerdict(session),
          });
        }
      } else saveJourneyDraft(historyOwner, session, mode, id);
    } catch {
      setError(
        "Nie udało się zapisać postępu. Pobierz kopię poprzedniego zapisu, zanim zapiszesz bieżącą lekcję.",
      );
    }
  }, [session, mode, id, historyOwner, onComplete, boot.error, error, replay]);
  function play(s: JourneySession, from: number, to: number, after: Phase, asReplay = false) {
    range.current = { from, to };
    playhead.current = from;
    setPlayTime(from);
    setPaused(false);
    if (asReplay) setReplay(s);
    setReview(null);
    returnPhase.current = after;
    setPhase("playing");
  }
  function choosePoint(point: Point, targetId?: string) {
    if (!playable) return;
    try {
      const target = session.players.find((p) => p.id === targetId);
      setOptionKey(null);
      if (targetId === actor) {
        setDraft(liveChoice(controlled, own ? "hold" : "wait", point));
        return;
      }
      const toPartner = own && target?.team === "home";
      // With the ball: a tap near you is a carry, further away a pass into space.
      const near =
        Math.hypot(
          point.x - session.world.positions[actor].x,
          point.y - session.world.positions[actor].y,
        ) < CARRY_TAP_RADIUS;
      const intent = !own ? "move" : toPartner || !near ? "pass" : "carry";
      setDraft(liveChoice(controlled, intent, point, toPartner ? targetId : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się zaplanować ruchu.");
    }
  }
  function commit() {
    if (!draft || !playable) return;
    try {
      const from = journeyDuration(session),
        next = chooseJourney(
          controlled,
          draft.id,
          (performance.now() - decisionStart.current) / 1000,
        );
      setSession(next);
      setDraft(null);
      setOptionKey(null);
      setRevealed(false);
      play(
        next,
        from,
        journeyDuration(next),
        guided ? "feedback" : next.outcome ? "summary" : "decision",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się rozegrać akcji.");
    }
  }
  function start(def: JourneyDefinition, test = false) {
    allowedReplacement.current = false;
    setSession(createJourneyForRules(def, 9));
    setMode(test ? "challenge" : "learn");
    setId(newId());
    setPhase("intro");
    setDraft(null);
    setReplay(null);
    setReview(null);
    setSaved(false);
    setSheet(null);
    setOptionKey(null);
    setRevealed(false);
    setFieldTask(null);
    setTransfer(test);
  }
  function exportAttempt() {
    try {
      const backup = session.outcome
        ? createJourneyBackup([makeJourneyAttempt(session, mode, id)])
        : createJourneyBackup([], makeJourneyDraft(session, mode, id));
      void downloadText(
        `ballwise-iq-${id}.json`,
        JSON.stringify(backup, null, 2),
        "application/json",
        historyOwner,
      ).catch(() => setError("Nie udało się pobrać pliku. Spróbuj ponownie."));
    } catch {
      setError("Nie udało się przygotować kopii próby.");
    }
  }

  function preserveAndRetry() {
    try {
      const previous = loadJourneyDraft(historyOwner),
        rows = loadJourneyHistory(historyOwner);
      void downloadText(
        "ballwise-iq-kopia-przed-zmiana.json",
        JSON.stringify(createJourneyBackup(rows, previous), null, 2),
        "application/json",
        historyOwner,
      )
        .then(() => {
          allowedReplacement.current = true;
          setError("");
        })
        .catch(() =>
          setError("Kopia nie została pobrana. Dotychczasowy zapis pozostaje zachowany."),
        );
    } catch {
      setError(
        "Nie udało się odczytać kopii. Otwórz starszy tryb i pobierz surowy zapis z pomocy.",
      );
    }
  }
  const preview = draft
    ? ([
        {
          id: "your-plan",
          type:
            draft.intent === "shoot"
              ? "shot"
              : draft.intent === "pass"
                ? "pass"
                : draft.intent === "carry"
                  ? "carry"
                  : "run",
          playerId: actor,
          targetId: draft.targetId ?? "space",
          from: displayed.world.positions[actor],
          to: draft.point,
        },
      ] as PlannedAction[])
    : EMPTY;
  const event =
    isPlaying && guided
      ? displayed.beats
          .flatMap((b) => {
            let offset = 0;
            for (const row of displayed.beats) {
              if (row === b) break;
              offset += row.duration;
            }
            return (b.events ?? []).map((e) => ({
              ...e,
              time: e.time + offset,
            }));
          })
          .filter((e) => e.time <= playTime && e.time >= range.current.from)
          .at(-1)
      : null;
  const lastDecision = session.decisions.at(-1);
  let replayBeat = displayed.beats.length - 1,
    cursor = 0;
  if (isPlaying)
    for (const [i, beat] of displayed.beats.entries()) {
      if (playTime < cursor + beat.duration) {
        replayBeat = i;
        break;
      }
      cursor += beat.duration;
    }
  const analysisPaths = useMemo(() => attackReplay(displayed, replayBeat), [displayed, replayBeat]);
  const showAnalysis = !!replay;
  const options = useMemo(
    () => (phase === "decision" ? decisionOptions(controlled) : []),
    [controlled, phase],
  );
  const situation = situationFor(session.definition);
  // Learning shows the options at once; on your own you first read the pitch yourself.
  const showOptions = phase === "decision" && (mode === "learn" || revealed);
  const boardActions = showAnalysis
    ? analysisPaths
    : review
      ? review.paths
      : draft && !optionKey
        ? preview
        : showOptions
          ? optionPaths(controlled, options, optionKey)
          : preview;
  const scoreReached = !isPlaying || playTime >= journeyDuration(displayed) - 0.001;
  // Opening an earlier decision for review never changes the final score of the action.
  const scored = review ? session : displayed;
  const visibleHome = scoreReached ? (scored.attack?.home ?? 0) : 0;
  const visibleAway = scoreReached ? (scored.attack?.away ?? 0) : 0;
  const decisionNumber = isPlaying
    ? Math.max(
        1,
        (displayed.decisions.find((d) => d.firstBeat <= replayBeat && d.lastBeat >= replayBeat)
          ?.index ?? 0) + 1,
      )
    : phase === "decision" || phase === "intro"
      ? session.step + 1
      : Math.max(1, session.step);

  if (archive) return <FootballIQJourney {...props} onBack={() => setArchive(false)} />;
  const contextText = session.attack
    ? `${session.definition.context === 0 ? "78" : session.definition.context === 1 ? "54" : "82"}′ · ${(session.definition.context === 0 ? 1 : 0) + visibleHome}:${(session.definition.context === 2 ? 1 : 0) + visibleAway}`
    : session.definition.contextLabel.split(" · ").slice(0, 2).join(" · ");
  const nowLine = situationLine(controlled, actor);
  const chooseOption = (key: string) => {
    const option = options.find((o) => o.key === key);
    if (!option) return;
    setOptionKey(key);
    setDraft(option.choice);
  };
  const items = pickerItems(props.position, pickAll);
  return (
    <div
      className="bwiq-app iq-journey iqE-app"
      data-iq-engine={session.rulesVersion}
      data-iq-phase={phase}
    >
      <header className="iqE-header">
        <div className="iqE-top">
          <button
            className="iqE-icon"
            type="button"
            onClick={props.onBack}
            aria-label="Wróć do aplikacji"
          >
            <ArrowLeft size={21} />
          </button>
          <button
            className="iqE-role"
            type="button"
            onClick={() => setSheet("roles")}
            aria-label="Wybierz sytuację"
          >
            IQ · {roleLabels[session.definition.role]} <ChevronDown size={14} />
          </button>
          <button
            className="iqE-icon"
            type="button"
            onClick={() => setSheet("help")}
            aria-label="Jak grać"
          >
            <CircleHelp size={21} />
          </button>
        </div>
        <div className="iqE-context">
          <span>
            {contextText} · TY: {you.number}
          </span>
          <span>
            {transfer ? "Nowy układ · " : ""}
            {session.rulesVersion === 9
              ? `Decyzja ${decisionNumber}`
              : `${Math.min(3, session.step + 1)}/3`}
            <span className="iqE-direction" aria-label="Kierunek ataku">
              {" "}
              · Atak <span className="iqE-up">↑</span>
              <span className="iqE-right">→</span>
            </span>
          </span>
        </div>
        <h1 className="iqE-title">{session.definition.title}</h1>
        <p className="iqE-goal">{lessonGoal(session)}</p>
      </header>
      <main className="iqE-pitch" aria-label="Boisko do podejmowania decyzji">
        <TacticalPitch
          scenario={displayed.scenario}
          actions={boardActions}
          selectedPlayerId={actor}
          mode={draft?.intent === "shoot" ? "shot" : draft?.intent === "pass" ? "pass" : "run"}
          interactive={playable && !isPlaying}
          playing={isPlaying && !paused}
          fixedView
          landscapeView
          compactFigures
          portraitThreshold={0.62}
          visibleLabelIds={
            phase === "decision"
              ? displayed.players.filter((p) => !p.goalkeeper).map((p) => p.id)
              : ["you", carrier.id].filter((v, i, a) => a.indexOf(v) === i)
          }
          selectablePlayerIds={displayed.players.map((p) => p.id)}
          frameOverride={isPlaying ? liveFrame : idleFrame}
          frameSource={isPlaying ? sampleFrame : undefined}
          onPlayerSelect={(p) => choosePoint(displayed.world.positions[p.id], p.id)}
          onPitchSelect={(p) => choosePoint(p)}
          onReadyChange={setReady}
          showActionOrders={false}
          showGuidance={showAnalysis || !!review || !!draft || showOptions}
          broadcastView
        />
        {showAnalysis && (
          <div className="iqE-replay-key">
            <span>Podanie</span>
            <span>Bieg</span>
            <span>Reakcja rywala</span>
          </div>
        )}
        {!ready && (
          <div className="iqE-loading" role="status">
            Przygotowuję boisko…
          </div>
        )}
        {isPlaying && (
          <button
            type="button"
            className="iqE-pause"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Wznów akcję" : "Zatrzymaj akcję"}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        )}
      </main>
      <footer className="iqE-footer">
        {session.rulesVersion === 8 && !replay && (
          <div className="iqE-legacy-note">
            Wznowiono starszą krótką lekcję.{" "}
            <button type="button" className="iqE-link" onClick={() => setSheet("roles")}>
              Wybierz nową pełną akcję
            </button>
          </div>
        )}
        {replay && isPlaying && (
          <label className="iqE-seek">
            Powtórka · przewiń do ważnego momentu
            <input
              aria-label="Czas powtórki"
              type="range"
              min={range.current.from}
              max={range.current.to}
              step={0.05}
              value={playTime}
              onChange={(e) => {
                playhead.current = +e.target.value;
                setPlayTime(+e.target.value);
                setPaused(true);
              }}
            />
          </label>
        )}
        {error && (
          <div className="iqE-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={exportAttempt}>
              Pobierz kopię
            </button>
            <button type="button" onClick={preserveAndRetry}>
              Pobierz poprzedni zapis i ponów
            </button>
            <button type="button" onClick={() => setArchive(true)}>
              Otwórz archiwum
            </button>
          </div>
        )}
        {phase === "intro" ? (
          <section className="iqE-start" aria-label="Jak przebiega lekcja">
            <span className="iqE-eyebrow">
              {momentLabel(momentOf(session.definition))} ·{" "}
              {transfer ? "nowy układ" : session.definition.contextLabel}
            </span>
            <ol className="iqE-steps">
              {startLines(session, mode).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            <div className="iqE-intro-options">
              <button
                type="button"
                aria-pressed={mode === "learn"}
                onClick={() => setMode("learn")}
              >
                Nauka z opcjami
              </button>
              <button
                type="button"
                aria-pressed={mode === "challenge"}
                onClick={() => setMode("challenge")}
              >
                Samodzielnie
              </button>
            </div>
            <button
              type="button"
              className="iqE-primary"
              disabled={!ready || !!error}
              onClick={() => play(session, 0, 0.8, "decision", true)}
            >
              Start <ArrowRight size={17} />
            </button>
          </section>
        ) : phase === "decision" ? (
          <>
            <p className="iqE-now">{nowLine}</p>
            {showOptions ? (
              <div className="iqE-options" role="group" aria-label="Twoje opcje">
                {options.map((o, i) => (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={optionKey === o.key}
                    disabled={!playable}
                    onClick={() => chooseOption(o.key)}
                  >
                    <b
                      className="iqE-mark"
                      style={{ background: OPTION_MARKS[i % OPTION_MARKS.length].color }}
                      aria-hidden="true"
                    >
                      {OPTION_MARKS[i % OPTION_MARKS.length].letter}
                    </b>
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="iqE-think">
                <p>Pomyśl sam: gdzie jest wolne miejsce? Dotknij boiska.</p>
                <button
                  type="button"
                  className="iqE-secondary"
                  disabled={!playable}
                  onClick={() => setRevealed(true)}
                >
                  Pokaż opcje
                </button>
              </div>
            )}
            {(showOptions || draft) && (
              <div className="iqE-plan">
                <span>
                  {draft && !optionKey
                    ? `Własny ruch: ${draft.label}`
                    : own
                      ? "Albo dotknij boiska: blisko siebie – prowadzenie, dalej – podanie."
                      : "Albo dotknij boiska, by wybrać własne miejsce."}
                </span>
                {draft && (
                  <button
                    className="iqE-icon"
                    type="button"
                    aria-label="Usuń wybór"
                    onClick={() => {
                      setDraft(null);
                      setOptionKey(null);
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
            <div className="iqE-actions">
              <button
                className="iqE-primary"
                type="button"
                disabled={!playable || !draft}
                onClick={commit}
              >
                Zagraj <Play size={16} />
              </button>
              {draft && (
                <button
                  className="iqE-icon iqE-bordered"
                  type="button"
                  aria-label="Wykonanie"
                  onClick={() => setSheet("settings")}
                >
                  <Settings2 size={18} />
                </button>
              )}
            </div>
          </>
        ) : phase === "playing" ? (
          <div className="iqE-coach" aria-live="polite">
            <span>{replay ? "Powtórka" : "Akcja trwa"}</span>
            <p>
              {guided
                ? (event?.text ?? "Patrz na piłkę i ustawienie rywali.")
                : "Patrz, co się zmienia. Za chwilę kolejna decyzja."}
            </p>
          </div>
        ) : phase === "feedback" ? (
          <>
            <span className="iqE-eyebrow">Co się stało</span>
            <p className="iqE-feedback">{lastDecision?.why}</p>
            {!session.outcome && (
              <p className="iqE-next">
                <strong>Teraz:</strong> {situationLine(session, "you")}
              </p>
            )}
            <div className="iqE-actions">
              <button
                type="button"
                className="iqE-primary"
                onClick={() => setPhase(session.outcome ? "summary" : "decision")}
              >
                {session.outcome ? "Zobacz wynik" : "Dalej"} <ArrowRight size={16} />
              </button>
              <button
                className="iqE-icon iqE-bordered"
                type="button"
                aria-label="Powtórz ten fragment"
                onClick={() =>
                  play(
                    session,
                    journeyDuration(session) - session.beats.at(-1)!.duration,
                    journeyDuration(session),
                    "feedback",
                    true,
                  )
                }
              >
                <RotateCcw size={17} />
              </button>
            </div>
          </>
        ) : (
          <section className="iqE-summary" aria-label="Wynik akcji">
            <div className="iqE-between">
              <span className="iqE-eyebrow">
                {transfer ? "Próba w nowym układzie" : "Wynik akcji"}
              </span>
              <span className="iqE-save">
                {saved
                  ? "Zapisano"
                  : props.historyOwner
                    ? "Zapis w toku"
                    : "Bez konta · pobierz kopię"}
              </span>
            </div>
            <h2>
              {session.attack
                ? session.attack.finish === "goal"
                  ? session.attack.home
                    ? "Gol!"
                    : "Gol rywali"
                  : session.attack.finish === "miss"
                    ? "Niecelny strzał"
                    : session.attack.finish === "offside"
                      ? "Spalony"
                      : "Akcja przerwana"
                : session.outcome === "loss" || session.outcome === "blocked"
                  ? "Wróć do momentu zmiany"
                  : session.outcome === "progress"
                    ? "Wyjście spod nacisku z dalszą opcją"
                    : "Piłka utrzymana. Czy udało się wyjść spod nacisku?"}
            </h2>
            <p>{lessonTakeaway(session)}</p>
            {fieldTask && (
              <section className="iqE-task" aria-label="Zadanie na boisko">
                <span>Zadanie na boisko</span>
                <p>{fieldTask.text}</p>
                <small>
                  {props.historyOwner
                    ? "Zobaczysz je też na ekranie Start."
                    : "Zaloguj się, żeby widzieć je na ekranie Start."}
                </small>
              </section>
            )}
            <section className="iqE-review" aria-label="Twoje decyzje">
              <span>Twoje decyzje · dotknij, żeby zobaczyć na boisku</span>
              <ol>
                {session.decisions.map((d, i) => (
                  <li key={d.choiceId + i}>
                    <button
                      type="button"
                      aria-pressed={review?.index === i}
                      onClick={() =>
                        setReview(review?.index === i ? null : reviewDecision(session, i))
                      }
                    >
                      <b>{i + 1}.</b> {d.label}
                      <em className={`iqE-grade iqE-grade--${d.quality}`}>
                        {qualityLabels[d.quality]}
                      </em>
                    </button>
                    {review?.index === i && (
                      <p className="iqE-better">
                        <i style={{ background: REVIEW_COLORS.yours }} /> Twój wybór
                        {review.better ? (
                          <>
                            {" · "}
                            <i style={{ background: REVIEW_COLORS.better }} /> Lepiej:{" "}
                            {review.better.label}
                          </>
                        ) : d.quality === "good" ? null : (
                          " · Żadna z gotowych opcji nie była lepsza."
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <button
              type="button"
              className="iqE-primary"
              onClick={() => start(nextDefinition(session.definition, props.position))}
            >
              Następna sytuacja <ArrowRight size={16} />
            </button>
            <div className="iqE-actions">
              <button
                type="button"
                className="iqE-secondary"
                onClick={() => play(session, 0, journeyDuration(session), "summary", true)}
              >
                <Play size={16} /> Cała akcja
              </button>
              <button
                type="button"
                className="iqE-secondary"
                onClick={() => start(nextContext(session.definition), true)}
              >
                Sprawdź w nowym układzie
              </button>
            </div>
            <div className="iqE-between">
              <button className="iqE-link" type="button" onClick={exportAttempt}>
                Pobierz zapis
              </button>
              <button className="iqE-link" type="button" onClick={() => setSheet("history")}>
                <History size={15} /> Historia i kopie
              </button>
            </div>
          </section>
        )}
      </footer>
      <dialog
        ref={dialog}
        className="iqE-sheet"
        onCancel={(e) => {
          e.preventDefault();
          setSheet(null);
        }}
      >
        <div className="iqE-between">
          <button className="iqE-link" type="button" onClick={() => setSheet(null)}>
            <ChevronDown size={18} /> Zwiń
          </button>
          <button
            className="iqE-icon"
            type="button"
            onClick={() => setSheet(null)}
            aria-label="Zamknij"
          >
            <X size={20} />
          </button>
        </div>
        {sheet === "help" && (
          <>
            <h2>Jak grać</h2>
            <ol className="iqE-steps">
              {startLines(session, mode).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            <h3 className="iqE-sources-title">Źródła</h3>
            <ul className="iqE-sources">
              {(situation?.sources ?? (Object.keys(iqSources) as (keyof typeof iqSources)[])).map(
                (id) => (
                  <li key={id}>
                    <a href={iqSources[id].url} target="_blank" rel="noreferrer">
                      {iqSources[id].label}
                    </a>
                  </li>
                ),
              )}
            </ul>
          </>
        )}
        {sheet === "history" && (
          <>
            <h2>Historia IQ</h2>
            <p>Ukończone lekcje i zapis do pobrania.</p>
            {(() => {
              try {
                const rows = loadJourneyHistory(historyOwner);
                return (
                  <>
                    <div className="iqE-role-list">
                      {rows
                        .filter((r) =>
                          [LIVE_BANK_VERSION, ATTACK_BANK_VERSION].includes(r.bankVersion),
                        )
                        .slice(-20)
                        .reverse()
                        .map((row) => (
                          <button
                            type="button"
                            key={row.id}
                            onClick={() => {
                              const restored = restoreJourney(row);
                              completed.current.add(row.id);
                              setSession(restored);
                              setId(row.id);
                              setMode(row.mode);
                              setPhase("summary");
                              setSheet(null);
                              setSaved(true);
                              setError("");
                            }}
                          >
                            <span>
                              {new Date(row.createdAt).toLocaleDateString("pl")} ·{" "}
                              {row.mode === "learn" ? "Lekcja" : "Samodzielnie"}
                            </span>
                            {
                              [...advancedJourneyBank, ...situationBank].find(
                                (d) => d.id === row.scenarioId,
                              )?.title
                            }
                          </button>
                        ))}
                    </div>
                    {!rows.length && <p>Twoja pierwsza ukończona lekcja pojawi się tutaj.</p>}
                    <button
                      className="iqE-secondary"
                      type="button"
                      onClick={() => {
                        void downloadText(
                          "ballwise-iq-kopia.json",
                          JSON.stringify(
                            createJourneyBackup(rows, loadJourneyDraft(historyOwner)),
                            null,
                            2,
                          ),
                          "application/json",
                          historyOwner,
                        ).catch(() => setError("Nie udało się pobrać kopii."));
                      }}
                    >
                      Pobierz pełną kopię IQ
                    </button>
                  </>
                );
              } catch {
                return (
                  <p>Nie udało się odczytać historii. Dotychczasowe pliki pozostają zachowane.</p>
                );
              }
            })()}
            <button
              className="iqE-link"
              type="button"
              onClick={() => {
                setSheet(null);
                setArchive(true);
              }}
            >
              Starsze próby i przywracanie kopii
            </button>
          </>
        )}
        {sheet === "roles" && (
          <>
            <h2>Wybierz sytuację</h2>
            <div className="iqE-intro-options">
              <button type="button" aria-pressed={!pickAll} onClick={() => setPickAll(false)}>
                Twoja pozycja
              </button>
              <button type="button" aria-pressed={pickAll} onClick={() => setPickAll(true)}>
                Wszystkie pozycje
              </button>
            </div>
            {(["build", "attack", "transition", "defend"] as const).map((moment) => {
              const group = items.filter((i) => i.moment === moment);
              if (!group.length) return null;
              return (
                <section key={moment} className="iqE-pick-group">
                  <h3>{momentLabel(moment)}</h3>
                  <div className="iqE-role-list">
                    {group.map((i) => (
                      <button
                        type="button"
                        key={i.def.id}
                        aria-current={i.def.topicId === session.definition.topicId}
                        onClick={() => start(i.def)}
                      >
                        <span>{i.role}</span>
                        {i.def.title}
                        <ArrowRight size={17} />
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            <button type="button" className="iqE-secondary" onClick={() => setSheet("history")}>
              <History size={16} /> Historia i kopie
            </button>
          </>
        )}
        {sheet === "settings" && draft && (
          <>
            <h2>Wykonanie</h2>
            <p>
              Miejsce wybierasz na boisku. Tutaj dopasujesz moment
              {draft.intent === "pass" ? " i tor piłki" : " ruchu"}.
            </p>
            <div className="iqE-intro-options">
              {(["now", "delay"] as const).map((timing) => (
                <button
                  type="button"
                  key={timing}
                  aria-pressed={draft.timing === timing}
                  onClick={() =>
                    setDraft(
                      liveChoice(
                        controlled,
                        draft.intent!,
                        draft.point,
                        draft.targetId,
                        draft.delivery,
                        timing,
                      ),
                    )
                  }
                >
                  {timing === "now" ? "Teraz" : "Po chwili"}
                </button>
              ))}
            </div>
            {draft.intent === "pass" && (
              <div className="iqE-intro-options">
                {(["ground", "chip", "lofted"] as const).map((delivery) => (
                  <button
                    type="button"
                    key={delivery}
                    aria-pressed={draft.delivery === delivery}
                    onClick={() =>
                      setDraft(
                        liveChoice(
                          controlled,
                          "pass",
                          draft.point,
                          draft.targetId,
                          delivery,
                          draft.timing,
                        ),
                      )
                    }
                  >
                    {delivery === "ground"
                      ? "Po ziemi"
                      : delivery === "chip"
                        ? "Podcięcie"
                        : "Przerzut"}
                  </button>
                ))}
              </div>
            )}
            <button className="iqE-primary" type="button" onClick={() => setSheet(null)}>
              Wróć do boiska
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
