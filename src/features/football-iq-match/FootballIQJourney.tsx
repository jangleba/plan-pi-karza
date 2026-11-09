import { SpatialHeader, SpatialDecisionPanel } from "./SpatialControls";
import {
  spatialPointChoice,
  spatialPlayerChoice,
  spatialStay,
  changeSpatialChoice,
} from "./spatialDecision";
import type { JourneyChoice } from "./journeyTypes";
import { TacticalForecastSheet } from "./TacticalForecastSheet";
import {
  addForecast,
  forecastRival,
  forecastReflection,
  observationCue,
  reactionLabels,
  planLabels,
} from "./tacticalForecast";
import type { TacticalForecast } from "./journeyTypes";
import { SurfaceSketch } from "@/components/design/SurfaceSketch";
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
import { lessonFocus, lessonInstruction, lessonPreviewAction } from "./lessonPresentation";
import { journeyBank, iqScenarioBank, roleLabels, rolesForPosition } from "./journeyBank";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  controlTacticalActor,
  dribbleLabels,
  tacticalGroup,
  tacticalGroupLabels,
  tacticalGroups,
  type TacticalGroup,
} from "./tacticalJourney";
import { TACTICAL_TURNS } from "./tacticalWorld";
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
  TacticalIntent,
  DribbleStyle,
  ActionTiming,
} from "./journeyTypes";
import type { EvaluationLevel, PlannedAction, Point } from "./types";
import "./football-iq.css";
import "./journey.css";
import "./spatial.css";

