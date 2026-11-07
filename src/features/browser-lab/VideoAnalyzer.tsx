import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, FileVideo, RotateCcw, ZoomIn } from "lucide-react";
import { createBrowserResult, resultValue, timedMeasurement, type BrowserResult } from "./results";
import { protocolFor, sideLabel, type BrowserAttempt } from "./protocols";
import { createJumpFrameDecoder, openJumpVideo, type OpenedVideo } from "./video";
import { createHistoryBackup } from "./storage";
import { downloadText, downloadBlob } from "./download";
import { LabButton, LabNotice, messageOf } from "./LabUI";
import { CameraRecorder } from "./CameraRecorder";
import { AutomaticLongJumpOverlay } from "./LongJumpEditor";
import {
  findBallWiseCalibrationMarkers,
  longJumpMeasurement,
  longJumpSchema,
  type AutomaticLongJumpCalibration,
} from "./longJump";
import { analyzeLongJump } from "./longJumpAuto";
import { analyzeTimedVideo } from "./timedAuto";
import type { TimedEventProposal, TimedTestId } from "./timedEventDetection";
import { EventFrameProof } from "./EventFrameProof";
import { prepareManualJump, completeManualJump, type ManualJumpStart } from "./manualLongJump";
import { paintVideoFrame } from "./videoFrame";
import { APP_VERSION } from "@/lib/appVersion";
import { orientStartMarker } from "./markerGeometry";
import { LabEventGapError, validateEventGaps } from "./measurement";
import { resultRecordingQuality } from "./timingQuality";

