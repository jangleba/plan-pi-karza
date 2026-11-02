import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openLabCamera, recordLabCamera, stopCamera, type LabCamera } from "./camera";
import { LabButton, LabNotice, messageOf } from "./LabUI";

export function CameraRecorder({
  instruction,
  title = "Nagraj próbę",
  onRecording,
  onCancel,
  highDetail = false,
}: {
  instruction: string;
  title?: string;
  onRecording: (file: File) => void;
  onCancel: () => void;
  highDetail?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const preview = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<LabCamera | null>(null);
  const [phase, setPhase] = useState<
    "opening" | "ready" | "countdown" | "recording" | "finishing" | "error"
  >("opening");
  const [count, setCount] = useState(3);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [maximumSeconds, setMaximumSeconds] = useState(8);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const capture = useRef<AbortController | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const cameraRef = useRef<LabCamera | null>(null);
  const complete = useRef(onRecording);
  complete.current = onRecording;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel.current();
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),select:not(:disabled)",
        ) ?? []),
      ];
      const first = controls[0],
        last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keys, true);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", keys, true);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const element = preview.current;
    const controller = new AbortController();
    capture.current = controller;
    const visibility = () => {
      if (!document.hidden) return;
      controller.abort();
      if (cameraRef.current) stopCamera(cameraRef.current);
      setError("Nagrywanie przerwane. Pozostań w Lab podczas próby.");
      setPhase("error");
    };
    const ended = () => {
      if (controller.signal.aborted || ["finishing", "error"].includes(phaseRef.current)) return;
      controller.abort();
      setError("Kamera została odłączona. Otwórz ją ponownie.");
      setPhase("error");
    };
    document.addEventListener("visibilitychange", visibility);
    void openLabCamera(controller.signal, highDetail)
      .then(async (opened) => {
        if (controller.signal.aborted) {
          stopCamera(opened);
          return;
        }
        cameraRef.current = opened;
        setCamera(opened);
        if (!element) {
          stopCamera(opened);
          return;
        }
        element.srcObject = opened.stream;
        opened.stream.getVideoTracks().forEach((track) => track.addEventListener("ended", ended));
        await element.play();
        if (!controller.signal.aborted) setPhase("ready");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (cameraRef.current) stopCamera(cameraRef.current);
        setError(messageOf(reason));
        setPhase("error");
      });
    return () => {
      controller.abort();
      if (cameraRef.current) {
        cameraRef.current.stream
          .getVideoTracks()
          .forEach((track) => track.removeEventListener("ended", ended));
        stopCamera(cameraRef.current);
      }
      if (element) element.srcObject = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [highDetail]);

  useEffect(() => {
    if (phase !== "countdown" || !camera) return;
    const controller = capture.current!;
    let value = countdownSeconds;
    let started = false;
    const beginRecording = () => {
      if (started || controller.signal.aborted) return;
      started = true;
      const recording = recordLabCamera(
        camera,
        controller.signal,
        (n) => setSeconds(Math.max(0, n - 1)),
        maximumSeconds + 1,
      );
      stop.current = recording.stop;
      void recording.finished
        .then((file) => {
          if (!controller.signal.aborted) complete.current(file);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setError(messageOf(reason));
          setPhase("error");
        });
    };
    const timer = setInterval(() => {
      value--;
      if (controller.signal.aborted) return;
      try {
        // Keep one second of stillness before START for movement detection.
        // Measurement always uses the file's actual frame timestamps.
        if (value === 1) beginRecording();
        if (value > 0) setCount(value);
        else {
          clearInterval(timer);
          beginRecording();
          setPhase("recording");
        }
      } catch (reason) {
        if (cameraRef.current) stopCamera(cameraRef.current);
        setError(messageOf(reason));
        setPhase("error");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, camera, countdownSeconds, maximumSeconds]);

  const settings = camera?.settings;
  return createPortal(
    <section
      ref={dialog}
      tabIndex={-1}
      className="browser-lab bl-camera bl-camera-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Kamera Lab"
    >
      <div className="bl-camera-preview">
        <video ref={preview} autoPlay muted playsInline aria-label="Podgląd kamery" />
        {phase === "countdown" && (
          <strong className="bl-camera-count" aria-live="assertive">
            {count}
          </strong>
        )}
        {phase === "recording" && seconds === 0 && (
          <strong className="bl-camera-count" aria-live="assertive">
            START
          </strong>
        )}
      </div>
      <header className="bl-camera-header">
        <LabButton className="bl-camera-close" aria-label="Zamknij kamerę" onClick={onCancel}>
          {phase === "error" ? "Wróć" : "Anuluj"}
        </LabButton>
        <h2>{title}</h2>
        <span className="bl-camera-status" role="status">
          {phase === "recording"
            ? `● ${seconds} / ${maximumSeconds} s`
            : phase === "opening"
              ? "Uruchamiam…"
              : phase === "finishing"
                ? "Odczyt…"
                : settings?.frameRate
                  ? `${settings.frameRate.toFixed(0)} FPS`
                  : ""}
        </span>
      </header>
      <div className="bl-camera-bottom">
        {settings && (
          <p className="bl-camera-settings">
            {settings.width && settings.height
              ? `${settings.width} × ${settings.height}`
              : "Kamera gotowa"}
            {settings.frameRate ? ` · ${settings.frameRate.toFixed(0)} FPS` : ""}
          </p>
        )}
        {phase === "ready" && (
          <>
            <p className="bl-camera-tip">{instruction}</p>
            <div className="bl-camera-options">
              <label>
                Start za
                <select
                  aria-label="Opóźnienie startu"
                  value={countdownSeconds}
                  onChange={(event) => setCountdownSeconds(Number(event.target.value))}
                >
                  {[3, 5, 10].map((value) => (
                    <option key={value} value={value}>
                      {value} s
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nagranie
                <select
                  aria-label="Długość nagrania"
                  value={maximumSeconds}
                  onChange={(event) => setMaximumSeconds(Number(event.target.value))}
                >
                  {[8, 12, 15].map((value) => (
                    <option key={value} value={value}>
                      {value} s
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="bl-camera-small">
              Stań spokojnie. Zacznij po napisie START. Możesz zakończyć wcześniej.
            </p>
            <LabButton
              className="bl-camera-shutter"
              onClick={() => {
                setCount(countdownSeconds);
                setPhase("countdown");
              }}
            >
              Start
            </LabButton>
          </>
        )}
        {phase === "countdown" && (
          <p className="bl-camera-tip" aria-live="polite">
            Przygotuj się do próby.
          </p>
        )}
        {phase === "recording" && (
          <LabButton
            className="bl-camera-stop"
            onClick={() => {
              setPhase("finishing");
              stop.current?.();
            }}
          >
            Zakończ nagranie
          </LabButton>
        )}
        {error && <LabNotice error>{error}</LabNotice>}
      </div>
    </section>,
    document.body,
  );
}
