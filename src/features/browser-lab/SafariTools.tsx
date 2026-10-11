import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Wrench } from "lucide-react";
import { runSafariCheck, type SafariCheck } from "./diagnostic";
import {
  createHistoryBackup,
  rawBrowserHistory,
  restoreHistoryBackup,
  backupResults,
  CorruptHistoryError,
  replaceCorruptedHistory,
} from "./storage";
import { historyCSV } from "./export";
import { downloadText } from "./download";
import type { BrowserResult } from "./results";
import { LabButton, LabNotice, LabConfirm, messageOf } from "./LabUI";
export function SafariTools({
  ownerId,
  rows,
  onRestore,
}: {
  ownerId: string;
  rows: BrowserResult[];
  onRestore: (rows: BrowserResult[]) => void;
}) {
  const [check, setCheck] = useState<SafariCheck | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [repair, setRepair] = useState<{ backup: unknown; raw: string } | null>(null);
  const [rawDownloaded, setRawDownloaded] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  async function diagnose() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setCheck(null);
    setError("");
    setProgress("Rozpoczynam test przeglądarki…");
    try {
      const result = await runSafariCheck(abort.signal, (text) => {
        if (mounted.current) setProgress(text);
      });
      if (mounted.current) setCheck(result);
    } catch (reason) {
      if (mounted.current && !abort.signal.aborted) setError(messageOf(reason));
    } finally {
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  async function restore(file: File) {
    setRepair(null);
    setRawDownloaded(false);
    setNotice("");
    setError("");
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Kopia jest za duża. Wybierz JSON BallWise Lab do 2 MB.");
      const input: unknown = JSON.parse(await file.text());
      if (!mounted.current) return;
      backupResults(input);
      let restored;
      try {
        restored = restoreHistoryBackup(ownerId, input);
      } catch (reason) {
        if (reason instanceof CorruptHistoryError) {
          setRepair({ backup: input, raw: rawBrowserHistory(ownerId) });
          throw reason;
        }
        throw reason;
      }
      onRestore(restored.rows);
      setNotice(
        `Dodano ${restored.added} prób. Wcześniejsze wyniki zachowano; duplikaty pominięto.`,
      );
    } catch (reason) {
      if (mounted.current) setError(messageOf(reason));
    }
  }
  function safely(action: () => void) {
    setError("");
    try {
      action();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  return (
    <section className="bl-card bl-tools">
      <p className="bl-kicker">NARZĘDZIA LABU</p>
      <h2 className="flex items-center gap-2">
        <Wrench size={20} />
        Safari i kopia wyników
      </h2>
      <p className="bl-muted">
        Test kontrolny sprawdza dekodowanie klatek H.264 i HEVC na tym urządzeniu. Używa sztucznego
        filmu, bez zapisywania wyniku do Twojej historii.
      </p>
      <LabButton className="bl-wide bl-secondary" disabled={busy} onClick={() => void diagnose()}>
        Sprawdź Safari
      </LabButton>
      {busy && (
        <>
          <LabNotice>{progress}</LabNotice>
          <LabButton
            className="bl-link"
            onClick={() => {
              controller.current?.abort();
            }}
          >
            Anuluj sprawdzanie
          </LabButton>
        </>
      )}
      {check && (
        <div className="bl-diagnostic">
          <h3>
            {check.avc.passed ? (
              <>
                <CheckCircle2 size={18} className="inline mr-2" />
                H.264 gotowe do prób
              </>
            ) : (
              "H.264: wymaga sprawdzenia"
            )}
          </h3>
          <p className="bl-muted">{check.avc.detail}</p>
          <h3>{check.hevc.passed ? "HEVC: odczyt działa" : "HEVC: odczyt niedostępny"}</h3>
          <p className="bl-muted">{check.hevc.detail}</p>
          {check.knownJumpCm !== null && (
            <p className="bl-muted">
              Kontrola obliczeń: 104 odstępy klatek / 240 FPS → {check.knownJumpCm.toFixed(6)} cm.
              To sztuczny przykład, nie pomiar zawodnika.
            </p>
          )}
          <p className="bl-muted">
            Po tym sprawdzeniu wykonaj próbę na własnym filmie. Każdy import nadal przechodzi osobną
            kontrolę czasu i kodeka.
          </p>
          <LabButton
            className="bl-link"
            onClick={() =>
              downloadText("BallWise-kontrola-Safari.json", JSON.stringify(check, null, 2))
            }
          >
            Pobierz raport przeglądarki
          </LabButton>
        </div>
      )}
      <details className="bl-details">
        <summary>Kopia historii i eksport</summary>
        <p className="bl-muted">
          JSON pozwala przywrócić historię na drugim urządzeniu. CSV służy do przeglądania w
          arkuszu. Filmy zachowaj osobno. Kopia zawiera nazwy filmów, notatki i wyniki.
        </p>
        <div className="bl-actions">
          <LabButton
            className="bl-secondary"
            onClick={() =>
              safely(() =>
                downloadText(
                  "BallWise-Lab-kopia.json",
                  JSON.stringify(createHistoryBackup(rows), null, 2),
                ),
              )
            }
          >
            <Download size={16} />
            Pobierz JSON
          </LabButton>
          <LabButton
            className="bl-secondary"
            disabled={!rows.length}
            onClick={() =>
              safely(() =>
                downloadText("BallWise-Lab-wyniki.csv", historyCSV(rows), "text/csv;charset=utf-8"),
              )
            }
          >
            Pobierz CSV
          </LabButton>
        </div>
        <label className="bl-button bl-secondary bl-upload">
          Przywróć kopię JSON
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Przywróć kopię JSON"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void restore(file);
            }}
          />
        </label>
        <p className="bl-muted">
          Przywracanie dodaje poprawne próby i pomija duplikaty. Cały plik jest sprawdzany przed
          zapisem.
        </p>
        <LabButton
          className="bl-link"
          onClick={() =>
            safely(() =>
              downloadText(
                "BallWise-Lab-surowa-historia.txt",
                rawBrowserHistory(ownerId),
                "text/plain",
              ),
            )
          }
        >
          Pobierz surową historię do odzyskania
        </LabButton>
      </details>
      {repair && (
        <LabNotice error>
          Poprawna kopia została sprawdzona, ale lokalna historia jest uszkodzona.
          <LabButton
            className="bl-secondary bl-wide"
            onClick={() =>
              safely(() => {
                downloadText("BallWise-Lab-surowa-historia.txt", repair.raw, "text/plain");
                setRawDownloaded(true);
              })
            }
          >
            Pobierz uszkodzoną historię przed odzyskaniem
          </LabButton>
          <LabButton
            className="bl-secondary bl-wide"
            disabled={!rawDownloaded}
            onClick={() => setConfirmRepair(true)}
          >
            Odzyskaj ze sprawdzonej kopii
          </LabButton>
        </LabNotice>
      )}
      <LabConfirm
        open={confirmRepair}
        title="Zastąpić uszkodzoną historię?"
        description="Upewnij się, że surowa kopia jest zapisana w Plikach. Lab zastąpi uszkodzone dane tylko sprawdzonymi próbami z wybranego JSON. Pobraną kopię zachowaj do odzyskania pozostałych wpisów."
        action="Odzyskaj historię"
        onCancel={() => setConfirmRepair(false)}
        onConfirm={() =>
          safely(() => {
            if (!repair) return;
            const updated = replaceCorruptedHistory(ownerId, repair.backup, repair.raw);
            onRestore(updated);
            setRepair(null);
            setConfirmRepair(false);
            setNotice(`Odzyskano ${updated.length} prób.`);
          })
        }
      />
      {notice && <LabNotice>{notice}</LabNotice>}
      {error && <LabNotice error>{error}</LabNotice>}
    </section>
  );
}
