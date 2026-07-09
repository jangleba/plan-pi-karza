import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { formatDate } from "@/lib/loadwise/labels";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";

export function WeeklyGateSheet({
  open,
  onOpenChange,
  weekNumber,
  nextWeekStart,
  nextWeekEnd,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** week_number kończonego tygodnia (odblokowuje kolejny). */
  weekNumber: number;
  nextWeekStart: string; // yyyy-MM-dd — pierwszy dzień kolejnego tygodnia
  nextWeekEnd: string; // yyyy-MM-dd — ostatni dzień kolejnego tygodnia
  onConfirmed: () => void;
}) {
  const { state, confirmWeeklyTransition } = useLoadwise();
  const existing = state.transitions[weekNumber];

  const [matchDate, setMatchDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMatchDate(existing?.nextMatchDate ?? "");
      setSaving(false);
    }
  }, [open, existing]);

  const canSave = matchDate !== "";

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await confirmWeeklyTransition(weekNumber, matchDate, false);
      toast.success("Mecz zapisany. Dopasowujemy tydzień.");
      onOpenChange(false);
      onConfirmed();
    } finally {
      setSaving(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Zanim przejdziesz dalej</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Podaj datę kolejnego meczu, żeby Loadwise dobrze ułożył następny
          tydzień.
        </p>

        <div className="mt-1 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Kolejny tydzień: {formatDate(nextWeekStart)} – {formatDate(nextWeekEnd)}
        </div>

        {/* Data meczu */}
        <div className="mt-2">
          <label className="mb-1.5 block text-sm font-medium">
            Data kolejnego meczu
          </label>
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              value={matchDate}
              min={nextWeekStart}
              onChange={(e) => setMatchDate(e.target.value)}
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>
        </div>


        <Button
          className="mt-3 w-full"
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? "Układamy…" : "Zapisz i ułóż kolejny tydzień"}
        </Button>

        {!canSave && (
          <p className="text-center text-xs text-muted-foreground">
            Podaj kolejny mecz. Bez tego nie układamy następnego tygodnia.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
