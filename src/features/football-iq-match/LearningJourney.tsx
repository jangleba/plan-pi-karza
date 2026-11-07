import { attackReplay } from "./attackReplay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleHelp,
  History,
  Lightbulb,
  MoveUpRight,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
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
import {
  lessonGoal,
  lessonHint,
  lessonQuestion,
  lessonTakeaway,
  LIVE_BANK_VERSION,
  ATTACK_BANK_VERSION,
} from "./liveLesson";
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
import type {
  JourneyChoice,
  JourneyDefinition,
  JourneyMode,
  JourneySession,
} from "./journeyTypes";
import type { PlannedAction, Point } from "./types";
import "./learning.css";

type Props = React.ComponentProps<typeof FootballIQJourney>;
type Phase = "intro" | "decision" | "playing" | "feedback" | "summary";
type Sheet = "help" | "hint" | "roles" | "settings" | "history" | null;
const EMPTY: PlannedAction[] = [];
const newId = () =>
  `iq8-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
function startDefinition(position?: string, index?: number) {
  const roles = rolesForPosition(position);
  return (
    advancedJourneyBank[index ?? -1] ??
    advancedJourneyBank.find(
      (d) =>
        d.role === roles[0] && d.concept === "third-player" && d.context === 0,
    )!
  );
}
function initial(props: Props) {
  const fresh = () => ({
    session: createJourneyForRules(
      startDefinition(props.position, props.initialScenario),
      9,
    ),
    mode: "learn" as JourneyMode,
    id: newId(),
    resumed: false,
    firstVisit: true,
    error: "",
  });
  if (!props.historyOwner) return fresh();
  try {
    const draft = loadJourneyDraft(props.historyOwner);
    if (
      draft &&
      [LIVE_BANK_VERSION, ATTACK_BANK_VERSION].includes(draft.bankVersion)
    )
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
  const [sheet, setSheet] = useState<Sheet>(
      !boot.resumed &&
        boot.firstVisit &&
        props.showOnboardingInitially !== false
        ? "help"
        : null,
    ),
    [guide, setGuide] = useState(0),
    [tool, setTool] = useState<"ball" | "move" | "shoot">("move");
  const [draft, setDraft] = useState<JourneyChoice | null>(null),
    [takeover, setTakeover] = useState(false),
    [ready, setReady] = useState(false);
  const [archive, setArchive] = useState(false),
    [replay, setReplay] = useState<JourneySession | null>(null);
  const [paused, setPaused] = useState(false),
    [playTime, setPlayTime] = useState(0),
    [reflection, setReflection] = useState("");
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
  const actor = takeover ? session.world.carrierId : "you";
  const controlled = useMemo(
    () => ({ ...session, controlledId: actor }),
    [session, actor],
  );
  const tutorial = sheet === "help";
  const demo = useMemo(() => {
    const s = createJourneyForRules(
      advancedJourneyBank.find((d) => d.id === "iqx-wing-0-0")!,
      9,
    );
    if (guide < 2) s.world.carrierId = "you";
    return s;
  }, [guide]);
  const displayed = tutorial ? demo : (replay ?? session);
  current.current = displayed;
  const sampleFrame = useCallback(
    () => sampleJourney(current.current, playhead.current),
    [],
  );
  const idleFrame = useMemo(
    () =>
      journeyFrame(
        displayed.world,
        displayed.players,
        journeyDuration(displayed),
      ),
    [displayed],
  );
  const isPlaying = phase === "playing";
  const playable = ready && phase === "decision" && !sheet && !error;
  const own =
    controlled.world.carrierId === actor && !controlled.world.looseBall;
  const liveFrame = isPlaying && !tutorial ? sampleFrame() : idleFrame;
  const carrier = displayed.players.find(
    (p) => p.id === liveFrame.ballCarrierId,
  )!;
  const you = displayed.players.find((p) => p.id === "you")!;
  useEffect(() => {
    document.body.classList.toggle("iq-learning-focus", !archive);
    return () => document.body.classList.remove("iq-learning-focus");
  }, [archive]);
  useEffect(() => {
    if (sheet && sheet !== "help") dialog.current?.showModal();
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
      if (
        previousDraft &&
        previousDraft.id !== id &&
        !allowedReplacement.current
      )
        throw new Error("Inna akcja jest niedokończona.");
      if (
        previousDraft?.id === id &&
        previousDraft.choices.some(
          (c, i) => c.id !== session.decisions[i]?.choiceId,
        )
      )
        throw new Error("Zapis zmienił się na innym urządzeniu.");
      if (session.outcome) {
        if (!completed.current.has(id)) {
          saveJourneyAttempt(
            historyOwner,
            makeJourneyAttempt(session, mode, id),
          );
          if (
            !previousDraft ||
            previousDraft.id === id ||
            allowedReplacement.current
          )
            saveJourneyDraft(historyOwner, session, mode, id);
          completed.current.add(id);
          setSaved(!!historyOwner);
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
  function play(
    s: JourneySession,
    from: number,
    to: number,
    after: Phase,
    asReplay = false,
  ) {
    range.current = { from, to };
    playhead.current = from;
    setPlayTime(from);
    setPaused(false);
    if (asReplay) setReplay(s);
    returnPhase.current = after;
    setPhase("playing");
  }
  function choosePoint(point: Point, targetId?: string) {
    if (tutorial) {
      if (guide === 0) {
        if (targetId === "you") setGuide(1);
        return;
      }
      setDraft(
        liveChoice(
          demo,
          guide === 1 ? "pass" : "move",
          point,
          guide === 1 &&
            targetId !== "you" &&
            demo.players.find((p) => p.id === targetId)?.team === "home"
            ? targetId
            : undefined,
        ),
      );
      return;
    }
    if (!playable) return;
    try {
      const target = session.players.find((p) => p.id === targetId);
      if (targetId === actor) {
        setDraft(liveChoice(controlled, own ? "hold" : "wait", point));
        return;
      }
      const intent =
        tool === "shoot" && own
          ? "shoot"
          : tool === "ball" && own
            ? "pass"
            : own
              ? "carry"
              : "move";
      setDraft(
        liveChoice(
          controlled,
          intent,
          point,
          intent === "pass" && target?.team === "home" ? targetId : undefined,
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Nie udało się zaplanować ruchu.",
      );
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
      setTakeover(false);
      setTool("move");
      setReflection("");
      play(
        next,
        from,
        journeyDuration(next),
        guided ? "feedback" : next.outcome ? "summary" : "decision",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Nie udało się rozegrać akcji.",
      );
    }
  }
  function start(def: JourneyDefinition, test = false) {
    allowedReplacement.current = false;
    setSession(createJourneyForRules(def, 9));
    setMode(test ? "challenge" : "learn");
    setId(newId());
    setPhase("intro");
    setDraft(null);
    setTakeover(false);
    setReplay(null);
    setSaved(false);
    setSheet(null);
    setTransfer(test);
    setReflection("");
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
          setError(
            "Kopia nie została pobrana. Dotychczasowy zapis pozostaje zachowany.",
          ),
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
          playerId: tutorial ? "you" : actor,
          targetId: draft.targetId ?? "space",
          from: displayed.world.positions[tutorial ? "you" : actor],
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
  const analysisPaths = useMemo(
    () => attackReplay(displayed, replayBeat),
    [displayed, replayBeat],
  );
  const showAnalysis = !!replay && !tutorial;
  const scoreReached =
    !isPlaying || playTime >= journeyDuration(displayed) - 0.001;
  const visibleHome = scoreReached ? (displayed.attack?.home ?? 0) : 0;
  const visibleAway = scoreReached ? (displayed.attack?.away ?? 0) : 0;
  const decisionNumber = isPlaying
    ? Math.max(
        1,
        (displayed.decisions.find(
          (d) => d.firstBeat <= replayBeat && d.lastBeat >= replayBeat,
        )?.index ?? 0) + 1,
      )
    : phase === "decision" || phase === "intro"
      ? session.step + 1
      : Math.max(1, session.step);

  if (archive)
    return <FootballIQJourney {...props} onBack={() => setArchive(false)} />;
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
          >
            IQ · {roleLabels[session.definition.role]} <ChevronDown size={14} />
          </button>
          <button
            className="iqE-icon"
            type="button"
            onClick={() => {
              setGuide(0);
              setDraft(null);
              setSheet("help");
            }}
            aria-label="Jak grać"
          >
            <CircleHelp size={21} />
          </button>
        </div>
        <div className="iqE-context">
          <span>
            {session.attack
              ? `${session.definition.context === 0 ? "78" : session.definition.context === 1 ? "54" : "82"}′ · ${(session.definition.context === 0 ? 1 : 0) + visibleHome}:${(session.definition.context === 2 ? 1 : 0) + visibleAway}`
              : session.definition.contextLabel
                  .split(" · ")
                  .slice(0, 2)
                  .join(" · ")}
          </span>
          <span>
            {transfer ? "Nowy układ" : "Lekcja"} ·{" "}
            {session.rulesVersion === 9
              ? `Decyzja ${decisionNumber} · ${Math.round(isPlaying ? playTime : (session.attack?.elapsed ?? 0))} s gry`
              : `${Math.min(3, session.step + 1)}/3`}
          </span>
        </div>
        <p className="iqE-goal">{lessonGoal(session)}</p>
      </header>
      <div className="iqE-meta">
        <span>
          <i className="iqE-dot" /> TY: {you.number}
        </span>
        <span>
          {displayed.world.looseBall && !isPlaying
            ? "Piłka bez kontroli"
            : liveFrame.ballInFlight
              ? "Piłka w grze"
              : `Piłkę ma: ${carrier.team === "home" ? "Twój" : "rywal"} ${carrier.number}`}
        </span>
        <span className="iqE-direction">
          Atakujesz <span className="iqE-up">↑</span>
          <span className="iqE-right">→</span>
        </span>
      </div>
      <main className="iqE-pitch" aria-label="Boisko do podejmowania decyzji">
        <TacticalPitch
          scenario={displayed.scenario}
          actions={showAnalysis ? analysisPaths : preview}
          selectedPlayerId={tutorial ? "you" : actor}
          mode={tool === "shoot" ? "shot" : tool === "ball" ? "pass" : "run"}
          interactive={tutorial || (playable && !isPlaying)}
          playing={isPlaying && !paused && !tutorial}
          fixedView
          landscapeView
          compactFigures
          portraitThreshold={0.62}
          visibleLabelIds={["you", carrier.id].filter(
            (v, i, a) => a.indexOf(v) === i,
          )}
          selectablePlayerIds={displayed.players.map((p) => p.id)}
          frameOverride={isPlaying && !tutorial ? liveFrame : idleFrame}
          frameSource={isPlaying && !tutorial ? sampleFrame : undefined}
          onPlayerSelect={(p) =>
            choosePoint(displayed.world.positions[p.id], p.id)
          }
          onPitchSelect={(p) => choosePoint(p)}
          onReadyChange={setReady}
          showActionOrders={false}
          showGuidance={showAnalysis || !!draft}
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
        {phase === "intro" && !tutorial && (
          <div className="iqE-opening">
            <span>Najpierw cel, potem decyzja</span>
            <p>
              {transfer
                ? "Obrońca zachowa się inaczej. Sprawdź nowy układ i dopasuj rozwiązanie."
                : lessonQuestion(session)}
            </p>
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
            <button
              type="button"
              className="iqE-link"
              onClick={() => setSheet("roles")}
            >
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
        {tutorial ? (
          <section className="iqE-guide" aria-label="Krótka instrukcja">
            <div className="iqE-between">
              <span>Jak grać · {guide + 1}/3</span>
              <button
                type="button"
                className="iqE-link"
                onClick={() => {
                  setSheet(null);
                  setDraft(null);
                }}
              >
                Pomiń
              </button>
            </div>
            <h2>
              {guide === 0
                ? "Znajdź siebie"
                : guide === 1
                  ? "Podaj tam, gdzie chcesz"
                  : "Zaplanuj własny ruch"}
            </h2>
            <p>
              {guide === 0
                ? "Niebieski TY to Ty. Dotknij go na boisku."
                : guide === 1
                  ? "W tym ćwiczeniu masz piłkę. Dotknij partnera albo wolnej przestrzeni — pojawi się podgląd podania."
                  : "Teraz piłkę ma partner. Dotknij miejsca, do którego chcesz pobiec. Rywalami nie sterujesz."}
            </p>
            {guide > 0 && draft && (
              <button
                type="button"
                className="iqE-primary"
                onClick={() => {
                  setDraft(null);
                  if (guide === 1) setGuide(2);
                  else setSheet(null);
                }}
              >
                {guide === 1
                  ? "Widzę podanie · dalej"
                  : "Rozumiem · wróć do lekcji"}{" "}
                <ArrowRight size={17} />
              </button>
            )}
          </section>
        ) : phase === "intro" ? (
          <>
            <div className="iqE-between">
              <span className="iqE-eyebrow">
                {transfer
                  ? "Sprawdź zrozumienie"
                  : "Cała akcja · aż do wykończenia"}
              </span>
              <button
                type="button"
                className="iqE-link"
                onClick={() => {
                  setGuide(0);
                  setDraft(null);
                  setSheet("help");
                }}
              >
                Instrukcja
              </button>
            </div>
            <div className="iqE-intro-options">
              <button
                type="button"
                aria-pressed={mode === "learn"}
                onClick={() => setMode("learn")}
              >
                Z komentarzem
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
              Obserwuj · zaczynam <ArrowRight size={17} />
            </button>
          </>
        ) : phase === "decision" ? (
          <>
            <p className="iqE-question">{lessonQuestion(session)}</p>
            <div className="iqE-controls">
              <div
                className="iqE-tools"
                role="group"
                aria-label="Rodzaj działania"
              >
                <button
                  type="button"
                  aria-pressed={tool === "ball"}
                  disabled={!own}
                  onClick={() => {
                    setTool("ball");
                    setDraft(null);
                  }}
                >
                  <span>⚽</span> Piłka
                </button>
                <button
                  type="button"
                  aria-pressed={tool === "move"}
                  onClick={() => {
                    setTool("move");
                    setDraft(null);
                  }}
                >
                  <MoveUpRight size={16} /> {own ? "Prowadzenie" : "Twój ruch"}
                </button>
                {session.rulesVersion === 9 && (
                  <button
                    type="button"
                    aria-pressed={tool === "shoot"}
                    disabled={!own}
                    onClick={() => {
                      setTool("shoot");
                      setDraft(null);
                    }}
                  >
                    Strzał
                  </button>
                )}
              </div>
              {guided && (
                <button
                  className="iqE-icon"
                  type="button"
                  aria-label="Wskazówka"
                  onClick={() => setSheet("hint")}
                >
                  <Lightbulb size={19} />
                </button>
              )}
            </div>
            {session.rulesVersion === 9 && tool === "shoot" && own && (
              <div className="iqE-aim" role="group" aria-label="Cel strzału">
                {[
                  { x: 43.5, label: "Lewy róg" },
                  { x: 50, label: "Środek" },
                  { x: 56.5, label: "Prawy róg" },
                ].map((a) => (
                  <button
                    type="button"
                    key={a.x}
                    onClick={() =>
                      setDraft(
                        liveChoice(controlled, "shoot", { x: a.x, y: 0 }),
                      )
                    }
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            <div className="iqE-plan">
              <span>
                {draft
                  ? draft.label
                  : own
                    ? tool === "shoot"
                      ? "Wskaż kierunek strzału na boisku. Cel jest przy bramce rywali."
                      : tool === "ball"
                        ? "Dotknij celu podania na boisku."
                        : "Dotknij miejsca prowadzenia piłki."
                    : carrier.team === "home"
                      ? "Piłkę ma partner. Wybierz miejsce własnego ruchu."
                      : "Piłkę ma rywal. Wybierz własną pozycję."}
              </span>
              {draft && (
                <button
                  className="iqE-icon"
                  type="button"
                  aria-label="Usuń plan"
                  onClick={() => setDraft(null)}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="iqE-actions">
              {draft ? (
                <>
                  <button
                    className="iqE-primary"
                    type="button"
                    disabled={!playable}
                    onClick={commit}
                  >
                    Rozegraj <Play size={16} />
                  </button>
                  <button
                    className="iqE-icon iqE-bordered"
                    type="button"
                    aria-label="Wykonanie"
                    onClick={() => setSheet("settings")}
                  >
                    <Settings2 size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="iqE-secondary"
                    disabled={!playable}
                    onClick={() =>
                      setDraft(
                        liveChoice(
                          controlled,
                          own ? "hold" : "wait",
                          session.world.positions[actor],
                        ),
                      )
                    }
                  >
                    Pozostań w pozycji
                  </button>
                  {!own && carrier.team === "home" && (
                    <button
                      type="button"
                      className="iqE-link"
                      onClick={() => {
                        setTakeover(true);
                        setTool("ball");
                        setDraft(null);
                      }}
                    >
                      Jedno zagranie za {carrier.number}
                    </button>
                  )}
                  {takeover && (
                    <button
                      type="button"
                      className="iqE-link"
                      onClick={() => {
                        setTakeover(false);
                        setTool("move");
                        setDraft(null);
                      }}
                    >
                      Wróć do TY
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        ) : phase === "playing" ? (
          <div className="iqE-coach" aria-live="polite">
            <span>{replay ? "Porównaj przebieg" : "Obserwuj reakcję"}</span>
            <p>
              {guided
                ? (event?.text ?? "Śledź piłkę i zmianę ustawienia rywala.")
                : "Akcja w ruchu. Zwróć uwagę na następną możliwość."}
            </p>
          </div>
        ) : phase === "feedback" ? (
          <>
            <p className="iqE-question">Co zmieniło się po Twoim wyborze?</p>
            <p className="iqE-feedback">{lastDecision?.why}</p>
            <div className="iqE-actions">
              <button
                type="button"
                className="iqE-primary"
                onClick={() =>
                  setPhase(session.outcome ? "summary" : "decision")
                }
              >
                {session.outcome
                  ? "Zobacz wniosek"
                  : "Podejmij następną decyzję"}{" "}
                <ArrowRight size={16} />
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
          <section className="iqE-summary" aria-label="Wniosek z lekcji">
            <div className="iqE-between">
              <span className="iqE-eyebrow">
                {transfer ? "Próba w nowym układzie" : "Wniosek na boisko"}
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
                  ? visibleHome
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
            <details>
              <summary>Przyczyna → reakcja → następna opcja</summary>
              {session.decisions.map((d, i) => (
                <p key={d.choiceId + i}>
                  <strong>
                    {i + 1}. {d.label}.
                  </strong>{" "}
                  {d.why}
                </p>
              ))}
            </details>
            <div className="iqE-actions">
              <button
                type="button"
                className="iqE-secondary"
                onClick={() =>
                  play(session, 0, journeyDuration(session), "summary", true)
                }
              >
                <Play size={16} /> Cała akcja
              </button>
              <button
                type="button"
                className="iqE-secondary"
                onClick={() => {
                  const index = session.decisions.findIndex(
                    (d) => d.alternative,
                  );
                  let alt = createJourneyForRules(
                    session.definition,
                    session.rulesVersion ?? 8,
                  );
                  for (const d of session.decisions.slice(0, index))
                    alt = chooseJourney(
                      alt,
                      d.choiceId,
                      d.decisionSeconds,
                      false,
                    );
                  const from = journeyDuration(alt),
                    c = session.decisions[index]?.alternative;
                  if (c) {
                    alt = chooseJourney(alt, c.id, 0, false);
                    play(alt, from, journeyDuration(alt), "summary", true);
                  }
                }}
              >
                Porównaj inny wybór
              </button>
            </div>
            <label className="iqE-reflection">
              Co sprawdzisz przed następnym zagraniem?
              <input
                value={reflection}
                onChange={(e) => setReflection(e.target.value.slice(0, 180))}
                placeholder="Twoja krótka odpowiedź — opcjonalnie"
              />
            </label>
            <button
              type="button"
              className="iqE-primary"
              onClick={() =>
                start(
                  advancedJourneyBank.find(
                    (d) =>
                      d.topicId === session.definition.topicId &&
                      d.context === (session.definition.context + 1) % 3,
                  )!,
                  true,
                )
              }
            >
              Sprawdź w nowym układzie <ArrowRight size={16} />
            </button>
            <div className="iqE-between">
              <button
                className="iqE-link"
                type="button"
                onClick={exportAttempt}
              >
                Pobierz zapis
              </button>
              <button
                className="iqE-link"
                type="button"
                onClick={() => setSheet("history")}
              >
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
          <button
            className="iqE-link"
            type="button"
            onClick={() => setSheet(null)}
          >
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
                          [LIVE_BANK_VERSION, ATTACK_BANK_VERSION].includes(
                            r.bankVersion,
                          ),
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
                              {new Date(row.createdAt).toLocaleDateString("pl")}{" "}
                              ·{" "}
                              {row.mode === "learn" ? "Lekcja" : "Samodzielnie"}
                            </span>
                            {
                              advancedJourneyBank.find(
                                (d) => d.id === row.scenarioId,
                              )?.title
                            }
                          </button>
                        ))}
                    </div>
                    {!rows.length && (
                      <p>Twoja pierwsza ukończona lekcja pojawi się tutaj.</p>
                    )}
                    <button
                      className="iqE-secondary"
                      type="button"
                      onClick={() => {
                        void downloadText(
                          "ballwise-iq-kopia.json",
                          JSON.stringify(
                            createJourneyBackup(
                              rows,
                              loadJourneyDraft(historyOwner),
                            ),
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
                  <p>
                    Nie udało się odczytać historii. Dotychczasowe pliki
                    pozostają zachowane.
                  </p>
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
        {sheet === "hint" && (
          <>
            <h2>Najpierw pomyśl</h2>
            <p>{lessonHint(session)}</p>
            <p>Nie musisz otrzymać piłki, żeby Twój ruch pomógł drużynie.</p>
          </>
        )}
        {sheet === "roles" && (
          <>
            <h2>Twoja pozycja, Twój problem</h2>
            <p>Wybierz sytuację. Zapisana historia pozostaje w archiwum.</p>
            <div className="iqE-role-list">
              {advancedJourneyBank
                .filter(
                  (d) =>
                    rolesForPosition(props.position).includes(d.role) &&
                    d.context === 0,
                )
                .map((d) => (
                  <button type="button" key={d.id} onClick={() => start(d)}>
                    <span>{roleLabels[d.role]}</span>
                    {d.title}
                    <ArrowRight size={17} />
                  </button>
                ))}
            </div>
            <button
              type="button"
              className="iqE-secondary"
              onClick={() => setSheet("history")}
            >
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
            <button
              className="iqE-primary"
              type="button"
              onClick={() => setSheet(null)}
            >
              Wróć do boiska
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
