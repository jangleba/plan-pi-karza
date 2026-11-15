import { useFeedbackAdjustment } from "@/lib/loadwise/useFeedbackAdjustment";

/** One calm card; the plan changes only after "Zastosuj". */
export function FeedbackAdjustmentCard() {
  const { proposal, busy, error, apply, dismiss } = useFeedbackAdjustment();
  if (!proposal) return null;
  return (
    <section className="bw-home-iq-task" aria-label="Propozycja zmiany planu">
      <span>
        <small>{proposal.reason}</small>
        <ul>
          {proposal.changes.map((c) => (
            <li key={`${c.kind}:${c.sessionId}`}>
              {c.line}
              {c.details?.length ? (
                <details>
                  <summary>Zmiany ćwiczeń ({c.details.length})</summary>
                  <ul>
                    {c.details.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
        <small>
          Zmieniamy tylko wymienione sesje. Wykonane i rozpoczęte oraz reszta planu zostają bez
          zmian.
        </small>
        {error ? <small role="alert">{error}</small> : null}
      </span>
      <button type="button" disabled={busy} onClick={() => void apply()}>
        {busy ? "Zapisywanie…" : "Zastosuj"}
      </button>
      <button type="button" disabled={busy} onClick={dismiss}>
        Zostaw plan
      </button>
    </section>
  );
}
