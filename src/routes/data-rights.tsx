import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, FileDown, Trash2, ShieldOff, HeartOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/loadwise/auth";
import { Button } from "@/components/ui/button";
import { LEGAL_VERSION, MEDICAL_DISCLAIMER } from "@/lib/loadwise/legal";

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
  "consent_logs",
] as const;

function DataRights() {
  const router = useRouter();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function exportData() {
    if (!user) return;
    setBusy(true);
    try {
      const bundle: Record<string, unknown> = {
        account: { id: user.id, email: user.email },
        exported_at: new Date().toISOString(),
      };
      for (const t of USER_TABLES) {
        const { data } = await supabase.from(t).select("*").eq("user_id", user.id);
        bundle[t] = data ?? [];
      }
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadwise-moje-dane.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Eksport danych gotowy.");
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
        "Wycofanie zgody na dane o zdrowiu może spowodować, że generowanie planów treningowych przestanie działać. Kontynuować?",
      )
    )
      return;
    await supabase.from("consent_logs").insert({
      user_id: user.id,
      consent_type: type,
      accepted: false,
      version: LEGAL_VERSION,
      text_snapshot: "Wycofanie zgody przez użytkownika.",
    });
    toast.success("Zgoda została wycofana i odnotowana.");
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
      await supabase.from("consent_logs").insert({
        user_id: user.id,
        consent_type: "account_deletion_request",
        accepted: true,
        version: LEGAL_VERSION,
        text_snapshot: "Użytkownik zażądał usunięcia konta i danych.",
      });
      // Remove all user-owned data (RLS scopes deletes to this user).
      for (const t of USER_TABLES) {
        if (t === "consent_logs") continue;
        await supabase.from(t).delete().eq("user_id", user.id);
      }
      await supabase.from("profiles").delete().eq("user_id", user.id);
      toast.success("Dane usunięte. Zostaniesz wylogowany.");
      await signOut();
      navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("Nie udało się usunąć danych.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell min-h-screen px-5 pb-16 pt-6">
      <button
        onClick={() => router.history.back()}
        className="mb-4 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-foreground"
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
          onClick={exportData}
          disabled={busy}
          className="soft-card flex w-full items-center gap-3 p-4 text-left"
        >
          <FileDown className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Eksportuj moje dane (JSON)</div>
            <div className="text-xs text-muted-foreground">
              Pobierz wszystkie swoje dane w jednym pliku.
            </div>
          </div>
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
              Uwaga: generowanie planów treningowych może przestać działać.
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
