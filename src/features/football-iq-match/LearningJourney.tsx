import { attackReplay } from "./attackReplay";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { situationLine } from "./decisionOptions";
import {
  controlsLine,
  momentLabel,
  nextContext,
  pickerItems,
  startLine,
  startLines,
} from "./journeyGuide";
import { loadFieldTask, pickFieldTask, saveFieldTask, type FieldTask } from "./fieldTask";
import {
  qualityLabels,
  REVIEW_COLORS,
  reviewDecision,
  stateBefore,
  type DecisionReview,
} from "./decisionReview";
import { iqSources, situationBank, situationFor } from "./situationBank";
import {
  assessAction,
  assessDecision,
  contributionCounts,
  keyMoment,
  lessonAim,
  momentRange,
} from "./decisionAssessment";
import type { FootballIQJourney as ArchiveJourney } from "./FootballIQJourney";
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
import { attackChoice, crossingZone } from "./attackJourney";
const liveChoice: typeof legacyChoice = (s, ...args) =>
  s.rulesVersion === 9 ? attackChoice(s, ...args) : legacyChoice(s, ...args);
import { lessonGoal, LIVE_BANK_VERSION, ATTACK_BANK_VERSIONS } from "./liveLesson";
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
import { addForecast, forecastRival, predictionLabels, predictionResult } from "./tacticalForecast";
import { teamOf } from "./tacticalWorld";
import {
  retryVerdict,
  solutionKind,
  solutionLabels,
  solutionMap,
  type RetryVerdict,
  type SolutionKind,
} from "./solutionSpace";
import {
  addAssessments,
  aimProgress,
  focusAim,
  loadMastery,
  nextByMastery,
  saveMastery,
  type Mastery,
} from "./mastery";
import { backupIqNow, cloudBackupEnabled, restoreIqFromAccount, setCloudBackup } from "./iqCloud";
import { downloadText } from "../browser-lab/download";
import type {
  JourneyChoice,
  JourneyDefinition,
  JourneyMode,
  JourneySession,
  TacticalForecast,
} from "./journeyTypes";
import type { PlannedAction, Point } from "./types";
// The pitch overlay, labels and option markers are styled here. They used to arrive with the
// archive screen; since the archive loads on demand, the IQ screen imports them itself.
import "./football-iq.css";
import "./journey.css";
import "./spatial.css";
import "./learning.css";

