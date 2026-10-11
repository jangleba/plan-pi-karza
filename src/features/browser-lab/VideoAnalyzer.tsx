import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  FileVideo,
  RotateCcw,
  ZoomIn,
} from "lucide-react";
import {
  createBrowserResult,
  resultValue,
  timedMeasurement,
  type BrowserResult,
} from "./results";
import { protocolFor, sideLabel, type BrowserAttempt } from "./protocols";
import { decodeJumpFrame, openJumpVideo, type OpenedVideo } from "./video";
import { createHistoryBackup } from "./storage";
import { downloadText, downloadBlob } from "./download";
import { LabButton, LabNotice, messageOf } from "./LabUI";
import { CameraRecorder } from "./CameraRecorder";

export function VideoAnalyzer({
  attempt,
  sessionId,
  onSave,
}: {
  attempt: BrowserAttempt;
  sessionId: string;
  onSave: (result: BrowserResult) => void;
}) {
  const protocol = protocolFor(attempt.testId);
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

  useEffect(
    () => () => {
      version.current++;
      load.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!video || saved) return;
    const controller = new AbortController();
    let active = true;
    setPainted(null);
    const visibility = () => {
      if (document.hidden) controller.abort();
      else if (controller.signal.aborted) setRefresh((value) => value + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    void decodeJumpFrame(video, frameIndex, controller.signal)
      .then((frame) => {
        try {
          if (!active || controller.signal.aborted || !canvas.current) return;
          const width = frame.displayWidth;
          const height = frame.displayHeight;
          const swapped = video.rotation === 90 || video.rotation === 270;
          const displayedWidth = swapped ? height : width;
          const displayedHeight = swapped ? width : height;
          const scale = Math.min(
            1,
            1280 / Math.max(displayedWidth, displayedHeight),
          );
          canvas.current.width = Math.round(displayedWidth * scale);
          canvas.current.height = Math.round(displayedHeight * scale);
          const context = canvas.current.getContext("2d");
          if (!context)
            throw new Error("Nie można wyświetlić klatki. Odśwież Safari.");
          context.save();
          context.translate(
            canvas.current.width / 2,
            canvas.current.height / 2,
          );
          context.rotate((video.rotation * Math.PI) / 180);
          context.drawImage(
            frame,
            (-width * scale) / 2,
            (-height * scale) / 2,
            width * scale,
            height * scale,
          );
          context.restore();
          setAspect(displayedWidth / displayedHeight);
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
  }, [video, frameIndex, refresh, saved]);

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
    } catch (reason) {
      if (current === version.current && !controller.signal.aborted)
        setError(messageOf(reason));
    } finally {
      if (current === version.current) setReading(false);
    }
  }
  const ready = video !== null && painted === frameIndex && !reading;
  let measure: ReturnType<typeof timedMeasurement> | null = null;
  let invalid = "";
  if (video && start !== null && end !== null) {
    try {
      measure = timedMeasurement(attempt.testId, video.timeline, start, end);
    } catch (reason) {
      invalid = messageOf(reason);
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
    } else {
      setEnd(frameIndex);
      setEditing(false);
    }
    setDraft(null);
    setError("");
  }
  function save() {
    if (
      !video ||
      !measure ||
      start === null ||
      end === null ||
      !original ||
      !confirmed ||
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
        });
      setDraft(result);
      onSave(result);
      setSaved(true);
      setError("");
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  const stepIndex = marking === "start" ? 0 : 1;
  const selectedIndex = stepIndex === 0 ? start : end;
  const shortSetup =
    protocol.category === "jump"
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
    flying_10m: [
      "Środek tułowia pierwszy raz przecina linię wejścia.",
      "Ten sam punkt tułowia pierwszy raz przecina metę.",
    ],
    cod_505: [
      "Środek tułowia pierwszy raz przecina linię pomiarową.",
      "Ten sam punkt przecina tę linię w drodze powrotnej.",
    ],
  } as const;
  const precision = video && video.timeline.fps < 119 ? " · orientacyjny" : "";
  function selectFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (file) void importVideo(file);
  }
  function downloadDraft() {
    if (!draft) return;
    downloadText(
      `BallWise-proba-${draft.id.slice(0, 8)}.json`,
      JSON.stringify(createHistoryBackup([draft]), null, 2),
    );
  }
  return (
    <div className="bl-analyzer bl-compact">
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
          instruction={shortSetup}
          onRecording={(file) => {
            void importVideo(file);
          }}
          onCancel={() => setCameraOpen(false)}
        />
      )}
      {!video && !cameraOpen && (
        <section className="bl-card bl-source-card">
          <p className="bl-kicker">
            PRÓBA {attempt.trial} / {attempt.trials}
          </p>
          <h2>
            {protocol.title}
            {attempt.side && ` · ${sideLabel(attempt.side)}`}
          </h2>
          <p className="bl-muted">{shortSetup}</p>
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
              HD lub 4K, od 15 FPS. Maksymalnie 20 s i 128 MB. Film w
              oryginalnym tempie. Jeśli galeria zmienia tempo, w Zdjęciach
              wybierz Udostępnij → Eksportuj niezmodyfikowany oryginał → Pliki.
              120/240 FPS szukaj w Aparacie w trybie „Zwolnione tempo”.
            </p>
            <p className="bl-muted">
              Lab dobiera tryb tylnej kamery dostępny w przeglądarce. Liczbę
              klatek i czasy sprawdza w gotowym filmie. Tryby 120/240 FPS mogą
              być dostępne tylko w aplikacji Aparat.
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
      {error && !video && lastFile && !reading && !cameraOpen && (
        <LabButton
          className="bl-secondary bl-wide"
          onClick={() => downloadBlob(lastFile.name, lastFile)}
        >
          Zachowaj nagranie
        </LabButton>
      )}
      {video && measure && (
        <section className="bl-card bl-result" aria-label="Wynik próby">
          <p className="bl-kicker">
            {saved ? "ZAPISANO LOKALNIE" : "WYNIK PRÓBY"}
          </p>
          <div className="bl-big-value">
            {resultValue(measure.primaryValue, measure.primaryUnit)}
          </div>
          <p className="bl-muted">
            {video.timeline.fps.toFixed(0)} FPS{precision}
          </p>
          <p className="bl-muted">
            Zakres z klatek:{" "}
            {resultValue(measure.resolutionMin, measure.primaryUnit)}–
            {resultValue(measure.resolutionMax, measure.primaryUnit)}
          </p>
          {measure.averageSpeedMps !== undefined && (
            <p>
              Średnia prędkość: {(measure.averageSpeedMps * 3.6).toFixed(1)}{" "}
              km/h
            </p>
          )}
          {!saved && (
            <>
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
                Film w oryginalnym tempie. Próba zgodna z instrukcją.
              </label>
              <LabButton
                className="bl-wide"
                disabled={!original || !confirmed}
                onClick={save}
              >
                Zapisz wynik
              </LabButton>
              <LabButton
                className="bl-link bl-wide"
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "Zamknij korektę" : "Popraw oznaczenia"}
              </LabButton>
            </>
          )}
          <details className="bl-details">
            <summary>Szczegóły pomiaru</summary>
            {lastFile && (
              <LabButton
                className="bl-secondary"
                onClick={() => downloadBlob(lastFile.name, lastFile)}
              >
                Pobierz film
              </LabButton>
            )}
            <p>
              {protocol.category === "jump" ? "Czas lotu" : "Czas odcinka"}:{" "}
              {measure.elapsedSeconds.toFixed(3)} s ·{" "}
              {video.timeline.fps.toFixed(2)} FPS.
            </p>
            <p className="bl-muted">
              Zakres dotyczy odstępów między klatkami. Nie obejmuje błędu
              oznaczenia zdarzeń, ustawienia kamery ani techniki. Przy 30/60 FPS
              wynik jest orientacyjny.
            </p>
            {protocol.category === "jump" && (
              <p className="bl-muted">
                Wysokość z czasu lotu: h = g · t² / 8. Ustawienie nóg przy
                wybiciu i pierwszym kontakcie powinno być podobne.
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
              <p className="bl-muted">
                Wynik zapisany na tym urządzeniu. Zachowaj film osobno.
              </p>
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
      {video && (
        <section
          className="bl-card bl-frame-card"
          hidden={saved || (!!measure && !editing)}
        >
          <div className="bl-step-tabs" aria-label="Zdarzenie do oznaczenia">
            {protocol.markers.map((title, i) => (
              <button
                type="button"
                key={title}
                aria-pressed={stepIndex === i}
                disabled={saved || (i === 1 && start === null)}
                onClick={() => {
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
            {shortInstructions[attempt.testId][stepIndex]}
          </p>
          <div
            className="bl-frame"
            style={{ aspectRatio: aspect, maxWidth: `${38 * aspect}svh` }}
          >
            <div
              className="bl-frame-inner"
              style={{
                transform: `scale(${zoom}) translate(${pan[0]}%, ${pan[1]}%)`,
              }}
            >
              <canvas ref={canvas} aria-label="Dokładna klatka filmu" />
              {guides
                .filter((_, i) => !protocol.sharedGuide || i === 0)
                .map((guide, i) => (
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
                {error
                  ? "Nie udało się odczytać klatki"
                  : "Odczyt dokładnej klatki…"}
              </div>
            )}
          </div>
          <p className="bl-frame-time" aria-live="polite">
            Klatka {frameIndex + 1} / {video.timeline.frames.length} ·{" "}
            {video.timeline.fps.toFixed(1)} FPS
          </p>
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
          <div className="bl-frame-controls">
            <LabButton
              aria-label="10 klatek wstecz"
              className="bl-secondary"
              disabled={!ready || saved || frameIndex < 1}
              onClick={() => move(frameIndex - 10)}
            >
              −10
            </LabButton>
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
              disabled={
                !ready ||
                saved ||
                frameIndex >= video.timeline.frames.length - 1
              }
              onClick={() => move(frameIndex + 1)}
            >
              +1
              <ChevronRight size={18} />
            </LabButton>
            <LabButton
              aria-label="10 klatek dalej"
              className="bl-secondary"
              disabled={
                !ready ||
                saved ||
                frameIndex >= video.timeline.frames.length - 1
              }
              onClick={() => move(frameIndex + 10)}
            >
              +10
            </LabButton>
          </div>
          <LabButton
            className="bl-wide"
            disabled={
              !ready ||
              saved ||
              frameIndex < 1 ||
              (marking === "end" && (start === null || frameIndex <= start))
            }
            onClick={() => mark(marking)}
          >
            Oznacz {protocol.markers[stepIndex].toLocaleLowerCase("pl-PL")}
          </LabButton>
          {selectedIndex !== null && (
            <p className="bl-muted">Wybrano klatkę {selectedIndex + 1}.</p>
          )}
          {invalid && <LabNotice error>{invalid}</LabNotice>}
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
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                <option value={1}>1×</option>
                <option value={1.5}>1,5×</option>
                <option value={2}>2×</option>
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
                    min={-25}
                    max={25}
                    step={1}
                    value={pan[i]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setPan((old) =>
                        i === 0 ? [value, old[1]] : [old[0], value],
                      );
                    }}
                  />
                </label>
              ))}
            <p className="bl-muted">
              Linie pomagają oznaczyć zdarzenie. Nie służą do mierzenia
              odległości.
            </p>
            {guides
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
                    step={0.005}
                    value={guide}
                    disabled={saved}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setGuides((old) =>
                        protocol.sharedGuide
                          ? [value, value]
                          : i === 0
                            ? [value, old[1]]
                            : [old[0], value],
                      );
                      setDraft(null);
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
        </section>
      )}
    </div>
  );
}
