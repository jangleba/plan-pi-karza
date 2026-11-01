import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { LessonChoicePanel } from "./LessonChoicePanel";
import {
  lessonFocus,
  lessonInstruction,
  lessonPreviewAction,
  lessonPlaybackPoints,
} from "./lessonPresentation";
import { journeyBank, iqScenarioBank, roleLabels, rolesForPosition } from "./journeyBank";
import { advancedJourneyBank } from "./advancedJourneyBank";
import { freshJourneyEntry, journeyVisits, rememberJourneyEntry } from "./journeyEntry";
import { IQ_COACHING_SOURCES, journeyDebrief, journeyDebriefText } from "./journeyDebrief";
import { deliveryLabels } from "./ballFlight";
import type { BallDelivery } from "./ballFlight";
import { practiceToday } from "./journeyPractice";
import {
  chooseJourney,
  createJourney,
  createJourneyForRules,
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
const EMPTY_DESTINATIONS: { id: string; point: Point; label: string; shortLabel?: string }[] = [];
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
function scenarioForStart(position: string | undefined, index?: number) {
  const roles = rolesForPosition(position);
  const pool = (index === undefined ? advancedJourneyBank : journeyBank).filter((s) =>
    roles.includes(s.role),
  );
  return index === undefined ? pool[0] : pool[boundedIndex(index, pool.length)];
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
  const [preview, setPreview] = useState<{ scope: string; id: string } | null>(null);
  const [overview, setOverview] = useState(false);
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
  const [offeredDraft, setOfferedDraft] = useState<JourneyDraft | null>(null);
  const entry = useRef<{ scope: string; definition: JourneyDefinition } | null>(null);
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
    // Spatial ordering keeps A/B stable without always putting the preferred answer first.
    () =>
      [
        ...(selectedStep?.choices.filter((c) => !c.delivery || c.delivery === selectedDelivery) ??
          []),
      ].sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y || a.id.localeCompare(b.id)),
    [selectedStep, selectedDelivery],
  );
  const decision = session.decisions[reviewIndex];
  const lesson = mode === "learn" && view === "decision" && !transport && !!selectedStep;
  const previewScope = `${session.definition.id}:${session.step}:${selectedDelivery}:${mode}`;
  const previewChoice = lesson
    ? (visibleChoices.find((c) => preview?.scope === previewScope && c.id === preview.id) ??
      visibleChoices[0])
    : undefined;
  const instruction = lesson && selectedStep ? lessonInstruction(session, selectedStep) : null;
  const focus = useMemo(() => lessonFocus(session, previewChoice), [session, previewChoice]);
  const transportFrom = transport?.from ?? 0,
    transportTo = transport?.to ?? 0,
    transporting = transport !== null;
  const movingFocus = useMemo(
    () => (transporting ? lessonPlaybackPoints(session, transportFrom, transportTo) : []),
    [session, transporting, transportFrom, transportTo],
  );
  const previewActions = useMemo(
    () => (lesson && previewChoice ? [lessonPreviewAction(session, previewChoice)] : null),
    [lesson, previewChoice, session],
  );
  const setPreviewChoice = (id: string) => {
    if (visibleChoices.some((c) => c.id === id)) {
      setPreview({ scope: previewScope, id });
      setNote("");
    }
  };
  const duration = useMemo(() => journeyDuration(session), [session]);
  const debrief = useMemo(() => journeyDebrief(session), [session]);
  const cameraActions = useMemo<PlannedAction[]>(
    () =>
      (mode === "learn" && !overview && (lesson || transporting)
        ? transporting
          ? movingFocus
          : focus.points
        : journeyCameraPoints(session, mode === "learn" || view === "review")
      ).map((point, index) => ({
        id: `camera-${index}`,
        type: "run",
        playerId: "you",
        from: point,
        to: point,
      })),
    [session, mode, view, lesson, overview, focus.points, movingFocus, transporting],
  );
  const animationSession = transport?.kind === "alternative" && alternative ? alternative : session;
  const sampleLiveFrame = useCallback(
    () => sampleJourney(animationSession, playheadRef.current),
    [animationSession],
  );
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
  const destinations = EMPTY_DESTINATIONS;
  const currentChoices = useMemo(() => {
    if (!decision || view !== "review") return null;
    let base = createJourneyForRules(session.definition, session.rulesVersion ?? 3);
    session.decisions.slice(0, reviewIndex).forEach((d) => {
      base = chooseJourney(base, d.choiceId, d.decisionSeconds);
    });
    return { base, step: journeyStep(base) };
  }, [decision, view, session.definition, session.decisions, session.rulesVersion, reviewIndex]);
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
    setOfferedDraft(null);
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
    let previous: JourneyAttempt[] = [];
    try {
      previous = loadJourneyHistory(historyOwner);
      setHistory(previous);
    } catch {
      setNote("Historia jest chwilowo niedostępna. Bieżąca akcja pozostaje dostępna.");
    }
    if (initialScenario === undefined) {
      const scope = `${historyOwner ?? "guest"}:${position ?? "all"}`;
      let definition = entry.current?.scope === scope ? entry.current.definition : null;
      if (!definition) {
        const pool = advancedJourneyBank.filter((s) => rolesForPosition(position).includes(s.role));
        const visits = [...journeyVisits(historyOwner)];
        try {
          const unfinished = loadJourneyDraft(historyOwner);
          if (unfinished && unfinished.scenarioId !== visits.at(-1))
            visits.push(unfinished.scenarioId);
        } catch {
          /* The restore error is reported below without replacing the original draft. */
        }
        definition = freshJourneyEntry(pool, previous, "learn", initial, visits);
        rememberJourneyEntry(historyOwner, definition.id);
        entry.current = { scope, definition };
      }
      setSession(createJourney(definition));
    }
    try {
      setLegacyCount(loadIQHistory(historyOwner).length);
    } catch {
      /* Old history is preserved under its original key. */
    }
    try {
      const draft = loadJourneyDraft(historyOwner);
      if (draft) {
        if (initialScenario !== undefined) {
          setSession(restoreJourney(draft));
          setMode(draft.mode);
          attemptId.current = draft.id;
        } else if (draft.choices.length) {
          setOfferedDraft(draft);
          draftBlocked.current = true;
        }
      }
    } catch {
      setNote("Nie udało się przywrócić poprzedniej akcji. Możesz rozegrać nową.");
    }
    setLoadedOwner(historyOwner);
    setBooted(true);
  }, [historyOwner, initial, initialScenario, position]);
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
      lastHUD = 0,
      cancelled = false;
    const tick = (now: number) => {
      if (cancelled) return;
      // Frames are sampled from a recorded timeline, so a slow GPU must not
      // stretch a five-second action into a much longer one.
      const delta = document.hidden ? 0 : Math.max(0, (now - last) / 1000);
      last = now;
      const next = Math.min(transport.to, playheadRef.current + delta * speed);
      playheadRef.current = next;
      // The pitch samples every frame. Text and slider do not need a full React render at 60 Hz.
      if (now - lastHUD >= 100 || next >= transport.to) {
        lastHUD = now;
        setPlayhead(next);
      }
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
      setPreview(null);
      setOverview(false);
      if (offeredDraft) {
        draftBlocked.current = false;
        setOfferedDraft(null);
      }
      const start = journeyDuration(session);
      setNote("");
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
    rememberJourneyEntry(historyOwner, definition.id);
    if (offeredDraft) {
      draftBlocked.current = false;
      setOfferedDraft(null);
    }
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
    const pool = advancedJourneyBank.filter((s) => roles.includes(s.role));
    newScenario(
      freshJourneyEntry(pool, history, mode, session.definition, journeyVisits(historyOwner)),
    );
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
    return iqScenarioBank.filter(
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
  const decisionCounts = session.decisions.reduce(
    (counts, d) => ({ ...counts, [d.quality]: counts[d.quality] + 1 }),
    { good: 0, possible: 0, error: 0 },
  );
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
              : selectedStep?.kind === "pass"
                ? "Dotknij partnera lub wybierz jego numer."
                : selectedStep?.kind === "finish"
                  ? "Podaj do partnera albo wybierz strzał."
                  : selectedStep?.kind === "transition"
                    ? selectedStep.instruction
                    : "Wybierz oznaczenie na boisku albo przycisk poniżej.";
  return (
    <section
      className={`bwiq-app iq-journey${mode === "learn" && (lesson || transport) ? " iqL-lesson" : ""}`}
      data-iq-scenario={session.definition.id}
      aria-label="BallWise IQ — pełne akcje"
    >
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
        {session.definition.revision === 3 && (
          <p className="iqJ-context">
            {session.definition.contextLabel.split(" · ").slice(0, 2).join(" · ")}
          </p>
        )}
        <div className="iqJ-title">
          <h1>
            {instruction
              ? instruction.title
              : transport && mode === "learn"
                ? "Obserwuj rozegranie"
                : mode === "challenge" && !session.outcome
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
          <details className="iqL-mode-menu">
            <summary>{modeLabel}⌄</summary>
            <div className="iqJ-modes" role="group" aria-label="Tryb akcji">
              <button
                type="button"
                aria-pressed={mode === "learn"}
                onClick={(event) => {
                  setMode("learn");
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  setHinted(false);
                }}
              >
                Z podpowiedziami
              </button>
              <button
                type="button"
                aria-pressed={mode === "challenge"}
                onClick={(event) => {
                  setMode("challenge");
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  setHinted(false);
                }}
              >
                Bez podpowiedzi
              </button>
            </div>
          </details>
        ) : (
          <div className="iqJ-mode-label">
            {modeLabel}
            {(mode === "learn" || session.outcome) && session.definition.revision !== 3 && (
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
        {instruction && <p className="iqL-situation">{instruction.situation}</p>}
      </header>
      <div className="iqJ-board-meta">
        <span>{session.scenario.defensive ? "↓ Bronisz" : "↑ Atakujesz"}</span>
        <span className="iqJ-teams">
          <i /> Twoi <i /> Rywale
        </span>
        {lesson ? (
          <span className="iqL-tools">
            <button type="button" onClick={() => setOverview((v) => !v)} aria-pressed={overview}>
              {overview ? "Przybliż" : "Całość"}
            </button>
            <button
              type="button"
              aria-label={hinted ? "Ukryj wskazówkę" : "Wskazówka"}
              aria-pressed={hinted}
              onClick={() => setHinted((h) => !h)}
            >
              <Lightbulb size={17} />
              <span className="sr-only">Wskazówka</span>
            </button>
          </span>
        ) : (
          <span className="iqJ-possession">
            {transport
              ? transport.kind === "live"
                ? "Akcja w ruchu"
                : "Powtórka"
              : session.world.carrierId === "you"
                ? "Masz piłkę"
                : session.world.carrierId.startsWith("r")
                  ? "Piłka rywali"
                  : "Piłka u partnera"}
          </span>
        )}
      </div>
      <div className="iqJ-stage">
        {booted ? (
          <TacticalPitch
            scenario={session.scenario}
            actions={previewActions ?? reviewActions}
            visibleLabelIds={mode === "learn" ? focus.labelIds : undefined}
            cameraClose={mode === "learn" && !overview && (lesson || !!transport)}
            frameOverride={frame}
            frameSource={transport ? sampleLiveFrame : undefined}
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
              if (c) {
                if (mode === "learn") setPreviewChoice(c.id);
                else choose(c.id);
              }
            }}
            onPitchSelect={(point) => {
              if (mode === "learn" && interactive && selectedStep) {
                setNote(
                  ["pass", "finish"].includes(selectedStep.kind)
                    ? "Dotknij partnera, żeby obejrzeć podanie. Przycisk Zagraj tak wykona wybór."
                    : "Porównaj ruchy przyciskami Poprzedni/Następny wariant. Zagraj tak wykona wybór.",
                );
                return;
              }
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
            onDestinationSelect={mode === "learn" ? setPreviewChoice : choose}
            showActionOrders={false}
            showGuidance={
              mode === "learn" || view === "review" || transport?.kind === "alternative"
            }
            freeMovement={
              mode === "challenge" &&
              !!selectedStep &&
              !["pass", "finish"].includes(selectedStep.kind)
            }
            highlights={lesson ? undefined : highlights}
            highlightGood
          />
        ) : (
          <div className="iqJ-preparing" role="status">
            Przygotowuję akcję…
          </div>
        )}
      </div>
      <footer className={`iqJ-footer${lesson ? " iqL-footer" : ""}`}>
        {!lesson && (
          <>
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
          </>
        )}
        {lesson && hinted && selectedStep && (
          <p className="iqL-cue" role="status">
            {selectedStep.cue}
          </p>
        )}
        {!lesson && view === "decision" && !transport && deliveries.length > 1 && (
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
        {lesson && previewChoice && selectedStep && (
          <LessonChoicePanel
            session={session}
            step={selectedStep}
            choices={visibleChoices}
            activeId={previewChoice.id}
            disabled={!interactive}
            onPreview={setPreviewChoice}
            onCommit={() => choose(previewChoice.id)}
            deliveryControl={
              deliveries.length > 1 ? (
                <select
                  aria-label="Rodzaj podania"
                  value={selectedDelivery}
                  disabled={!interactive}
                  onChange={(event) => {
                    const kind = event.target.value as BallDelivery;
                    const match = selectedStep.choices.find(
                      (c) => c.targetId === previewChoice.targetId && c.delivery === kind,
                    );
                    setDelivery(kind);
                    setHinted(false);
                    setPreview(
                      match
                        ? {
                            scope: `${session.definition.id}:${session.step}:${kind}:${mode}`,
                            id: match.id,
                          }
                        : null,
                    );
                  }}
                >
                  {deliveries.map((kind) => (
                    <option key={kind} value={kind}>
                      {deliveryLabels[kind]}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />
        )}
        {view === "decision" && (
          <div className="iqJ-actions">
            {selectedShot && mode === "challenge" && (
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
            {debrief && (
              <section className="iqJ-debrief" aria-label="Wnioski z akcji">
                <span className="iqJ-kicker">Do wykorzystania w meczu</span>
                <h3>{debrief.rule.reminder}</h3>
                <p>
                  <strong>{debrief.moment}</strong>
                </p>
                <p>{debrief.observation}</p>
                <p>{debrief.rule.action}</p>
                <details>
                  <summary>Dlaczego tutaj i kiedy zagrać inaczej</summary>
                  <p>
                    <strong>Skutek wyboru:</strong> {debrief.consequence}
                  </p>
                  {debrief.comparison && (
                    <p>
                      <strong>Inny wariant:</strong> {debrief.comparison}
                    </p>
                  )}
                  <p>
                    <strong>Sygnał w meczu:</strong> {debrief.rule.signal}
                  </p>
                  <p>
                    <strong>Zmień plan, gdy:</strong> {debrief.rule.exception}
                  </p>
                  <p>{debrief.mission}</p>
                </details>
                <div className="iqJ-actions">
                  <button
                    type="button"
                    className="iqJ-text"
                    onClick={() => openReview(debrief.decisionIndex)}
                  >
                    Zobacz ten moment
                  </button>
                  <button
                    type="button"
                    className="iqJ-text"
                    onClick={() => {
                      void downloadText(
                        "BallWise-IQ-na-mecz.txt",
                        journeyDebriefText(session, debrief),
                        "text/plain",
                        historyOwner,
                      ).catch(() =>
                        setNote("Nie udało się zapisać wskazówki. Możesz przeczytać ją tutaj."),
                      );
                    }}
                  >
                    Zapisz wskazówkę
                  </button>
                </div>
              </section>
            )}
            <p className="iqJ-series" aria-label="Jakość decyzji">
              Trafne: {decisionCounts.good} · Warunkowe: {decisionCounts.possible} · Błędy:{" "}
              {decisionCounts.error}
            </p>
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
                    {iqScenarioBank.find((s) => s.id === attempt.scenarioId)?.title}
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
        {picker && (
          <>
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
              {new Set(filteredBank.map((d) => d.topicId)).size} tematów · {filteredBank.length}{" "}
              wariantów
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
                    {definition.revision === 3
                      ? "Zaawansowane · "
                      : definition.revision === 2
                        ? "Piłka górna · "
                        : "Podstawy · "}
                    {roleLabels[definition.role]}
                    {mode === "learn" ? ` · ${definition.contextLabel}` : ""}
                  </small>
                </button>
              ))}
              {!filteredBank.length && <p>Brak pasujących sytuacji. Zmień frazę lub pozycję.</p>}
            </div>
          </>
        )}
      </dialog>
      <dialog
        className="iqJ-dialog iqJ-help"
        ref={helpDialog}
        aria-labelledby="iqJ-help-title"
        onCancel={() => setHelp(false)}
        onClose={() => setHelp(false)}
      >
        {help && (
          <>
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
                ? "Najpierw przeczytaj, kto ma piłkę i co robisz TY. Porównaj warianty strzałkami pod boiskiem: każdy pokazuje jeden ruch. Zagraj tak wykonuje wybrany wariant."
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
              <summary>Podstawy zadań i wniosków</summary>
              <p>
                Zadania ćwiczą odczytywanie ustawienia i konsekwencji decyzji. Wynik dotyczy tej
                uproszczonej sytuacji; nie jest pomiarem inteligencji ani prognozą Twojej
                skuteczności w meczu.
              </p>
              {IQ_COACHING_SOURCES.map((source) => (
                <p key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.label}
                  </a>
                </p>
              ))}
            </details>
            <details>
              <summary>Historia i kopie IQ</summary>
              {offeredDraft && (
                <>
                  <p>Nowe wykonanie zastąpi niedokończoną akcję. Możesz ją wcześniej wznowić.</p>
                  <button
                    type="button"
                    className="iqJ-button"
                    onClick={() => {
                      try {
                        setSession(restoreJourney(offeredDraft));
                        setMode(offeredDraft.mode);
                        attemptId.current = offeredDraft.id;
                        choiceLock.current = false;
                        setTransport(null);
                        setView("decision");
                        setOfferedDraft(null);
                        draftBlocked.current = false;
                        setHelp(false);
                        setNote("");
                      } catch {
                        setNote("Nie udało się wznowić akcji. Zapis pozostaje zachowany.");
                      }
                    }}
                  >
                    Wznów poprzednią
                  </button>
                </>
              )}
              <p>
                Próby i niedokończona akcja są zapisywane lokalnie na tym urządzeniu. Limit historii
                to 100 prób; starsze wyniki nie są automatycznie usuwane. Kopię w chmurze możesz
                osobno zapisać w profilu.
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
                      error instanceof Error
                        ? error.message
                        : "Nie udało się pobrać surowej kopii.",
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
          </>
        )}
      </dialog>
    </section>
  );
}
