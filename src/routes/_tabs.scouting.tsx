import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Star, ListChecks, NotebookPen, Plus, Trophy, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_tabs/scouting")({
  component: ScoutingScreen,
});

function EditableCard({
  title,
  icon: Icon,
  value,
  placeholder,
  onSave,
}: {
  title: string;
  icon: typeof Star;
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
            <span className="italic">Jeszcze nic tu nie ma. Dodaj swoje notatki.</span>
          )}
        </p>
      )}
    </div>
  );
}

function ScoutingScreen() {
  const { state, updateScouting } = useLoadwise();
  const sc = state.scouting;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");

  function addOpportunity() {
    if (!title.trim()) {
      toast.error("Podaj nazwę.");
      return;
    }
    updateScouting({
      opportunities: [
        { id: crypto.randomUUID(), title: title.trim(), detail: detail.trim() },
        ...sc.opportunities,
      ],
    });
    setTitle("");
    setDetail("");
    setOpen(false);
    toast.success("Dodano pozycję.");
  }

  function remove(id: string) {
    updateScouting({
      opportunities: sc.opportunities.filter((o) => o.id !== id),
    });
  }

  return (
    <div>
      <AppHeader
        title="Analiza"
        subtitle="Twój profil rozwojowy i szanse na rozwój."
      />

      <div className="space-y-3 px-5">
        <EditableCard
          title="Mocne strony"
          icon={Star}
          value={sc.strengths}
          placeholder="np. szybkość, gra głową, pierwszy kontakt…"
          onSave={(v) => updateScouting({ strengths: v })}
        />
        <EditableCard
          title="Priorytety rozwoju"
          icon={ListChecks}
          value={sc.priorities}
          placeholder="np. lewa noga, decyzyjność pod presją…"
          onSave={(v) => updateScouting({ priorities: v })}
        />
        <EditableCard
          title="Notatki z obserwacji"
          icon={NotebookPen}
          value={sc.notes}
          placeholder="Uwagi po meczach, treningach, feedback trenera…"
          onSave={(v) => updateScouting({ notes: v })}
        />

        <div className="soft-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-primary" /> Kluby / testy / szanse
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="h-4 w-4" /> Dodaj
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nowa szansa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Nazwa</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="np. testy do akademii, turniej, kontakt"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Szczegóły (opcjonalnie)</Label>
                    <Textarea
                      value={detail}
                      onChange={(e) => setDetail(e.target.value)}
                      placeholder="Termin, miejsce, osoba kontaktowa…"
                    />
                  </div>
                  <Button className="w-full" onClick={addOpportunity}>
                    Dodaj
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {sc.opportunities.length === 0 ? (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
              Brak zapisanych szans. Dodaj testy, turnieje lub kontakty, które
              chcesz śledzić.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {sc.opportunities.map((o) => (
                <div
                  key={o.id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{o.title}</div>
                    {o.detail && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {o.detail}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => remove(o.id)}
                    className="text-muted-foreground"
                    aria-label="Usuń"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
