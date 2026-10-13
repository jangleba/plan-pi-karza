import { useState } from "react";
import { PROTOCOLS, protocolFor, sideLabel, type StoredTestId } from "./protocols";
import {
  comparison,
  resultGroups,
  resultValue,
  sideDifference,
  type BrowserResult,
} from "./results";
import { LabButton, LabConfirm, LabNotice } from "./LabUI";
import { videoPrecision } from "./measurement";

const dateOf = (date: string) =>
  new Date(date).toLocaleString("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
function ResultDetails({ result }: { result: BrowserResult }) {
  return (
    <dl className="bl-result-details">
      <dt>Dokładność nagrania</dt>
      <dd>{videoPrecision(result.fps)}</dd>
      <dt>Film</dt>
      <dd>{result.sourceName}</dd>
      <dt>Klatki / FPS</dt>
      <dd>
        {result.startFrameIndex + 1} → {result.endFrameIndex + 1} / {result.fps.toFixed(1)}
      </dd>
      <dt>Czasy w filmie</dt>
      <dd>
        {result.startSeconds.toFixed(6)} → {result.endSeconds.toFixed(6)} s
      </dd>
      {result.spatial ? (
        <>
          <dt>Metoda</dt>
          <dd>Kalibracja płaszczyzny podłoża. Dokładność sportowa niezweryfikowana.</dd>
          <dt>Wzorzec</dt>
          <dd>
            {result.spatial.referenceWidthCm} × {result.spatial.referenceDepthCm} cm
          </dd>
          <dt>Odcinek kontrolny</dt>
          <dd>{result.spatial.controlLengthCm} cm</dd>
        </>
      ) : (
        <>
          <dt>Rozdzielczość czasowa</dt>
          <dd>
            {resultValue(result.resolutionMin!, result.primaryUnit)}–
            {resultValue(result.resolutionMax!, result.primaryUnit)}
          </dd>
        </>
      )}
      {result.turnFrameIndex !== undefined && (
        <>
          <dt>Nawrót 505</dt>
          <dd>
            Klatka {result.turnFrameIndex + 1} · noga {result.side === "left" ? "lewa" : "prawa"}
          </dd>
        </>
      )}
      {result.averageSpeedMps && (
        <>
          <dt>Średnia prędkość</dt>
          <dd>{result.averageSpeedMps.toFixed(2)} m/s</dd>
        </>
      )}
      <dt>Protokół</dt>
      <dd>{result.version}</dd>
      <dt>ID filmu</dt>
      <dd className="bl-hash">{result.sourceHash.slice(0, 16)}…</dd>
      {result.notes && (
        <>
          <dt>Notatka</dt>
          <dd>{result.notes}</dd>
        </>
      )}
    </dl>
  );
}
export function BrowserHistory({
  rows,
  onDelete,
}: {
  rows: BrowserResult[];
  onDelete: (id: string) => boolean;
}) {
  const [filter, setFilter] = useState<StoredTestId | "all">("all");
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const shown = rows.filter((row) => filter === "all" || row.testId === filter);
  const first = rows.find((row) => row.id === firstId);
  const candidates = first
    ? rows.filter(
        (row) =>
          row.id !== first.id &&
          row.testId === first.testId &&
          row.side === first.side &&
          row.version === first.version,
      )
    : [];
  const second = candidates.find((row) => row.id === secondId);
  const compared = first && second ? comparison(first, second) : null;
  const groups = resultGroups(shown);
  const optionLabel = (row: BrowserResult) =>
    `${protocolFor(row.testId).title}${row.side ? ` · ${sideLabel(row.side)}` : ""} · ${resultValue(row.primaryValue, row.primaryUnit)} · ${dateOf(row.recordedAt)} · próba ${row.trial}`;
  return (
    <div className="bl-history">
      <section className="bl-card">
        <p className="bl-kicker">HISTORIA NA TYM URZĄDZENIU</p>
        <h2>{rows.length} zapisanych prób</h2>
        <p className="bl-muted">
          Historia dotyczy tego konta w tej przeglądarce. Nie jest jeszcze synchronizowana między
          urządzeniami. Pobieraj kopię w narzędziach Labu. Usunięcie danych Safari usuwa także
          lokalną historię.
        </p>
        <label className="bl-label">
          Test{" "}
          <select
            aria-label="Filtr historii"
            value={filter}
            onChange={(event) => setFilter(event.target.value as StoredTestId | "all")}
          >
            <option value="all">Wszystkie testy</option>
            {rows.some((row) => row.testId === "flying_10m") && (
              <option value="flying_10m">Flying 10 m · archiwum</option>
            )}
            {PROTOCOLS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </section>
      {!shown.length && (
        <LabNotice>
          Brak zapisanych prób. Wybierz test, oznacz dwa zdarzenia w oryginalnym filmie i zapisz
          wynik.
        </LabNotice>
      )}
      {groups.map((group) => {
        const protocol = protocolFor(group.best.testId);
        const sides =
          group.best.side === "left"
            ? sideDifference(rows, group.best.sessionId, group.best.testId)
            : null;
        return (
          <section className="bl-card" key={group.key}>
            <div className="bl-history-heading">
              <div>
                <p className="bl-kicker">{dateOf(group.best.recordedAt)}</p>
                <h2>
                  {protocol.title}
                  {group.best.side && ` · ${sideLabel(group.best.side)}`}
                </h2>
              </div>
              <span className="bl-badge">
                {group.rows.length}/{group.expected} prób
              </span>
            </div>
            <div className="bl-history-stats">
              <div>
                <span>Najlepsza</span>
                <strong>{resultValue(group.best.primaryValue, group.best.primaryUnit)}</strong>
              </div>
              <div>
                <span>Średnia</span>
                <strong>{resultValue(group.average, group.best.primaryUnit)}</strong>
              </div>
            </div>
            <p className="bl-muted">
              {group.complete
                ? "Komplet prób w tej sesji."
                : "Sesja niepełna — zbierz wszystkie próby, zanim porównasz sesje."}
            </p>
            {sides && (
              <LabNotice>
                Różnica najlepszych prób L/P: {sides.percent.toFixed(1)}% (|L−P| / większa wartość).
                To opis wyników z tej sesji, bez oceny ryzyka urazu.
              </LabNotice>
            )}
            <details className="bl-details">
              <summary>Pokaż próby i czasy klatek</summary>
              {[...group.rows]
                .sort((a, b) => a.trial - b.trial)
                .map((row) => (
                  <article className="bl-trial-row" key={row.id}>
                    <h3>
                      Próba {row.trial} · {resultValue(row.primaryValue, row.primaryUnit)}
                    </h3>
                    <ResultDetails result={row} />
                    <div className="bl-actions">
                      <LabButton
                        className="bl-secondary"
                        onClick={() => {
                          setFirstId(row.id);
                          setSecondId("");
                          document.getElementById("bl-compare")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }}
                      >
                        Porównaj próbę
                      </LabButton>
                      <LabButton className="bl-link" onClick={() => setDeleteId(row.id)}>
                        Usuń próbę
                      </LabButton>
                    </div>
                  </article>
                ))}
            </details>
          </section>
        );
      })}
      {rows.length > 1 && (
        <section className="bl-card" id="bl-compare">
          <p className="bl-kicker">PORÓWNANIE DWÓCH PRÓB</p>
          <h2>Ten sam test i warunki</h2>
          <p className="bl-muted">
            Wybierz tę samą nogę i protokół. Porównuj podobną nawierzchnię, obuwie, rozgrzewkę i
            ustawienie kamery. Do oceny postępu wybierz najlepsze próby z dwóch pełnych sesji.
          </p>
          <label className="bl-label">
            Pierwsza próba
            <select
              aria-label="Pierwsza próba do porównania"
              value={firstId}
              onChange={(event) => {
                setFirstId(event.target.value);
                setSecondId("");
              }}
            >
              <option value="">Wybierz…</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {optionLabel(row)}
                </option>
              ))}
            </select>
          </label>
          <label className="bl-label">
            Druga próba
            <select
              aria-label="Druga próba do porównania"
              value={secondId}
              disabled={!first}
              onChange={(event) => setSecondId(event.target.value)}
            >
              <option value="">Wybierz…</option>
              {candidates.map((row) => (
                <option key={row.id} value={row.id}>
                  {optionLabel(row)}
                </option>
              ))}
            </select>
          </label>
          {first && !candidates.length && (
            <p className="bl-muted">Potrzebna jest jeszcze jedna próba tego samego testu i nogi.</p>
          )}
          {compared && (
            <div className="bl-comparison">
              <div className="bl-history-stats">
                <div>
                  <span>Starsza · {dateOf(compared.older.recordedAt)}</span>
                  <strong>
                    {resultValue(compared.older.primaryValue, compared.older.primaryUnit)}
                  </strong>
                </div>
                <div>
                  <span>Nowsza · {dateOf(compared.newer.recordedAt)}</span>
                  <strong>
                    {resultValue(compared.newer.primaryValue, compared.newer.primaryUnit)}
                  </strong>
                </div>
              </div>
              <p>
                Zmiana nowszej próby: {compared.difference > 0 ? "+" : ""}
                {resultValue(compared.difference, first!.primaryUnit)} (
                {compared.percent > 0 ? "+" : ""}
                {compared.percent.toFixed(1)}%).{" "}
                {protocolFor(first!.testId).category === "jump"
                  ? first!.testId === "standing_long_jump"
                    ? "Większy wynik oznacza dalszy skok."
                    : "Wyższy wynik oznacza wyższy skok."
                  : "Krótszy czas oznacza szybszą próbę."}
              </p>
              <LabNotice>
                {compared.overlaps === null
                  ? "Dokładność pomiaru odległości wymaga sprawdzenia taśmą. Małych zmian nie traktuj jako potwierdzonego postępu."
                  : compared.overlaps
                    ? "Przedziały rozdzielczości klatek nakładają się. Ten pomiar nie pozwala pewnie rozróżnić tak małej zmiany."
                    : "Przedziały rozdzielczości klatek są rozłączne. Nadal uwzględnij warunki i błąd oznaczenia zdarzeń."}
              </LabNotice>
            </div>
          )}
        </section>
      )}
      <LabConfirm
        open={deleteId !== null}
        title="Usunąć próbę?"
        description="Usunięta zostanie tylko ta lokalna próba. Pobrane kopie pozostaną bez zmian."
        action="Usuń próbę"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            if (onDelete(deleteId)) setDeleteId(null);
          }
        }}
      />
    </div>
  );
}
