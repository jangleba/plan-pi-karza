import { useEffect, useId, useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock,
  FlaskConical,
  Footprints,
  MoveRight,
  RotateCcw,
  Timer,
  ArrowUpFromLine,
} from "lucide-react";
import {
  PROTOCOLS,
  TEST_IDS,
  attemptPlan,
  protocolFor,
  type BrowserAttempt,
  type BrowserTestId,
} from "./protocols";
import { appendBrowserResult, deleteBrowserResult, loadBrowserResults } from "./storage";
import type { BrowserResult } from "./results";
import { VideoAnalyzer } from "./VideoAnalyzer";
import { BrowserHistory } from "./BrowserHistory";
import { SafariTools } from "./SafariTools";
import { LabButton, LabConfirm, LabNotice, messageOf } from "./LabUI";
import "./browser-lab.css";

interface Session {
  id: string;
  attempts: BrowserAttempt[];
  index: number;
  saved: boolean;
  savedCount: number;
  restUntil: number;
}
function RestReminder({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <p className="bl-rest">
      <Clock size={17} />
      {seconds > 0
        ? `Zalecana przerwa: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : "Możesz wykonać kolejną próbę."}
    </p>
  );
}
export default function BrowserLab({
  ownerId,
  initialTab = "tests",
}: {
  ownerId: string;
  initialTab?: "tests" | "history";
}) {
  const tabsId = useId();
  const [tab, setTab] = useState<"tests" | "history">(initialTab);
  const [rows, setRows] = useState<BrowserResult[]>([]);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [exit, setExit] = useState(false);
  const [capable, setCapable] = useState<boolean | null>(null);
  const [finished, setFinished] = useState<number | null>(null);
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, current: "tests" | "history") {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "tests"
        : event.key === "End"
          ? "history"
          : current === "tests"
            ? "history"
            : "tests";
    setTab(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)
      ?.focus();
  }
  useEffect(() => {
    setCapable(
      globalThis.isSecureContext &&
        typeof VideoDecoder !== "undefined" &&
        typeof EncodedVideoChunk !== "undefined",
    );
    const reload = () => {
      try {
        setRows(loadBrowserResults(ownerId));
        setError("");
      } catch (reason) {
        setError(messageOf(reason));
      }
    };
    const applied = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; module?: string }>).detail;
      if (detail?.userId === ownerId && detail.module === "lab") reload();
    };
    reload();
    window.addEventListener("ballwise:module-data-applied", applied);
    return () => window.removeEventListener("ballwise:module-data-applied", applied);
  }, [ownerId]);
  function begin(ids: readonly BrowserTestId[]) {
    if (!capable) return;
    setSession({
      id: crypto.randomUUID(),
      attempts: attemptPlan(ids),
      index: 0,
      saved: false,
      savedCount: 0,
      restUntil: 0,
    });
    setFinished(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function save(result: BrowserResult) {
    const updated = appendBrowserResult(ownerId, result);
    setRows(updated);
    setError("");
    setSession((current) =>
      current
        ? {
            ...current,
            saved: true,
            savedCount: current.savedCount + 1,
            restUntil: Date.now() + protocolFor(result.testId).restSeconds * 1000,
          }
        : current,
    );
  }
  function next() {
    if (!session?.saved) return;
    if (session.index === session.attempts.length - 1) {
      setFinished(session.savedCount);
      setSession(null);
      setTab("history");
    } else {
      setSession({ ...session, index: session.index + 1, saved: false });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  return (
    <div className="browser-lab">
      {session ? (
        <>
          <div className="bl-session-header">
            <LabButton
              className="bl-link"
              onClick={() =>
                session.saved
                  ? (setFinished(session.savedCount), setSession(null), setTab("history"))
                  : setExit(true)
              }
            >
              <ArrowLeft size={18} />
              Zakończ sesję
            </LabButton>
            <span>
              {session.index + 1} / {session.attempts.length}
            </span>
          </div>
          <div
            className="bl-session-progress"
            aria-label={`${session.savedCount} z ${session.attempts.length} prób zapisanych`}
          >
            <span
              style={{
                width: `${(session.savedCount / session.attempts.length) * 100}%`,
              }}
            />
          </div>
          {!session.saved && session.restUntil > 0 && <RestReminder until={session.restUntil} />}
          <VideoAnalyzer
            ownerId={ownerId}
            key={`${session.id}:${session.index}`}
            attempt={session.attempts[session.index]}
            sessionId={session.id}
            onSave={save}
          />
          {session.saved && (
            <section className="bl-card bl-next">
              {session.index < session.attempts.length - 1 && (
                <RestReminder until={session.restUntil} />
              )}
              <LabButton className="bl-wide" onClick={next}>
                {session.index === session.attempts.length - 1
                  ? "Zakończ i pokaż wyniki"
                  : "Kolejna próba"}
                <ArrowRight size={18} />
              </LabButton>
              {session.index < session.attempts.length - 1 && (
                <LabButton
                  className="bl-link bl-wide"
                  onClick={() => {
                    setFinished(session.savedCount);
                    setSession(null);
                    setTab("history");
                  }}
                >
                  Zakończ na teraz
                </LabButton>
              )}
            </section>
          )}
        </>
      ) : (
        <>
          <section className="bl-intro">
            <div className="bl-icon">
              <FlaskConical size={24} />
            </div>
            <div>
              <p className="bl-kicker">LAB</p>
              <h2>Wybierz test</h2>
              <p>Skok, sprint lub zmiana kierunku.</p>
            </div>
          </section>
          <div className="bl-tabs" role="tablist" aria-label="BallWise Lab">
            <button
              type="button"
              role="tab"
              id={`${tabsId}-tests`}
              data-tab="tests"
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === "tests" ? 0 : -1}
              aria-selected={tab === "tests"}
              onKeyDown={(event) => tabKeys(event, "tests")}
              onClick={() => setTab("tests")}
            >
              Testy
            </button>
            <button
              type="button"
              role="tab"
              id={`${tabsId}-history`}
              data-tab="history"
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === "history" ? 0 : -1}
              aria-selected={tab === "history"}
              onKeyDown={(event) => tabKeys(event, "history")}
              onClick={() => setTab("history")}
            >
              Historia <span>{rows.length}</span>
            </button>
          </div>
          {finished !== null && (
            <LabNotice>
              Sesja zakończona. Zapisano {finished} poprawnych prób. Pobierz kopię historii w
              narzędziach Labu.
            </LabNotice>
          )}
          {error && <LabNotice error>{error}</LabNotice>}
          {capable === false && (
            <LabNotice error>
              {globalThis.isSecureContext
                ? "Ta przeglądarka nie udostępnia dokładnego odczytu klatek. Otwórz Lab w aktualnym Safari lub Chrome i uruchom „Sprawdź Safari”."
                : "Dokładny pomiar wymaga strony otwartej przez HTTPS. Otwórz bezpieczny adres BallWise."}{" "}
              Historia i kopie wyników pozostają dostępne.
            </LabNotice>
          )}
          <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
            {tab === "tests" ? (
              <>
                <div className="bl-test-list">
                  {PROTOCOLS.map((protocol) => {
                    const Icon =
                      protocol.id === "cmj"
                        ? ArrowUpFromLine
                        : protocol.id === "single_leg_cmj"
                          ? Footprints
                          : protocol.id === "sprint_10m"
                            ? Timer
                            : protocol.id === "standing_long_jump"
                              ? MoveRight
                              : RotateCcw;
                    return (
                      <button
                        type="button"
                        key={protocol.id}
                        className="bl-card bl-test-card"
                        aria-label={`Rozpocznij ${protocol.title}`}
                        disabled={capable !== true}
                        onClick={() => begin([protocol.id as BrowserTestId])}
                      >
                        <span className="bl-test-icon" aria-hidden="true">
                          <Icon size={21} />
                        </span>
                        <span className="bl-test-copy">
                          <strong>{protocol.title}</strong>
                          <span>{protocol.subtitle}</span>
                        </span>
                        <ChevronRight size={20} className="bl-test-chevron" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
                <details className="bl-details bl-suite-options">
                  <summary>Cały zestaw testów</summary>
                  <p className="bl-muted">
                    Możesz także wykonać wszystkie testy kolejno. Rozgrzej się i zachowuj zalecane
                    przerwy.
                  </p>
                  <LabButton disabled={capable !== true} onClick={() => begin(TEST_IDS)}>
                    Rozpocznij pełny profil
                    <ArrowRight size={18} />
                  </LabButton>
                </details>
                <details className="bl-details">
                  <summary>Jak wykonać pomiar?</summary>
                  <ol className="bl-steps">
                    <li>
                      Nagraj jedną próbę, około 5–10 s. Dla rozdzielczości czasu wybierz oryginalne
                      120/240 FPS. Obsługujemy HD i 4K od 15 FPS; przy 30/60 FPS wynik jest
                      orientacyjny.
                    </li>
                    <li>
                      Wybierz test i zaimportuj oryginalny MP4/MOV z Plików. Sprawdź rzeczywiste FPS
                      odczytane przez Lab.
                    </li>
                    <li>
                      Lab proponuje zdarzenia do sprawdzenia. Dla biegów ustaw linię na obrazie.
                      Porównaj sąsiednie klatki, popraw w razie potrzeby i zapisz wynik.
                    </li>
                  </ol>
                  <p className="bl-muted">
                    Skok w dal używa dwóch wydrukowanych wzorców na podłożu; wysokość pozostałych
                    skoków obliczamy z czasu lotu, a odcinki biegowe trzeba zmierzyć taśmą. Przy
                    30/60 FPS wyniki czasowe są orientacyjne — sprawdź podany zakres rozdzielczości.
                    Zmiana tempa filmu uniemożliwia poprawny pomiar.
                  </p>
                </details>
              </>
            ) : (
              <BrowserHistory
                rows={rows}
                onDelete={(id) => {
                  try {
                    setRows(deleteBrowserResult(ownerId, id));
                    setError("");
                    return true;
                  } catch (reason) {
                    setError(messageOf(reason));
                    return false;
                  }
                }}
              />
            )}
          </div>
          <SafariTools
            ownerId={ownerId}
            rows={rows}
            onRestore={(updated) => {
              setRows(updated);
              setError("");
            }}
          />
        </>
      )}
      <LabConfirm
        open={exit}
        title="Zakończyć tę sesję?"
        description="Zapisane próby pozostaną w historii. Niezapisane oznaczenia bieżącej próby zostaną utracone. Niepełne serie będą opisane jako niepełne."
        action="Zakończ sesję"
        onCancel={() => setExit(false)}
        onConfirm={() => {
          setSession(null);
          setExit(false);
          setTab("history");
        }}
      />
    </div>
  );
}
