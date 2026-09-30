import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { formatDate } from "@/lib/loadwise/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, ResponsiveDialog, StatusMessage } from "@/components/ui/app-ui";

export function WeeklyGateSheet({
  open,
  onOpenChange,
  weekNumber,
  nextWeekStart,
  nextWeekEnd,
  allowNoMatch = false,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** week_number kończonego tygodnia (odblokowuje kolejny). */
  weekNumber: number;
  nextWeekStart: string; // yyyy-MM-dd — pierwszy dzień kolejnego tygodnia
  nextWeekEnd: string; // yyyy-MM-dd — ostatni dzień kolejnego tygodnia
  /** Poza sezonem / przejściowy: pozwól zaznaczyć tydzień bez meczu. */
  allowNoMatch?: boolean;
  onConfirmed: () => void;
}) {
  const { state, confirmWeeklyTransition } = useLoadwise();
  const existing = state.transitions[weekNumber];

  const [matchDate, setMatchDate] = useState<string>("");
  const [secondMatchDate, setSecondMatchDate] = useState<string>("");
  const [noMatch, setNoMatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMatchDate(existing?.nextMatchDate ?? "");
      setSecondMatchDate(
        existing?.nextMatchDates?.find((date) => date !== existing.nextMatchDate) ?? "",
      );
      setNoMatch(allowNoMatch && Boolean(existing?.noMatchNextWeek));
      setSaving(false);
      setError(null);
    }
  }, [open, existing, allowNoMatch]);

  const canSave =
    noMatch || (matchDate !== "" && (secondMatchDate === "" || secondMatchDate > matchDate));

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await confirmWeeklyTransition(
        weekNumber,
        noMatch ? [] : [matchDate, secondMatchDate].filter(Boolean),
        noMatch,
      );
      toast.success(
        noMatch ? "Zapisano tydzień bez meczu." : "Mecz zapisany. Dopasowujemy tydzień.",
      );
      onOpenChange(false);
      onConfirmed();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się zapisać meczu. Spróbuj ponownie.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mecze w kolejnym tygodniu"
      description={`${formatDate(nextWeekStart)} – ${formatDate(nextWeekEnd)}`}
      dismissible={!saving}
      footer={
        <>
          <Button disabled={!canSave || saving} onClick={() => void handleSave()}>
            {saving ? "Układamy…" : "Zapisz i otwórz tydzień"}
          </Button>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
        </>
      }
    >
      <div className="bw-stack">
        <p className="text-sm text-muted-foreground">
          Terminy meczów pozwalają dopasować obciążenie i regenerację.
        </p>
        <Field label="Data kolejnego meczu" htmlFor="week-match-date">
          <Input
            id="week-match-date"
            type="date"
            value={matchDate}
            min={nextWeekStart}
            max={nextWeekEnd}
            disabled={noMatch}
            onChange={(event) => setMatchDate(event.target.value)}
          />
        </Field>
        {!noMatch && (
          <Field
            label="Drugi mecz (opcjonalnie)"
            htmlFor="week-second-match-date"
            error={
              secondMatchDate !== "" && secondMatchDate <= matchDate
                ? "Drugi mecz musi być później niż pierwszy."
                : undefined
            }
          >
            <Input
              id="week-second-match-date"
              type="date"
              value={secondMatchDate}
              min={matchDate || nextWeekStart}
              max={nextWeekEnd}
              onChange={(event) => setSecondMatchDate(event.target.value)}
            />
          </Field>
        )}
        {allowNoMatch && (
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <Checkbox checked={noMatch} onCheckedChange={(value) => setNoMatch(value === true)} />{" "}
            Tydzień bez meczu (poza sezonem)
          </label>
        )}
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
      </div>
    </ResponsiveDialog>
  );
}
