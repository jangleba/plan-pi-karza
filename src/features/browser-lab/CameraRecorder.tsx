import { useEffect, useRef, useState } from "react";
import {
  openLabCamera,
  recordLabCamera,
  stopCamera,
  type LabCamera,
} from "./camera";
import { LabButton, LabNotice, messageOf } from "./LabUI";

export function CameraRecorder({
  instruction,
  onRecording,
  onCancel,
}: {
  instruction: string;
  onRecording: (file: File) => void;
  onCancel: () => void;
}) {
  const preview = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<LabCamera | null>(null);
  const [phase, setPhase] = useState<
    "opening" | "ready" | "countdown" | "recording" | "finishing" | "error"
  >("opening");
  const [count, setCount] = useState(3);
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
      if (
        controller.signal.aborted ||
        ["finishing", "error"].includes(phaseRef.current)
      )
        return;
      controller.abort();
      setError("Kamera została odłączona. Otwórz ją ponownie.");
      setPhase("error");
    };
    document.addEventListener("visibilitychange", visibility);
    void openLabCamera(controller.signal)
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
        opened.stream
          .getVideoTracks()
          .forEach((track) => track.addEventListener("ended", ended));
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
  }, []);

  useEffect(() => {
    if (phase !== "countdown" || !camera) return;
    const controller = capture.current!;
    let value = 3;
    const timer = setInterval(() => {
      value--;
      if (value > 0) {
        setCount(value);
        return;
      }
      clearInterval(timer);
      if (controller.signal.aborted) return;
      try {
        const recording = recordLabCamera(
          camera,
          controller.signal,
          setSeconds,
        );
        stop.current = recording.stop;
        setPhase("recording");
        void recording.finished
          .then((file) => {
            if (!controller.signal.aborted) complete.current(file);
          })
          .catch((reason: unknown) => {
            if (controller.signal.aborted) return;
            setError(messageOf(reason));
            setPhase("error");
          });
      } catch (reason) {
        if (cameraRef.current) stopCamera(cameraRef.current);
        setError(messageOf(reason));
        setPhase("error");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, camera]);

  const settings = camera?.settings;
  return (
    <section className="bl-card bl-camera" aria-label="Kamera Lab">
      <h2>{phase === "opening" ? "Uruchamiam kamerę…" : "Nagraj próbę"}</h2>
      <div className="bl-camera-preview">
        <video
          ref={preview}
          autoPlay
          muted
          playsInline
          aria-label="Podgląd kamery"
        />
        {phase === "countdown" && (
          <strong className="bl-camera-count" aria-live="assertive">
            {count}
          </strong>
        )}
      </div>
      {settings && (
        <p className="bl-muted">
          {settings.width && settings.height
            ? `${settings.width} × ${settings.height}`
            : "Kamera gotowa"}
          {settings.frameRate ? ` · ${settings.frameRate.toFixed(0)} FPS` : ""}
        </p>
      )}
      {phase === "ready" && (
        <>
          <p className="bl-muted">{instruction} Start za 3 s, nagranie 8 s.</p>
          <LabButton
            className="bl-wide"
            onClick={() => {
              setCount(3);
              setPhase("countdown");
            }}
          >
            Start
          </LabButton>
        </>
      )}
      {phase === "countdown" && (
        <p className="bl-muted" aria-live="polite">
          Przygotuj się do próby.
        </p>
      )}
      {phase === "recording" && (
        <>
          <p className="bl-muted" role="status">
            Nagrywam · {seconds} / 8 s
          </p>
          <LabButton
            className="bl-wide"
            onClick={() => {
              setPhase("finishing");
              stop.current?.();
            }}
          >
            Zakończ nagranie
          </LabButton>
        </>
      )}
      {phase === "finishing" && <p role="status">Odczytuję nagranie…</p>}
      {error && <LabNotice error>{error}</LabNotice>}
      <LabButton className="bl-secondary bl-wide" onClick={onCancel}>
        {phase === "error" ? "Wróć" : "Anuluj"}
      </LabButton>
    </section>
  );
}
