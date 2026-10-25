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
import { journeyBank, journeyTopicCount, roleLabels, rolesForPosition } from "./journeyBank";
import { deliveryLabels } from "./ballFlight";
import type { BallDelivery } from "./ballFlight";
import { nextPractice, practiceToday } from "./journeyPractice";
import {
  chooseJourney,
  createJourney,
  journeyDuration,
  journeyCameraPoints,
  journeyFrame,
  journeyChoice,
  journeyPointChoice,
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
  makeJourneyDraft,
  createJourneyBackup,
  rawJourneyData,
  restoreJourneyBackup,
  clearJourneyDataAfterBackup,
  journeyHistoryKey,
  journeyDraftKey,
  type JourneyDraft,
} from "./journeyHistory";
import { downloadText } from "../browser-lab/download";
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
  transition: "Reakcja po stracie",
};
const endings = {
  progress: "Otworzyłeś grę do przodu.",
  retained: "Utrzymałeś akcję.",
  chance: "Akcja zakończona próbą.",
  blocked: "Akcja została zatrzymana.",
  loss: "Strata piłki.",
  recovered: "Piłka odzyskana.",
  contained: "Osłoniłeś drogę do bramki.",
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
function scenarioForStart(position: string | undefined, index?: number) {
  const pool = poolFor(position);
  return index === undefined
    ? (pool.find((s) => s.revision === 2) ?? pool[0])
    : pool[boundedIndex(index, pool.length)];
}

export function FootballIQJourney({
  initialScenario,
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
  const [delivery, setDelivery] = useState<BallDelivery | null>(null);
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
  const [loadedOwner, setLoadedOwner] = useState<string | undefined | null>(null);
  const [pendingAttempt, setPendingAttempt] = useState<JourneyAttempt | null>(null);
  const [incomingDraft, setIncomingDraft] = useState<JourneyDraft | null>(null);
  const [draftChanged, setDraftChanged] = useState(false);
  const [saveRevision, setSaveRevision] = useState(0);
  const [backupNote, setBackupNote] = useState("");
  const [rawDownloaded, setRawDownloaded] = useState<ReturnType<typeof rawJourneyData> | null>(
    null,
  );
  const [clearConfirmed, setClearConfirmed] = useState(false);
  const draftBlocked = useRef(false);
  const activeOwner = useRef(historyOwner);
  activeOwner.current = historyOwner;
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
  const deliveries = useMemo(
    () => [
      ...new Set(selectedStep?.choices.flatMap((c) => (c.delivery ? [c.delivery] : [])) ?? []),
    ],
    [selectedStep],
  );
  const selectedDelivery =
    delivery && deliveries.includes(delivery)
      ? delivery
      : (session.definition.delivery ?? "ground");
  const visibleChoices = useMemo(
    () => selectedStep?.choices.filter((c) => !c.delivery || c.delivery === selectedDelivery) ?? [],
    [selectedStep, selectedDelivery],
  );
  const decision = session.decisions[reviewIndex];
  const duration = useMemo(() => journeyDuration(session), [session]);
  const cameraActions = useMemo<PlannedAction[]>(
    () =>
      journeyCameraPoints(session, mode === "learn" || view === "review").map((point, index) => ({
        id: `camera-${index}`,
        type: "run",
        playerId: "you",
        from: point,
        to: point,
      })),
    [session, mode, view],
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
        ? visibleChoices.flatMap((c) => (c.targetId ? [c.targetId] : []))
        : EMPTY_IDS,
    [interactive, selectedStep, visibleChoices],
  );
  const destinations = useMemo(
    () =>
      mode === "learn" &&
      interactive &&
      selectedStep &&
      !["pass", "finish", "transition"].includes(selectedStep.kind)
        ? selectedStep.choices.map((c) => ({ id: c.id, point: c.point, label: c.label }))
        : [],
    [interactive, selectedStep, mode],
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
      : journeyChoice(currentChoices.base, decision.choiceId);
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
      const c = visibleChoices.find((c) => c.quality === "good");
      return c ? [c.point] : undefined;
    }
    if (view === "review" && comparing && decision?.alternative)
      return [decision.alternative.point];
    return undefined;
  }, [view, mode, hinted, selectedStep, visibleChoices, comparing, decision]);

  useEffect(() => {
    attemptId.current = crypto.randomUUID();
    saved.current = "";
    notified.current = "";
    draftBlocked.current = false;
    setPendingAttempt(null);
    setIncomingDraft(null);
    setDraftChanged(false);
    setSession(createJourney(initial));
    setMode("learn");
    setTransport(null);
    setView("decision");
    setHistory([]);
    setLegacyCount(0);
    setRawDownloaded(null);
    setClearConfirmed(false);
    setBackupNote("");
    setNote("");
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
    setLoadedOwner(historyOwner);
    setBooted(true);
  }, [historyOwner, initial]);
  useEffect(() => {
    const applied = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; module?: string; key?: string }>)
        .detail;
      if (!historyOwner || detail?.userId !== historyOwner || detail.module !== "iq") return;
      try {
        if (detail.key === journeyHistoryKey(historyOwner))
          setHistory(loadJourneyHistory(historyOwner));
        if (detail.key === journeyDraftKey(historyOwner)) {
          // A cloud restore may arrive during a decision; never autosave over it or replace play silently.
          draftBlocked.current = true;
          setIncomingDraft(loadJourneyDraft(historyOwner));
          setDraftChanged(true);
        }
      } catch (error) {
        draftBlocked.current = detail.key === journeyDraftKey(historyOwner);
        setNote(
          error instanceof Error
            ? error.message
            : "Zapis IQ jest niedostępny. Pobierz surową kopię w pomocy.",
        );
      }
    };
    window.addEventListener("ballwise:module-data-applied", applied);
    return () => window.removeEventListener("ballwise:module-data-applied", applied);
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
    if (!booted || loadedOwner !== historyOwner) return;
    if (session.outcome) {
      if (saved.current === attemptId.current) return;
      const attempt = makeJourneyAttempt(session, mode, attemptId.current);
      try {
        if (!saveJourneyAttempt(historyOwner, attempt)) {
          setPendingAttempt(attempt);
          setNote("Próba gościa jest dostępna na tym ekranie. Pobierz ją przed wyjściem.");
          return;
        }
        saved.current = attemptId.current;
        setPendingAttempt((current) => (current?.id === attempt.id ? null : current));
        setHistory(loadJourneyHistory(historyOwner));
        if (!draftBlocked.current) {
          try {
            saveJourneyDraft(historyOwner, session, mode, attemptId.current);
          } catch {
            setNote(
              "Próba zapisana. Nie udało się usunąć zapisu roboczego; historia jest bezpieczna.",
            );
          }
        }
      } catch (error) {
        setPendingAttempt(attempt);
        setNote(
          `${error instanceof Error ? error.message : "Nie udało się zapisać próby."} Powtórka i pobranie bieżącej próby nadal działają.`,
        );
      }
    } else {
      try {
        if (draftBlocked.current) return;
        saveJourneyDraft(historyOwner, session, mode, attemptId.current);
      } catch {
        setNote("Przeglądarka nie zapisała postępu. Dokończ akcję przed zamknięciem ekranu.");
      }
    }
  }, [booted, session, mode, historyOwner, loadedOwner, saveRevision]);
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
      setDelivery(null);
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
    if (pendingAttempt) {
      setNote("Pobierz niezapisaną próbę albo ponów zapis przed rozpoczęciem kolejnej akcji.");
      return;
    }
    setNote("");
    setTransport(null);
    playheadRef.current = 0;
    setPlayhead(0);
    choiceLock.current = false;
    setSession(createJourney(definition));
    setDelivery(null);
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
    newScenario(nextPractice(pool, history, mode, session.definition));
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
  async function downloadPending() {
    if (!pendingAttempt) return;
    const owner = historyOwner,
      pendingId = pendingAttempt.id;
    try {
      const result = await downloadText(
        `BallWise-IQ-proba-${pendingAttempt.id}.json`,
        JSON.stringify(createJourneyBackup([pendingAttempt]), null, 2),
        "application/json",
        owner,
      );
      if (activeOwner.current !== owner) return;
      if (result === "delivered") {
        setPendingAttempt((current) => (current?.id === pendingId ? null : current));
        setNote("Przekazano próbę do zapisania. Sprawdź plik przed opuszczeniem ekranu.");
      } else setNote("Anulowano przekazanie próby. Niezapisany wynik pozostaje na ekranie.");
    } catch (error) {
      if (activeOwner.current !== owner) return;
      setNote(error instanceof Error ? error.message : "Nie udało się pobrać próby.");
    }
  }
  async function exportBackup() {
    const owner = historyOwner;
    try {
      const rows = historyOwner ? loadJourneyHistory(historyOwner) : [];
      const draft = session.outcome ? null : makeJourneyDraft(session, mode, attemptId.current);
      const result = await downloadText(
        "BallWise-IQ-kopia.json",
        JSON.stringify(createJourneyBackup(rows, draft), null, 2),
        "application/json",
        owner,
      );
      if (activeOwner.current !== owner) return;
      setBackupNote(
        result === "delivered"
          ? "Przekazano kopię historii i bieżącej akcji. Sprawdź plik w wybranym miejscu."
          : "Anulowano przekazanie kopii. Historia pozostaje bez zmian.",
      );
    } catch (error) {
      if (activeOwner.current !== owner) return;
      setBackupNote(
        `${error instanceof Error ? error.message : "Nie udało się utworzyć kopii."} Użyj surowej kopii, która zachowuje oryginalne dane.`,
      );
    }
  }
  async function importBackup(file: File) {
    const owner = historyOwner;
    try {
      if (!owner) throw new Error("Zaloguj się przed przywróceniem kopii.");
      if (file.size > 2_000_000) throw new Error("Kopia IQ przekracza 2 MB.");
      const input: unknown = JSON.parse(await file.text());
      if (activeOwner.current !== owner) return;
      const restored = restoreJourneyBackup(owner, input);
      setHistory(restored.attempts);
      if (restored.draft) {
        draftBlocked.current = true;
        setIncomingDraft(restored.draft);
        setDraftChanged(true);
      }
      setBackupNote(`Przywrócono ${restored.added} nowych prób. Istniejące próby zachowano.`);
    } catch (error) {
      if (activeOwner.current === owner)
        setBackupNote(error instanceof Error ? error.message : "Nie udało się przywrócić kopii.");
    }
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
  const stepCount = session.definition.steps.length;
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
          : mode === "challenge"
            ? "Twój ruch"
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
            : mode === "challenge"
              ? selectedStep?.kind === "pass"
                ? "Dotknij partnera, żeby podać."
                : selectedStep?.kind === "finish"
                  ? "Podaj do partnera albo wybierz strzał."
                  : "Dotknij miejsca, do którego ruszysz."
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
          <h1>
            {mode === "challenge" && !session.outcome
              ? "Rozegraj sytuację"
              : session.definition.title}
          </h1>
          <span>
            {view === "review"
              ? `${reviewIndex + 1}/${session.decisions.length}`
              : session.transition === "choose"
                ? "Reakcja"
                : view === "summary"
                  ? `${session.decisions.length} decyzji`
                  : `${Math.min(session.step + 1, stepCount)}/${stepCount}`}
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
            {(mode === "learn" || session.outcome) && (
              <span>{session.definition.contextLabel}</span>
            )}
          </div>
        )}
        <div
          className="iqJ-progress"
          aria-label={
            session.transition === "choose"
              ? "Reakcja po stracie"
              : `Decyzja ${Math.min(session.step + 1, stepCount)} z ${stepCount}`
          }
        >
          {session.definition.steps.map((_, i) => (
            <span
              key={i}
              className={i < session.step ? "is-done" : i === session.step ? "is-current" : ""}
            />
          ))}
          {session.transition && (
            <span className={session.transition === "choose" ? "is-current" : "is-done"} />
          )}
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
              const c = visibleChoices.find((c) => c.targetId === player.id);
              if (c) choose(c.id);
            }}
            onPitchSelect={(point) => {
              if (
                mode !== "challenge" ||
                !interactive ||
                !selectedStep ||
                ["pass", "finish"].includes(selectedStep.kind)
              )
                return;
              try {
                choose(journeyPointChoice(session, point).id);
              } catch {
                setNote("Wskaż miejsce wewnątrz boiska.");
              }
            }}
            destinations={destinations}
            onDestinationSelect={choose}
            showActionOrders={false}
            showGuidance={
              mode === "learn" || view === "review" || transport?.kind === "alternative"
            }
            freeMovement={
              mode === "challenge" &&
              !!selectedStep &&
              !["pass", "finish"].includes(selectedStep.kind)
            }
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
                  ? mode === "challenge"
                    ? "Twoja decyzja"
                    : labels[selectedStep.kind]
                  : ""}
        </span>
        <h2>{footerTitle}</h2>
        <p>{footerDetail}</p>
        {view === "decision" && deliveries.length > 1 && (
          <div className="iqJ-deliveries" role="group" aria-label="Rodzaj podania">
            {deliveries.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={selectedDelivery === kind}
                disabled={!interactive}
                onClick={() => {
                  setDelivery(kind);
                  setHinted(false);
                }}
              >
                {deliveryLabels[kind]}
              </button>
            ))}
          </div>
        )}
        {mode === "learn" && view === "decision" && selectedStep?.kind === "transition" && (
          <div className="iqJ-actions">
            {selectedStep.choices.map((c) => (
              <button
                key={c.id}
                type="button"
                className="iqJ-button"
                disabled={!interactive}
                onClick={() => choose(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
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
            <p className="iqJ-series">
              {practiceToday(history, mode) < 3
                ? `Krótka seria · ${practiceToday(history, mode)}/3`
                : "Dzisiejsza seria ukończona"}
            </p>
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
                onClick={() => {
                  if (!currentChoices) return;
                  setSession(currentChoices.base);
                  setTransport(null);
                  setAlternative(null);
                  setComparing(false);
                  setHinted(false);
                  setDelivery(null);
                  setView("decision");
                  choiceLock.current = false;
                  elapsed.current = 0;
                  attemptId.current = crypto.randomUUID();
                  setNote("Zagraj ponownie od wybranego momentu.");
                }}
              >
                Zagraj od tego momentu
              </button>
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
        {pendingAttempt && (
          <div className="iqJ-actions">
            <button type="button" className="iqJ-button" onClick={downloadPending}>
              Pobierz niezapisaną próbę
            </button>
            <button
              type="button"
              className="iqJ-text"
              onClick={() => setSaveRevision((value) => value + 1)}
            >
              Ponów zapis próby
            </button>
          </div>
        )}
        {draftChanged && (
          <div role="status">
            <p>
              Zmieniono zapis niedokończonej akcji. Twoja bieżąca akcja pozostaje na ekranie. Kopię
              możesz pobrać w pomocy.
            </p>
            {incomingDraft && (
              <button
                type="button"
                className="iqJ-button"
                onClick={() => {
                  try {
                    setSession(restoreJourney(incomingDraft));
                    setMode(incomingDraft.mode);
                    attemptId.current = incomingDraft.id;
                    saved.current = "";
                    setTransport(null);
                    setView("decision");
                    elapsed.current = 0;
                    choiceLock.current = false;
                    draftBlocked.current = false;
                    setDraftChanged(false);
                    setIncomingDraft(null);
                  } catch (error) {
                    setNote(
                      error instanceof Error ? error.message : "Nie udało się przywrócić akcji.",
                    );
                  }
                }}
              >
                Przywróć zaktualizowaną akcję
              </button>
            )}
            <button
              type="button"
              className="iqJ-text"
              onClick={() => {
                draftBlocked.current = false;
                setDraftChanged(false);
                setIncomingDraft(null);
                setSaveRevision((value) => value + 1);
              }}
            >
              Zachowaj bieżącą akcję
            </button>
          </div>
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
          {filteredBank.length} scenariuszy · {journeyTopicCount} wątków w całej bazie
        </p>
        <div className="iqJ-scenario-list">
          {filteredBank.map((definition, index) => (
            <button
              type="button"
              key={definition.id}
              className="iqJ-scenario"
              onClick={() => newScenario(definition)}
            >
              <span>{mode === "challenge" ? `Sytuacja ${index + 1}` : definition.title}</span>
              <small>
                {definition.revision === 2 ? "Nowe · " : ""}
                {roleLabels[definition.role]}
                {mode === "learn" ? ` · ${definition.contextLabel}` : ""}
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
          {mode === "learn"
            ? "Dotknij partnera, aby podać. Przy ruchu dotknij jednej z zaznaczonych przestrzeni."
            : "Dotknij partnera, aby podać. Przy ruchu wskaż samodzielnie miejsce na boisku."}
        </p>
        <p>
          {mode === "learn"
            ? "W nowych akcjach wybierz tor podania, a potem partnera. Po stracie wybierz doskok albo powrót do obrony."
            : "Rodzaj podania wybierasz przyciskami. Po stracie także sam wskazujesz miejsce reakcji."}
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
        {(mode === "learn" || session.outcome) && (
          <p className="iqJ-help-focus">Cel: {session.definition.focus}</p>
        )}
        <details>
          <summary>Historia i kopie IQ</summary>
          <p>
            Próby i niedokończona akcja są zapisywane lokalnie na tym urządzeniu. Limit historii to
            100 prób; starsze wyniki nie są automatycznie usuwane. Kopię w chmurze możesz osobno
            zapisać w profilu.
          </p>
          <button type="button" className="iqJ-button" onClick={exportBackup}>
            Pobierz kopię IQ
          </button>
          <label className="iqJ-field">
            Przywróć kopię IQ JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void importBackup(file);
              }}
            />
          </label>
          <button
            type="button"
            className="iqJ-button"
            disabled={!historyOwner}
            onClick={async () => {
              const owner = historyOwner;
              setRawDownloaded(null);
              try {
                if (!owner) return;
                const snapshot = rawJourneyData(owner);
                const result = await downloadText(
                  "BallWise-IQ-surowa-kopia.json",
                  JSON.stringify(
                    { schema: "ballwise.iq.raw.v1", ...snapshot, pendingAttempt },
                    null,
                    2,
                  ),
                  "application/json",
                  owner,
                );
                if (activeOwner.current !== owner) return;
                if (result === "delivered") setRawDownloaded(snapshot);
                setClearConfirmed(false);
                setBackupNote(
                  result === "delivered"
                    ? "Przekazano surową kopię. Sprawdź plik przed wyczyszczeniem zapisu."
                    : "Anulowano przekazanie kopii. Czyszczenie pozostaje zablokowane.",
                );
              } catch (error) {
                if (activeOwner.current !== owner) return;
                setBackupNote(
                  error instanceof Error ? error.message : "Nie udało się pobrać surowej kopii.",
                );
              }
            }}
          >
            Pobierz surową kopię zapisu
          </button>
          <label className="iqJ-field">
            <input
              type="checkbox"
              checked={clearConfirmed}
              onChange={(event) => setClearConfirmed(event.target.checked)}
            />
            Zachowałem surową kopię i chcę wyczyścić lokalną historię oraz zapis roboczy.
          </label>
          <button
            type="button"
            className="iqJ-button"
            disabled={!historyOwner || !rawDownloaded || !clearConfirmed}
            onClick={() => {
              try {
                if (!historyOwner || !rawDownloaded) return;
                clearJourneyDataAfterBackup(historyOwner, rawDownloaded);
                setHistory([]);
                saved.current = "";
                draftBlocked.current = false;
                setIncomingDraft(null);
                setDraftChanged(false);
                setRawDownloaded(null);
                setClearConfirmed(false);
                setSaveRevision((value) => value + 1);
                setBackupNote(
                  "Lokalny zapis wyczyszczony. Bieżąca akcja zostanie zapisana ponownie.",
                );
              } catch (error) {
                setBackupNote(
                  error instanceof Error ? error.message : "Nie udało się wyczyścić zapisu.",
                );
              }
            }}
          >
            Wyczyść zapis po wykonaniu kopii
          </button>
          {backupNote && <p role="status">{backupNote}</p>}
        </details>
        <button type="button" className="iqJ-button iqJ-primary" onClick={() => setHelp(false)}>
          Rozumiem
        </button>
      </dialog>
    </section>
  );
}
