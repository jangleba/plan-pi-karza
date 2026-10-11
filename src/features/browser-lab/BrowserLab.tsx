import { useEffect, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, CheckCircle2, Clock, FlaskConical } from "lucide-react";
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
        ? `Zalecana przerwa przed kolejną próbą: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : "Zalecana przerwa zakończona."}
    </p>
  );
}
export default function BrowserLab({ ownerId }: { ownerId: string }) {
  const [tab, setTab] = useState<"tests" | "history">("tests");
  const [rows, setRows] = useState<BrowserResult[]>([]);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [exit, setExit] = useState(false);
  const [capable, setCapable] = useState<boolean | null>(null);
  const [finished, setFinished] = useState<number | null>(null);
  useEffect(() => {
    setCapable(
      globalThis.isSecureContext &&
        typeof VideoDecoder !== "undefined" &&
        typeof EncodedVideoChunk !== "undefined",
    );
    try {
      setRows(loadBrowserResults(ownerId));
      setError("");
    } catch (reason) {
      setError(messageOf(reason));
    }
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
            <LabButton className="bl-link" onClick={() => setExit(true)}>
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
            <span style={{ width: `${(session.savedCount / session.attempts.length) * 100}%` }} />
          </div>
          {!session.saved && session.restUntil > 0 && <RestReminder until={session.restUntil} />}
          <VideoAnalyzer
            key={`${session.id}:${session.index}`}
            attempt={session.attempts[session.index]}
            sessionId={session.id}
            onSave={save}
          />
          {session.saved && (
            <section className="bl-card bl-next">
              <CheckCircle2 size={26} />
              <h2>Próba {session.index + 1} zapisana</h2>
              {session.index < session.attempts.length - 1 && (
                <RestReminder until={session.restUntil} />
              )}
              <LabButton className="bl-wide" onClick={next}>
                {session.index === session.attempts.length - 1
                  ? "Zakończ i pokaż wyniki"
                  : "Przejdź do kolejnej próby"}
                <ArrowRight size={18} />
              </LabButton>
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
              <p className="bl-kicker">LAB · FILM 120 / 240 FPS</p>
              <h2>Sprawdź swoją formę</h2>
              <p>Prawdziwe czasy klatek. Jasne protokoły. Twoje próby do porównania.</p>
            </div>
          </section>
          <div className="bl-tabs" role="tablist" aria-label="BallWise Lab">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "tests"}
              onClick={() => setTab("tests")}
            >
              Testy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "history"}
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
          {tab === "tests" ? (
            <>
              <section className="bl-card bl-profile">
                <p className="bl-kicker">PEŁNY PROFIL</p>
                <h2>5 testów · 17 prób</h2>
                <p>
                  Skoczność, szybkość i zmiana kierunku. Przed sesją zrób rozgrzewkę, przygotuj
                  taśmę, pachołki i statyw. Zaplanuj czas na przerwy: 60 s po skoku, 3 min po biegu.
                </p>
                <LabButton disabled={capable !== true} onClick={() => begin(TEST_IDS)}>
                  Rozpocznij pełny profil
                  <ArrowRight size={18} />
                </LabButton>
              </section>
              <div className="bl-test-list">
                {PROTOCOLS.map((protocol) => (
                  <section key={protocol.id} className="bl-card bl-test-card">
                    <div className="bl-test-icon">
                      <Activity size={20} />
                    </div>
                    <div>
                      <p className="bl-kicker">
                        {protocol.category === "jump"
                          ? "SKOCZNOŚĆ"
                          : protocol.category === "speed"
                            ? "SZYBKOŚĆ"
                            : "ZMIANA KIERUNKU"}
                      </p>
                      <h2>{protocol.title}</h2>
                      <p>{protocol.subtitle}</p>
                      <span className="bl-muted">
                        {protocol.trials} próby{protocol.sides.length > 1 ? " na każdą nogę" : ""} ·{" "}
                        {protocol.category === "jump" ? "wynik w cm" : "wynik w sekundach"}
                      </span>
                    </div>
                    <LabButton
                      className="bl-secondary"
                      aria-label={`Rozpocznij ${protocol.title}`}
                      disabled={capable !== true}
                      onClick={() => begin([protocol.id])}
                    >
                      Start
                      <ArrowRight size={16} />
                    </LabButton>
                  </section>
                ))}
              </div>
              <section className="bl-card">
                <h2>Jak używać w Safari</h2>
                <ol className="bl-steps">
                  <li>
                    Nagraj oryginalny film w Aparacie, 1080p i 120/240 FPS. Safari nie nagrywa tutaj
                    240 FPS.
                  </li>
                  <li>
                    Wybierz test i zaimportuj oryginalny MP4/MOV z Plików. Sprawdź rzeczywiste FPS
                    odczytane przez Lab.
                  </li>
                  <li>
                    Przesuwaj film o jedną klatkę. Oznacz początek i koniec zgodnie z instrukcją,
                    potwierdź warunki i zapisz.
                  </li>
                </ol>
                <p className="bl-muted">
                  LiDAR nie jest potrzebny. Wysokość skoku obliczamy z czasu lotu, a odcinki biegowe
                  trzeba zmierzyć taśmą. Film 30/60 FPS, zmienione tempo lub nieobsługiwany kodek
                  blokują pomiar.
                </p>
              </section>
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
