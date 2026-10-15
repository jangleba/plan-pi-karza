import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { TacticalPitch } from "./TacticalPitch";
import { journeyBank, roleLabels, rolesForPosition } from "./journeyBank";
import {
  chooseJourney,
  createJourney,
  journeyDuration,
  journeyCameraPoints,
  journeyFrame,
  journeyStep,
  journeyVerdict,
  sampleJourney,
} from "./journeyEngine";
import {
  loadJourneyDraft,
  loadJourneyHistory,
  makeJourneyAttempt,
  restoreJourney,
  saveJourneyAttempt,
  saveJourneyDraft,
} from "./journeyHistory";
import { loadIQHistory } from "./history";
import type {
  IQRole,
  JourneyAction,
  JourneyAttempt,
  JourneyDefinition,
  JourneyMode,
  JourneySession,
} from "./journeyTypes";
import type { EvaluationLevel, PlannedAction, Point } from "./types";
import "./football-iq.css";
import "./journey.css";

type Props = {
  initialScenario?: number;
  showOnboardingInitially?: boolean;
  onBack?: () => void;
  onComplete?: (result: { scenarioId: string; verdict: EvaluationLevel }) => void;
  historyOwner?: string;
  position?: string;
};
type View = "decision" | "playing" | "summary" | "review";
type Transport = {
  kind: "live" | "replay" | "step" | "alternative";
  from: number;
  to: number;
  paused: boolean;
};
const EMPTY_ACTIONS: PlannedAction[] = [];
const EMPTY_IDS: string[] = [];
const labels: Record<JourneyAction, string> = {
  pass: "Podanie",
  move: "Ruch bez piłki",
  carry: "Prowadzenie",
  cover: "Asekuracja",
  press: "Doskok",
  mark: "Krycie",
  finish: "Zakończenie",
};
const endings = {
  progress: "Otworzyłeś grę do przodu.",
  retained: "Utrzymałeś akcję.",
  chance: "Akcja zakończona próbą.",
  blocked: "Akcja została zatrzymana.",
  loss: "Strata piłki.",
  recovered: "Piłka odzyskana.",
};
const verdictLabels = {
  strong: "Dobre decyzje",
  conditional: "Możliwe inne rozwiązanie",
  risky: "Moment do poprawy",
};
const secondsLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function boundedIndex(value: number, length: number) {
  return ((Math.trunc(Number.isFinite(value) ? value : 0) % length) + length) % length;
}
function poolFor(position: string | undefined) {
  const roles = rolesForPosition(position);
  return journeyBank.filter((s) => roles.includes(s.role));
}
function scenarioForStart(position: string | undefined, index: number) {
  const pool = poolFor(position);
  return pool[boundedIndex(index, pool.length)];
}