type Props = {
  initialScenario?: number;
  showOnboardingInitially?: boolean;
  onBack?: () => void;
  onComplete?: (result: { scenarioId: string; verdict: EvaluationLevel }) => void;
  historyOwner?: string;
  position?: string;
};
type View = "decision" | "playing" | "feedback" | "summary" | "review";
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
  play: "Własny zamiar",
  wait: "Obserwacja i czas",
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
  const [recordedSession, setSession] = useState(() => createJourney(initial));
  const [takeover, setTakeover] = useState<{ scope: string; actor: string } | null>(null);
  const [mode, setMode] = useState<JourneyMode>("learn");
  const [preview, setPreview] = useState<{ scope: string; id: string } | null>(null);
  const [observedScope, setObservedScope] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<BallDelivery | null>(null);
  const [intent, setIntent] = useState<{
    scope: string;
    group: TacticalGroup;
    timing: ActionTiming;
  } | null>(null);
  const [dribbleStyle, setDribbleStyle] = useState<DribbleStyle>("direct");
  const [defenseIntent, setDefenseIntent] = useState<TacticalIntent>("cover");
  const [view, setView] = useState<View>("decision");
  const [booted, setBooted] = useState(false),
    [ready, setReady] = useState(false);
  const [hinted, setHinted] = useState(false),
    [note, setNote] = useState("");
  const [spatialDraft, setSpatialDraft] = useState<{ scope: string; choice: JourneyChoice } | null>(
    null,
  );
  const [forecastChoice, setForecastChoice] = useState<string | null>(null);
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
  const controlScope = `${recordedSession.definition.id}:${recordedSession.step}`;
  const session = useMemo(() => {
    if (view === "decision" && !transport && takeover?.scope === controlScope) {
      try {
        return controlTacticalActor(recordedSession, takeover.actor);
      } catch {
        /* Possession may have changed. */
      }
    }
    return recordedSession;
  }, [recordedSession, view, transport, takeover, controlScope]);
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
  const tactical = session.rulesVersion === 6 || session.rulesVersion === 7;
  const spatial = session.rulesVersion === 7;
  const controlled = session.controlledId ?? "you";
  const rivalHasBall =
    session.players.find((p) => p.id === session.world.carrierId)?.team === "away";
  const selectedDefense = rivalHasBall ? defenseIntent : "cover";
  const takeoverPlayer =
    (session.rulesVersion === 6 || session.rulesVersion === 7) &&
    !session.outcome &&
    view === "decision" &&
    !transport
      ? session.players.find(
          (p) => p.id === session.world.carrierId && p.team === "home" && p.id !== "you",
        )
      : undefined;
  const intentScope = `${session.definition.id}:${session.step}:${controlled}`;
  const spatialChoice = spatialDraft?.scope === intentScope ? spatialDraft.choice : undefined;
  const groups = tactical ? tacticalGroups(session) : [];
  const defaultGroup = groups.includes("carry")
    ? "carry"
    : groups.includes("move") &&
        session.players.find((p) => p.id === session.world.carrierId)?.team === "home"
      ? "move"
      : groups[0];
  const selectedGroup =
    intent?.scope === intentScope && groups.includes(intent.group) ? intent.group : defaultGroup;
  const selectedTiming =
    intent?.scope === intentScope && intent.group === selectedGroup && selectedGroup !== "hold"
      ? intent.timing
      : "now";
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
        ...(selectedStep?.choices.filter(
          (c) =>
            (!c.delivery || c.delivery === selectedDelivery) &&
            (!tactical ||
              (tacticalGroup(c) === selectedGroup && (c.timing ?? "now") === selectedTiming)),
        ) ?? []),
      ].sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y || a.id.localeCompare(b.id)),
    [selectedStep, selectedDelivery, tactical, selectedGroup, selectedTiming],
  );
  const decision = session.decisions[reviewIndex];
  const lesson = mode === "learn" && view === "decision" && !transport && !!selectedStep;
  const decisionScope = `${session.definition.id}:${session.decisions.length}:${session.transition ?? "play"}`;
  const observing = !spatial && lesson && observedScope !== decisionScope;
  const choosing = lesson && !observing;
  const previewScope = `${session.definition.id}:${session.step}:${selectedDelivery}:${mode}:${selectedGroup}:${selectedTiming}`;
  const needsIntent =
    !spatial && session.rulesVersion === 7 && lesson && intent?.scope !== intentScope;
  const previewChoice =
    lesson && !needsIntent
      ? (visibleChoices.find((c) => preview?.scope === previewScope && c.id === preview.id) ??
        visibleChoices[0])
      : undefined;
  const instruction = lesson && selectedStep ? lessonInstruction(session, selectedStep) : null;
  const focus = useMemo(
    () => lessonFocus(session, observing ? undefined : previewChoice),
    [session, previewChoice, observing],
  );
  const previewActions = useMemo(
    () =>
      spatial
        ? spatialChoice
          ? [lessonPreviewAction(session, spatialChoice)]
          : EMPTY_ACTIONS
        : choosing && previewChoice
          ? [lessonPreviewAction(session, previewChoice)]
          : null,
    [choosing, previewChoice, session, spatial, spatialChoice],
  );
  const setPreviewChoice = (id: string) => {
    if (visibleChoices.some((c) => c.id === id)) {
      setPreview({ scope: previewScope, id });
      setNote("");
    }
  };
  const duration = useMemo(() => journeyDuration(session), [session]);
  const debrief = useMemo(() => journeyDebrief(session), [session]);
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
  const interactive =
    booted && ready && view === "decision" && !observing && !transport && !picker && !help;
  const selectable = useMemo(
    () =>
      spatial && interactive
        ? session.players
            .filter(
              (p) =>
                p.id !== controlled &&
                (session.world.carrierId === controlled
                  ? p.team === "home" || !!p.goalkeeper
                  : rivalHasBall && p.team === "away" && !p.goalkeeper),
            )
            .map((p) => p.id)
        : interactive && selectedStep && !needsIntent
          ? visibleChoices.flatMap((c) =>
              c.targetId && (!tactical || c.intent === "pass") ? [c.targetId] : [],
            )
          : EMPTY_IDS,
    [
      interactive,
      selectedStep,
      visibleChoices,
      tactical,
      needsIntent,
      spatial,
      session,
      controlled,
      rivalHasBall,
    ],
  );
  const destinations = EMPTY_DESTINATIONS;
  const currentChoices = useMemo(() => {
    if (!decision || view !== "review") return null;
    let base = createJourneyForRules(session.definition, session.rulesVersion ?? 3);
    if (session.attackRevision !== 2) delete base.attackRevision;
    session.decisions.slice(0, reviewIndex).forEach((d) => {
      base = chooseJourney(base, d.choiceId, d.decisionSeconds);
    });
    return { base, step: journeyStep(base) };
  }, [
    decision,
    view,
    session.definition,
    session.decisions,
    session.rulesVersion,
    session.attackRevision,
    reviewIndex,
  ]);
  const reviewActions = useMemo<PlannedAction[]>(() => {
    if (view !== "review" || !decision || !currentChoices || transport) return EMPTY_ACTIONS;
    const c = comparing
      ? decision.alternative
      : journeyChoice(currentChoices.base, decision.choiceId);
    if (!c) return EMPTY_ACTIONS;
    const actor = decision.actorId ?? "you";
    const from = decision.before.positions[actor];
    if (c.targetId)
      return [
        {
          id: "review-choice",
          type: "pass",
          playerId: actor,
          targetId: c.targetId,
          from,
          to: c.point,
        },
      ];
    return [{ id: "review-choice", type: "run", playerId: actor, from, to: c.point }];
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
    setForecastChoice(null);
    setSession(createJourney(initial));
    setTakeover(null);
    setObservedScope(null);
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
      // Mobile browsers suspend intervals in the background. Rebase on both
      // edges so the first visible tick cannot count that suspended time.
      lastTiming.current = performance.now();
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
      setView(mode === "learn" ? "feedback" : session.outcome ? "summary" : "decision");
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
    if (
      !spatial &&
      session.rulesVersion === 7 &&
      mode === "learn" &&
      !session.forecasts?.length &&
      forecastRival(session) &&
      interactive &&
      !choiceLock.current
    ) {
      setForecastChoice(choiceId);
      return;
    }
    performChoice(choiceId);
  }
  function performChoice(
    choiceId: string,
    forecast?: Pick<TacticalForecast, "predicted" | "plan">,
  ) {
    if (!interactive || choiceLock.current) return;
    choiceLock.current = true;
    try {
      let next = chooseJourney(session, choiceId, elapsed.current);
      if (forecast) next = addForecast(next, session, forecast);
      setForecastChoice(null);
      setSpatialDraft(null);
      setPreview(null);

      if (offeredDraft) {
        draftBlocked.current = false;
        setOfferedDraft(null);
      }
      const start = journeyDuration(session);
      setNote("");
      setSession(next);
      setTakeover(null);
      setDelivery(null);
      setHinted(false);
      startTransport({ kind: "live", from: start, to: journeyDuration(next), paused: false });
    } catch {
      choiceLock.current = false;
      setNote("Nie udało się wykonać tego wyboru. Spróbuj ponownie.");
    }
  }
  function previewSpatial(make: () => JourneyChoice) {
    if (!interactive) return;
    try {
      setSpatialDraft({ scope: intentScope, choice: make() });
      setNote("");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Wybierz miejsce na boisku.");
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
    setForecastChoice(null);
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
    setObservedScope(null);
    setTakeover(null);
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
    return (spatial ? advancedJourneyBank : iqScenarioBank).filter(
      (s) =>
        // Live-only situations need the continuous engine of the main IQ screen.
        s.concept !== "situation" &&
        roles.includes(s.role) &&
        (!q || `${s.title} ${s.focus} ${s.contextLabel}`.toLocaleLowerCase("pl").includes(q)),
    );
  }, [roleFilter, allowedRoles, query, spatial]);
  const modeLabel = mode === "learn" ? "Z podpowiedziami" : "Bez podpowiedzi";
  const playing = !!transport && !transport.paused && ready;
  const selectedShot = (tactical ? visibleChoices : selectedStep?.choices)?.find(
    (c) => c.id === "shot" || c.intent === "shoot",
  );
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
  const stepCount = tactical ? TACTICAL_TURNS : session.definition.steps.length;
  const footerTitle =
    view === "feedback"
      ? "Co zmienił Twój wybór?"
      : view === "summary"
        ? session.finishTeam === "away"
          ? "Rywal zakończył akcję strzałem."
          : endings[session.outcome!]
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
    view === "feedback"
      ? session.decisions.at(-1)?.why
      : view === "summary"
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
                ? tactical
                  ? selectedGroup === "pass"
                    ? "Wybierz partnera na boisku. Nie musisz grać do przodu."
                    : selectedGroup === "hold"
                      ? "Wybierz poczekanie lub osłonę. Partnerzy i rywale nadal reagują."
                      : selectedGroup === "shoot"
                        ? "Sam zdecyduj, czy jest miejsce na próbę strzału."
                        : selectedGroup === "decoy"
                          ? "Wskaż własny bieg, który może otworzyć miejsce innemu partnerowi."
                          : "Wybierz zamiar i moment, potem dotknij własnego miejsca na boisku."
                  : selectedStep?.kind === "pass"
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
  const intentControl =
    tactical && selectedStep ? (
      <select
        aria-label="Zamiar i moment"
        value={needsIntent ? "" : `${selectedGroup}:${selectedTiming}`}
        disabled={!interactive}
        onChange={(event) => {
          const [group, timing] = event.target.value.split(":") as [TacticalGroup, ActionTiming];
          setIntent({ scope: intentScope, group, timing });
          setPreview(null);
          setHinted(false);
          setNote("");
        }}
      >
        {needsIntent && (
          <option value="" disabled>
            Co chcesz osiągnąć?
          </option>
        )}
        {groups.map((group) => (
          <optgroup key={group} label={tacticalGroupLabels[group]}>
            <option value={`${group}:now`}>{tacticalGroupLabels[group]} — teraz</option>
            {group !== "hold" && (
              <option value={`${group}:delay`}>{tacticalGroupLabels[group]} — po chwili</option>
            )}
          </optgroup>
        ))}
      </select>
    ) : undefined;
  return (
    <section
      className={`bwiq-app iq-journey iqS-staged${spatial ? " iqB-spatial" : ""}${mode === "learn" && (lesson || transport || view === "feedback") ? " iqL-lesson" : ""}`}
      data-iq-phase={
        transport
          ? "playing"
          : spatial && view === "decision"
            ? "board"
            : observing
              ? "observe"
              : view === "feedback"
                ? "feedback"
                : lesson
                  ? "choose"
                  : view
      }
      data-iq-quality={view === "feedback" ? session.decisions.at(-1)?.quality : undefined}
      data-iq-scenario={session.definition.id}
      aria-label="BallWise IQ — pełne akcje"
    >
      {forecastChoice && forecastRival(session) && (
        <TacticalForecastSheet
          key={`${decisionScope}:${forecastChoice}`}
          rivalNumber={forecastRival(session)!.number}
          onClose={() => setForecastChoice(null)}
          onConfirm={(forecast) => performChoice(forecastChoice, forecast)}
        />
      )}
      <header className="iqJ-header">
        {spatial ? (
          <SpatialHeader
            session={session}
            mode={mode}
            onBack={onBack}
            onRole={() => {
              setTransport((p) => (p ? { ...p, paused: true } : p));
              setPicker(true);
            }}
            onHelp={() => {
              setTransport((p) => (p ? { ...p, paused: true } : p));
              setHelp(true);
            }}
            onMode={() => {
              setMode(mode === "learn" ? "challenge" : "learn");
              setHinted(false);
            }}
          />
        ) : (
          <>
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
              {Array.from(
                { length: tactical ? TACTICAL_TURNS : session.definition.steps.length },
                (_, i) => (
                  <span
                    key={i}
                    className={
                      i < session.step ? "is-done" : i === session.step ? "is-current" : ""
                    }
                  />
                ),
              )}
              {session.transition && (
                <span className={session.transition === "choose" ? "is-current" : "is-done"} />
              )}
            </div>
          </>
        )}
      </header>
      <div className="iqJ-board-meta">
        <span>
          {(
            tactical
              ? session.players.find((p) => p.id === session.world.carrierId)?.team === "away"
              : session.scenario.defensive
          ) ? (
            spatial ? (
              <>
                <span className="iqB-direction-wide">← Bronisz</span>
                <span className="iqB-direction-tall">↓ Bronisz</span>
              </>
            ) : (
              "↓ Bronisz"
            )
          ) : spatial ? (
            <>
              <span className="iqB-direction-wide">Atakujesz →</span>
              <span className="iqB-direction-tall">↑ Atakujesz</span>
            </>
          ) : (
            "↑ Atakujesz"
          )}
        </span>
        {!spatial && takeoverPlayer && !observing && view === "decision" ? (
          <select
            className="iqT-control"
            aria-label="Sterowany zawodnik"
            value={controlled}
            disabled={!interactive}
            onChange={(event) => {
              setTakeover(
                event.target.value === "you"
                  ? null
                  : { scope: controlScope, actor: event.target.value },
              );
              setIntent(null);
              setPreview(null);
              setNote("");
            }}
          >
            <option value="you">Sterujesz: TY</option>
            <option value={takeoverPlayer.id}>Zdecyduj za nr {takeoverPlayer.number}</option>
          </select>
        ) : (
          <span className="iqJ-teams">
            <i /> Twoi <i /> Rywale
          </span>
        )}
        <span className="iqJ-possession">
          {transport
            ? transport.kind === "live"
              ? "Akcja w ruchu"
              : "Powtórka"
            : session.world.carrierId === "you"
              ? "Masz piłkę"
              : session.players.find((p) => p.id === session.world.carrierId)?.team === "away"
                ? "Piłka rywali"
                : "Piłka u partnera"}
        </span>
      </div>
      <div className="iqJ-stage">
        {booted ? (
          <TacticalPitch
            scenario={session.scenario}
            actions={
              observing || view === "feedback" ? EMPTY_ACTIONS : (previewActions ?? reviewActions)
            }
            visibleLabelIds={
              spatial
                ? [
                    ...new Set(
                      [
                        controlled,
                        session.world.carrierId,
                        ...(forecastChoice || observedScope === decisionScope
                          ? [forecastRival(session)?.id]
                          : []),
                        spatialChoice?.targetId,
                      ].filter((id): id is string => !!id),
                    ),
                  ].slice(0, 3)
                : mode === "learn"
                  ? view === "review" && decision
                    ? [
                        ...new Set([decision.actorId ?? "you", "you", session.world.carrierId]),
                      ].slice(0, 3)
                    : transport && session.decisions.at(-1)?.actorId !== "you"
                      ? [
                          ...new Set([
                            session.decisions.at(-1)?.actorId ?? "you",
                            "you",
                            session.world.carrierId,
                          ]),
                        ].slice(0, 3)
                      : focus.labelIds
                  : undefined
            }
            cameraClose={false}
            fixedView
            landscapeView={spatial}
            frameOverride={frame}
            frameSource={transport ? sampleLiveFrame : undefined}
            focusOnActions={false}
            selectedPlayerId={view === "review" ? (decision?.actorId ?? "you") : controlled}
            mode={
              !spatial && (tactical ? selectedGroup === "carry" : selectedStep?.kind === "carry")
                ? "carry"
                : "pass"
            }
            interactive={interactive && !forecastChoice && !needsIntent}
            playing={playing && !reduced}
            onReadyChange={setReady}
            selectablePlayerIds={selectable}
            onPlayerSelect={(player) => {
              if (spatial) {
                previewSpatial(() => spatialPlayerChoice(session, player.id));
                return;
              }
              const c = visibleChoices.find((c) => c.targetId === player.id);
              if (c) {
                if (mode === "learn") setPreviewChoice(c.id);
                else choose(c.id);
              }
            }}
            onPitchSelect={(point) => {
              if (spatial) {
                previewSpatial(() => spatialPointChoice(session, point));
                return;
              }
              if (mode === "learn" && interactive && selectedStep) {
                setNote(
                  (
                    tactical
                      ? selectedGroup === "pass"
                      : ["pass", "finish"].includes(selectedStep.kind)
                  )
                    ? "Dotknij partnera, żeby obejrzeć podanie. Przycisk Zagraj tak wykona wybór."
                    : "Porównaj ruchy przyciskami Poprzedni/Następny wariant. Zagraj tak wykona wybór.",
                );
                return;
              }
              if (
                mode !== "challenge" ||
                !interactive ||
                !selectedStep ||
                (tactical
                  ? ["pass", "hold", "shoot"].includes(selectedGroup)
                  : ["pass", "finish"].includes(selectedStep.kind))
              )
                return;
              try {
                const freeIntent =
                  selectedGroup === "defend" ? selectedDefense : (selectedGroup as TacticalIntent);
                choose(
                  journeyPointChoice(
                    session,
                    point,
                    tactical ? freeIntent : undefined,
                    dribbleStyle,
                    selectedTiming,
                  ).id,
                );
              } catch (error) {
                setNote(error instanceof Error ? error.message : "Wskaż miejsce wewnątrz boiska.");
              }
            }}
            destinations={destinations}
            onDestinationSelect={mode === "learn" ? setPreviewChoice : choose}
            showActionOrders={false}
            showGuidance={
              spatial || mode === "learn" || view === "review" || transport?.kind === "alternative"
            }
            freeMovement={
              !spatial &&
              mode === "challenge" &&
              !!selectedStep &&
              (tactical
                ? !["pass", "hold", "shoot"].includes(selectedGroup)
                : !["pass", "finish"].includes(selectedStep.kind))
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
        {!lesson && (!spatial || view !== "decision") && (
          <>
            <span className="iqJ-kicker">
              {view === "feedback"
                ? session.decisions.at(-1)?.quality === "good"
                  ? "Trafna decyzja"
                  : "Sprawdź skutek"
                : view === "summary"
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
            {spatial && view === "feedback" ? null : session.rulesVersion === 7 &&
              view === "feedback" ? (
              <details className="iqF-consequence">
                <summary>{(footerDetail ?? "").split(/(?<=[.!?])\s/)[0]}</summary>
                <p>{footerDetail}</p>
              </details>
            ) : (
              <p>{footerDetail}</p>
            )}
          </>
        )}
        {spatial && view === "decision" && !transport && (
          <SpatialDecisionPanel
            key={`${intentScope}:${mode}`}
            session={session}
            choice={spatialChoice}
            mode={mode}
            disabled={!interactive || !!forecastChoice}
            onStay={() => previewSpatial(() => spatialStay(session))}
            onClear={() => setSpatialDraft(null)}
            onCommit={() => spatialChoice && performChoice(spatialChoice.id)}
            onForecast={() => {
              if (spatialChoice) {
                setObservedScope(decisionScope);
                setForecastChoice(spatialChoice.id);
              }
            }}
            onChange={(timing, style, kind) => {
              if (!spatialChoice) return;
              try {
                setSpatialDraft({
                  scope: intentScope,
                  choice: changeSpatialChoice(session, spatialChoice, timing, style, kind),
                });
                return "";
              } catch (error) {
                return error instanceof Error ? error.message : "Wybierz inny wariant.";
              }
            }}
            takeoverNumber={takeoverPlayer?.number}
            onTakeover={
              takeoverPlayer
                ? () => {
                    setTakeover({ scope: controlScope, actor: takeoverPlayer.id });
                    setSpatialDraft(null);
                  }
                : controlled !== "you"
                  ? () => {
                      setTakeover(null);
                      setSpatialDraft(null);
                    }
                  : undefined
            }
          />
        )}
        {spatial && view === "feedback" && (
          <section className="iqB-feedback" aria-label="Skutek Twojej decyzji">
            <p>{session.decisions.at(-1)?.why.split(/(?<=[.!?])\s/)[0]}</p>
            <button
              type="button"
              className="iqB-execute iqS-continue"
              onClick={() => {
                setView(session.outcome ? "summary" : "decision");
                elapsed.current = 0;
              }}
            >
              {session.outcome ? "Wnioski z akcji" : "Następny krok"}
              <ArrowRight size={17} />
            </button>
            <details>
              <summary>Skutek, przewidywanie i powtórka</summary>
              <p>{session.decisions.at(-1)?.why}</p>
              {session.forecasts
                ?.filter((f) => f.decisionIndex === session.decisions.length - 1)
                .map((f) => (
                  <p key={f.decisionIndex}>
                    {forecastReflection(f).reaction} {forecastReflection(f).plan}
                  </p>
                ))}
              <button
                type="button"
                className="iqB-text"
                onClick={() => {
                  const last = session.decisions.at(-1)!;
                  const from = session.beats
                    .slice(0, last.firstBeat)
                    .reduce((n, b) => n + b.duration, 0);
                  startTransport({ kind: "live", from, to: duration, paused: false });
                }}
              >
                Obejrzyj jeszcze raz
              </button>
            </details>
          </section>
        )}
        {observing && instruction && (
          <section className="iqS-observe" aria-label="Obejrzyj sytuację">
            <span className="iqS-phase-label">
              <span>1</span> Obserwuj
            </span>
            <h2>{instruction.title}</h2>
            {session.rulesVersion !== 7 && <p>{instruction.situation}</p>}
            {session.rulesVersion === 7 && <p className="iqF-observe">{observationCue(session)}</p>}
            <button
              type="button"
              className="iqJ-button iqJ-primary iqS-continue"
              disabled={!booted || !ready || picker || help}
              onClick={() => setObservedScope(decisionScope)}
            >
              Wybierz rozwiązanie <ArrowRight size={17} />
            </button>
          </section>
        )}
        {!spatial && view === "feedback" && (
          <section className="iqS-reflection" aria-label="Skutek Twojej decyzji">
            {session.forecasts
              ?.filter((f) => f.decisionIndex === session.decisions.length - 1)
              .map((f) => {
                const result = forecastReflection(f);
                return (
                  <div className="iqF-feedback" key={f.decisionIndex}>
                    <strong>
                      {result.matches === null
                        ? "Sprawdź reakcję"
                        : result.matches
                          ? "Przewidziałeś reakcję"
                          : "Rywal wybrał inaczej"}
                    </strong>
                    <p>{result.reaction}</p>
                  </div>
                );
              })}
            <button
              type="button"
              className="iqJ-button iqJ-primary iqS-continue"
              onClick={() => {
                setView(session.outcome ? "summary" : "decision");
                setObservedScope(null);
                elapsed.current = 0;
              }}
            >
              {session.outcome ? "Przejdź do wniosków" : "Następny krok"} <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="iqJ-text"
              onClick={() => {
                const last = session.decisions.at(-1)!;
                const from = session.beats
                  .slice(0, last.firstBeat)
                  .reduce((n, b) => n + b.duration, 0);
                startTransport({ kind: "live", from, to: duration, paused: false });
              }}
            >
              <RotateCcw size={15} /> Obejrzyj jeszcze raz
            </button>
            {session.forecasts
              ?.filter((f) => f.decisionIndex === session.decisions.length - 1)
              .map((f) => (
                <details className="iqF-feedback-details" key={f.decisionIndex}>
                  <summary>Twoja prognoza i następny krok</summary>
                  <p>Twoja prognoza: {reactionLabels[f.predicted].toLowerCase()}.</p>
                  {f.plan && (
                    <p>
                      Twój plan: {planLabels[f.plan].toLowerCase()}. {forecastReflection(f).plan}
                    </p>
                  )}
                </details>
              ))}
          </section>
        )}
        {choosing && hinted && selectedStep && (
          <p className="iqL-cue" role="status">
            {selectedStep.cue}
          </p>
        )}
        {!spatial && !lesson && view === "decision" && !transport && tactical && (
          <div className="iqT-intents">
            {intentControl}
            {selectedGroup === "carry" && (
              <select
                aria-label="Sposób dryblingu"
                value={dribbleStyle}
                disabled={!interactive}
                onChange={(event) => setDribbleStyle(event.target.value as DribbleStyle)}
              >
                {(
                  ["direct", "cut-left", "cut-right", "stop-go", "turn-back"] as DribbleStyle[]
                ).map((style) => (
                  <option key={style} value={style}>
                    {dribbleLabels[style]}
                  </option>
                ))}
              </select>
            )}
            {selectedGroup === "defend" && (
              <select
                aria-label="Sposób obrony"
                value={selectedDefense}
                disabled={!interactive}
                onChange={(event) => setDefenseIntent(event.target.value as TacticalIntent)}
              >
                <option value="cover">Osłona korytarza</option>
                {rivalHasBall && (
                  <>
                    <option value="mark">Krycie odbiorcy</option>
                    <option value="press">Doskok do piłki</option>
                  </>
                )}
              </select>
            )}
          </div>
        )}
        {!lesson &&
          view === "decision" &&
          !transport &&
          (!tactical || selectedGroup === "pass") &&
          deliveries.length > 1 && (
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
        {choosing && needsIntent && <div className="iqF-intent">{intentControl}</div>}
        {!spatial && choosing && previewChoice && selectedStep && (
          <LessonChoicePanel
            session={session}
            step={selectedStep}
            choices={visibleChoices}
            activeId={previewChoice.id}
            disabled={!interactive}
            onPreview={setPreviewChoice}
            onCommit={() => choose(previewChoice.id)}
            intentControl={intentControl}
            hintControl={
              <button
                type="button"
                className="iqJ-text"
                aria-label={hinted ? "Ukryj wskazówkę" : "Wskazówka"}
                aria-pressed={hinted}
                onClick={() => setHinted((h) => !h)}
              >
                <Lightbulb size={16} /> <span>Wskazówka</span>
              </button>
            }
            deliveryControl={
              deliveries.length > 1 && (!tactical || selectedGroup === "pass") ? (
                <select
                  aria-label="Rodzaj podania"
                  value={selectedDelivery}
                  disabled={!interactive}
                  onChange={(event) => {
                    const kind = event.target.value as BallDelivery;
                    const match = selectedStep.choices.find(
                      (c) =>
                        c.targetId === previewChoice.targetId &&
                        c.delivery === kind &&
                        (!tactical || (c.timing ?? "now") === selectedTiming),
                    );
                    setDelivery(kind);
                    setHinted(false);
                    setPreview(
                      match
                        ? {
                            scope: `${session.definition.id}:${session.step}:${kind}:${mode}:${selectedGroup}:${selectedTiming}`,
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
        {!spatial && view === "decision" && (
          <div className="iqJ-actions">
            {selectedShot && mode === "challenge" && (
              <button
                type="button"
                className="iqJ-button iqJ-primary"
                disabled={!interactive}
                onClick={() => choose(selectedShot.id)}
              >
                Strzel
              </button>
            )}
            {tactical &&
              selectedGroup === "hold" &&
              mode === "challenge" &&
              !transport &&
              visibleChoices.map((choice) => (
                <button
                  type="button"
                  key={choice.id}
                  className="iqJ-button"
                  disabled={!interactive}
                  onClick={() => choose(choice.id)}
                >
                  {choice.label}
                </button>
              ))}
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
              <section className="iqJ-debrief bw-sketch-surface" aria-label="Wnioski z akcji">
                <SurfaceSketch kind="play" />
                <span className="iqJ-kicker">Do wykorzystania w meczu</span>
                <h3>{debrief.rule.reminder}</h3>
                <p>
                  <strong>{debrief.moment}</strong>
                </p>
                <p>{debrief.observation}</p>
                <p>{debrief.rule.action}</p>
                {!!session.forecasts?.length && (
                  <details>
                    <summary>Twoje przewidywanie i następny krok</summary>
                    {session.forecasts.map((f) => (
                      <div key={f.decisionIndex}>
                        <p>
                          <strong>Prognoza:</strong> {reactionLabels[f.predicted]}.{" "}
                          {forecastReflection(f).reaction}
                        </p>
                        {f.plan && (
                          <p>
                            <strong>Plan:</strong> {planLabels[f.plan]}.{" "}
                            {forecastReflection(f).plan}
                          </p>
                        )}
                      </div>
                    ))}
                  </details>
                )}
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
                  {!!debrief.teamDecisions?.length && (
                    <>
                      <p>
                        <strong>Co wybrali inni zawodnicy:</strong>
                      </p>
                      <ul>
                        {debrief.teamDecisions.map((text, index) => (
                          <li key={index}>{text}</li>
                        ))}
                      </ul>
                    </>
                  )}
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
                  setTakeover(null);
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
              {spatial
                ? "Dotknij partnera, by zaplanować podanie. Dotknij przestrzeni, by wybrać własny ruch. Dotknij bramki rywali, by zaplanować strzał. W obronie dotknięcie rywala planuje doskok albo krycie. Najpierw zobaczysz swój wybór, potem Rozegraj go wykona."
                : tactical
                  ? mode === "learn"
                    ? "Wybierz zamiar i moment działania. Strzałkami porównasz po jednym wariancie; Zagraj tak wykona decyzję."
                    : "Wybierz zamiar, moment i sposób ruchu. Przy podaniu dotknij partnera, a przy biegu wskaż własne miejsce na boisku."
                  : mode === "learn"
                    ? "Najpierw przeczytaj, kto ma piłkę i co robisz TY. Porównaj warianty strzałkami pod boiskiem: każdy pokazuje jeden ruch. Zagraj tak wykonuje wybrany wariant."
                    : "Dotknij partnera, aby podać. Przy ruchu wskaż samodzielnie miejsce na boisku."}
            </p>
            <p>
              {tactical
                ? "Nie każda akcja prowadzi do podania do TY. Partnerzy i rywale wybierają dalszą grę według ustawienia. Gdy partner ma piłkę, przycisk Zdecyduj za pozwala zdecydować za niego na jeden ruch."
                : mode === "learn"
                  ? "W nowych akcjach wybierz tor podania, a potem partnera. Po stracie wybierz doskok albo powrót do obrony."
                  : "Rodzaj podania wybierasz przyciskami. Po stracie także sam wskazujesz miejsce reakcji."}
            </p>
            {session.rulesVersion === 7 && mode === "learn" && (
              <p>
                Raz w akcji przewidzisz pierwszą reakcję wskazanego rywala i wybierzesz zamiar na
                następny krok. Po animacji porównasz prognozę z przebiegiem. Niejasna reakcja nie
                dostaje oceny trafności. Plan możesz zmienić, gdy zmieni się sytuacja.
              </p>
            )}
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
