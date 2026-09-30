import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog, StatusMessage } from "@/components/ui/app-ui";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/loadwise/auth";
import { recordConsentDecisions, type ConsentDecision } from "@/lib/loadwise/consent";
import { CONSENTS, FUEL_PRECISION_CONSENT, LEGAL_VERSION } from "@/lib/loadwise/legal";
import { useLoadwise } from "@/lib/loadwise/store";
import { profileWithoutFuelPrecision, profileWithoutHealthData } from "@/lib/loadwise/localPrivacy";

type GateStatus = "checking" | "required" | "complete" | "error";

interface ConsentRow {
  id: string;
  consent_type: string;
  accepted: boolean;
  version: string;
  accepted_at: string;
}

const HEALTH_DATA_CONSENT_TEXT =
  CONSENTS.find((consent) => consent.type === "health_data")?.text ??
  "Wyrażam zgodę na opcjonalną personalizację na podstawie danych o zdrowiu.";

export function LegalReconsentGate() {
  const { user, signOut } = useAuth();
  const userId = user?.id;
  const { state, updateProfile } = useLoadwise();
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
  useActivityExitGuard({ dirty: false, busy: saving });

  useEffect(() => {
    let active = true;

    async function checkCurrentLegalVersion() {
      if (!userId || !profile?.onboardingComplete) {
        if (active) setStatus("complete");
        return;
      }

      setStatus("checking");
      setErrorMessage("");

      const { data, error } = await supabase
        .from("consent_logs")
        .select("id, consent_type, accepted, version, accepted_at")
        .eq("user_id", userId)
        .in("consent_type", ["terms", "privacy", "health_data", "fuel_precision"])
        .order("accepted_at", { ascending: false })
        .order("id", { ascending: false });

      if (!active) return;
      if (error) {
        setErrorMessage(
          "Nie udało się sprawdzić aktualności dokumentów. Sprawdź połączenie i spróbuj ponownie.",
        );
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

  if (!user || !profile?.onboardingComplete || status === "complete") return null;

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
      setSaving(false);
      setStatus("complete");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Nie udało się zapisać decyzji. Spróbuj ponownie.",
      );
      setSaving(false);
    }
  }

  const title =
    status === "checking"
      ? "Sprawdzamy aktualność dokumentów"
      : status === "error"
        ? "Nie udało się sprawdzić dokumentów"
        : "Zaktualizowane dokumenty BallWise";

  return (
    <ResponsiveDialog
      open
      onOpenChange={() => {}}
      dismissible={false}
      title={title}
      description={
        status === "required"
          ? "Przed dalszym korzystaniem zapoznaj się z aktualnym Regulaminem i Polityką prywatności. Opcjonalne zgody zdrowotne nie są zaznaczone automatycznie."
          : undefined
      }
      footer={
        status === "error" ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={() => setRetryRevision((value) => value + 1)}>
              Spróbuj ponownie
            </Button>
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              Wyloguj się
            </Button>
          </div>
        ) : status === "required" ? (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              disabled={!termsAccepted || !privacyAccepted || saving}
              onClick={() => void submit()}
            >
              {saving ? "Zapisujemy decyzję…" : "Zapisz i przejdź dalej"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void signOut()}
            >
              Nie akceptuję — wyloguj mnie
            </Button>
          </div>
        ) : undefined
      }
    >
      {status === "checking" ? (
        <span className="bw-launch__signal" aria-busy="true" aria-label="Sprawdzanie dokumentów" />
      ) : status === "error" ? (
        <StatusMessage tone="error">{errorMessage}</StatusMessage>
      ) : (
        <div className="space-y-5" aria-busy={saving}>
          <p className="text-sm text-primary">Wersja {LEGAL_VERSION}</p>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
            <Checkbox
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              disabled={saving}
              className="mt-1"
            />
            <span className="text-base leading-6">
              Akceptuję aktualny{` `}
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline underline-offset-4"
              >
                Regulamin
              </a>
              .
            </span>
          </label>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
            <Checkbox
              checked={privacyAccepted}
              onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
              disabled={saving}
              className="mt-1"
            />
            <span className="text-base leading-6">
              Potwierdzam zapoznanie się z aktualną{` `}
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline underline-offset-4"
              >
                Polityką prywatności
              </a>
              .
            </span>
          </label>
          {healthNeedsRenewal && (
            <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
              <Checkbox
                checked={healthOptIn}
                onCheckedChange={(checked) => setHealthOptIn(checked === true)}
                disabled={saving}
                className="mt-1"
              />
              <span className="text-base leading-6">
                <span className="font-semibold">Opcjonalnie:</span>
                {` `}
                {HEALTH_DATA_CONSENT_TEXT} Jeśli nie zaznaczysz tej zgody, zapisane dane zdrowotne
                zostaną usunięte.
              </span>
            </label>
          )}
          {fuelNeedsRenewal && (
            <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
              <Checkbox
                checked={fuelOptIn}
                onCheckedChange={(checked) => setFuelOptIn(checked === true)}
                disabled={saving}
                className="mt-1"
              />
              <span className="text-base leading-6">
                <span className="font-semibold">Opcjonalnie:</span>
                {` `}
                {FUEL_PRECISION_CONSENT}
              </span>
            </label>
          )}
          {errorMessage && <StatusMessage tone="error">{errorMessage}</StatusMessage>}
        </div>
      )}
    </ResponsiveDialog>
  );
}
