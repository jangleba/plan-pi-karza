import { useId, useState } from "react";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import { proposalToEngineResult } from "@/lib/loadwise/engineV2/feedbackAdjustment";
import { proposeMasTest, type MasTestOffer } from "@/lib/loadwise/engineV2/masTest";
import { masTestIneligibility } from "@/lib/loadwise/engineV2/masTestRecipe";
import { useLoadwise } from "@/lib/loadwise/store";

/**
 * Voluntary "Ustal tempo". The test is prepared by the engine, replaces one unstarted calm run
 * and is saved only after "Zastosuj", through the same version-checked plan write.
 */
export function MasTestAction() {
  const { state, hydrated, syncing, todayIso, activatePlanV2 } = useLoadwise();
  const detailsId = useId();
  const [offer, setOffer] = useState<MasTestOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = state.profile;
  if (!hydrated || syncing || !profile || !state.plan.length || !activatePlanV2) return null;
  // Only athletes the test is meant for see the action; everyone else keeps the effort-based path.
  if (masTestIneligibility(profile, todayIso)) return null;
  const build = () =>
    proposeMasTest({
      profile,
      plan: resolveEffectivePlan(state.plan, state.modifications, {
        completions: state.completions,
      }),
      completions: state.completions,
      todayIso,
      planId: state.activePlanId ?? null,
      readiness: state.readiness,
      hasModificationsInWindow: Object.entries(state.modifications).some(
        ([date, items]) => date >= todayIso && items.length > 0,
      ),
    });
  async function apply() {
    if (!offer?.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = build();
      if (!fresh.ok || fresh.proposal.fingerprint !== offer.proposal.fingerprint)
        throw new Error("Plan zmienił się. Zacznij od nowa.");
      await activatePlanV2!(proposalToEngineResult(fresh.proposal, profile!));
      setOffer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się zapisać. Plan bez zmian.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bw-plan-mas" aria-label="Ustal tempo">
      <div className="bw-plan-mas-row">
        <span>Test biegowy 5 min</span>
        {!offer && (
          <button
            type="button"
            className="bw-plan-link"
            aria-controls={detailsId}
            aria-expanded={false}
            onClick={() => setOffer(build())}
          >
            Ustal tempo
          </button>
        )}
      </div>
      <div id={detailsId} className="bw-plan-mas-details" hidden={!offer}>
        {offer && (
          <>
            <p>Test 5 minut ustala Twoje tempo do kolejnych biegów. Jest dobrowolny.</p>
            {offer.ok ? (
              <>
                <p>{offer.proposal.reason}</p>
                <ul>
                  {offer.proposal.changes.map((c) => (
                    <li key={c.sessionId}>{c.line}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{offer.reason}</p>
            )}
            <p className="text-xs text-neutral-600">
              Wynik powstaje z zapisanego dystansu (GPS) i czasu. Bez dystansu nie ustalimy tempa.
            </p>
            {offer.ok && error ? <p role="alert">{error}</p> : null}
            <div className="bw-plan-mas-actions">
              {offer.ok && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void apply()}
                  className="bw-plan-link"
                >
                  {busy ? "Zapisywanie…" : "Zastosuj"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setOffer(null)}
                className="bw-plan-link"
              >
                {offer.ok ? "Anuluj" : "Zamknij"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