export function FootballIQJourney({
  initialScenario = 0,
  onBack,
  onComplete,
  historyOwner,
  position,
}: Props) {
  const initial = useMemo(
    () => scenarioForStart(position, initialScenario),
    [position, initialScenario],
  );
  const [session, setSession] = useState(() => createJourney(initial));
  const [mode, setMode] = useState<JourneyMode>("learn");
  const [view, setView] = useState<View>("decision");
  const [booted, setBooted] = useState(false),
    [ready, setReady] = useState(false);
  const [hinted, setHinted] = useState(false),
    [note, setNote] = useState("");
  const [history, setHistory] = useState<JourneyAttempt[]>([]),
    [legacyCount, setLegacyCount] = useState(0);
  const [picker, setPicker] = useState(false),
    [help, setHelp] = useState(false);
  const [roleFilter, setRoleFilter] = useState<IQRole | "profile" | "all">("profile");
  const [query, setQuery] = useState("");
  const [reviewIndex, setReviewIndex] = useState(0),
    [showAfter, setShowAfter] = useState(false);
  const [alternative, setAlternative] = useState<JourneySession | null>(null),
    [comparing, setComparing] = useState(false);
  const [transport, setTransport] = useState<Transport | null>(null),
    [playhead, setPlayhead] = useState(0),
    [speed, setSpeed] = useState(1);
  const [reduced, setReduced] = useState(false);
  const playheadRef = useRef(0),
    choiceLock = useRef(false),
    attemptId = useRef(""),
    saved = useRef(""),
    notified = useRef("");
  const elapsed = useRef(0),
    lastTiming = useRef(0),
    finishTransport = useRef<() => void>(() => {});
  const dialog = useRef<HTMLDialogElement>(null),
    helpDialog = useRef<HTMLDialogElement>(null),
    pickerTrigger = useRef<HTMLButtonElement>(null);
  const allowedRoles = useMemo(() => rolesForPosition(position), [position]);
  const selectedStep = useMemo(() => (!session.outcome ? journeyStep(session) : null), [session]);
  const decision = session.decisions[reviewIndex];
  const duration = useMemo(() => journeyDuration(session), [session]);
  const cameraActions = useMemo<PlannedAction[]>(
    () =>
      journeyCameraPoints(session).map((point, index) => ({
        id: `camera-${index}`,
        type: "run",
        playerId: "you",
        from: point,
        to: point,
      })),
    [session],
  );
  const animationSession = transport?.kind === "alternative" && alternative ? alternative : session;
  const frame = useMemo(() => {
    if (transport) return sampleJourney(animationSession, playhead);
    if (view === "review" && decision)
      return journeyFrame(
        comparing && alternative ? alternative.world : showAfter ? decision.after : decision.before,
        session.players,
      );
    return journeyFrame(session.world, session.players);
  }, [
    transport,
    animationSession,
    playhead,
    view,
    decision,
    comparing,
    alternative,
    showAfter,
    session,
  ]);
  const interactive = booted && ready && view === "decision" && !transport && !picker && !help;
  const selectable = useMemo(
    () =>
      interactive && selectedStep
        ? selectedStep.choices.flatMap((c) => (c.targetId ? [c.targetId] : []))
        : EMPTY_IDS,
    [interactive, selectedStep],
  );
  const destinations = useMemo(
    () =>
      interactive && selectedStep && !["pass", "finish"].includes(selectedStep.kind)
        ? selectedStep.choices.map((c) => ({ id: c.id, point: c.point, label: c.label }))
        : [],
    [interactive, selectedStep],
  );
  const currentChoices = useMemo(() => {
    if (!decision || view !== "review") return null;
    let base = createJourney(session.definition);
    session.decisions.slice(0, reviewIndex).forEach((d) => {
      base = chooseJourney(base, d.choiceId, d.decisionSeconds);
    });
    return { base, step: journeyStep(base) };
  }, [decision, view, session.definition, session.decisions, reviewIndex]);
  const reviewActions = useMemo<PlannedAction[]>(() => {
    if (view !== "review" || !decision || !currentChoices || transport) return EMPTY_ACTIONS;
    const c = comparing
      ? decision.alternative
      : currentChoices.step.choices.find((c) => c.id === decision.choiceId);
    if (!c) return EMPTY_ACTIONS;
    const from = decision.before.positions.you;
    if (c.targetId)
      return [
        {
          id: "review-choice",
          type: "pass",
          playerId: "you",
          targetId: c.targetId,
          from,
          to: c.point,
        },
      ];
    return [{ id: "review-choice", type: "run", playerId: "you", from, to: c.point }];
  }, [view, decision, currentChoices, transport, comparing]);
  const highlights = useMemo<Point[] | undefined>(() => {
    if (view === "decision" && mode === "learn" && hinted && selectedStep) {
      const c = selectedStep.choices.find((c) => c.quality === "good");
      return c ? [c.point] : undefined;
    }
    if (view === "review" && comparing && decision?.alternative)
      return [decision.alternative.point];
    return undefined;
  }, [view, mode, hinted, selectedStep, comparing, decision]);

  useEffect(() => {
    attemptId.current = crypto.randomUUID();
    try {
      setHistory(loadJourneyHistory(historyOwner));
    } catch {
      setNote("Historia jest chwilowo niedostępna. Bieżąca akcja pozostaje dostępna.");
    }
    try {
      setLegacyCount(loadIQHistory(historyOwner).length);
    } catch {
      /* Old history is preserved under its original key. */
    }
    try {
      const draft = loadJourneyDraft(historyOwner);
      if (draft) {
        setSession(restoreJourney(draft));
        setMode(draft.mode);
        attemptId.current = draft.id;
      }
    } catch {
      setNote("Nie udało się przywrócić poprzedniej akcji. Możesz rozegrać nową.");
    }
    setBooted(true);
  }, [historyOwner]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => {
      document.body.style.overflow = previous;
      preference.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (!booted) return;
    if (session.outcome) {
      if (saved.current === attemptId.current) return;
      const attempt = makeJourneyAttempt(session, mode, attemptId.current);
      try {
        saveJourneyAttempt(historyOwner, attempt);
        saveJourneyDraft(historyOwner, session, mode, attemptId.current);
        saved.current = attemptId.current;
        setHistory((previous) =>
          previous.some((a) => a.id === attempt.id) ? previous : [...previous, attempt].slice(-100),
        );
      } catch {
        setNote("Nie udało się zapisać próby. Powtórka i analiza nadal działają w tej sesji.");
      }
    } else {
      try {
        saveJourneyDraft(historyOwner, session, mode, attemptId.current);
      } catch {
        setNote("Przeglądarka nie zapisała postępu. Dokończ akcję przed zamknięciem ekranu.");
      }
    }
  }, [booted, session, mode, historyOwner]);
  useEffect(() => {
    if (view !== "summary" || !session.outcome || notified.current === attemptId.current) return;
    notified.current = attemptId.current;
    onComplete?.({ scenarioId: session.definition.id, verdict: journeyVerdict(session) });
  }, [view, session, onComplete]);
  useEffect(() => {
    lastTiming.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (interactive && !document.hidden) elapsed.current += (now - lastTiming.current) / 1000;
      lastTiming.current = now;
    }, 200);
    return () => clearInterval(timer);
  }, [interactive]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) setTransport((p) => (p ? { ...p, paused: true } : p));
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (!ready) setTransport((p) => (p ? { ...p, paused: true } : p));
  }, [ready]);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (picker && !el.open) el.showModal();
    if (!picker && el.open) el.close();
  }, [picker]);
  useEffect(() => {
    const el = helpDialog.current;
    if (!el) return;
    if (help && !el.open) el.showModal();
    if (!help && el.open) el.close();
  }, [help]);
  finishTransport.current = () => {
    const kind = transport?.kind;
    setTransport(null);
    choiceLock.current = false;
    if (kind === "live") {
      setView(session.outcome ? "summary" : "decision");
      elapsed.current = 0;
    } else if (kind === "replay") setView("summary");
    else {
      setView("review");
      setShowAfter(true);
    }
  };
  useEffect(() => {
    if (!transport || transport.paused || !ready) return;
    if (reduced) {
      playheadRef.current = transport.to;
      setPlayhead(transport.to);
      finishTransport.current();
      return;
    }
    let handle = 0,
      last = performance.now(),
      cancelled = false;
    const tick = (now: number) => {
      if (cancelled) return;
      // Frames are sampled from a recorded timeline, so a slow GPU must not
      // stretch a five-second action into a much longer one.
      const delta = document.hidden ? 0 : Math.max(0, (now - last) / 1000);
      last = now;
      const next = Math.min(transport.to, playheadRef.current + delta * speed);
      playheadRef.current = next;
      setPlayhead(next);
      if (next >= transport.to) {
        finishTransport.current();
        return;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [transport, ready, speed, reduced]);
  function startTransport(next: Transport) {
    playheadRef.current = next.from;
    setPlayhead(next.from);
    setTransport(next);
    setView("playing");
  }
  function choose(choiceId: string) {
    if (!interactive || choiceLock.current) return;
    choiceLock.current = true;
    try {
      const next = chooseJourney(session, choiceId, elapsed.current);
      const start = journeyDuration(session);
      setSession(next);
      setHinted(false);
      startTransport({ kind: "live", from: start, to: journeyDuration(next), paused: false });
    } catch {
      choiceLock.current = false;
      setNote("Nie udało się wykonać tego wyboru. Spróbuj ponownie.");
    }
  }
  function openReview(index?: number) {
    const first = index ?? session.decisions.findIndex((d) => d.quality !== "good");
    setReviewIndex(Math.max(0, first));
    setView("review");
    setTransport(null);
    setComparing(false);
    setAlternative(null);
    setShowAfter(false);
  }
  function newScenario(definition: JourneyDefinition) {
    setTransport(null);
    playheadRef.current = 0;
    setPlayhead(0);
    choiceLock.current = false;
    setSession(createJourney(definition));
    setView("decision");
    setHinted(false);
    setComparing(false);
    setAlternative(null);
    setShowAfter(false);
    setReviewIndex(0);
    elapsed.current = 0;
    attemptId.current = crypto.randomUUID();
    setPicker(false);
  }
  function nextScenario() {
    const roles =
      roleFilter === "all"
        ? rolesForPosition()
        : roleFilter === "profile"
          ? allowedRoles
          : [roleFilter];
    const pool = journeyBank.filter((s) => roles.includes(s.role));
    const attempts = history.filter((a) => a.mode === mode);
    const seen = new Set(attempts.map((a) => a.scenarioId));
    const unseen = pool.find((s) => s.topicId !== session.definition.topicId && !seen.has(s.id));
    const index = pool.findIndex((s) => s.id === session.definition.id);
    newScenario(unseen ?? pool[(index + 1 + pool.length) % pool.length]);
  }
  function playAlternative() {
    if (!decision?.alternative || !currentChoices) return;
    const next = chooseJourney(currentChoices.base, decision.alternative.id);
    setAlternative(next);
    setComparing(true);
    startTransport({
      kind: "alternative",
      from: journeyDuration(currentChoices.base),
      to: journeyDuration(next),
      paused: false,
    });
  }
  const filteredBank = useMemo(() => {
    const roles =
      roleFilter === "all"
        ? rolesForPosition()
        : roleFilter === "profile"
          ? allowedRoles
          : [roleFilter];
    const q = query.trim().toLocaleLowerCase("pl");
    return journeyBank.filter(
      (s) =>
        roles.includes(s.role) &&
        (!q || `${s.title} ${s.focus} ${s.contextLabel}`.toLocaleLowerCase("pl").includes(q)),
    );
  }, [roleFilter, allowedRoles, query]);
  const modeLabel = mode === "learn" ? "Z podpowiedziami" : "Bez podpowiedzi";
  const playing = !!transport && !transport.paused && ready;
  const selectedShot = selectedStep?.choices.find((c) => c.id === "shot");
  const liveBeat = transport
    ? animationSession.beats.find(
        (_, i) =>
          animationSession.beats.slice(0, i + 1).reduce((n, b) => n + b.duration, 0) > playhead,
      )
    : null;
  const totalDone = history.filter((a) => a.mode === mode).length;
  const footerTitle =
    view === "summary"
      ? endings[session.outcome!]
      : view === "review"
        ? comparing
          ? "Lepszy wariant"
          : decision?.label
        : transport
          ? transport.kind === "live"
            ? "Akcja trwa…"
            : transport.kind === "alternative"
              ? "Sprawdź inne rozwiązanie"
              : "Twoja akcja"
          : selectedStep?.prompt;
  const footerDetail =
    view === "summary"
      ? "Obejrzyj swoje wybory w całości albo zatrzymaj konkretną decyzję."
      : view === "review"
        ? comparing
          ? decision?.alternative?.why
          : decision?.why
        : transport
          ? mode === "learn" || transport.kind !== "live"
            ? liveBeat?.text
            : "Obserwuj piłkę i ruch zawodników."
          : mode === "learn" && hinted
            ? selectedStep?.cue
            : selectedStep?.instruction;
  return (
    <section className="bwiq-app iq-journey" aria-label="BallWise IQ — pełne akcje">
      <header className="iqJ-header">
        <div className="iqJ-header-line">
          <button
            type="button"
            className="iqJ-icon"
            aria-label="Wróć do aplikacji"
            onClick={onBack}
          >
            <ArrowLeft size={21} />
          </button>
          <button
            type="button"
            className="iqJ-position"
            ref={pickerTrigger}
            onClick={() => {
              setTransport((p) => (p ? { ...p, paused: true } : p));
              setPicker(true);
            }}
            aria-label="Wybierz sytuację i rolę"
          >
            <span>IQ · {roleLabels[session.definition.role]}</span>
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            className="iqJ-icon"
            aria-label="Jak rozegrać akcję"
            onClick={() => {
              setTransport((p) => (p ? { ...p, paused: true } : p));
              setHelp(true);
            }}
          >
            <HelpCircle size={20} />
          </button>
        </div>
        <div className="iqJ-title">
          <h1>{session.definition.title}</h1>
          <span>
            {view === "review"
              ? `${reviewIndex + 1}/${session.decisions.length}`
              : `${Math.min(session.step + 1, 4)}/4`}
          </span>
        </div>
        {session.step === 0 && view === "decision" ? (
          <div className="iqJ-modes" role="group" aria-label="Tryb akcji">
            <button
              type="button"
              aria-pressed={mode === "learn"}
              onClick={() => {
                setMode("learn");
                setHinted(false);
              }}
            >
              Z podpowiedziami
            </button>
            <button
              type="button"
              aria-pressed={mode === "challenge"}
              onClick={() => {
                setMode("challenge");
                setHinted(false);
              }}
            >
              Bez podpowiedzi
            </button>
          </div>
        ) : (
          <div className="iqJ-mode-label">
            {modeLabel}
            <span>{session.definition.contextLabel}</span>
          </div>
        )}
        <div className="iqJ-progress" aria-label={`Decyzja ${Math.min(session.step + 1, 4)} z 4`}>
          {session.definition.steps.map((_, i) => (
            <span
              key={i}
              className={i < session.step ? "is-done" : i === session.step ? "is-current" : ""}
            />
          ))}
        </div>
      </header>
      <div className="iqJ-stage">
        {booted ? (
          <TacticalPitch
            scenario={session.scenario}
            actions={reviewActions}
            frameOverride={frame}
            focusOnActions
            cameraActions={cameraActions}
            selectedPlayerId="you"
            mode={selectedStep?.kind === "carry" ? "carry" : "pass"}
            interactive={interactive}
            playing={playing && !reduced}
            onReadyChange={setReady}
            selectablePlayerIds={selectable}
            onPlayerSelect={(player) => {
              const c = selectedStep?.choices.find((c) => c.targetId === player.id);
              if (c) choose(c.id);
            }}
            onPitchSelect={() => {}}
            destinations={destinations}
            onDestinationSelect={choose}
            showActionOrders={false}
            highlights={highlights}
            highlightGood
          />
        ) : (
          <div className="iqJ-preparing" role="status">
            Przygotowuję akcję…
          </div>
        )}
        <div className="iqJ-field-status" aria-hidden="true">
          {transport
            ? transport.kind === "live"
              ? "Akcja w ruchu"
              : "Powtórka"
            : session.world.carrierId === "you"
              ? "Masz piłkę"
              : session.world.carrierId.startsWith("r")
                ? "Piłka rywali"
                : "Piłka u partnera"}
        </div>
      </div>
      <footer className="iqJ-footer" aria-live="polite" aria-atomic="true">
        <span className="iqJ-kicker">
          {view === "summary"
            ? verdictLabels[journeyVerdict(session)]
            : view === "review"
              ? decision?.quality === "good"
                ? "Dobra decyzja"
                : decision?.quality === "possible"
                  ? "Możliwe, ale trudniejsze"
                  : "Moment do poprawy"
              : transport
                ? "Obserwuj reakcję"
                : selectedStep
                  ? labels[selectedStep.kind]
                  : ""}
        </span>
        <h2>{footerTitle}</h2>
        <p>{footerDetail}</p>
        {view === "decision" && (
          <div className="iqJ-actions">
            {mode === "learn" && (
              <button
                type="button"
                className="iqJ-text"
                onClick={() => setHinted((h) => !h)}
                disabled={!ready}
              >
                <Lightbulb size={16} />
                {hinted ? "Ukryj wskazówkę" : "Wskazówka"}
              </button>
            )}
            {selectedShot && (
              <button
                type="button"
                className="iqJ-button iqJ-primary"
                disabled={!interactive}
                onClick={() => choose("shot")}
              >
                Strzel
              </button>
            )}
          </div>
        )}
        {transport && (
          <div className="iqJ-transport">
            <div className="iqJ-transport-line">
              <button
                type="button"
                className="iqJ-icon"
                aria-label={transport.paused ? "Wznów powtórkę" : "Zatrzymaj powtórkę"}
                disabled={!ready}
                onClick={() => setTransport((p) => (p ? { ...p, paused: !p.paused } : p))}
              >
                {transport.paused ? <Play size={20} /> : <Pause size={20} />}
              </button>
              <span>
                {secondsLabel(playhead - transport.from)} /{" "}
                {secondsLabel(transport.to - transport.from)}
              </span>
              <button
                type="button"
                className="iqJ-text"
                aria-label="Zmień tempo odtwarzania"
                onClick={() => setSpeed((s) => (s === 1 ? 1.5 : 1))}
              >
                {speed}×
              </button>
            </div>
            {transport.kind !== "live" && (
              <input
                type="range"
                aria-label="Moment powtórki"
                min={transport.from}
                max={transport.to}
                step="0.02"
                value={playhead}
                onChange={(event) => {
                  const v = Number(event.target.value);
                  playheadRef.current = v;
                  setPlayhead(v);
                  setTransport((p) => (p ? { ...p, paused: true } : p));
                }}
              />
            )}
          </div>
        )}
        {view === "summary" && (
          <>
            <div className="iqJ-actions">
              <button
                type="button"
                className="iqJ-button iqJ-primary"
                disabled={!ready}
                onClick={() =>
                  startTransport({ kind: "replay", from: 0, to: duration, paused: false })
                }
              >
                <Play size={16} />
                Moja akcja
              </button>
              <button type="button" className="iqJ-button" onClick={() => openReview()}>
                Analiza
              </button>
            </div>
            <div className="iqJ-actions">
              <button
                type="button"
                className="iqJ-text"
                onClick={() => newScenario(session.definition)}
              >
                <RotateCcw size={15} />
                Powtórz zadanie
              </button>
              <button type="button" className="iqJ-text iqJ-next" onClick={nextScenario}>
                Kolejna akcja
                <ArrowRight size={16} />
              </button>
            </div>
            <details className="iqJ-history">
              <summary>
                Twoje próby · {totalDone} · {modeLabel.toLocaleLowerCase("pl")}
              </summary>
              {history
                .filter((a) => a.mode === mode)
                .slice(-8)
                .reverse()
                .map((attempt) => (
                  <button
                    type="button"
                    key={attempt.id}
                    className="iqJ-history-item"
                    onClick={() => {
                      try {
                        const restored = restoreJourney(attempt);
                        setSession(restored);
                        setMode(attempt.mode);
                        attemptId.current = attempt.id;
                        saved.current = attempt.id;
                        notified.current = attempt.id;
                        startTransport({
                          kind: "replay",
                          from: 0,
                          to: journeyDuration(restored),
                          paused: false,
                        });
                      } catch {
                        setNote("Ta próba nie jest dostępna do odtworzenia.");
                      }
                    }}
                  >
                    {journeyBank.find((s) => s.id === attempt.scenarioId)?.title}
                    <span>{verdictLabels[attempt.verdict]}</span>
                  </button>
                ))}
              {legacyCount > 0 && (
                <p>
                  Wcześniejsze próby IQ: {legacyCount}. Pozostają zachowane w dotychczasowym
                  zapisie.
                </p>
              )}
            </details>
          </>
        )}
        {view === "review" && decision && (
          <>
            <div className="iqJ-review-nav">
              <button
                type="button"
                className="iqJ-icon"
                aria-label="Poprzednia decyzja"
                disabled={reviewIndex === 0}
                onClick={() => openReview(reviewIndex - 1)}
              >
                <ChevronLeft size={20} />
              </button>
              <span>
                Decyzja {reviewIndex + 1} z {session.decisions.length}
              </span>
              <button
                type="button"
                className="iqJ-icon"
                aria-label="Następna decyzja"
                disabled={reviewIndex === session.decisions.length - 1}
                onClick={() => openReview(reviewIndex + 1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="iqJ-actions">
              <button
                type="button"
                className="iqJ-button"
                disabled={!ready}
                onClick={() => {
                  setComparing(false);
                  const from = session.beats
                      .slice(0, decision.firstBeat)
                      .reduce((n, b) => n + b.duration, 0),
                    to = session.beats
                      .slice(0, decision.lastBeat + 1)
                      .reduce((n, b) => n + b.duration, 0);
                  startTransport({ kind: "step", from, to, paused: false });
                }}
              >
                <Play size={15} />
                Mój wybór
              </button>
              {decision.alternative && (
                <button
                  type="button"
                  className="iqJ-button iqJ-primary"
                  disabled={!ready}
                  onClick={playAlternative}
                >
                  Inny wariant
                </button>
              )}
            </div>
            <button
              type="button"
              className="iqJ-text"
              onClick={() => {
                setComparing(false);
                setView("summary");
              }}
            >
              Wróć do całej akcji
            </button>
          </>
        )}
        {note && (
          <p className="iqJ-note" role="status">
            {note}
          </p>
        )}
      </footer>
      <dialog
        className="iqJ-dialog"
        ref={dialog}
        aria-labelledby="iqJ-picker-title"
        onCancel={() => setPicker(false)}
        onClose={() => {
          setPicker(false);
          pickerTrigger.current?.focus();
        }}
      >
        <div className="iqJ-dialog-header">
          <h2 id="iqJ-picker-title">Wybierz akcję</h2>
          <button
            type="button"
            className="iqJ-icon"
            aria-label="Zamknij wybór akcji"
            onClick={() => setPicker(false)}
          >
            <X size={20} />
          </button>
        </div>
        <label className="iqJ-field">
          Pozycja
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as IQRole | "profile" | "all")}
          >
            <option value="profile">Z Twojego onboardingu</option>
            {Object.entries(roleLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
            <option value="all">Wszystkie pozycje</option>
          </select>
        </label>
        <label className="iqJ-field">
          Szukaj sytuacji
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Np. pressing, kontra, asekuracja"
          />
        </label>
        <p className="iqJ-bank-count">
          {filteredBank.length} scenariuszy · 80 wątków w całej bazie
        </p>
        <div className="iqJ-scenario-list">
          {filteredBank.map((definition) => (
            <button
              type="button"
              key={definition.id}
              className="iqJ-scenario"
              onClick={() => newScenario(definition)}
            >
              <span>{definition.title}</span>
              <small>
                {roleLabels[definition.role]} · {definition.contextLabel}
              </small>
            </button>
          ))}
          {!filteredBank.length && <p>Brak pasujących sytuacji. Zmień frazę lub pozycję.</p>}
        </div>
      </dialog>
      <dialog
        className="iqJ-dialog iqJ-help"
        ref={helpDialog}
        aria-labelledby="iqJ-help-title"
        onCancel={() => setHelp(false)}
        onClose={() => setHelp(false)}
      >
        <div className="iqJ-dialog-header">
          <h2 id="iqJ-help-title">Jedna decyzja naraz</h2>
          <button
            type="button"
            className="iqJ-icon"
            aria-label="Zamknij pomoc"
            onClick={() => setHelp(false)}
          >
            <X size={20} />
          </button>
        </div>
        <p>
          Dotknij partnera, aby podać. Przy ruchu bez piłki dotknij jednej z zaznaczonych
          przestrzeni.
        </p>
        <p>
          Po wyborze zobaczysz reakcję zawodników i kolejne zadanie. Po końcu odtworzysz własną
          akcję i sprawdzisz konkretne decyzje.
        </p>
        <p>
          {mode === "learn"
            ? "Wskazówka jest dostępna na żądanie."
            : "Ten tryb nie pokazuje podpowiedzi ani oceny w trakcie akcji."}
        </p>
        <p className="iqJ-help-focus">Cel: {session.definition.focus}</p>
        <button type="button" className="iqJ-button iqJ-primary" onClick={() => setHelp(false)}>
          Rozumiem
        </button>
      </dialog>
    </section>
  );
}
