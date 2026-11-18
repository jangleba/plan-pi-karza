import { useMemo, useState } from "react";
import {
  DAY_LABELS,
  MINUTE_STEPS,
  draftNextPlan,
  emptyAnswers,
  type NextPlanDraft,
} from "@/lib/loadwise/nextPlanInterview";
import type { Profile } from "@/lib/loadwise/types";
import { plRange } from "./PlanWeek";

const WEEKDAY = ["nd", "pn", "wt", "śr", "cz", "pt", "so"];
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The only way into the next week: the match date comes first and is required ("no match" is an
 * answer too), then optional changes for that week. Nothing is saved here; it prepares the preview.
 */
export function NextWeekGate({
  profile,
  from,
  currentMinutes,
  onPrepare,
}: {
  profile: Profile;
  /** First day of the coming week. */
  from: string;
  currentMinutes: number;
  onPrepare: (draft: NextPlanDraft) => Promise<void>;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from]);
  const [match, setMatch] = useState<{ answered: boolean; date: string | null }>({
    answered: false,
    date: null,
  });
  const [ownDays, setOwnDays] = useState<number[]>(profile.individualTrainingDays);
  const [duration, setDuration] = useState<"full" | number>("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function prepare() {
    if (!match.answered || busy) return;
    setBusy(true);
    setError(null);
    try {
      const answers = {
        ...emptyAnswers(),
        match,
        days: ownDays,
        ...(duration === "full"
          ? { sessionDurationMode: "full" as const, minutes: null }
          : { sessionDurationMode: "limited" as const, minutes: duration }),
      };
      const confirmed = new Set(["match", "days", "minutes"]);
      await onPrepare(draftNextPlan(profile, currentMinutes, answers, confirmed));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się przygotować tygodnia.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bw-plan-card bw-gate" aria-label="Kolejny tydzień">
      <header>
        <h2>Kolejny tydzień</h2>
        <p>{plRange(from, addDays(from, 6))}</p>
      </header>
      <div className="bw-gate-step" role="group" aria-labelledby="bw-gate-match">
        <h3 id="bw-gate-match">Kiedy gramy mecz?</h3>
        <div className="bw-gate-days">
          {days.map((iso) => (
            <button
              key={iso}
              type="button"
              aria-pressed={match.answered && match.date === iso}
              onClick={() => setMatch({ answered: true, date: iso })}
            >
              <span>{WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()]}</span>
              <b>{Number(iso.slice(8, 10))}</b>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="bw-gate-none"
          aria-pressed={match.answered && match.date === null}
          onClick={() => setMatch({ answered: true, date: null })}
        >
          Bez meczu w tym tygodniu
        </button>
      </div>
      <details className="bw-gate-changes">
        <summary>Zmiany w tym tygodniu</summary>
        <div className="bw-gate-step" role="group" aria-label="Dni własnych treningów">
          <h3>Dni własnych treningów</h3>
          <div className="bw-gate-chips">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={ownDays.includes(d)}
                onClick={() => {
                  const next = ownDays.includes(d)
                    ? ownDays.filter((x) => x !== d)
                    : [...ownDays, d];
                  if (next.length > 0) setOwnDays(next);
                }}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
        <label className="bw-gate-select">
          Czas na jednostkę
          <select
            aria-label="Czas na jednostkę w kolejnym tygodniu"
            value={duration === "full" ? "full" : String(duration)}
            onChange={(e) =>
              setDuration(e.target.value === "full" ? "full" : Number(e.target.value))
            }
          >
            <option value="full">Pełne jednostki</option>
            {[...new Set<number>([...MINUTE_STEPS, currentMinutes])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {m} minut
                </option>
              ))}
          </select>
        </label>
      </details>
      {error ? (
        <p role="alert" className="bw-plan-alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="bw-plan-button"
        disabled={!match.answered || busy}
        onClick={() => void prepare()}
      >
        {busy ? "Przygotowywanie…" : "Przygotuj tydzień"}
      </button>
      {!match.answered ? (
        <p className="bw-gate-hint">Najpierw wybierz dzień meczu albo „Bez meczu”.</p>
      ) : null}
    </section>
  );
}