type Props = React.ComponentProps<typeof ArchiveJourney>;
// The archive of older attempts is opened rarely; load it on demand so it is not part of the IQ screen.
const FootballIQJourney = lazy(() =>
  import("./FootballIQJourney").then((module) => ({ default: module.FootballIQJourney })),
);
type Phase = "intro" | "decision" | "playing" | "feedback" | "summary";
type Sheet = "help" | "roles" | "settings" | "history" | null;
const EMPTY: PlannedAction[] = [];
const CARRY_TAP_RADIUS = 14;
/** Taps this close to the rival goal line, between these widths, mean a shot. */
const GOAL_TAP_DEPTH = 8;
const GOAL_TAP_HALF_WIDTH = 14;
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
/** A fresh lesson starts on the weakest aim the player is learning, when there is one. */
function firstDefinition(props: Props) {
  const def = startDefinition(props.position, props.initialScenario);
  if (props.initialScenario !== undefined) return def;
  try {
    const mastery = loadMastery(props.historyOwner);
    const focus = focusAim(mastery);
    if (!focus) return def;
    if (lessonAim(def) === focus.aim) return def;
    const next = nextByMastery(def, props.position, mastery);
    return next.progress.aim === focus.aim ? next.def : def;
  } catch {
    return def;
  }
}
function initial(props: Props) {
  const fresh = () => ({
    session: createJourneyForRules(firstDefinition(props), 9),
    mode: "learn" as JourneyMode,
    id: newId(),
    resumed: false,
    firstVisit: true,
    error: "",
  });
  if (!props.historyOwner) return fresh();
  try {
    const draft = loadJourneyDraft(props.historyOwner);
    if (draft && [LIVE_BANK_VERSION, ...ATTACK_BANK_VERSIONS].includes(draft.bankVersion))
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
        [LIVE_BANK_VERSION, ...ATTACK_BANK_VERSIONS].includes(r.bankVersion),
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
    [fieldTask, setFieldTask] = useState<FieldTask | null>(null),
    // After a decision: what another good solution produced on the same picture.
    [alternative, setAlternative] = useState<{ step: number; text: string } | null>(null),
    // "Find another solution": the same picture again after a good decision. Not saved.
    [retry, setRetry] = useState<{
      original: JourneySession;
      index: number;
      firstId: string;
      kinds: SolutionKind[];
      verdict: { kind: RetryVerdict; text: string } | null;
    } | null>(null);
  const [draft, setDraft] = useState<JourneyChoice | null>(null),
    [ready, setReady] = useState(false);
  const [archive, setArchive] = useState(false),
    [replay, setReplay] = useState<JourneySession | null>(null),
    [review, setReview] = useState<DecisionReview | null>(null);
  const [paused, setPaused] = useState(false),
    [playTime, setPlayTime] = useState(0);
  const [transfer, setTransfer] = useState(false);
  // Before the first decision with the ball in our team, TY predicts the nearest rival's reaction.
  const [prediction, setPrediction] = useState<TacticalForecast["predicted"] | null>(null),
    [skipPrediction, setSkipPrediction] = useState(false);
  const [mastery, setMastery] = useState<Mastery>(() => loadMastery(historyOwner));
  const masteryNow = useRef(mastery);
  // Opt-in copy on the account after each action; restore merges copies from other devices.
  const [cloudOn, setCloudOn] = useState(() => cloudBackupEnabled(historyOwner)),
    [cloudStatus, setCloudStatus] = useState(""),
    [cloudBusy, setCloudBusy] = useState(false);
  const backupToAccount = useCallback(async () => {
    if (!historyOwner) return;
    try {
      await backupIqNow(historyOwner);
      setCloudStatus(`Kopia na koncie: ${new Date().toLocaleTimeString("pl")}.`);
    } catch {
      setCloudStatus("Nie udało się zapisać kopii na koncie. Postęp jest bezpieczny w telefonie.");
    }
  }, [historyOwner]);
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
  const predictionRival =
    phase === "decision" && !retry && !session.forecasts?.length && !skipPrediction && !prediction
      ? forecastRival({ ...session, controlledId: "you" })
      : undefined;
  // Asked only while our team has the ball: then "to the ball" and "after me" are different moves.
  const askPrediction =
    !!predictionRival &&
    !session.world.looseBall &&
    teamOf(session, session.world.carrierId) === teamOf(session, "you");
  const playable = ready && phase === "decision" && !sheet && !error && !askPrediction;
  const own = controlled.world.carrierId === actor && !controlled.world.looseBall;
  const defending =
    !controlled.world.looseBall && teamOf(controlled, controlled.world.carrierId) !== "home";
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
  }, [phase, session.step, prediction, skipPrediction]);
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
      retry ||
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
          // The task for next time comes from the problem found in TY's key moment.
          const graded = assessAction(session);
          const found = keyMoment(graded);
          masteryNow.current = addAssessments(masteryNow.current, graded);
          saveMastery(historyOwner, masteryNow.current);
          setMastery(masteryNow.current);
          const rotated = pickFieldTask(
            session.definition,
            session.attack?.finish,
            loadFieldTask(historyOwner),
          );
          const task = found?.problem
            ? { ...rotated, id: `${session.definition.topicId}:${found.problem}`, text: found.task }
            : rotated;
          saveFieldTask(historyOwner, task);
          setFieldTask(task);
          if (cloudBackupEnabled(historyOwner)) void backupToAccount();
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
  }, [
    session,
    mode,
    id,
    historyOwner,
    onComplete,
    boot.error,
    error,
    replay,
    retry,
    backupToAccount,
  ]);
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
      const v9 = session.rulesVersion === 9;
      if (targetId === actor) {
        setDraft(liveChoice(controlled, own ? (v9 ? "shield" : "hold") : "wait", point));
        return;
      }
      // Defending: a tap on the rival with the ball is a press, on another rival a mark
      // (closing the pass to him). Both follow that rival while the play goes on.
      if (v9 && defending && target && target.team !== "home" && !target.goalkeeper) {
        const press = target.id === session.world.carrierId;
        setDraft(liveChoice(controlled, press ? "press" : "mark", point, target.id));
        return;
      }
      // With the ball: a tap on the rival goal mouth is a shot at that point.
      if (
        own &&
        !targetId &&
        point.y <= GOAL_TAP_DEPTH &&
        Math.abs(point.x - 50) <= GOAL_TAP_HALF_WIDTH
      ) {
        setDraft(liveChoice(controlled, "shoot", point));
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
      const from = journeyDuration(session);
      let next = chooseJourney(
        controlled,
        draft.id,
        (performance.now() - decisionStart.current) / 1000,
      );
      if (prediction && !session.forecasts?.length && !retry)
        next = addForecast(next, controlled, { predicted: prediction });
      if (retry) {
        const second = assessDecision(next, next.decisions.length - 1);
        const kind = retryVerdict(retry.firstId, draft.id, second);
        const style = solutionKind(second);
        const text =
          kind === "another"
            ? `Masz drugie dobre rozwiązanie${style ? ` (${solutionLabels[style]})` : ""}. ${second.happened}`
            : kind === "same"
              ? "To ten sam pomysł co za pierwszym razem: ta sama akcja do tego samego celu. Poszukaj innego."
              : `${qualityLabels[second.grade]}. ${second.happened} ${second.why}`;
        setRetry({ ...retry, verdict: { kind, text } });
      }
      setSession(next);
      setDraft(null);
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
  /** Replays another good option on the picture before the last decision (after the decision only). */
  function showAlternative() {
    const index = session.decisions.length - 1;
    if (index < 0) return;
    try {
      const r = reviewDecision(session, index);
      if (!r.better || !r.betterAssessment) {
        setAlternative({
          step: session.step,
          text: "W tym układzie nie znaleziono innego dobrego rozwiązania.",
        });
        return;
      }
      const other = chooseJourney(r.before, r.better.choice.id, 0, false);
      setAlternative({
        step: session.step,
        text: `${r.assessment.grade === "good" ? "Inne dobre rozwiązanie" : "Lepsze rozwiązanie"}: ${r.better.label}. ${r.betterAssessment.happened}`,
      });
      play(other, journeyDuration(r.before), journeyDuration(other), "feedback", true);
    } catch {
      setError("Nie udało się pokazać innego rozwiązania.");
    }
  }
  /** After a good decision: the same picture again, to be solved another way. */
  function findAnother() {
    const original = retry?.original ?? session;
    const index = retry?.index ?? session.decisions.length - 1;
    if (index < 0) return;
    try {
      const before = stateBefore(original, index);
      setRetry({
        original,
        index,
        firstId: original.decisions[index].choiceId,
        kinds: retry?.kinds ?? solutionMap(before).map((o) => o.kind),
        verdict: null,
      });
      setSession(before);
      setDraft(null);
      setAlternative(null);
      setPhase("decision");
    } catch {
      setError("Nie udało się odtworzyć tej sytuacji.");
    }
  }
  function leaveRetry() {
    if (!retry) return;
    setSession(retry.original);
    setRetry(null);
    setDraft(null);
    setPhase("feedback");
  }
  function start(def: JourneyDefinition, test = false) {
    allowedReplacement.current = false;
    setRetry(null);
    setSession(createJourneyForRules(def, 9));
    setMode(test ? "challenge" : "learn");
    setId(newId());
    setPhase("intro");
    setDraft(null);
    setReplay(null);
    setReview(null);
    setSaved(false);
    setSheet(null);
    setFieldTask(null);
    setTransfer(test);
    setPrediction(null);
    setSkipPrediction(false);
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
  // TY's own contribution, measured from the saved worlds and simulation events.
  const lastAssessment = useMemo(
    () => (session.decisions.length ? assessDecision(session, session.decisions.length - 1) : null),
    [session],
  );
  const assessments = useMemo(() => (session.outcome ? assessAction(session) : []), [session]);
  const forecast = session.forecasts?.[0];
  const forecastShown = forecast ? predictionResult(session, forecast) : null;
  const lastForecast =
    forecast && forecast.decisionIndex === session.decisions.length - 1 ? forecastShown : null;
  const upNext = useMemo(
    () => (phase === "summary" ? nextByMastery(session.definition, props.position, mastery) : null),
    [phase, session.definition, props.position, mastery],
  );
  const key = useMemo(() => keyMoment(assessments), [assessments]);
  const counts = contributionCounts(assessments);
  const summaryFact = `Twoje decyzje — dobre: ${counts.good} · do poprawy: ${counts.possible} · błędy: ${counts.error}. Liczy się Twój ruch, nie wynik drużyny.`;
  const keyReview = useMemo(
    () => (phase === "summary" && key ? reviewDecision(session, key.index) : null),
    [phase, key, session],
  );
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
  const situation = situationFor(session.definition);
  const boardActions = showAnalysis ? analysisPaths : review ? review.paths : preview;
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

  if (archive)
    return (
      <Suspense fallback={<p role="status">Ładowanie archiwum…</p>}>
        <FootballIQJourney {...props} onBack={() => setArchive(false)} />
      </Suspense>
    );
  const contextText = session.attack
    ? `${session.definition.context === 0 ? "78" : session.definition.context === 1 ? "54" : "82"}′ · ${(session.definition.context === 0 ? 1 : 0) + visibleHome}:${(session.definition.context === 2 ? 1 : 0) + visibleAway}`
    : session.definition.contextLabel.split(" · ").slice(0, 2).join(" · ");
  const nowLine = situationLine(controlled, actor);
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
          mode={
            draft?.intent === "shoot"
              ? "shot"
              : own || defending || draft?.intent === "pass"
                ? "pass"
                : "run"
          }
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
          selectablePlayerIds={displayed.players
            // With the ball, a tap at the rival goal is a shot, never a "pass" to their keeper.
            .filter((p) => !(own && p.goalkeeper && p.team !== "home"))
            .map((p) => p.id)}
          frameOverride={isPlaying ? liveFrame : idleFrame}
          frameSource={isPlaying ? sampleFrame : undefined}
          onPlayerSelect={(p) => choosePoint(displayed.world.positions[p.id], p.id)}
          onPitchSelect={(p) => choosePoint(p)}
          onReadyChange={setReady}
          showActionOrders={false}
          showGuidance={showAnalysis || !!review || !!draft}
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
          <section className="iqE-start" aria-label="Start akcji">
            <p className="iqE-start-line">{startLine(session)}</p>
            <button
              type="button"
              className="iqE-primary"
              disabled={!ready || !!error}
              onClick={() => play(session, 0, 0.8, "decision", true)}
            >
              Start <ArrowRight size={17} />
            </button>
          </section>
        ) : phase === "decision" && askPrediction && predictionRival ? (
          <section className="iqE-predict" aria-label="Przewidź reakcję rywala">
            <span className="iqE-eyebrow">Najpierw przewidź</span>
            <p className="iqE-now">
              Co zrobi rywal nr {predictionRival.number} po Twojej decyzji? Sprawdzisz to w
              animacji.
            </p>
            <div className="iqE-options" role="group" aria-label="Reakcja rywala">
              {(Object.entries(predictionLabels) as [TacticalForecast["predicted"], string][]).map(
                ([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!ready || !!sheet || !!error}
                    onClick={() => setPrediction(value)}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <button type="button" className="iqE-link" onClick={() => setSkipPrediction(true)}>
              Pomiń
            </button>
          </section>
        ) : phase === "decision" ? (
          <>
            {prediction && !session.forecasts?.length && (
              <p className="iqE-prediction">
                Twoja prognoza: {predictionLabels[prediction].toLowerCase()}.
              </p>
            )}
            {retry && (
              <p className="iqE-retry">
                Rozwiąż ten sam moment inaczej niż za pierwszym razem: inną akcją albo z innym
                celem.
              </p>
            )}
            <p className="iqE-now">{nowLine}</p>
            {draft ? (
              <div className="iqE-plan">
                <span>Twój wybór: {draft.label}</span>
                <button
                  className="iqE-icon"
                  type="button"
                  aria-label="Usuń wybór"
                  onClick={() => setDraft(null)}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <p className="iqE-controls">
                {controlsLine(own ? "own" : defending ? "rival" : "partner")}
              </p>
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
        ) : phase === "feedback" && retry?.verdict ? (
          <>
            <span className="iqE-eyebrow">Inne rozwiązanie</span>
            <p className="iqE-feedback" data-iq-retry={retry.verdict.kind}>
              {retry.verdict.text}
            </p>
            {retry.kinds.length > 0 && (
              <p className="iqE-why">
                W tym momencie są dobre rozwiązania:{" "}
                {retry.kinds.map((k) => solutionLabels[k]).join(", ")}.
              </p>
            )}
            <div className="iqE-actions">
              <button type="button" className="iqE-primary" onClick={leaveRetry}>
                Wróć do akcji <ArrowRight size={16} />
              </button>
              <button type="button" className="iqE-secondary" onClick={findAnother}>
                <RotateCcw size={16} /> Jeszcze raz
              </button>
            </div>
          </>
        ) : phase === "feedback" ? (
          <>
            <span className="iqE-eyebrow">Co się stało</span>
            {lastAssessment && (
              <>
                <p className="iqE-feedback">
                  <em className={`iqE-grade iqE-grade--${lastAssessment.grade}`}>
                    {qualityLabels[lastAssessment.grade]}
                    {solutionKind(lastAssessment) &&
                      ` · ${solutionLabels[solutionKind(lastAssessment)!]}`}
                  </em>{" "}
                  {lastAssessment.happened}
                </p>
                <p className="iqE-result" data-iq-result>
                  Skutek: {lastAssessment.result}
                </p>
                {lastAssessment.grade !== "good" && <p className="iqE-why">{lastAssessment.why}</p>}
              </>
            )}
            {alternative?.step === session.step && (
              <p className="iqE-alternative">{alternative.text}</p>
            )}
            {lastForecast && (
              <p className="iqE-forecast" data-iq-forecast={String(lastForecast.hit)}>
                <b>
                  {lastForecast.hit === null
                    ? "Prognoza bez rozstrzygnięcia."
                    : lastForecast.hit
                      ? "Prognoza trafiona."
                      : "Prognoza nietrafiona."}
                </b>{" "}
                Przewidziałeś: {lastForecast.predicted.toLowerCase()}. {lastForecast.actual}
              </p>
            )}
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
            {lastAssessment?.grade === "good" && (
              <button type="button" className="iqE-secondary" onClick={findAnother}>
                Znajdź inne rozwiązanie
              </button>
            )}
            {alternative?.step !== session.step && (
              <button type="button" className="iqE-link" onClick={showAlternative}>
                Zobacz inne rozwiązanie
              </button>
            )}
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
            <p className="iqE-fact">{summaryFact}</p>
            {forecastShown && (
              <p className="iqE-forecast" data-iq-forecast={String(forecastShown.hit)}>
                <b>
                  {forecastShown.hit === null
                    ? "Prognoza bez rozstrzygnięcia."
                    : forecastShown.hit
                      ? "Prognoza trafiona."
                      : "Prognoza nietrafiona."}
                </b>{" "}
                {forecastShown.actual}
              </p>
            )}
            {key && (
              <section className="iqE-key" aria-label="Kluczowy moment">
                <div className="iqE-between">
                  <span>Kluczowy moment · decyzja {key.index + 1}</span>
                  <em className={`iqE-grade iqE-grade--${key.grade}`}>
                    {qualityLabels[key.grade]}
                  </em>
                </div>
                <dl>
                  <dt>Co zrobiłeś</dt>
                  <dd>{key.did}</dd>
                  <dt>Co się stało</dt>
                  <dd>{key.happened}</dd>
                  <dt>Dlaczego to ważne</dt>
                  <dd>{key.why}</dd>
                </dl>
                <button
                  type="button"
                  className="iqE-secondary"
                  onClick={() => {
                    const { from, to } = momentRange(session, key.index);
                    play(session, from, to, "summary", true);
                  }}
                >
                  <Play size={16} /> Pokaż moment
                </button>
                <details className="iqE-more">
                  <summary>Więcej o tym momencie</summary>
                  {keyReview?.better && keyReview.betterAssessment && (
                    <p>
                      <b>
                        {key.grade === "good" ? "Inne dobre rozwiązanie" : "Lepsze rozwiązanie"}:
                      </b>{" "}
                      {keyReview.better.label}. W tej samej sytuacji:{" "}
                      {keyReview.betterAssessment.happened}{" "}
                      <button
                        type="button"
                        className="iqE-link"
                        aria-pressed={review?.index === key.index}
                        onClick={() => setReview(review?.index === key.index ? null : keyReview)}
                      >
                        {review?.index === key.index ? "Ukryj na boisku" : "Pokaż na boisku"}
                      </button>
                    </p>
                  )}
                  {key.rivalReaction && (
                    <p>
                      <b>Reakcja rywala:</b> {key.rivalReaction}
                    </p>
                  )}
                  <p>
                    <b>Źródło zasady:</b>{" "}
                    <a href={key.source.url} target="_blank" rel="noreferrer">
                      {key.source.label}
                    </a>
                  </p>
                </details>
              </section>
            )}
            {fieldTask && (
              <section className="iqE-task" aria-label="Zadanie na następny raz">
                <span>Zadanie na następny raz</span>
                <p>{fieldTask.text}</p>
                <small>
                  {props.historyOwner
                    ? "Zobaczysz je też na ekranie Start."
                    : "Zaloguj się, żeby widzieć je na ekranie Start."}
                </small>
              </section>
            )}
            <details className="iqE-review">
              <summary>Wszystkie Twoje decyzje ({assessments.length})</summary>
              <ol>
                {assessments.map((a, i) => (
                  <li key={session.decisions[i].choiceId + i}>
                    <button
                      type="button"
                      aria-pressed={review?.index === i}
                      onClick={() =>
                        setReview(review?.index === i ? null : reviewDecision(session, i))
                      }
                    >
                      <b>{i + 1}.</b> {a.did}
                      <em className={`iqE-grade iqE-grade--${a.grade}`}>
                        {qualityLabels[a.grade]}
                      </em>
                    </button>
                    {review?.index === i && (
                      <div className="iqE-better">
                        <p>{a.happened}</p>
                        <p>
                          <i style={{ background: REVIEW_COLORS.yours }} /> Twój wybór
                          {review.better ? (
                            <>
                              {" · "}
                              <i style={{ background: REVIEW_COLORS.better }} /> Lepiej:{" "}
                              {review.better.label}
                            </>
                          ) : a.grade === "good" ? null : (
                            " · Żadna z gotowych opcji nie była lepsza."
                          )}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </details>
            {upNext && (
              <p className="iqE-upnext" data-iq-next={upNext.def.topicId}>
                <b>Następna: {upNext.def.title}.</b> {upNext.reason}
              </p>
            )}
            <button
              type="button"
              className="iqE-primary"
              onClick={() =>
                start((upNext ?? nextByMastery(session.definition, props.position, mastery)).def)
              }
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
            <div className="iqE-intro-options" role="group" aria-label="Tryb gry">
              <button
                type="button"
                aria-pressed={mode === "learn"}
                disabled={phase !== "intro"}
                onClick={() => setMode("learn")}
              >
                Z omówieniem
              </button>
              <button
                type="button"
                aria-pressed={mode === "challenge"}
                disabled={phase !== "intro"}
                onClick={() => setMode("challenge")}
              >
                Bez przerw
              </button>
            </div>
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
                          [LIVE_BANK_VERSION, ...ATTACK_BANK_VERSIONS].includes(r.bankVersion),
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
                              {row.mode === "learn" ? "Z omówieniem" : "Bez przerw"}
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
            {historyOwner && (
              <section className="iqE-cloud" aria-label="Postęp na koncie">
                <h3 className="iqE-sources-title">Postęp na koncie</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={cloudOn}
                    onChange={(e) => {
                      const on = e.target.checked;
                      try {
                        setCloudBackup(historyOwner, on);
                        setCloudOn(on);
                        if (on) void backupToAccount();
                        else setCloudStatus("");
                      } catch {
                        setCloudStatus("Nie udało się zapisać ustawienia.");
                      }
                    }}
                  />
                  Zapisuj kopię IQ na koncie po każdej akcji (historia, postęp i zadanie)
                </label>
                <button
                  type="button"
                  className="iqE-secondary"
                  disabled={cloudBusy}
                  onClick={() => {
                    setCloudBusy(true);
                    setCloudStatus("Pobieram kopie z konta…");
                    void restoreIqFromAccount(historyOwner)
                      .then(({ copies, added }) => {
                        masteryNow.current = loadMastery(historyOwner);
                        setMastery(masteryNow.current);
                        setCloudStatus(
                          copies
                            ? `Połączono ${copies} ${copies === 1 ? "kopię" : "kopie"} z konta. Nowe wpisy: ${added}.`
                            : "Na koncie nie ma jeszcze kopii IQ.",
                        );
                      })
                      .catch(() =>
                        setCloudStatus(
                          "Nie udało się przywrócić kopii. Dane w telefonie są nienaruszone.",
                        ),
                      )
                      .finally(() => setCloudBusy(false));
                  }}
                >
                  Przywróć postęp z konta
                </button>
                {cloudStatus && <p role="status">{cloudStatus}</p>}
              </section>
            )}
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
                        <ProgressTag mastery={mastery} def={i.def} />
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
                {(crossingZone(session.world.positions[actor], "home")
                  ? (["ground", "chip", "lofted", "cross"] as const)
                  : (["ground", "chip", "lofted"] as const)
                ).map((delivery) => (
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
                        : delivery === "cross"
                          ? "Dośrodkowanie"
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

function ProgressTag({ mastery, def }: { mastery: Mastery; def: JourneyDefinition }) {
  const p = aimProgress(mastery, lessonAim(def));
  if (p.level === "new") return null;
  return (
    <small className={`iqE-progress iqE-progress--${p.level}`}>
      {p.level === "mastered" ? "Opanowane" : `${Math.round(p.score * 100)}%`}
    </small>
  );
}
