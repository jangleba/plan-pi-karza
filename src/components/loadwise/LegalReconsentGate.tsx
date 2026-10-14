import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { cachedConsentRows, consentNeeds, loadConsentRows } from "@/lib/loadwise/legalStatus";
import { AppLaunchScreen } from "./AppLaunchScreen";
import { useAuth } from "@/lib/loadwise/auth";
import { recordConsentDecisions, type ConsentDecision } from "@/lib/loadwise/consent";
import { CONSENTS, FUEL_PRECISION_CONSENT, LEGAL_VERSION } from "@/lib/loadwise/legal";
import { useLoadwise } from "@/lib/loadwise/store";
import { profileWithoutFuelPrecision, profileWithoutHealthData } from "@/lib/loadwise/localPrivacy";

type GateStatus = "checking" | "required" | "complete" | "error";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const HEALTH_DATA_CONSENT_TEXT =
  CONSENTS.find((consent) => consent.type === "health_data")?.text ??
  "Wyrażam zgodę na opcjonalną personalizację na podstawie danych o zdrowiu.";

export function LegalReconsentGate({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth();
  const userId = user?.id;
  const { state, updateProfile } = useLoadwise();
  const profile = state.profile;
  const [status, setStatus] = useState<GateStatus>(() => {
    const rows = userId ? cachedConsentRows(userId) : null;
    return rows && profile && !consentNeeds(rows, profile).required ? "complete" : "checking";
  });
  const [retryRevision, setRetryRevision] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsNeedUpdate, setTermsNeedUpdate] = useState(false);
  const [privacyNeedUpdate, setPrivacyNeedUpdate] = useState(false);
  const [healthNeedsRenewal, setHealthNeedsRenewal] = useState(false);
  const [fuelNeedsRenewal, setFuelNeedsRenewal] = useState(false);
  const [healthOptIn, setHealthOptIn] = useState(false);
  const [fuelOptIn, setFuelOptIn] = useState(false);

  useClientLayoutEffect(() => {
    let active = true;

    async function checkCurrentLegalVersion() {
      if (!userId || !profile?.onboardingComplete) {
        if (active) setStatus("complete");
        return;
      }

      if (!cachedConsentRows(userId)) setStatus("checking");
      setErrorMessage("");
      let rows;
      try {
        rows = await loadConsentRows(userId);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Spróbuj ponownie.");
        setStatus("error");
        return;
      }
      if (!active) return;
      const { termsCurrent, privacyCurrent, healthRenewal, fuelRenewal } = consentNeeds(
        rows,
        profile,
      );

      setTermsAccepted(termsCurrent);
      setPrivacyAccepted(privacyCurrent);
      setTermsNeedUpdate(!termsCurrent);
      setPrivacyNeedUpdate(!privacyCurrent);
      setHealthNeedsRenewal(healthRenewal);
      setFuelNeedsRenewal(fuelRenewal);
      // Optional health and Fuel consents are never preselected.
      setHealthOptIn(false);
      setFuelOptIn(false);
      setStatus(
        !termsCurrent || !privacyCurrent || healthRenewal || fuelRenewal ? "required" : "complete",
      );
    }

    void checkCurrentLegalVersion();
    return () => {
      active = false;
    };
  }, [
    userId,
    profile?.onboardingComplete,
    profile?.healthPersonalizationEnabled,
    profile?.fuelPrecisionEnabled,
    retryRevision,
  ]);

  if (!user || !profile?.onboardingComplete || status === "complete") return <>{children}</>;
  if (status === "checking") return <AppLaunchScreen />;

  async function submit() {
    if (!profile || !termsAccepted || !privacyAccepted || saving) return;
    setSaving(true);
    setErrorMessage("");

    try {
      const decisions: ConsentDecision[] = [];
      let nextProfile = profile;

      if (healthNeedsRenewal && !healthOptIn) {
        decisions.push({ type: "health_data", accepted: false });
        nextProfile = profileWithoutHealthData(nextProfile);
      }

      if (fuelNeedsRenewal && !fuelOptIn) {
        decisions.push({ type: "fuel_precision", accepted: false });
        nextProfile = profileWithoutFuelPrecision(nextProfile);
      }

      if (termsNeedUpdate) {
        decisions.push({ type: "terms", accepted: true });
      }

      if (privacyNeedUpdate) {
        decisions.push({ type: "privacy", accepted: true });
      }

      if (healthNeedsRenewal && healthOptIn) {
        decisions.push({ type: "health_data", accepted: true });
      }

      if (fuelNeedsRenewal && fuelOptIn) {
        decisions.push({ type: "fuel_precision", accepted: true });
      }

      await recordConsentDecisions(decisions);
      if (nextProfile !== profile) await updateProfile(nextProfile);
      await loadConsentRows(user!.id);
      setSaving(false);
      setStatus("complete");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Nie udało się zapisać decyzji. Spróbuj ponownie.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/95 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-update-title"
        className="mx-auto w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-2xl"
      >
        {status === "error" ? (
          <div className="py-6 text-center">
            <h2 id="legal-update-title" className="text-lg font-semibold">
              Nie udało się sprawdzić dokumentów
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => setRetryRevision((value) => value + 1)}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Spróbuj ponownie
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium"
              >
                Wyloguj się
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Wersja {LEGAL_VERSION}
            </p>
            <h2 id="legal-update-title" className="mt-2 text-2xl font-semibold tracking-tight">
              Zaktualizowane dokumenty BallWise
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Przed dalszym korzystaniem zapoznaj się z aktualnym Regulaminem i Polityką
              prywatności. Opcjonalne zgody zdrowotne nie są zaznaczone automatycznie.
            </p>

            <div className="mt-5 space-y-3">
              <label className="flex gap-3 rounded-2xl border border-border p-4">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-sm leading-relaxed">
                  Akceptuję aktualny{` `}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary underline"
                  >
                    Regulamin
                  </a>
                  .
                </span>
              </label>

              <label className="flex gap-3 rounded-2xl border border-border p-4">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-sm leading-relaxed">
                  Potwierdzam zapoznanie się z aktualną{` `}
                  <a
                    href="/privacy-policy"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary underline"
                  >
                    Polityką prywatności
                  </a>
                  .
                </span>
              </label>

              {healthNeedsRenewal && (
                <label className="flex gap-3 rounded-2xl border border-border p-4">
                  <input
                    type="checkbox"
                    checked={healthOptIn}
                    onChange={(event) => setHealthOptIn(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-sm leading-relaxed">
                    <span className="font-semibold">Opcjonalnie:</span>
                    {` `}
                    {HEALTH_DATA_CONSENT_TEXT} Jeśli nie zaznaczysz tej zgody, zapisane dane
                    zdrowotne zostaną usunięte.
                  </span>
                </label>
              )}

              {fuelNeedsRenewal && (
                <label className="flex gap-3 rounded-2xl border border-border p-4">
                  <input
                    type="checkbox"
                    checked={fuelOptIn}
                    onChange={(event) => setFuelOptIn(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-sm leading-relaxed">
                    <span className="font-semibold">Opcjonalnie:</span> {FUEL_PRECISION_CONSENT}
                  </span>
                </label>
              )}
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              disabled={!termsAccepted || !privacyAccepted || saving}
              onClick={() => void submit()}
              className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Zapisujemy decyzję…" : "Zapisz i przejdź dalej"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void signOut()}
              className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm font-medium disabled:opacity-50"
            >
              Nie akceptuję — wyloguj mnie
            </button>
          </>
        )}
      </div>
    </div>
  );
}
