import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/loadwise/auth";
import { CONSENTS, FUEL_PRECISION_CONSENT, LEGAL_VERSION } from "@/lib/loadwise/legal";
import { useLoadwise } from "@/lib/loadwise/store";

type GateStatus = "checking" | "required" | "complete" | "error";

interface ConsentRow {
  id: string;
  consent_type: string;
  accepted: boolean;
  version: string;
  accepted_at: string;
}

interface ConsentInsert {
  user_id: string;
  consent_type: string;
  accepted: boolean;
  version: string;
  text_snapshot: string;
  actor_type: "athlete" | "guardian";
  actor_email: string | null;
  scope: string;
}

function definition(type: string) {
  const item = CONSENTS.find((consent) => consent.type === type);
  if (!item) throw new Error(`Brak definicji zgody: ${type}`);
  return item;
}

export function LegalReconsentGate() {
  const { user, signOut } = useAuth();
  const { state, saveFuelPrecision } = useLoadwise();
  const profile = state.profile;
  const [status, setStatus] = useState<GateStatus>("checking");
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

  useEffect(() => {
    let active = true;

    async function checkCurrentLegalVersion() {
      if (!user || !profile?.onboardingComplete) {
        if (active) setStatus("complete");
        return;
      }

      setStatus("checking");
      setErrorMessage("");

      const { data, error } = await supabase
        .from("consent_logs")
        .select("id, consent_type, accepted, version, accepted_at")
        .eq("user_id", user.id)
        .in("consent_type", ["terms", "privacy", "health_data", "fuel_precision"])
        .order("accepted_at", { ascending: false })
        .order("id", { ascending: false });

      if (!active) return;
      if (error) {
        setErrorMessage("Nie udało się sprawdzić aktualności dokumentów. Sprawdź połączenie i spróbuj ponownie.");
        setStatus("error");
        return;
      }

      const latest = new Map<string, ConsentRow>();
      for (const row of (data ?? []) as ConsentRow[]) {
        if (!latest.has(row.consent_type)) latest.set(row.consent_type, row);
      }

      const isCurrentAccepted = (type: string) => {
        const row = latest.get(type);
        return row?.accepted === true && row.version === LEGAL_VERSION;
      };

      const termsCurrent = isCurrentAccepted("terms");
      const privacyCurrent = isCurrentAccepted("privacy");
      const healthRenewal =
        profile.healthPersonalizationEnabled === true && !isCurrentAccepted("health_data");
      const fuelRenewal =
        profile.fuelPrecisionEnabled === true && !isCurrentAccepted("fuel_precision");

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
        !termsCurrent || !privacyCurrent || healthRenewal || fuelRenewal
          ? "required"
          : "complete",
      );
    }

    void checkCurrentLegalVersion();
    return () => {
      active = false;
    };
  }, [
    user?.id,
    profile?.onboardingComplete,
    profile?.healthPersonalizationEnabled,
    profile?.fuelPrecisionEnabled,
    retryRevision,
  ]);

  if (!user || !profile?.onboardingComplete || status === "complete") return null;

  async function submit() {
    if (!termsAccepted || !privacyAccepted || saving) return;
    setSaving(true);
    setErrorMessage("");

    try {
      if (healthNeedsRenewal && !healthOptIn) {
        const health = definition("health_data");
        const { error } = await supabase.rpc("withdraw_health_data_consent", {
          p_version: LEGAL_VERSION,
          p_text_snapshot: health.text,
        });
        if (error) throw error;
      }

      if (fuelNeedsRenewal && !fuelOptIn) {
        await saveFuelPrecision(false, null);
      }

      const actorType = profile.accountOwnerType === "guardian" ? "guardian" : "athlete";
      const rows: ConsentInsert[] = [];

      if (termsNeedUpdate) {
        const terms = definition("terms");
        rows.push({
          user_id: user.id,
          consent_type: terms.type,
          accepted: true,
          version: LEGAL_VERSION,
          text_snapshot: terms.text,
          actor_type: actorType,
          actor_email: user.email ?? null,
          scope: "terms_of_service",
        });
      }

      if (privacyNeedUpdate) {
        const privacy = definition("privacy");
        rows.push({
          user_id: user.id,
          consent_type: privacy.type,
          accepted: true,
          version: LEGAL_VERSION,
          text_snapshot: privacy.text,
          actor_type: actorType,
          actor_email: user.email ?? null,
          scope: "privacy_notice",
        });
      }

      if (healthNeedsRenewal && healthOptIn) {
        const health = definition("health_data");
        rows.push({
          user_id: user.id,
          consent_type: health.type,
          accepted: true,
          version: LEGAL_VERSION,
          text_snapshot: health.text,
          actor_type: actorType,
          actor_email: user.email ?? null,
          scope: "readiness_and_fuel_safety",
        });
      }

      if (fuelNeedsRenewal && fuelOptIn) {
        rows.push({
          user_id: user.id,
          consent_type: "fuel_precision",
          accepted: true,
          version: LEGAL_VERSION,
          text_snapshot: FUEL_PRECISION_CONSENT,
          actor_type: actorType,
          actor_email: user.email ?? null,
          scope: "fuel_personalization",
        });
      }

      if (rows.length > 0) {
        const { error } = await supabase.from("consent_logs").insert(rows);
        if (error) throw error;
      }

      window.location.reload();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać decyzji. Spróbuj ponownie.",
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
        {status === "checking" ? (
          <div className="py-12 text-center">
            <h2 id="legal-update-title" className="text-lg font-semibold">
              Sprawdzamy aktualność dokumentów
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">To potrwa tylko chwilę.</p>
          </div>
        ) : status === "error" ? (
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
              Przed dalszym korzystaniem zapoznaj się z aktualnym Regulaminem i Polityką prywatności.
              Opcjonalne zgody zdrowotne nie są zaznaczone automatycznie.
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
                    <span className="font-semibold">Opcjonalnie:</span>{` `}
                    {definition("health_data").text} Jeśli nie zaznaczysz tej zgody, zapisane
                    dane zdrowotne zostaną usunięte.
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