export function VideoAnalyzer({
  ownerId,
  attempt,
  sessionId,
  onSave,
}: {
  ownerId?: string;
  attempt: BrowserAttempt;
  sessionId: string;
  onSave: (result: BrowserResult) => void;
}) {
  const protocol = protocolFor(attempt.testId);
  const isLongJump = attempt.testId === "standing_long_jump";
  const is505 = attempt.testId === "cod_505";
  const [spatial, setSpatial] = useState<AutomaticLongJumpCalibration | null>(null);
  const [autoStatus, setAutoStatus] = useState<"idle" | "analyzing" | "ready" | "error" | "manual">(
    "idle",
  );
  const [autoProgress, setAutoProgress] = useState(0);
  const [autoError, setAutoError] = useState("");
  const [turnFrame, setTurnFrame] = useState<number | null>(null);
  const [timedProposal, setTimedProposal] = useState<TimedEventProposal | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [proofReady, setProofReady] = useState(false);
  const [reviewWide, setReviewWide] = useState(false);
  const [manualJump, setManualJump] = useState<{ start?: ManualJumpStart } | null>(null);
  const [manualCursor, setManualCursor] = useState<[number, number]>([0.5, 0.8]);
  const [video, setVideo] = useState<OpenedVideo | null>(null);
  const [reading, setReading] = useState(false);
  const [frameIndex, setFrameIndex] = useState(1);
  const [painted, setPainted] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [guides, setGuides] = useState<[number, number]>(
    protocol.guideAxis === "horizontal" ? [0.8, 0.8] : [0.3, 0.7],
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [original, setOriginal] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<BrowserResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const [marking, setMarking] = useState<"start" | "end">("start");
  const [editing, setEditing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const load = useRef<AbortController | null>(null);
  const version = useRef(0);
  const decoderRef = useRef<ReturnType<typeof createJumpFrameDecoder> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const correctionRef = useRef<HTMLElement>(null);
  const correctionBefore = useRef<{
    spatial: AutomaticLongJumpCalibration;
    end: number | null;
    frameIndex: number;
    draft: BrowserResult | null;
    error: string;
  } | null>(null);
  const cancelCorrectionRef = useRef<() => void>(() => {});
  cancelCorrectionRef.current = cancelHeelCorrection;

  useEffect(() => {
    if (!isLongJump || !editing) return;
    const root = rootRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    correctionRef.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelCorrectionRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...(correctionRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
        ) ?? []),
      ];
      const first = controls[0],
        last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === correctionRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === correctionRef.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keys, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keys, true);
      queueMicrotask(() => {
        if (root?.isConnected) root.querySelector<HTMLButtonElement>("[data-heel-edit]")?.focus();
      });
    };
  }, [isLongJump, editing]);

  const stopImport = useCallback(
    (message: string) => {
      load.current?.abort();
      setReading(false);
      if (video && autoStatus === "analyzing") {
        setAutoStatus("error");
        setAutoError(message);
      } else setError(message);
    },
    [video, autoStatus],
  );

  useEffect(
    () => () => {
      version.current++;
      load.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!reading) return;
    const pause = () => {
      if (document.hidden)
        stopImport(
          "Analiza przerwana po schowaniu aplikacji. Wybierz film ponownie, aby kontynuować.",
        );
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [reading, stopImport]);
  useEffect(() => {
    if (!video || saved) return;
    const decoder = createJumpFrameDecoder(video);
    decoderRef.current = decoder;
    return () => {
      decoder.dispose();
      if (decoderRef.current === decoder) decoderRef.current = null;
    };
  }, [video, saved]);
  useEffect(() => {
    if (!video || saved || !decoderRef.current) return;
    const controller = new AbortController();
    let active = true;
    setPainted(null);
    const visibility = () => {
      if (document.hidden) controller.abort();
      else if (controller.signal.aborted) setRefresh((value) => value + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    void decoderRef.current
      .decode(frameIndex, controller.signal)
      .then((frame) => {
        try {
          if (!active || controller.signal.aborted || !canvas.current) return;
          const paintedFrame = paintVideoFrame(
            canvas.current,
            frame,
            video.rotation,
            isLongJump || zoom > 1 ? 4096 : 1280,
          );
          setAspect(paintedFrame.aspect);
          setPainted(frameIndex);
          setError("");
        } finally {
          frame.close();
        }
      })
      .catch((reason: unknown) => {
        if (active && !controller.signal.aborted) setError(messageOf(reason));
      });
    return () => {
      active = false;
      controller.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [video, frameIndex, refresh, saved, zoom, isLongJump]);

  async function importVideo(file: File) {
    setCameraOpen(false);
    setLastFile(file);
    load.current?.abort();
    const controller = new AbortController();
    load.current = controller;
    const current = ++version.current;
    setReading(true);
    setVideo(null);
    setPainted(null);
    setStart(null);
    setEnd(null);
    setSpatial(null);
    setAutoStatus("idle");
    setAutoProgress(0);
    setAutoError("");
    setTurnFrame(null);
    setTimedProposal(null);
    setReviewIndex(0);
    setProofReady(false);
    setManualJump(null);
    setReviewWide(false);
    setOriginal(false);
    setConfirmed(false);
    setDraft(null);
    setSaved(false);
    setError("");
    setMarking("start");
    setEditing(false);
    setZoom(1);
    setPan([0, 0]);
    try {
      const opened = await openJumpVideo(file, controller.signal);
      if (current !== version.current || controller.signal.aborted) return;
      setVideo(opened);
      setFrameIndex(1);
      if (isLongJump) {
        setAutoStatus("analyzing");
        try {
          const automatic = await analyzeLongJump(opened, controller.signal, (progress) => {
            if (current === version.current && !controller.signal.aborted)
              setAutoProgress(progress);
          });
          if (current !== version.current || controller.signal.aborted) return;
          setSpatial(automatic);
          setStart(automatic.lineFrameIndex);
          setEnd(automatic.heelFrameIndex);
          setFrameIndex(automatic.heelFrameIndex);
          setMarking("end");
          setEditing(true);
          setAutoStatus("ready");
        } catch (reason) {
          if (current !== version.current || controller.signal.aborted) return;
          setAutoError(messageOf(reason));
          setAutoStatus("error");
        }
      } else if (protocol.category === "jump") {
        await proposeTiming(opened, controller, current);
      }
    } catch (reason) {
      if (current === version.current && !controller.signal.aborted) setError(messageOf(reason));
    } finally {
      if (current === version.current) setReading(false);
    }
  }
  async function proposeTiming(
    opened: OpenedVideo,
    controller: AbortController,
    current: number,
    line?: number,
    chosenStart?: number,
  ) {
    setAutoStatus("analyzing");
    setAutoProgress(0);
    setAutoError("");
    setTimedProposal(null);
    setProofReady(false);
    try {
      const proposal = await analyzeTimedVideo(
        opened,
        attempt.testId as TimedTestId,
        attempt.side,
        line,
        controller.signal,
        (progress) => {
          if (current === version.current && !controller.signal.aborted) setAutoProgress(progress);
        },
      );
      if (current !== version.current || controller.signal.aborted) return;
      setStart(chosenStart ?? proposal.start);
      setEnd(proposal.end);
      setTurnFrame(proposal.turn ?? null);
      setTimedProposal(proposal);
      setReviewIndex(chosenStart !== undefined ? 1 : 0);
      setFrameIndex(
        chosenStart !== undefined ? proposal.end : (proposal.startReviewFrom ?? proposal.start),
      );
      setMarking(chosenStart !== undefined ? "end" : "start");
      setEditing(true);
      setConfirmed(false);
      setOriginal(false);
      setDraft(null);
      setAutoStatus("ready");
    } catch (reason) {
      if (current === version.current && !controller.signal.aborted) {
        setAutoStatus("error");
        setAutoError(messageOf(reason));
      }
    }
  }
  async function findTimedEvents() {
    if (!video || reading || saved) return;
    load.current?.abort();
    const controller = new AbortController();
    load.current = controller;
    const current = ++version.current;
    setReading(true);
    const chosenStart =
      attempt.testId === "sprint_10m" && timedProposal === null && start !== null
        ? start
        : undefined;
    setStart(chosenStart ?? null);
    setEnd(null);
    setTurnFrame(null);
    setDraft(null);
    setConfirmed(false);
    await proposeTiming(
      video,
      controller,
      current,
      protocol.category === "jump" ? undefined : guides[is505 ? 0 : 1],
      chosenStart,
    );
    if (current === version.current) setReading(false);
  }
  const ready = video !== null && painted === frameIndex && !reading;
  const reviewStages: ("start" | "turn" | "end")[] = is505
    ? ["start", "turn", "end"]
    : ["start", "end"];
  const reviewing = timedProposal !== null && reviewIndex < reviewStages.length;
  const reviewTarget = reviewStages[reviewIndex];
  let measure:
    | (Pick<
        BrowserResult,
        | "primaryValue"
        | "primaryUnit"
        | "elapsedSeconds"
        | "resolutionMin"
        | "resolutionMax"
        | "averageSpeedMps"
      > & { uncertaintyCm?: number; cameraShiftPx?: number })
    | null = null;
  let invalid = "";
  let needsNewRecording = false;
  if (video && start !== null && end !== null) {
    try {
      if (isLongJump) {
        if (!spatial || spatial.lineFrameIndex !== start || spatial.heelFrameIndex !== end)
          throw new Error(
            "Punkty linii i pięty muszą pochodzić z oznaczonych klatek. Oznacz je ponownie.",
          );
        const elapsedSeconds =
          video.timeline.frames[end].seconds - video.timeline.frames[start].seconds;
        if (elapsedSeconds < protocol.minimumSeconds || elapsedSeconds > protocol.maximumSeconds)
          throw new Error("Sprawdź klatkę przed odbiciem i stabilnego lądowania.");
        measure = { ...longJumpMeasurement(spatial), elapsedSeconds };
      } else {
        measure = timedMeasurement(attempt.testId, video.timeline, start, end);
        if (is505 && (turnFrame === null || turnFrame <= start || turnFrame >= end))
          throw new Error("Oznacz nawrót pomiędzy wejściem a powrotem.");
        if (is505 && turnFrame !== null)
          validateEventGaps(video.timeline, turnFrame, turnFrame, true);
      }
    } catch (reason) {
      measure = null;
      invalid = messageOf(reason);
      needsNewRecording = reason instanceof LabEventGapError;
    }
  }
  function move(index: number) {
    if (!video || saved) return;
    const next = Math.max(0, Math.min(video.timeline.frames.length - 1, index));
    if (next === frameIndex) {
      if (painted !== frameIndex) setRefresh((value) => value + 1);
      return;
    }
    setPainted(null);
    setFrameIndex(next);
  }
  function mark(which: "start" | "end") {
    if (!ready || saved || frameIndex < 1) return;
    if (which === "start") {
      setStart(frameIndex);
      setMarking("end");
      setEditing(true);
      if (is505) setTurnFrame(null);
    } else {
      setEnd(frameIndex);
      setEditing(false);
    }
    setDraft(null);
    setConfirmed(false);
    setError("");
  }
  function beginHeelCorrection() {
    if (!spatial || saved) return;
    correctionBefore.current = { spatial, end, frameIndex, draft, error };
    setEditing(true);
    if (end !== null) move(end);
  }
  function cancelHeelCorrection() {
    if (manualJump) {
      setManualJump(null);
      setAutoStatus("error");
      setEditing(false);
      setStart(null);
      setEnd(null);
      setSpatial(null);
      return;
    }
    const previous = correctionBefore.current;
    if (previous) {
      setSpatial(previous.spatial);
      setEnd(previous.end);
      setDraft(previous.draft);
      setError(previous.error);
      move(previous.frameIndex);
    }
    correctionBefore.current = null;
    setEditing(false);
  }
  function save() {
    if (
      !video ||
      !measure ||
      start === null ||
      end === null ||
      !ready ||
      reading ||
      editing ||
      reviewing ||
      !original ||
      !confirmed ||
      (isLongJump && spatial?.heelSource !== "manual") ||
      saved
    )
      return;
    try {
      const result =
        draft ??
        createBrowserResult({
          attempt,
          sessionId,
          timeline: video.timeline,
          start,
          end,
          sourceName: video.sourceName,
          sourceHash: video.sourceHash,
          sourceBytes: video.sourceBytes,
          codec: video.config.codec,
          guidePositions: guides,
          notes,
          timingMethod: timedProposal ? "assisted" : "manual",
          ...(isLongJump ? { spatial: longJumpSchema.parse(spatial) } : {}),
          ...(is505 && turnFrame !== null ? { turnFrameIndex: turnFrame } : {}),
        });
      setDraft(result);
      onSave(result);
      setSaved(true);
      setError("");
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  function useManualTiming() {
    load.current?.abort();
    setReading(false);
    setTimedProposal(null);
    setAutoStatus("manual");
    setAutoError("");
    setStart(null);
    setEnd(null);
    setTurnFrame(null);
    setMarking("start");
    setEditing(true);
    setDraft(null);
    setOriginal(false);
    setConfirmed(false);
    move(1);
  }
  function confirmProposedEvent() {
    if (!ready || !proofReady || !reviewing) return;
    if (
      frameIndex < 1 ||
      (reviewTarget === "start" && end !== null && frameIndex >= end) ||
      (reviewTarget === "turn" &&
        (start === null || end === null || frameIndex <= start || frameIndex >= end)) ||
      (reviewTarget === "end" && frameIndex <= (turnFrame ?? start ?? 0))
    ) {
      setError("Zdarzenia muszą zachować kolejność: początek, ewentualny nawrót, koniec.");
      return;
    }
    if (reviewTarget === "start") setStart(frameIndex);
    else if (reviewTarget === "turn") setTurnFrame(frameIndex);
    else setEnd(frameIndex);
    setDraft(null);
    setConfirmed(false);
    setProofReady(false);
    setReviewWide(false);
    const next = reviewIndex + 1;
    setReviewIndex(next);
    if (next >= reviewStages.length) {
      setEditing(false);
      return;
    }
    const target = reviewStages[next];
    setMarking(target === "start" ? "start" : "end");
    move(
      target === "turn"
        ? turnFrame!
        : target === "end"
          ? (timedProposal?.endReviewFrom ?? end!)
          : start!,
    );
  }
  function changeGuide(value: number, index: number) {
    setGuides((old) =>
      protocol.sharedGuide ? [value, value] : index === 0 ? [value, old[1]] : [old[0], value],
    );
    setDraft(null);
    setConfirmed(false);
    if (protocol.category !== "jump") {
      const keepStart =
        attempt.testId === "sprint_10m" && start !== null && (!timedProposal || reviewIndex > 0);
      setTimedProposal(null);
      setStart(keepStart ? start : null);
      setEnd(null);
      setTurnFrame(null);
      setMarking(keepStart ? "end" : "start");
      setEditing(true);
      setAutoStatus("idle");
    }
  }
  function startManualJump() {
    setAutoStatus("manual");
    setManualJump({});
    setSpatial(null);
    setStart(null);
    setEnd(null);
    setEditing(true);
    setZoom(1);
    setPan([0, 0]);
    move(1);
    setError("");
  }
  function acceptManualHeel(heel: [number, number]) {
    if (!ready || !manualJump?.start || !canvas.current) return;
    try {
      const image = canvas.current
        .getContext("2d", { willReadFrequently: true })!
        .getImageData(0, 0, canvas.current.width, canvas.current.height);
      const calibration = completeManualJump(manualJump.start, image, heel, frameIndex);
      setSpatial(calibration);
      setEnd(frameIndex);
      setManualJump(null);
      setAutoStatus("ready");
      setEditing(false);
      setDraft(null);
      setError("");
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  const stepIndex = marking === "start" ? 0 : 1;
  const selectedIndex = stepIndex === 0 ? start : end;
  const shortSetup = isLongJump
    ? "Dwa wzorce połóż na podłożu: START przy palcach i drugi dokładnie 3,00 m dalej. Telefon nieruchomo, z boku."
    : is505
      ? "10 m rozbiegu, 5 m do nawrotu. Pokaż linię pomiarową i kontakt nogi stawnej."
      : protocol.category === "jump"
        ? "Telefon z boku. Pokaż stopy i podłoże. Ręce na biodrach."
        : "Odmierz odcinek. Telefon nieruchomo, bokiem. Pokaż obie linie.";
  const shortInstructions = {
    cmj: [
      "Pierwsza klatka z obiema stopami nad podłożem.",
      "Pierwsza klatka kontaktu stopy z podłożem.",
    ],
    single_leg_cmj: [
      "Pierwsza klatka ze stopą podporową nad podłożem.",
      "Pierwsza klatka kontaktu tej samej stopy z podłożem.",
    ],
    sprint_10m: [
      "Pierwszy ruch tułowia rozpoczynający bieg.",
      "Środek tułowia pierwszy raz przecina metę 10 m.",
    ],
    standing_long_jump: [
      "Automatyka wykrywa linię START przed odbiciem.",
      "Wskaż kontakt bliższej pięty z podłożem i sprawdź, czy lądowanie było prawidłowe.",
    ],
    cod_505: [
      "Środek tułowia pierwszy raz przecina linię pomiarową.",
      "Ten sam punkt przecina tę linię w drodze powrotnej.",
    ],
  } as const;
  const precision = video && video.timeline.fps < 119 ? " · orientacyjny" : "";
  const recordingQuality =
    video && start !== null && end !== null
      ? resultRecordingQuality({
          testId: attempt.testId,
          fps: video.timeline.fps,
          startSeconds: video.timeline.frames[start].seconds,
          startPreviousSeconds: video.timeline.frames[Math.max(0, start - 1)].seconds,
          endSeconds: video.timeline.frames[end].seconds,
          endPreviousSeconds: video.timeline.frames[Math.max(0, end - 1)].seconds,
        })
      : null;
  function selectFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (file) void importVideo(file);
  }
  async function downloadDraft() {
    if (!draft) return;
    const snapshot = version.current;
    try {
      const result = await downloadText(
        `BallWise-proba-${draft.id.slice(0, 8)}.json`,
        JSON.stringify(createHistoryBackup([draft]), null, 2),
        "application/json",
        ownerId,
      );
      if (version.current === snapshot && result === "cancelled")
        setError("Anulowano przekazanie kopii. Wynik pozostaje na ekranie.");
    } catch (error) {
      if (version.current === snapshot) setError(messageOf(error));
    }
  }
  async function downloadOriginal() {
    if (!lastFile) return;
    const snapshot = version.current;
    try {
      const result = await downloadBlob(lastFile.name, lastFile, ownerId);
      if (version.current === snapshot && result === "cancelled")
        setError("Anulowano przekazanie filmu. Oryginał pozostaje dostępny.");
    } catch (error) {
      if (version.current === snapshot) setError(messageOf(error));
    }
  }
  return (
    <div
      className="bl-analyzer bl-compact"
      ref={rootRef}
      data-lab-test={attempt.testId}
      data-lab-loaded={!!video}
      data-lab-reading={reading}
      data-lab-auto={autoStatus}
      data-lab-frame={frameIndex}
      data-lab-painted={painted ?? -1}
    >
      <header className="bl-attempt-heading">
        <div>
          <p className="bl-kicker">
            PRÓBA {attempt.trial} / {attempt.trials}
          </p>
          <h2>
            {protocol.title}
            {attempt.side && ` · ${sideLabel(attempt.side)}`}
          </h2>
        </div>
        {saved && <span className="bl-saved-badge">Zapisano</span>}
      </header>
      <ol className="bl-flow-steps" aria-label="Etapy pomiaru">
        {["Film", "Sprawdź", "Wynik"].map((title, index) => {
          const current = saved || (measure && !editing) ? 2 : video ? 1 : 0;
          return (
            <li
              key={title}
              aria-current={current === index ? "step" : undefined}
              className={index < current ? "is-complete" : ""}
            >
              <span>{index + 1}</span>
              {title}
            </li>
          );
        })}
      </ol>
      {!saved && (
        <>
          <input
            ref={galleryInput}
            className="bl-file-input"
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            aria-label="Wybierz oryginalny film"
            disabled={reading}
            onChange={(event) => selectFile(event.currentTarget)}
          />
          <input
            ref={cameraInput}
            className="bl-file-input"
            type="file"
            accept="video/*"
            capture="environment"
            aria-label="Nagraj w aparacie systemowym"
            disabled={reading}
            onChange={(event) => selectFile(event.currentTarget)}
          />
        </>
      )}
      {cameraOpen && (
        <CameraRecorder
          highDetail={isLongJump}
          title={`${protocol.title}${attempt.side ? ` · ${sideLabel(attempt.side)}` : ""}`}
          instruction={shortSetup}
          onRecording={(file) => {
            void importVideo(file);
          }}
          onCancel={() => setCameraOpen(false)}
        />
      )}
      {!video && !cameraOpen && (
        <section className="bl-card bl-source-card">
          <h3>Dodaj nagranie</h3>
          <p className="bl-muted">{shortSetup}</p>
          {protocol.category !== "jump" && (
            <p className="bl-timing-tip">
              Najlepiej: nagraj w aparacie telefonu 120 lub 240 FPS i wybierz oryginalny film. Przed
              startem stój spokojnie przez sekundę.
            </p>
          )}
          {isLongJump && (
            <div className="bl-auto-setup">
              <span>1</span>
              <p>
                Wydrukuj dwa arkusze: START oraz 3 METRY. Ramka ma 20,0 × 24,0 cm. Linia START to
                krawędź 20,0 cm.
              </p>
              <span>2</span>
              <p>Krzyżyk pomarańczowego arkusza ustaw dokładnie 3,00 m od linii startu.</p>
              <div className="bl-auto-downloads">
                <a
                  className="bl-button bl-secondary"
                  href={`/lab-wzorzec.svg?v=${APP_VERSION}`}
                  download
                >
                  1. START
                </a>
                <a
                  className="bl-button bl-secondary"
                  href={`/lab-wzorzec-3m.svg?v=${APP_VERSION}`}
                  download
                >
                  2. 3 METRY
                </a>
              </div>
            </div>
          )}
          <LabButton
            className="bl-wide"
            disabled={reading}
            onClick={() => {
              setError("");
              setCameraOpen(true);
            }}
          >
            <Camera size={18} /> Nagraj próbę
          </LabButton>
          <LabButton
            className="bl-secondary bl-wide"
            disabled={reading}
            onClick={() => galleryInput.current?.click()}
          >
            <FileVideo size={18} /> Wybierz film
          </LabButton>
          <p className="bl-muted">Jedna próba · 5–10 sekund.</p>
          <details className="bl-details">
            <summary>Jak wykonać próbę?</summary>
            <ol className="bl-steps">
              {protocol.setup.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            <p className="bl-muted">
              HD lub 4K, od 15 FPS. Maksymalnie 20 s i 128 MB. Film w oryginalnym tempie. Jeśli
              galeria zmienia tempo, w Zdjęciach wybierz Udostępnij → Eksportuj niezmodyfikowany
              oryginał → Pliki. 120/240 FPS szukaj w Aparacie w trybie „Zwolnione tempo”.
            </p>
            <p className="bl-muted">
              Lab dobiera tryb tylnej kamery dostępny w przeglądarce. Liczbę klatek i czasy sprawdza
              w gotowym filmie. Tryby 120/240 FPS mogą być dostępne tylko w aplikacji Aparat.
            </p>
            <LabButton
              className="bl-secondary"
              disabled={reading}
              onClick={() => cameraInput.current?.click()}
            >
              Otwórz aparat systemowy
            </LabButton>
          </details>
          {reading && <LabNotice>Czytam film…</LabNotice>}
          {reading && (
            <LabButton
              className="bl-link"
              onClick={() => {
                version.current++;
                load.current?.abort();
                setReading(false);
              }}
            >
              Anuluj odczyt
            </LabButton>
          )}
        </section>
      )}
      {error && <LabNotice error>{error}</LabNotice>}
      {!video && lastFile && !reading && !cameraOpen && (
        <LabButton className="bl-secondary bl-wide" onClick={() => void downloadOriginal()}>
          Zachowaj nagranie
        </LabButton>
      )}
      {video && isLongJump && autoStatus === "analyzing" && (
        <section className="bl-card bl-auto-progress" aria-live="polite">
          <div className="bl-auto-spinner" />
          <p className="bl-kicker">ANALIZA AUTOMATYCZNA</p>
          <h2>Wykrywam skok i sprawdzam geometrię</h2>
          <div className="bl-session-progress" aria-label={`${autoProgress}% analizy`}>
            <span style={{ width: `${autoProgress}%` }} />
          </div>
          <p className="bl-muted">Sylwetka · wzorzec · ruch kamery · bliższa pięta</p>
          <LabButton
            className="bl-secondary"
            onClick={() => stopImport("Analiza anulowana. Możesz ponownie wybrać film.")}
          >
            Anuluj analizę
          </LabButton>
        </section>
      )}
      {video && isLongJump && autoStatus === "error" && (
        <section className="bl-card bl-auto-failed">
          <p className="bl-kicker">BRAK WIARYGODNEGO WYNIKU</p>
          <h2>Nie zgaduję centymetrów</h2>
          <LabNotice error>{autoError}</LabNotice>
          <LabButton className="bl-wide" onClick={startManualJump}>
            Wskaż lądowanie ręcznie
          </LabButton>
          {lastFile && (
            <LabButton className="bl-secondary bl-wide" onClick={() => void downloadOriginal()}>
              Zachowaj nagranie
            </LabButton>
          )}
          <LabButton className="bl-wide" onClick={() => galleryInput.current?.click()}>
            Wybierz lepszy film
          </LabButton>
          <LabButton
            className="bl-secondary bl-wide"
            onClick={() => {
              setVideo(null);
              setAutoStatus("idle");
              setAutoError("");
              setCameraOpen(true);
            }}
          >
            Nagraj ponownie
          </LabButton>
        </section>
      )}
      {video && !isLongJump && autoStatus === "analyzing" && (
        <section className="bl-card bl-auto-progress" aria-live="polite">
          <h3>Szukam zdarzeń w nagraniu</h3>
          <progress max={100} value={autoProgress} aria-label="Postęp wyszukiwania zdarzeń" />
          <p className="bl-muted">Potem sprawdzisz sąsiednie klatki przed zapisem.</p>
          <LabButton
            className="bl-link"
            onClick={() => stopImport("Analiza anulowana. Możesz oznaczyć zdarzenia ręcznie.")}
          >
            Anuluj analizę
          </LabButton>
        </section>
      )}
      {video && !isLongJump && autoStatus === "error" && (
        <LabNotice>{autoError} Ręczne oznaczanie pozostaje dostępne.</LabNotice>
      )}
      {video &&
        measure &&
        !reviewing &&
        (!isLongJump || (spatial?.heelSource === "manual" && !editing)) && (
          <section className="bl-card bl-result" aria-label="Wynik próby">
            <p className="bl-kicker">{saved ? "ZAPISANO LOKALNIE" : "WYNIK PRÓBY"}</p>
            <div className="bl-big-value">
              {resultValue(measure.primaryValue, measure.primaryUnit)}
            </div>
            {!recordingQuality && (
              <p className="bl-muted">
                {video.timeline.fps.toFixed(0)} FPS{precision}
              </p>
            )}
            {recordingQuality && (
              <div className={`bl-timing-quality bl-timing-quality-${recordingQuality.status}`}>
                <strong>
                  {!isLongJump && `${video.timeline.fps.toFixed(0)} FPS · `}
                  {recordingQuality.label}
                </strong>
                <p>{recordingQuality.description}</p>
              </div>
            )}
            {!recordingQuality && (
              <p className="bl-muted">
                {isLongJump ? (
                  <>Czułość geometrii: ±{measure.uncertaintyCm?.toFixed(1)} cm</>
                ) : (
                  <>
                    Zakres z klatek: {resultValue(measure.resolutionMin!, measure.primaryUnit)}–
                    {resultValue(measure.resolutionMax!, measure.primaryUnit)}
                  </>
                )}
              </p>
            )}

            {measure.averageSpeedMps !== undefined && (
              <p>Średnia prędkość: {(measure.averageSpeedMps * 3.6).toFixed(1)} km/h</p>
            )}
            {!saved && (
              <>
                {
                  <label className="bl-check">
                    <input
                      type="checkbox"
                      checked={original && confirmed}
                      onChange={(event) => {
                        setOriginal(event.target.checked);
                        setConfirmed(event.target.checked);
                        setDraft(null);
                      }}
                    />
                    {protocol.confirmation}
                  </label>
                }
                {isLongJump && (
                  <div className="bl-auto-checks">
                    <span>✓ Oba wzorce rozpoznane</span>
                    <span>✓ Kamera stabilna ({measure.cameraShiftPx?.toFixed(1)} px)</span>
                    <span>✓ Linia START i punkt pięty</span>
                  </div>
                )}
                <LabButton
                  className="bl-wide"
                  disabled={
                    !ready ||
                    reading ||
                    editing ||
                    !original ||
                    !confirmed ||
                    (isLongJump && spatial?.heelSource !== "manual")
                  }
                  onClick={save}
                >
                  Zapisz wynik
                </LabButton>
                {!isLongJump && (
                  <LabButton
                    className="bl-link bl-wide"
                    onClick={() => setEditing((value) => !value)}
                  >
                    {editing ? "Zamknij korektę" : "Popraw oznaczenia"}
                  </LabButton>
                )}
                {isLongJump && (
                  <p className="bl-auto-confirm">
                    Zapisując potwierdzasz 3,00 m między linią START a krzyżykiem, nieruchomy
                    telefon i poprawny punkt pięty.
                  </p>
                )}
              </>
            )}
            <details className="bl-details">
              <summary>Szczegóły pomiaru</summary>
              {recordingQuality && !isLongJump && (
                <p>
                  Zakres z klatek: {resultValue(measure.resolutionMin!, measure.primaryUnit)}–
                  {resultValue(measure.resolutionMax!, measure.primaryUnit)}.
                </p>
              )}
              {isLongJump && (
                <p>
                  Czułość geometrii na przesunięcie punktów: ±{measure.uncertaintyCm?.toFixed(1)}{" "}
                  cm. To wskaźnik wrażliwości kadru, nie całkowity błąd pomiaru.
                </p>
              )}
              {lastFile && (
                <LabButton className="bl-secondary" onClick={() => void downloadOriginal()}>
                  Pobierz film
                </LabButton>
              )}
              <p>
                {isLongJump
                  ? "Między oznaczonymi klatkami (nie służy do obliczania odległości)"
                  : protocol.category === "jump"
                    ? "Czas lotu"
                    : "Czas odcinka"}
                : {measure.elapsedSeconds.toFixed(3)} s · {video.timeline.fps.toFixed(2)} FPS.
              </p>
              {!isLongJump && (
                <p className="bl-muted">
                  Zakres dotyczy odstępów między klatkami. Nie obejmuje błędu oznaczenia zdarzeń,
                  ustawienia kamery ani techniki. Przy 30/60 FPS wynik jest orientacyjny.
                </p>
              )}
              {protocol.category === "jump" && !isLongJump && (
                <p className="bl-muted">
                  Wysokość z czasu lotu: h = g · t² / 8. Ustawienie nóg przy wybiciu i pierwszym
                  kontakcie powinno być podobne.
                </p>
              )}
              {isLongJump && (
                <p className="bl-muted">
                  Odległość prostopadle od krawędzi START (20 cm) do bliższej pięty. Automatyka nie
                  zapisuje wyniku, jeśli wzorzec jest za mały, wykryto ruch kamery albo czułość
                  geometrii przekracza 5 cm. Kontakt pięty z podłożem wskazujesz ręcznie. Odległość
                  sprawdź także taśmą.
                </p>
              )}
              {is505 && turnFrame !== null && (
                <p className="bl-muted">
                  505 tradycyjny: 10 m rozbiegu + 5 m do nawrotu + 5 m powrotu. Nawrót: klatka{" "}
                  {turnFrame + 1}. Czas liczymy między dwoma przecięciami tej samej linii.
                </p>
              )}
              <p className="bl-muted">{protocol.confirmation}</p>
              {!saved && (
                <label className="bl-label">
                  Notatka (opcjonalnie)
                  <textarea
                    aria-label="Notatka do próby"
                    maxLength={280}
                    rows={2}
                    value={notes}
                    onChange={(event) => {
                      setNotes(event.target.value);
                      setDraft(null);
                    }}
                    placeholder="Obuwie, nawierzchnia…"
                  />
                </label>
              )}
              {saved && notes && <p>{notes}</p>}
              {saved && (
                <p className="bl-muted">Wynik zapisany na tym urządzeniu. Zachowaj film osobno.</p>
              )}
              {draft && saved && (
                <LabButton className="bl-link" onClick={downloadDraft}>
                  Pobierz kopię tej próby
                </LabButton>
              )}
            </details>
            {draft && !saved && (
              <LabButton className="bl-secondary bl-wide" onClick={downloadDraft}>
                Pobierz kopię tej próby
              </LabButton>
            )}
          </section>
        )}
      {video && (!isLongJump || (autoStatus === "ready" && spatial) || manualJump) && (
        <section
          ref={correctionRef}
          tabIndex={isLongJump && editing ? -1 : undefined}
          role={isLongJump && editing ? "dialog" : undefined}
          aria-modal={isLongJump && editing ? true : undefined}
          aria-label={
            isLongJump && editing
              ? manualJump
                ? "Pomiar skoku w dal ze wzorców"
                : "Popraw punkt pięty"
              : undefined
          }
          className={`bl-card bl-frame-card${
            isLongJump ? (editing ? " bl-auto-correction" : " bl-auto-proof") : ""
          }`}
          hidden={saved || (!!measure && !editing && !isLongJump)}
        >
          {needsNewRecording && (
            <div className="bl-gap-recovery">
              <LabNotice error>{invalid}</LabNotice>
              <LabButton
                className="bl-secondary bl-wide"
                onClick={() => galleryInput.current?.click()}
              >
                Wybierz inny film
              </LabButton>
            </div>
          )}
          {!isLongJump ? (
            <>
              {protocol.category !== "jump" && !reviewing && !saved && (
                <div className="bl-assist-line">
                  <label className="bl-label">
                    {is505 ? "Ustaw linię pomiarową" : "Ustaw linię mety 10 m"}
                    <input
                      type="range"
                      className="bl-range"
                      aria-label="Linia do automatycznej analizy"
                      min={0.03}
                      max={0.97}
                      step={0.0005}
                      value={guides[is505 ? 0 : 1]}
                      disabled={reading}
                      onChange={(event) => changeGuide(Number(event.target.value), is505 ? 0 : 1)}
                    />
                  </label>
                  <LabButton
                    className="bl-secondary bl-wide"
                    disabled={!ready}
                    onClick={() => void findTimedEvents()}
                  >
                    {attempt.testId === "sprint_10m"
                      ? start !== null && !timedProposal
                        ? "Pomóż mi znaleźć metę"
                        : "Pomóż mi znaleźć start i metę"
                      : "Linia ustawiona — znajdź zdarzenia"}
                  </LabButton>
                </div>
              )}
              <div className="bl-step-tabs" aria-label="Zdarzenie do oznaczenia">
                {protocol.markers.map((title, i) => (
                  <button
                    type="button"
                    key={title}
                    aria-pressed={stepIndex === i}
                    disabled={saved || reviewing || reading || (i === 1 && start === null)}
                    onClick={() => {
                      setTimedProposal(null);
                      setMarking(i === 0 ? "start" : "end");
                      setEditing(true);
                      const selected = i === 0 ? start : end;
                      if (selected !== null) move(selected);
                    }}
                  >
                    {i + 1}. {title}
                    {(i === 0 ? start : end) !== null ? " ✓" : ""}
                  </button>
                ))}
              </div>
              <p className="bl-step-instruction">
                {reviewing && reviewTarget === "turn"
                  ? "Sprawdź kontakt wybranej nogi na linii nawrotu. Sam zwrot tułowia nie wystarcza."
                  : attempt.testId === "sprint_10m" && reviewing && reviewTarget === "start"
                    ? "Wskaż pierwszy widoczny ruch tułowia. Poprzednia klatka ma pokazywać pozycję przed ruszeniem. Przesuwaj film −1 / +1."
                    : shortInstructions[attempt.testId][stepIndex]}
              </p>
              {reviewing && timedProposal && (
                <>
                  <p className="bl-kicker">
                    {attempt.testId === "sprint_10m" && reviewTarget === "start"
                      ? "Wskaż start"
                      : "Sprawdź propozycję"}{" "}
                    {reviewIndex + 1}/{reviewStages.length}
                  </p>
                  <EventFrameProof
                    video={video}
                    index={frameIndex}
                    focus={timedProposal.focus[reviewTarget]!}
                    onReady={setProofReady}
                    line={
                      protocol.category === "jump" ||
                      reviewTarget === "turn" ||
                      (attempt.testId === "sprint_10m" && reviewTarget === "start")
                        ? undefined
                        : guides[is505 ? 0 : 1]
                    }
                  />
                  <p className="bl-muted">
                    Porównaj poprzednią i wybraną klatkę. W razie potrzeby popraw −1 / +1.
                  </p>
                  <LabButton
                    className="bl-link"
                    onClick={() => setReviewWide((value) => !value)}
                    aria-expanded={reviewWide}
                  >
                    {reviewWide ? "Zwiń cały kadr" : "Pokaż cały kadr"}
                  </LabButton>
                </>
              )}
            </>
          ) : (
            <div className="bl-auto-edit-heading">
              {editing && (
                <LabButton
                  className="bl-link bl-correction-cancel"
                  aria-label="Anuluj korektę"
                  onClick={cancelHeelCorrection}
                >
                  Wróć bez zmian
                </LabButton>
              )}
              <p className="bl-kicker">
                {manualJump ? "POMIAR ZE WZORCÓW" : editing ? "KOREKTA PIĘTY" : "SPRAWDŹ WYKRYCIE"}
              </p>
              <h2>
                {manualJump
                  ? manualJump.start
                    ? "Wybierz lądowanie i dotknij bliższej pięty"
                    : "Wybierz klatkę tuż przed skokiem"
                  : editing
                    ? "Dotknij kontaktu bliższej pięty z podłożem"
                    : "Czy niebieski punkt leży na bliższej pięcie?"}
              </h2>
            </div>
          )}
          <div
            className="bl-frame"
            hidden={reviewing && !reviewWide}
            style={{
              aspectRatio: aspect,
              maxWidth: `${(isLongJump ? (editing ? 58 : 48) : 38) * aspect}${isLongJump && editing ? "dvh" : "svh"}`,
            }}
          >
            <div
              className="bl-frame-inner"
              style={{
                transform: `scale(${zoom}) translate(${pan[0]}%, ${pan[1]}%)`,
              }}
            >
              <canvas ref={canvas} aria-label="Dokładna klatka filmu" />
              {manualJump?.start && (
                <button
                  type="button"
                  className="bl-manual-heel"
                  aria-label="Wskaż bliższą piętę na lądowaniu"
                  disabled={!ready}
                  onPointerDown={(event) => {
                    const box = canvas.current?.getBoundingClientRect();
                    if (!box || !box.width || !box.height) return;
                    const point: [number, number] = [
                      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
                      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
                    ];
                    setManualCursor(point);
                    acceptManualHeel(point);
                  }}
                  onKeyDown={(event) => {
                    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                      event.preventDefault();
                      setManualCursor(([x, y]) => [
                        Math.max(
                          0,
                          Math.min(
                            1,
                            x +
                              (event.key === "ArrowLeft"
                                ? -0.005
                                : event.key === "ArrowRight"
                                  ? 0.005
                                  : 0),
                          ),
                        ),
                        Math.max(
                          0,
                          Math.min(
                            1,
                            y +
                              (event.key === "ArrowUp"
                                ? -0.005
                                : event.key === "ArrowDown"
                                  ? 0.005
                                  : 0),
                          ),
                        ),
                      ]);
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      acceptManualHeel(manualCursor);
                    }
                  }}
                >
                  <span
                    style={{ left: `${manualCursor[0] * 100}%`, top: `${manualCursor[1] * 100}%` }}
                  />
                </button>
              )}
              {isLongJump && spatial && (
                <AutomaticLongJumpOverlay
                  value={spatial}
                  frameIndex={frameIndex}
                  editable={editing}
                  ready={ready}
                  canvas={canvas}
                  onHeel={(heel) => {
                    if (!ready || saved || !canvas.current) return;
                    try {
                      if (start === null || frameIndex <= start)
                        throw new Error("Wybierz klatkę lądowania po odbiciu.");
                      let candidate: AutomaticLongJumpCalibration = {
                        ...spatial,
                        heel,
                        heelFrameIndex: frameIndex,
                        heelSource: "manual",
                      };
                      if (frameIndex !== spatial.heelFrameIndex) {
                        // A different frame needs its own stability check. Reusing
                        // markers from the automatic landing could conceal camera motion.
                        const image = canvas.current
                          .getContext("2d", { willReadFrequently: true })
                          ?.getImageData(0, 0, canvas.current.width, canvas.current.height);
                        const markers = image && findBallWiseCalibrationMarkers(image);
                        if (!markers)
                          throw new Error(
                            "Na tej klatce nie widać obu wzorców. Wybierz klatkę lądowania z widocznymi wzorcami.",
                          );
                        candidate = {
                          ...candidate,
                          landingReferenceCorners:
                            spatial.method === "ballwise-marker-pose-v4"
                              ? orientStartMarker(markers.start.corners, markers.range.corners)
                              : markers.start.corners,
                          landingRangeCorners: markers.range.corners,
                          imageWidth: canvas.current.width,
                          imageHeight: canvas.current.height,
                          markerQuality: Math.min(
                            candidate.markerQuality,
                            markers.start.quality,
                            markers.range.quality,
                          ),
                        };
                      }
                      longJumpMeasurement(candidate);
                      setSpatial(candidate);
                      setEnd(frameIndex);
                      setDraft(null);
                      setConfirmed(false);
                      setEditing(true);
                      setError("");
                    } catch (reason) {
                      setError(messageOf(reason));
                    }
                  }}
                />
              )}
              {!isLongJump &&
                guides
                  .filter((_, i) => !protocol.sharedGuide || i === 0)
                  .map((guide, i) => ({ guide, i }))
                  .filter(({ i }) => attempt.testId !== "sprint_10m" || i === 1)
                  .map(({ guide, i }) => (
                    <div
                      key={i}
                      className={`bl-guide ${protocol.guideAxis === "vertical" ? "bl-guide-vertical" : "bl-guide-horizontal"}`}
                      style={
                        protocol.guideAxis === "vertical"
                          ? { left: `${guide * 100}%` }
                          : { top: `${guide * 100}%` }
                      }
                    >
                      <span>
                        {protocol.category === "jump"
                          ? "Podłoże"
                          : protocol.sharedGuide
                            ? "Linia pomiarowa"
                            : i === 0
                              ? "Wejście"
                              : "Meta"}
                      </span>
                    </div>
                  ))}
            </div>
            {!ready && (
              <div className="bl-frame-loading">
                {error ? "Nie udało się odczytać klatki" : "Odczyt dokładnej klatki…"}
              </div>
            )}
          </div>
          {(!isLongJump || editing) && (
            <p className="bl-frame-time" aria-live="polite">
              Klatka {frameIndex + 1} / {video.timeline.frames.length} ·{" "}
              {video.timeline.fps.toFixed(1)} FPS
            </p>
          )}
          {(!isLongJump || editing) && (
            <input
              className="bl-range"
              type="range"
              aria-label="Pozycja w filmie"
              min={0}
              max={video.timeline.frames.length - 1}
              step={1}
              value={frameIndex}
              disabled={saved}
              onChange={(event) => move(Number(event.target.value))}
            />
          )}
          {(!isLongJump || editing) && (
            <div className={`bl-frame-controls${isLongJump ? " bl-frame-controls-two" : ""}`}>
              {!isLongJump && (
                <LabButton
                  aria-label="10 klatek wstecz"
                  className="bl-secondary"
                  disabled={!ready || saved || frameIndex < 1}
                  onClick={() => move(frameIndex - 10)}
                >
                  −10
                </LabButton>
              )}
              <LabButton
                aria-label="Poprzednia klatka"
                className="bl-secondary"
                disabled={!ready || saved || frameIndex < 1}
                onClick={() => move(frameIndex - 1)}
              >
                <ChevronLeft size={18} />
                −1
              </LabButton>
              <LabButton
                aria-label="Następna klatka"
                className="bl-secondary"
                disabled={!ready || saved || frameIndex >= video.timeline.frames.length - 1}
                onClick={() => move(frameIndex + 1)}
              >
                +1
                <ChevronRight size={18} />
              </LabButton>
              {!isLongJump && (
                <LabButton
                  aria-label="10 klatek dalej"
                  className="bl-secondary"
                  disabled={!ready || saved || frameIndex >= video.timeline.frames.length - 1}
                  onClick={() => move(frameIndex + 10)}
                >
                  +10
                </LabButton>
              )}
            </div>
          )}
          {is505 && start !== null && !reviewing && (
            <div className="bl-notice">
              <p>
                Po wejściu znajdź kontakt wybranej nogi na linii nawrotu, potem oznacz powrót przez
                tę samą linię.
              </p>
              <LabButton
                className="bl-secondary"
                disabled={!ready || frameIndex <= start || (end !== null && frameIndex >= end)}
                onClick={() => {
                  setTurnFrame(frameIndex);
                  setDraft(null);
                  setConfirmed(false);
                }}
              >
                {turnFrame === frameIndex ? "Nawrót oznaczony ✓" : "Oznacz nawrót"}
              </LabButton>
              {turnFrame !== null && <p className="bl-muted">Nawrót · klatka {turnFrame + 1}</p>}
            </div>
          )}
          {manualJump ? (
            <>
              {!manualJump.start && (
                <LabButton
                  className="bl-wide"
                  disabled={!ready || frameIndex < 1}
                  onClick={() => {
                    if (!canvas.current) return;
                    try {
                      const image = canvas.current
                        .getContext("2d", { willReadFrequently: true })!
                        .getImageData(0, 0, canvas.current.width, canvas.current.height);
                      const start = prepareManualJump(image, frameIndex);
                      setManualJump({ start });
                      setStart(frameIndex);
                      setError("");
                      move(video.timeline.frames.length - 2);
                    } catch (reason) {
                      setError(messageOf(reason));
                    }
                  }}
                >
                  To klatka przed skokiem
                </LabButton>
              )}
              <p className="bl-muted">
                {manualJump.start
                  ? "Oba wzorce muszą pozostać widoczne. Zaznacz kontakt pięty z podłożem przed cofnięciem stóp."
                  : "Pokaż oba wzorce na podłożu. Krawędź START zostanie znaleziona automatycznie."}
              </p>
              {error && <LabNotice error>{error}</LabNotice>}
            </>
          ) : reviewing ? (
            <>
              <LabButton
                className="bl-wide"
                disabled={!ready || !proofReady}
                onClick={confirmProposedEvent}
              >
                {attempt.testId === "sprint_10m" && reviewTarget === "start"
                  ? "Wybieram"
                  : "Potwierdź"}{" "}
                {reviewTarget === "turn"
                  ? "nawrót"
                  : attempt.testId === "sprint_10m" && reviewTarget === "end"
                    ? "metę 10 m"
                    : protocol.markers[reviewTarget === "start" ? 0 : 1].toLocaleLowerCase("pl-PL")}
              </LabButton>
              <LabButton className="bl-link bl-wide" disabled={reading} onClick={useManualTiming}>
                Oznacz wszystko ręcznie
              </LabButton>
            </>
          ) : isLongJump && editing ? (
            <LabButton
              className="bl-wide"
              disabled={
                !ready ||
                saved ||
                !measure ||
                !spatial ||
                spatial.heelSource !== "manual" ||
                spatial.heelFrameIndex !== frameIndex
              }
              onClick={() => {
                correctionBefore.current = null;
                setEditing(false);
                setError("");
              }}
            >
              Zatwierdź punkt pięty
            </LabButton>
          ) : isLongJump ? (
            <LabButton
              className="bl-secondary bl-wide"
              data-heel-edit
              onClick={beginHeelCorrection}
            >
              Popraw punkt pięty
            </LabButton>
          ) : (
            <LabButton
              className="bl-wide"
              disabled={
                !ready ||
                saved ||
                frameIndex < 1 ||
                (is505 && marking === "end" && (turnFrame === null || frameIndex <= turnFrame)) ||
                (marking === "end" && (start === null || frameIndex <= start))
              }
              onClick={() => mark(marking)}
            >
              Oznacz{" "}
              {attempt.testId === "sprint_10m" && marking === "end"
                ? "metę 10 m"
                : protocol.markers[stepIndex].toLocaleLowerCase("pl-PL")}
            </LabButton>
          )}
          {!isLongJump && selectedIndex !== null && (
            <p className="bl-muted">Wybrano klatkę {selectedIndex + 1}.</p>
          )}
          {invalid && !needsNewRecording && <LabNotice error>{invalid}</LabNotice>}
          {!isLongJump && (
            <details className="bl-details">
              <summary>Powiększenie i pomoc</summary>
              <p className="bl-muted">
                {protocol.instructions[stepIndex]} Sprawdź klatkę poprzednią.
              </p>
              <label className="bl-label">
                <ZoomIn size={16} /> Powiększenie
                <select
                  aria-label="Powiększenie"
                  value={zoom}
                  onChange={(event) => {
                    const value = Number(event.target.value),
                      limit = (1 - 1 / value) * 50;
                    setZoom(value);
                    setPan(([x, y]) => [
                      Math.max(-limit, Math.min(limit, x)),
                      Math.max(-limit, Math.min(limit, y)),
                    ]);
                  }}
                >
                  <option value={1}>1×</option>
                  <option value={1.5}>1,5×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                  <option value={8}>8×</option>
                </select>
              </label>
              {zoom > 1 &&
                ["Poziomo", "Pionowo"].map((label, i) => (
                  <label key={label} className="bl-label">
                    {label}
                    <input
                      className="bl-range"
                      type="range"
                      aria-label={`Przesunięcie ${label.toLowerCase()}`}
                      min={-(1 - 1 / zoom) * 50}
                      max={(1 - 1 / zoom) * 50}
                      step={0.25}
                      value={pan[i]}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setPan((old) => (i === 0 ? [value, old[1]] : [old[0], value]));
                      }}
                    />
                  </label>
                ))}
              <p className="bl-muted">
                Linie pomagają oznaczyć zdarzenie. Nie służą do mierzenia odległości.
              </p>
              {!isLongJump &&
                guides
                  .filter((_, i) => !protocol.sharedGuide || i === 0)
                  .map((guide, i) => (
                    <label className="bl-label" key={i}>
                      Linia {i + 1}
                      <input
                        className="bl-range"
                        type="range"
                        aria-label={`Linia ${i + 1}`}
                        min={0}
                        max={1}
                        step={0.0005}
                        value={guide}
                        disabled={saved}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          changeGuide(value, i);
                        }}
                      />
                    </label>
                  ))}
              <LabButton
                className="bl-link"
                disabled={saved}
                onClick={() => setRefresh((value) => value + 1)}
              >
                <RotateCcw size={16} /> Odczytaj ponownie
              </LabButton>
              <LabButton
                className="bl-link"
                disabled={reading || saved}
                onClick={() => galleryInput.current?.click()}
              >
                Zmień film
              </LabButton>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
