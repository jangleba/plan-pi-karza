import { TrainingConflictReview } from "@/components/loadwise/TrainingConflictReview";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, FileDown, Trash2, ShieldOff, HeartOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deliverExportFile, clearExportCacheForUser } from "@/lib/loadwise/deliverExportFile";
import { buildUserDataExport, buildLocalUserDataExport } from "@/lib/loadwise/dataExport";
import { clearLocalHealthData } from "@/lib/loadwise/localPrivacy";
import { purgeTrainingQueue } from "@/lib/loadwise/offlineTrainingQueue";
import { useAuth } from "@/lib/loadwise/auth";
import { recordConsentDecision } from "@/lib/loadwise/consent";
import { MEDICAL_DISCLAIMER } from "@/lib/loadwise/legal";
import { useInstantBack } from "@/lib/loadwise/uiHooks";
import { clearLocalUserData } from "@/lib/loadwise/localPrivacy";

export const Route = createFileRoute("/data-rights")({
  component: DataRights,
});

function DataRights() {
  const navigate = useNavigate();
  const goBack = useInstantBack("/profil");
  const { user, signOut } = useAuth();
  const activeUser = useRef(user?.id);
  activeUser.current = user?.id;

  const [busy, setBusy] = useState(false);

  async function exportData(localOnly = false) {
    if (!user) return;
    setBusy(true);
    try {
      const account = {
        id: user.id,
        email: user.email,
        phone: user.phone,
        created_at: user.created_at,
        updated_at: user.updated_at,
        email_confirmed_at: user.email_confirmed_at,
        phone_confirmed_at: user.phone_confirmed_at,
        last_sign_in_at: user.last_sign_in_at,
        user_metadata: user.user_metadata,
        app_metadata: user.app_metadata,
        identities: user.identities,
      };
      const bundle = await (localOnly
        ? buildLocalUserDataExport(account)
        : buildUserDataExport(account));
      if (activeUser.current !== account.id) return;
      const result = await deliverExportFile(
        "ballwise-moje-dane.json",
        JSON.stringify(bundle, null, 2),
        "application/json",
        account.id,
      );
      if (result === "cancelled" || activeUser.current !== account.id) return;
      toast.success("Plik eksportu przygotowany i przekazany do pobrania.");
    } catch {
      toast.error("Nie udało się wyeksportować danych.");
    } finally {
      setBusy(false);
    }
  }

  async function withdrawConsent(type: "marketing" | "health_data") {
    if (!user) return;
    if (
      type === "health_data" &&
      !window.confirm(
        "Wycofać zgodę i usunąć zapisane check-iny oraz wpisy bólu? Konto i ostrożny plan nadal będą działać.",
      )
    )
      return;
    setBusy(true);
    if (type === "health_data") {
      try {
        await recordConsentDecision({ type: "health_data", accepted: false });
      } catch {
        setBusy(false);
        toast.error("Nie udało się wycofać zgody i usunąć danych.");
        return;
      }
      try {
        await clearLocalHealthData(user.id);
      } catch {
        toast.warning(
          "Zgoda została wycofana. Czyszczenie pamięci telefonu wymaga ponownego otwarcia aplikacji.",
        );
      }
      setBusy(false);
      toast.success("Zgoda zdrowotna wycofana. Plan działa bez personalizacji zdrowotnej.");
      navigate({ to: "/start", replace: true });
      return;
    }
    try {
      await recordConsentDecision({ type: "marketing", accepted: false });
    } catch {
      setBusy(false);
      toast.error("Nie udało się wycofać zgody.");
      return;
    }
    setBusy(false);
    toast.success("Zgoda marketingowa została wycofana.");
  }

  async function deleteAccount() {
    if (!user) return;
    if (
      !window.confirm(
        "Czy na pewno chcesz usunąć wszystkie swoje dane? Tej operacji nie można cofnąć.",
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        method: "POST",
      });
      if (error) throw error;
      clearLocalUserData(user.id);
      let deviceCleared = await purgeTrainingQueue(user.id);
      const cleanup = await Promise.allSettled([
        clearExportCacheForUser(user.id),
        (async () => {
          const { nativeRecorder, nativeRunningAvailable } =
            await import("@/lib/running/nativeRecorder");
          if (nativeRunningAvailable()) await nativeRecorder.clearOwner({ ownerId: user.id });
        })(),
      ]);
      if (cleanup.some((result) => result.status === "rejected")) deviceCleared = false;
      if (activeUser.current !== user.id) return;
      await signOut();
      if (deviceCleared) toast.success("Konto logowania i powiązane dane zostały usunięte.");
      else
        toast.warning(
          "Konto zostało usunięte z serwera. Nie udało się całkowicie wyczyścić pamięci telefonu. Usuń aplikację z telefonu, aby usunąć pozostałe dane lokalne.",
        );
      navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("Nie udało się usunąć danych.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell premium-flow min-h-screen px-5 pb-16 pt-6">
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-sm text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">Moje dane i prawa</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Zarządzaj swoimi danymi osobowymi i zgodami (RODO).
      </p>

      <div className="mt-5 space-y-3">
        <div className="soft-card p-4">
          <div className="text-sm font-semibold">Konto</div>
          <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
        </div>

        <button
          onClick={() => void exportData(false)}
          disabled={busy}
          className="soft-card flex w-full items-center gap-3 p-4 text-left"
        >
          <FileDown className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Eksportuj moje dane (JSON)</div>
            <div className="text-xs text-muted-foreground">
              Pobierz dane z bazy, lokalne historie i niewysłane wyniki z tego telefonu.
            </div>
          </div>
        </button>

        {user && <TrainingConflictReview key={user.id} userId={user.id} />}

        <button
          onClick={() => void exportData(true)}
          disabled={busy}
          className="soft-card w-full p-4 text-left text-sm"
        >
          Pobierz kopię danych z tego telefonu (również offline)
        </button>

        <button
          onClick={() => withdrawConsent("marketing")}
          disabled={busy}
          className="soft-card flex w-full items-center gap-3 p-4 text-left"
        >
          <ShieldOff className="h-5 w-5 text-foreground" />
          <div>
            <div className="text-sm font-semibold">Wycofaj zgodę marketingową</div>
            <div className="text-xs text-muted-foreground">
              Przestaniemy wysyłać Ci informacje marketingowe.
            </div>
          </div>
        </button>

        <button
          onClick={() => withdrawConsent("health_data")}
          disabled={busy}
          className="soft-card flex w-full items-center gap-3 p-4 text-left"
        >
          <HeartOff className="h-5 w-5 text-destructive" />
          <div>
            <div className="text-sm font-semibold">Wycofaj zgodę na dane o zdrowiu</div>
            <div className="text-xs text-muted-foreground">
              Usuwa check-iny i przełącza plan w tryb ostrożny. Konto nadal działa.
            </div>
          </div>
        </button>

        <button
          onClick={deleteAccount}
          disabled={busy}
          className="soft-card flex w-full items-center gap-3 p-4 text-left"
        >
          <Trash2 className="h-5 w-5 text-destructive" />
          <div>
            <div className="text-sm font-semibold text-destructive">Usuń konto i dane</div>
            <div className="text-xs text-muted-foreground">
              Trwale usuwa Twoje dane z aplikacji.
            </div>
          </div>
        </button>

        <p className="px-1 pt-2 text-xs leading-relaxed text-muted-foreground">
          {MEDICAL_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
