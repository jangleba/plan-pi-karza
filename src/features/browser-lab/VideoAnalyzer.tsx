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
import { longJumpMeasurement, longJumpSchema, type AutomaticLongJumpCalibration } from "./longJump";
import { analyzeLongJump } from "./longJumpAuto";
import { paintVideoFrame } from "./videoFrame";

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
  const [autoStatus, setAutoStatus] = useState<"idle" | "analyzing" | "ready" | "error">("idle");
  const [autoProgress, setAutoProgress] = useState(0);
  const [autoError, setAutoError] = useState("");
  const [turnFrame, setTurnFrame] = useState<number | null>(null);
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

  const stopImport = useCallback(
    (message: string) => {
      load.current?.abort();
      setReading(false);
      if (video && isLongJump && autoStatus === "analyzing") {
        setAutoStatus("error");
        setAutoError(message);
      } else setError(message);
    },
    [video, isLongJump, autoStatus],
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
          const paintedFrame = paintVideoFrame(canvas.current, frame, video.rotation);
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
    setSpatial(null);
    setAutoStatus("idle");
    setAutoProgress(0);
    setAutoError("");
    setTurnFrame(null);
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
          setEditing(false);
          setAutoStatus("ready");
        } catch (reason) {
          if (current !== version.current || controller.signal.aborted) return;
          setAutoError(messageOf(reason));
          setAutoStatus("error");
        }
      }
    } catch (reason) {
      if (current === version.current && !controller.signal.aborted) setError(messageOf(reason));
    } finally {
      if (current === version.current) setReading(false);
    }
  }
  const ready = video !== null && painted === frameIndex && !reading;
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
      }
    } catch (reason) {
      measure = null;
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
      if (is505) setTurnFrame(null);
    } else {
      setEnd(frameIndex);
      setEditing(false);
    }
    setDraft(null);
    setConfirmed(false);
    setError("");
  }
  function save() {
    if (
      !video ||
      !measure ||
      start === null ||
      end === null ||
      (!isLongJump && (!original || !confirmed)) ||
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
      "Automatyka wykrywa bliższą piętę; poprawiasz ją tylko w razie potrzeby.",
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
          <p className="bl-kicker">
            PRÓBA {attempt.trial} / {attempt.trials}
          </p>
          <h2>
            {protocol.title}
            {attempt.side && ` · ${sideLabel(attempt.side)}`}
          </h2>
          <p className="bl-muted">{shortSetup}</p>
          {isLongJump && (
            <div className="bl-auto-setup">
              <span>1</span>
              <p>Wydrukuj dwa arkusze: START oraz 3 METRY. Długa krawędź ma 20,0 cm.</p>
              <span>2</span>
              <p>Krzyżyk pomarańczowego arkusza ustaw dokładnie 3,00 m od linii startu.</p>
              <div className="bl-auto-downloads">
                <a className="bl-button bl-secondary" href="/lab-wzorzec.svg" download>
                  1. START
                </a>
                <a className="bl-button bl-secondary" href="/lab-wzorzec-3m.svg" download>
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
      {error && !video && lastFile && !reading && !cameraOpen && (
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
          <LabButton className="bl-wide" onClick={() => galleryInput.current?.click()}>
            Wybierz lepszy film
          </LabButton>
          <LabButton
            className="bl-secondary bl-wide"
            onClick={() => {
              setVideo(null);
              setLastFile(null);
              setAutoStatus("idle");
              setAutoError("");
            }}
          >
            Nagraj ponownie
          </LabButton>
        </section>
      )}
      {video && measure && (
        <section className="bl-card bl-result" aria-label="Wynik próby">
          <p className="bl-kicker">{saved ? "ZAPISANO LOKALNIE" : "WYNIK PRÓBY"}</p>
          <div className="bl-big-value">
            {resultValue(measure.primaryValue, measure.primaryUnit)}
          </div>
          <p className="bl-muted">
            {video.timeline.fps.toFixed(0)} FPS{precision}
          </p>
          <p className="bl-muted">
            {isLongJump ? (
              <>Szacowana niepewność geometrii: ±{measure.uncertaintyCm?.toFixed(1)} cm</>
            ) : (
              <>
                Zakres z klatek: {resultValue(measure.resolutionMin!, measure.primaryUnit)}–
                {resultValue(measure.resolutionMax!, measure.primaryUnit)}
              </>
            )}
          </p>
          {isLongJump && (
            <p className="bl-muted">
              Sprawdź punkt pięty i porównaj odległość z taśmą. Warunki nagrania wpływają na wynik;
              podany zakres nie obejmuje błędu automatycznego rozpoznania.
            </p>
          )}
          {measure.averageSpeedMps !== undefined && (
            <p>Średnia prędkość: {(measure.averageSpeedMps * 3.6).toFixed(1)} km/h</p>
          )}
          {!saved && (
            <>
              {!isLongJump && (
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
                  {is505
                    ? protocol.confirmation
                    : "Film w oryginalnym tempie. Próba zgodna z instrukcją."}
                </label>
              )}
              {isLongJump && (
                <div className="bl-auto-checks">
                  <span>✓ Oba wzorce rozpoznane</span>
                  <span>✓ Kamera stabilna ({measure.cameraShiftPx?.toFixed(1)} px)</span>
                  <span>✓ Proponowana linia i pięta</span>
                </div>
              )}
              <LabButton
                className="bl-wide"
                disabled={!isLongJump && (!original || !confirmed)}
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
                  Zapisując potwierdzasz 3,00 m między linią START a krzyżykiem, nieruchomy telefon
                  i poprawny punkt pięty.
                </p>
              )}
            </>
          )}
          <details className="bl-details">
            <summary>Szczegóły pomiaru</summary>
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
            <p className="bl-muted">
              Zakres dotyczy odstępów między klatkami. Nie obejmuje błędu oznaczenia zdarzeń,
              ustawienia kamery ani techniki. Przy 30/60 FPS wynik jest orientacyjny.
            </p>
            {protocol.category === "jump" && !isLongJump && (
              <p className="bl-muted">
                Wysokość z czasu lotu: h = g · t² / 8. Ustawienie nóg przy wybiciu i pierwszym
                kontakcie powinno być podobne.
              </p>
            )}
            {isLongJump && (
              <p className="bl-muted">
                Odległość prostopadle od długiej krawędzi wzorca do bliższej pięty. Automatyka nie
                zapisuje wyniku, jeśli wzorzec jest za mały, kamera się poruszyła albo szacowana
                niepewność geometrii przekracza 5 cm. To nadal pomiar z filmu, nie certyfikowany
                system laboratoryjny.
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
      {video && (!isLongJump || (autoStatus === "ready" && spatial)) && (
        <section
          className={`bl-card bl-frame-card${
            isLongJump ? (editing ? " bl-auto-correction" : " bl-auto-proof") : ""
          }`}
          hidden={saved || (!!measure && !editing && !isLongJump)}
        >
          {!isLongJump ? (
            <>
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
              <p className="bl-step-instruction">{shortInstructions[attempt.testId][stepIndex]}</p>
            </>
          ) : (
            <div className="bl-auto-edit-heading">
              <p className="bl-kicker">{editing ? "KOREKTA OPCJONALNA" : "SPRAWDŹ WYKRYCIE"}</p>
              <h2>
                {editing
                  ? "Przesuń punkt dokładnie na bliższą piętę"
                  : "Czy niebieski punkt leży na bliższej pięcie?"}
              </h2>
            </div>
          )}
          <div
            className="bl-frame"
            style={{
              aspectRatio: aspect,
              ...(isLongJump ? {} : { maxWidth: `${38 * aspect}svh` }),
            }}
          >
            <div
              className="bl-frame-inner"
              style={{
                transform: `scale(${zoom}) translate(${pan[0]}%, ${pan[1]}%)`,
              }}
            >
              <canvas ref={canvas} aria-label="Dokładna klatka filmu" />
              {isLongJump && spatial && (
                <AutomaticLongJumpOverlay
                  value={spatial}
                  frameIndex={frameIndex}
                  editable={editing}
                  ready={ready}
                  canvas={canvas}
                  onHeel={(heel) => {
                    setSpatial({
                      ...spatial,
                      heel,
                      heelFrameIndex: frameIndex,
                      heelSource: "manual",
                    });
                    setEnd(frameIndex);
                    setDraft(null);
                    setConfirmed(false);
                    setEditing(true);
                  }}
                />
              )}
              {!isLongJump &&
                guides
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
          {is505 && start !== null && (
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
          {isLongJump && editing ? (
            <LabButton
              className="bl-wide"
              disabled={!ready || saved || !spatial || spatial.heelFrameIndex !== frameIndex}
              onClick={() => setEditing(false)}
            >
              Zatwierdź punkt pięty
            </LabButton>
          ) : isLongJump ? (
            <LabButton
              className="bl-secondary bl-wide"
              onClick={() => {
                setEditing(true);
                if (end !== null) move(end);
              }}
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
              Oznacz {protocol.markers[stepIndex].toLocaleLowerCase("pl-PL")}
            </LabButton>
          )}
          {!isLongJump && selectedIndex !== null && (
            <p className="bl-muted">Wybrano klatkę {selectedIndex + 1}.</p>
          )}
          {invalid && <LabNotice error>{invalid}</LabNotice>}
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
          )}
        </section>
      )}
    </div>
  );
}
