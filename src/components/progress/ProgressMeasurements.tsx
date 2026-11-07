import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { loadBrowserResults } from "@/features/browser-lab/storage";
import { resultValue, type BrowserResult } from "@/features/browser-lab/results";
import { loadJourneyHistory } from "@/features/football-iq-match/journeyHistory";
import type { JourneyAttempt } from "@/features/football-iq-match/journeyTypes";
import { buildLabProgress, buildIQProgress } from "@/lib/progress/measurements";
import type { ProgressPeriod } from "@/lib/progress/progress";

type Data = {
  owner: string;
  lab: BrowserResult[];
  iq: JourneyAttempt[];
  labError: boolean;
  iqError: boolean;
};
export default function ProgressMeasurements({
  ownerId,
  todayIso,
  periodDays,
}: {
  ownerId: string;
  todayIso: string;
  periodDays: ProgressPeriod;
}) {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    function read() {
      const next: Data = { owner: ownerId, lab: [], iq: [], labError: false, iqError: false };
      try {
        next.lab = loadBrowserResults(ownerId);
      } catch {
        next.labError = true;
      }
      try {
        next.iq = loadJourneyHistory(ownerId);
      } catch {
        next.iqError = true;
      }
      setData(next);
    }
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ userId?: string }>).detail?.userId === ownerId) read();
    };
    const visible = () => {
      if (!document.hidden) read();
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("ballwise:module-data-changed", changed);
    window.addEventListener("ballwise:module-data-applied", changed);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("ballwise:module-data-changed", changed);
      window.removeEventListener("ballwise:module-data-applied", changed);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [ownerId]);
  const current = data?.owner === ownerId ? data : null;
  const lab = useMemo(
    () => buildLabProgress(current?.lab ?? [], todayIso, periodDays),
    [current, todayIso, periodDays],
  );
  const iq = useMemo(
    () => buildIQProgress(current?.iq ?? [], todayIso, periodDays),
    [current, todayIso, periodDays],
  );
  if (!current)
    return (
      <p role="status" className="mt-3 text-xs">
        Wczytuję dane tego konta…
      </p>
    );
  return (
    <div className="mt-3 space-y-4" data-progress-measurements>
      <p className="text-xs text-muted-foreground">
        Ostatnie {periodDays} dni · Lab i IQ zapisane na tym urządzeniu.
      </p>
      <section aria-label="Pomiary Lab">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Lab</h2>
          <Link
            to="/lab"
            className="min-h-11 inline-flex items-center px-2 text-xs font-medium text-primary"
          >
            Otwórz Lab →
          </Link>
        </div>
        {current.labError ? (
          <p role="alert" className="text-xs">
            Nie udało się odczytać historii Lab. Otwórz narzędzia Labu; zapisów nie zmieniono.
          </p>
        ) : lab.length === 0 ? (
          <p className="text-xs text-muted-foreground">Brak pomiarów w tym okresie.</p>
        ) : (
          <ul className="divide-y divide-border">
            {lab.map((row) => (
              <li key={row.key} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/lab"
                    search={{ view: "history" }}
                    aria-label={`Otwórz historię Lab: ${row.title}`}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                  >
                    {row.title} ›
                  </Link>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {resultValue(row.value, row.unit)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {row.date} · najlepsza próba · {row.trials}/{row.expected}
                  {!row.complete ? " · niepełna seria" : ""}
                </p>
                {row.timingQuality && (
                  <p
                    className={`mt-1 text-[11px] ${row.timingQuality.status === "reviewed" ? "text-primary" : "text-amber-700"}`}
                  >
                    {row.timingQuality.label}
                  </p>
                )}
                {row.delta !== null ? (
                  <p className="mt-1 text-xs">
                    Zmiana zapisu: {row.delta > 0 ? "+" : ""}
                    {row.delta.toFixed(row.unit === "s" ? 3 : 1)} {row.unit} względem poprzedniej
                    pełnej serii.
                    {row.overlaps
                      ? " Zakresy z klatek nakładają się — różnica nie potwierdza zmiany formy."
                      : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.timingQuality && row.timingQuality.status !== "reviewed"
                      ? "Ten zapis nie służy do oceny małych zmian wyniku."
                      : row.complete
                        ? "Do porównania potrzebna jest wcześniejsza pełna seria tą samą metodą."
                        : "Porównanie po ukończeniu pełnej serii."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {lab.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Wyżej w skokach i krócej w biegach to korzystniejszy wynik zapisu. Porównuj podobne
            warunki; pomiar z filmu ma ograniczenia.
          </p>
        )}
      </section>
      <section className="border-t border-border pt-3" aria-label="Trening IQ">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">IQ</h2>
          <Link
            to="/football-iq"
            className="min-h-11 inline-flex items-center px-2 text-xs font-medium text-primary"
          >
            Otwórz IQ →
          </Link>
        </div>
        {current.iqError ? (
          <p role="alert" className="text-xs">
            Nie udało się odczytać historii IQ. Otwórz IQ, aby sprawdzić kopię zapisów.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Przećwiczone akcje: <strong>{iq.total}</strong> · scenariusze: {iq.scenarios}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Z podpowiedziami: {iq.guided} · samodzielnie: {iq.independent}. To zapis nauki w
              aplikacji, nie ocena umiejętności meczowych.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
