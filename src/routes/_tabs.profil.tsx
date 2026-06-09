import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import {
  POSITION_LABELS,
  LEVEL_LABELS,
  GOAL_LABELS,
  DOUBLE_SESSION_LABELS,
} from "@/lib/loadwise/labels";
import type { DoubleSessions } from "@/lib/loadwise/types";
import { Button } from "@/components/ui/button";
import {
  User,
  Target,
  Dumbbell,
  ShieldCheck,
  FileDown,
  Trash2,
  Pencil,
  CircleCheck,
  CircleAlert,
} from "lucide-react";

export const Route = createFileRoute("/_tabs/profil")({
  component: ProfilScreen,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function ProfilScreen() {
  const { state, resetAll, updateProfile } = useLoadwise();
  const navigate = useNavigate();
  const p = state.profile;

  if (!p) return null;

  function setDouble(v: DoubleSessions) {
    if (!p || p.doubleSessionsAllowed === v) return;
    updateProfile({ ...p, doubleSessionsAllowed: v });
    toast.success("Zaktualizowano podwójne sesje. Plan przeliczony.");
  }

  const isMinor = p.age >= 13 && p.age <= 17;

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadwise-dane.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Eksport danych gotowy.");
    } catch {
      toast.error("Nie udało się wyeksportować danych.");
    }
  }

  function deleteData() {
    if (
      window.confirm(
        "Czy na pewno chcesz usunąć wszystkie dane? Tej operacji nie można cofnąć.",
      )
    ) {
      resetAll();
      toast.success("Dane usunięte.");
      navigate({ to: "/onboarding", replace: true });
    }
  }

  return (
    <div>
      <AppHeader title="Profil" subtitle="Twoje dane i ustawienia." />

      <div className="space-y-3 px-5">
        <div className="soft-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {p.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-base font-semibold">{p.name}</div>
              <div className="text-sm text-muted-foreground">
                {p.age} lat · {POSITION_LABELS[p.position]}
              </div>
            </div>
          </div>
        </div>

        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <User className="h-3.5 w-3.5" /> Podstawowe
          </div>
          <div className="mt-1 divide-y divide-border">
            <Row label="Pozycja" value={POSITION_LABELS[p.position]} />
            <Row label="Poziom" value={LEVEL_LABELS[p.level]} />
            <Row label="Cel główny" value={GOAL_LABELS[p.goal]} />
            <Row
              label="Najbliższy mecz"
              value={p.matchDate ?? "Brak daty"}
            />
          </div>
        </div>

        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Dumbbell className="h-3.5 w-3.5" /> Sprzęt
          </div>
          {p.equipment.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {p.equipment.map((e) => (
                <span
                  key={e}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                >
                  {e}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nie wybrano sprzętu.
            </p>
          )}
        </div>

        <div className="soft-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Status i zgody
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {p.painInjury ? (
                <CircleAlert className="h-4 w-4 text-destructive" />
              ) : (
                <CircleCheck className="h-4 w-4 text-primary" />
              )}
              {p.painInjury
                ? "Zgłoszony ból / uraz — plan ograniczony"
                : "Brak zgłoszonego bólu / urazu"}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CircleCheck className="h-4 w-4 text-primary" />
              {isMinor
                ? p.guardianConsent
                  ? "Zgoda rodzica/opiekuna potwierdzona"
                  : "Brak zgody opiekuna"
                : "Pełnoletni — zgoda niewymagana"}
            </div>
          </div>
        </div>

        <Button
          className="w-full gap-2"
          onClick={() => navigate({ to: "/onboarding" })}
        >
          <Pencil className="h-4 w-4" /> Edytuj profil
        </Button>

        <div className="soft-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Prywatność i dane
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Twoje dane są przechowywane lokalnie na tym urządzeniu. Polityka
            prywatności i regulamin pojawią się w pełnej wersji aplikacji.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportData}>
              <FileDown className="h-4 w-4" /> Eksport
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive"
              onClick={deleteData}
            >
              <Trash2 className="h-4 w-4" /> Usuń dane
            </Button>
          </div>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
