import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
import { toast } from "sonner";
import { ChevronLeft, FileDown, Trash2, ShieldOff, HeartOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/loadwise/auth";
import { recordConsentDecision } from "@/lib/loadwise/consent";
import { useInstantBack } from "@/lib/loadwise/uiHooks";
import { useLoadwise } from "@/lib/loadwise/store";
import { clearLocalUserData, profileWithoutHealthData } from "@/lib/loadwise/localPrivacy";
import { Button } from "@/components/ui/button";
import { ActionRow, ConfirmDialog, StatusMessage } from "@/components/ui/app-ui";

export const Route = createFileRoute("/data-rights")({
  component: DataRights,
});

const USER_TABLES = [
  "profiles",
  "athlete_profiles",
  "onboarding_answers",
  "readiness_logs",
  "pain_logs",
  "training_plans",
  "training_days",
  "training_sessions",
  "session_exercises",
  "session_logs",
  "exercise_set_logs",
  "session_modifications",
  "weekly_transitions",
  "exercise_replacements",
  "running_activities",
  "user_roles",
  "consent_logs",
] as const;

function DataRights() {
  const navigate = useNavigate();
  const goBack = useInstantBack("/profil");
  const { user, signOut } = useAuth();
  const { state, updateProfile } = useLoadwise();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"health_data" | "delete" | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [destination, setDestination] = useState<"/start" | "/auth" | null>(null);
  useActivityExitGuard({ dirty: false, busy });

  useEffect(() => {
    if (destination && !busy) navigate({ to: destination, replace: true });
  }, [destination, busy, navigate]);

  async function exportData() {
    if (!user) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const bundle: Record<string, unknown> = {
        account: { id: user.id, email: user.email },
        exported_at: new Date().toISOString(),
      };
      for (const t of USER_TABLES) {
        const { data, error } = await supabase.from(t).select("*").eq("user_id", user.id);
        if (error) throw error;
        bundle[t] = data ?? [];
      }
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ballwise-moje-dane.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Eksport danych gotowy.");
    } catch {
      setErrorMessage("Nie udało się wyeksportować danych. Spróbuj ponownie.");
      toast.error("Nie udało się wyeksportować danych.");
    } finally {
      setBusy(false);
    }
  }

  async function withdrawConsent(type: "marketing" | "health_data") {
    if (!user) return;
    setBusy(true);
    setErrorMessage("");
    if (type === "health_data") {
      try {
        await recordConsentDecision({ type: "health_data", accepted: false });
        if (state.profile) await updateProfile(profileWithoutHealthData(state.profile));
      } catch {
        setBusy(false);
        setErrorMessage("Nie udało się wycofać zgody i usunąć danych. Spróbuj ponownie.");
        toast.error("Nie udało się wycofać zgody i usunąć danych.");
        return;
      }
      setBusy(false);
      setConfirmation(null);
      toast.success("Usunięto dane zdrowotne i wyłączono ich personalizację.");
      setDestination("/start");
      return;
    }
    try {
      await recordConsentDecision({ type: "marketing", accepted: false });
    } catch {
      setBusy(false);
      setErrorMessage("Nie udało się wycofać zgody. Spróbuj ponownie.");
      toast.error("Nie udało się wycofać zgody.");
      return;
    }
    setBusy(false);
    toast.success("Zgoda marketingowa została wycofana.");
  }

  async function deleteAccount() {
    if (!user) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        method: "POST",
      });
      if (error) throw error;
      clearLocalUserData(user.id);
      await signOut();
      toast.success("Konto logowania i powiązane dane zostały usunięte.");
      setDestination("/auth");
    } catch {
      setErrorMessage("Nie udało się usunąć danych. Spróbuj ponownie.");
      toast.error("Nie udało się usunąć danych.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bw-form-page bw-page-content bw-stack">
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={goBack}
        className="justify-self-start"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Wstecz
      </Button>
      <div>
        <h1 className="bw-page-title">Moje dane i prawa</h1>
        <p className="mt-2 break-all text-base text-muted-foreground">{user?.email}</p>
      </div>

      <section className="bw-section space-y-4">
        <ActionRow
          title="Eksportuj moje dane (JSON)"
          description="Pobierz wszystkie swoje dane w jednym pliku."
          icon={<FileDown className="h-5 w-5 text-primary" />}
          onClick={() => void exportData()}
          disabled={busy}
        />
        <ActionRow
          title="Wycofaj zgodę marketingową"
          icon={<ShieldOff className="h-5 w-5 text-foreground" />}
          onClick={() => void withdrawConsent("marketing")}
          disabled={busy}
        />
        <ActionRow
          title="Wycofaj zgodę na dane o zdrowiu"
          description="Usuwa check-iny i przełącza plan w tryb ostrożny. Konto nadal działa."
          icon={<HeartOff className="h-5 w-5 text-destructive" />}
          onClick={() => {
            setErrorMessage("");
            setConfirmation("health_data");
          }}
          disabled={busy}
        />
      </section>
      <section className="bw-section">
        <ActionRow
          title={<span className="text-destructive">Usuń konto i dane</span>}
          description="Trwale usuwa Twoje dane z aplikacji."
          icon={<Trash2 className="h-5 w-5 text-destructive" />}
          onClick={() => {
            setErrorMessage("");
            setConfirmation("delete");
          }}
          disabled={busy}
        />
      </section>
      {busy && <StatusMessage>Wykonuję operację…</StatusMessage>}
      {errorMessage && !confirmation && <StatusMessage tone="error">{errorMessage}</StatusMessage>}
      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
        title={confirmation === "delete" ? "Usunąć konto i dane?" : "Wycofać zgodę zdrowotną?"}
        description={
          confirmation === "delete"
            ? "Czy na pewno chcesz usunąć wszystkie swoje dane? Tej operacji nie można cofnąć."
            : "Wycofać zgodę i usunąć zapisane check-iny oraz wpisy bólu? Konto i ostrożny plan nadal będą działać."
        }
        confirmLabel={confirmation === "delete" ? "Usuń konto i dane" : "Wycofaj zgodę"}
        busy={busy}
        error={errorMessage}
        destructive
        onConfirm={() =>
          confirmation === "delete" ? void deleteAccount() : void withdrawConsent("health_data")
        }
      />
    </section>
  );
}
