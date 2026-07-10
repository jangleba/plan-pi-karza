import { useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Star,
  ListChecks,
  AlertTriangle,
  Activity,
  Inbox,
  type LucideIcon,
} from "lucide-react";

function EditableCard({
  title,
  icon: Icon,
  value,
  placeholder,
  onSave,
}: {
  title: string;
  icon: LucideIcon;
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <div className="soft-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </div>
        {!editing && (
          <button
            className="text-xs font-medium text-primary"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            {value ? "Edytuj" : "Dodaj"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            rows={4}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onSave(draft.trim());
                setEditing(false);
              }}
            >
              Zapisz
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Anuluj
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
          {value || (
            <span className="italic">
              Jeszcze nic tu nie ma. Dodaj swoje notatki.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Raport progresu generowany wyłącznie z realnych danych zawodnika. */
function ProgressReport() {
  const { state } = useLoadwise();

  const report = useMemo(() => {
    const completedCount = Object.values(state.completions).filter(
      (c) => c.completed,
    ).length;
    const testsCount = state.tests.length;
    const readinessCount = Object.keys(state.readiness).length;
    const hasEnough = completedCount >= 3 || testsCount >= 1;

    const readinessVals = Object.values(state.readiness).map((r) => r.overall);
    const avgReadiness =
      readinessVals.length > 0
        ? readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length
        : null;

    return { completedCount, testsCount, readinessCount, hasEnough, avgReadiness };
  }, [state]);

  if (!report.hasEnough) {
    return (
      <div className="soft-card flex flex-col items-center gap-2 px-4 py-8 text-center">
        <span className="icon-bubble h-10 w-10">
          <Inbox className="h-5 w-5" strokeWidth={2} />
        </span>
        <p className="text-sm text-muted-foreground">
          Brakuje danych do pełnej analizy. Wykonaj testy i zapisz minimum kilka
          treningów.
        </p>
      </div>
    );
  }

  return (
    <div className="soft-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Activity className="h-4 w-4 text-primary" /> Raport progresu
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Generowany z Twoich realnych danych — nie zawiera wyników
        demonstracyjnych.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 py-2">
          <div className="text-lg font-bold">{report.completedCount}</div>
          <div className="text-[10px] text-muted-foreground">treningi</div>
        </div>
        <div className="rounded-lg bg-muted/50 py-2">
          <div className="text-lg font-bold">{report.testsCount}</div>
          <div className="text-[10px] text-muted-foreground">testy</div>
        </div>
        <div className="rounded-lg bg-muted/50 py-2">
          <div className="text-lg font-bold">
            {report.avgReadiness !== null ? report.avgReadiness.toFixed(1) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground">gotowość</div>
        </div>
      </div>
    </div>
  );
}

export function PlayerAnalysis() {
  const { state, updateScouting } = useLoadwise();
  const sc = state.scouting;

  return (
    <div className="space-y-3">
      <ProgressReport />
      <EditableCard
        title="Mocne strony"
        icon={Star}
        value={sc.strengths}
        placeholder="np. szybkość, gra głową, pierwszy kontakt…"
        onSave={(v) => updateScouting({ strengths: v })}
      />
      <EditableCard
        title="Słabe strony / priorytety rozwoju"
        icon={ListChecks}
        value={sc.priorities}
        placeholder="np. lewa noga, decyzyjność pod presją…"
        onSave={(v) => updateScouting({ priorities: v })}
      />
      <EditableCard
        title="Ryzyka i notatki z obserwacji"
        icon={AlertTriangle}
        value={sc.notes}
        placeholder="Uwagi po meczach, treningach, feedback trenera…"
        onSave={(v) => updateScouting({ notes: v })}
      />
    </div>
  );
}
