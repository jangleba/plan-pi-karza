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
import { downloadText } from "./download";
import { LabButton, LabNotice, messageOf } from "./LabUI";
import { videoPrecision } from "./measurement";

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
    if (!video) return;
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
  }, [video, frameIndex, refresh]);

  async function importVideo(file: File) {
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
    setPainted(null);
    setFrameIndex(
      Math.max(0, Math.min(video.timeline.frames.length - 1, index)),
    );
  }
  function mark(which: "start" | "end") {
    if (!ready || saved || frameIndex < 1) return;
    if (which === "start") setStart(frameIndex);
    else setEnd(frameIndex);
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
  return (
    <div className="bl-analyzer">
      <section className="bl-card">
        <p className="bl-kicker">USTAWIENIE PRÓBY</p>
        <h2>
          {protocol.title}
          {attempt.side && ` · ${sideLabel(attempt.side)}`}
        </h2>
        <p className="bl-muted">
          Próba {attempt.trial} z {attempt.trials}
          {attempt.testId === "cod_505" ? " · noga stawna w nawrocie" : ""}
        </p>
        <ol className="bl-steps">
          {protocol.setup.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <div className="bl-record-tip">
          <Camera size={19} />
          <p>
            Nagraj <strong>jedną próbę</strong>: HD 60 FPS, około 5–10 s.
            Przyjmujemy też 4K oraz 30, 120 i 240 FPS. Maksymalnie 20 s i 128
            MB. Zapisz oryginał w Plikach, bez zmiany tempa.
          </p>
        </div>
        <details className="bl-details">
          <summary>Co oznacza FPS i gdzie znaleźć 120/240?</summary>
          <p className="bl-muted">
            FPS to liczba klatek na sekundę. HD i 4K określają szczegółowość
            obrazu. HD 60 FPS wystarczy do wyniku orientacyjnego. Jeśli Twój
            iPhone obsługuje 120/240 FPS, znajdziesz je w Aparacie w trybie
            „Zwolnione tempo”, a nie w zwykłym „Wideo”. Więcej klatek ułatwia
            oznaczenie wybicia i lądowania; 4K nie zastępuje wyższego FPS.
          </p>
        </details>
        <details className="bl-details">
          <summary>Jak zapisać oryginał z iPhone’a?</summary>
          <ol className="bl-steps">
            <li>W Zdjęciach wybierz nagrany film i otwórz Udostępnij.</li>
            <li>
              Wybierz „Eksportuj niezmodyfikowany oryginał” i zapisz w Plikach.
            </li>
            <li>
              Wróć do Labu i wybierz ten MP4 lub MOV. Zachowaj oryginał do
              sprawdzenia wyniku.
            </li>
          </ol>
        </details>
        {!saved && (
          <label className="bl-button bl-upload">
            <FileVideo size={18} />
            {reading
              ? "Czytam oryginał…"
              : video
                ? "Wybierz inny film"
                : "Wybierz film z Plików"}
            <input
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov"
              aria-label="Wybierz oryginalny film"
              disabled={reading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importVideo(file);
              }}
            />
          </label>
        )}
        {reading && (
          <LabButton
            className="bl-secondary"
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
      {error && <LabNotice error>{error}</LabNotice>}
      {video && (
        <>
          <section className="bl-card bl-frame-card">
            <div className="bl-frame-heading">
              <span>
                {video.timeline.fps.toFixed(1)} FPS ·{" "}
                {video.timeline.durationSeconds.toFixed(2)} s
              </span>
              <span>
                {video.config.codec.startsWith("avc") ? "H.264" : "HEVC"}
              </span>
            </div>
            {video.timeline.fps < 119 && (
              <p className="bl-muted">
                Wynik orientacyjny. Oznacz zdarzenia klatka po klatce i sprawdź
                zakres przy wyniku.
              </p>
            )}
            <div
              className="bl-frame"
              style={{ aspectRatio: aspect, maxWidth: `${65 * aspect}vh` }}
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
                              ? "Wejście / start"
                              : "Meta"}
                      </span>
                    </div>
                  ))}
              </div>
              {!ready && (
                <div className="bl-frame-loading">
                  {error
                    ? "Klatka niepotwierdzona"
                    : "Odczyt dokładnej klatki…"}
                </div>
              )}
            </div>
            <p className="bl-frame-time" aria-live="polite">
              Klatka {frameIndex + 1} / {video.timeline.frames.length} ·{" "}
              {video.timeline.frames[frameIndex].seconds.toFixed(6)} s
              {ready ? " · potwierdzona" : ""}
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
                <ChevronLeft size={20} />
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
                <ChevronRight size={20} />
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
            <div className="bl-small-controls">
              <label>
                <ZoomIn size={16} />
                Powiększenie{" "}
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
              <LabButton
                className="bl-link"
                disabled={saved}
                onClick={() => setRefresh((value) => value + 1)}
              >
                <RotateCcw size={16} />
                Odczytaj ponownie
              </LabButton>
            </div>
            {zoom > 1 && (
              <details className="bl-details">
                <summary>Przesuń powiększony obraz</summary>
                {["Poziomo", "Pionowo"].map((label, i) => (
                  <label key={label}>
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
              </details>
            )}
            <details className="bl-details">
              <summary>Ustaw linie pomocnicze</summary>
              <p>
                Linie są wskazówką na obrazie. Odległości wyznacz taśmą w
                terenie. Przy powiększeniu krawędzie obrazu są przycięte.
              </p>
              {guides
                .filter((_, i) => !protocol.sharedGuide || i === 0)
                .map((guide, i) => (
                  <label key={i}>
                    {protocol.sharedGuide
                      ? "Pozycja linii"
                      : i === 0
                        ? "Linia wejścia / startu"
                        : "Linia mety"}
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
            </details>
          </section>
          <section className="bl-card">
            <p className="bl-kicker">DWA ZDARZENIA</p>
            {protocol.markers.map((title, i) => {
              const selected = i === 0 ? start : end;
              return (
                <div className="bl-marker" key={title}>
                  <div>
                    <h3>
                      {i + 1}. {title}
                    </h3>
                    <p>{protocol.instructions[i]}</p>
                  </div>
                  <LabButton
                    disabled={!ready || frameIndex < 1 || saved}
                    className="bl-secondary"
                    onClick={() => mark(i === 0 ? "start" : "end")}
                  >
                    Oznacz {title.toLocaleLowerCase("pl-PL")}
                  </LabButton>
                  {selected !== null && (
                    <button
                      type="button"
                      className="bl-selected"
                      disabled={saved}
                      onClick={() => move(selected)}
                    >
                      Klatka {selected + 1} ·{" "}
                      {video.timeline.frames[selected].seconds.toFixed(6)} s ·
                      Pokaż
                    </button>
                  )}
                </div>
              );
            })}
            <p className="bl-muted">
              Zawsze sprawdź klatkę poprzednią. Klatka 1 nie może być
              początkiem, bo nie pokazuje momentu przed zdarzeniem.
            </p>
          </section>
          {invalid && <LabNotice error>{invalid}</LabNotice>}
          {measure && (
            <section className="bl-card bl-result">
              <p className="bl-kicker">
                {saved ? "ZAPISANO LOKALNIE" : "PODGLĄD WYNIKU"}
              </p>
              <div className="bl-big-value">
                {resultValue(measure.primaryValue, measure.primaryUnit)}
              </div>
              <p className="bl-muted">{videoPrecision(video.timeline.fps)}</p>
              <p>
                {protocol.category === "jump" ? "Czas lotu" : "Czas odcinka"}:{" "}
                {measure.elapsedSeconds.toFixed(6)} s
              </p>
              {measure.averageSpeedMps !== undefined && (
                <p>
                  Średnia na 10 m: {measure.averageSpeedMps.toFixed(2)} m/s ·{" "}
                  {(measure.averageSpeedMps * 3.6).toFixed(1)} km/h
                </p>
              )}
              <p className="bl-muted">
                Przedział wynikający z rozdzielczości klatek:{" "}
                {resultValue(measure.resolutionMin, measure.primaryUnit)}–
                {resultValue(measure.resolutionMax, measure.primaryUnit)}. Nie
                obejmuje błędu ustawienia kamery, oznaczenia zdarzeń ani
                techniki ruchu.
              </p>
              {protocol.category === "jump" && (
                <p className="bl-muted">
                  Wysokość z czasu lotu: h = g · t² / 8. Zmiana pozycji nóg przy
                  lądowaniu zawyża wynik. To oszacowanie, wymagające jednakowych
                  warunków przy porównaniu.
                </p>
              )}
              {!saved && (
                <>
                  <label className="bl-check">
                    <input
                      type="checkbox"
                      checked={original}
                      onChange={(event) => {
                        setOriginal(event.target.checked);
                        setDraft(null);
                      }}
                    />
                    To oryginalny film, bez zmiany tempa ani eksportu slow
                    motion.
                  </label>
                  <label className="bl-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => {
                        setConfirmed(event.target.checked);
                        setDraft(null);
                      }}
                    />
                    {protocol.confirmation}
                  </label>
                  <label className="bl-label">
                    Notatka do próby{" "}
                    <textarea
                      aria-label="Notatka do próby"
                      maxLength={280}
                      rows={2}
                      value={notes}
                      onChange={(event) => {
                        setNotes(event.target.value);
                        setDraft(null);
                      }}
                      placeholder="Nawierzchnia, obuwie, warunki…"
                    />
                  </label>
                  <LabButton
                    className="bl-wide"
                    disabled={!original || !confirmed}
                    onClick={save}
                  >
                    Zapisz poprawną próbę
                  </LabButton>
                </>
              )}
              {draft && (
                <LabButton
                  className="bl-secondary bl-wide"
                  onClick={() =>
                    downloadText(
                      `BallWise-proba-${draft.id.slice(0, 8)}.json`,
                      JSON.stringify(createHistoryBackup([draft]), null, 2),
                    )
                  }
                >
                  Pobierz kopię tej próby
                </LabButton>
              )}
              {saved && (
                <LabNotice>
                  Próba jest w historii tego konta na tym urządzeniu. Zachowaj
                  film osobno; Lab zapisuje czasy i wynik, bez nagrania.
                </LabNotice>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
