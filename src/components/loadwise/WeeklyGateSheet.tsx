import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import {
  ISO_DAY_LABELS,
  formatDate,
  formatDateFull,
  isoDayOfWeek,
  parseIso,
} from "@/lib/loadwise/labels";
import { addIsoDays } from "@/lib/isoDate";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { transitionMatchesBlock } from "@/lib/loadwise/confirmedCalendar";

export function WeeklyGateSheet({
  open,
  onOpenChange,
  weekNumber,
  nextWeekStart,
  nextWeekEnd,
  allowNoMatch = true,
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
  const candidate = state.transitions[weekNumber];
  const existing = transitionMatchesBlock(state.plan, candidate, weekNumber)
    ? candidate
    : undefined;
  const plannedMatches = state.plan
    .filter(
      (day) => day.dayType === "match" && day.date >= nextWeekStart && day.date <= nextWeekEnd,
    )
    .map((day) => day.date)
    .join("|");

  const [matchDate, setMatchDate] = useState<string>("");
  const [secondMatchDate, setSecondMatchDate] = useState<string>("");
  const [noMatch, setNoMatch] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const defaults = plannedMatches ? plannedMatches.split("|") : [];
      setMatchDate(existing?.nextMatchDate ?? defaults[0] ?? "");
      setSecondMatchDate(
        existing?.nextMatchDates?.find((date) => date !== existing.nextMatchDate) ??
          defaults[1] ??
          "",
      );
      setNoMatch(allowNoMatch && Boolean(existing?.noMatchNextWeek));
      setSaving(false);
    }
  }, [open, existing, allowNoMatch, plannedMatches]);

  const weekDays = useMemo(() => {
    const days: { iso: string; short: string; label: string; day: number }[] = [];
    for (let iso = nextWeekStart; iso <= nextWeekEnd && days.length < 7; iso = addIsoDays(iso, 1)) {
      const date = parseIso(iso);
      const index = isoDayOfWeek(date) - 1;
      days.push({
        iso,
        short: ISO_DAY_LABELS[index].short,
        label: ISO_DAY_LABELS[index].label,
        day: date.getDate(),
      });
    }
    return days;
  }, [nextWeekStart, nextWeekEnd]);

  function toggleDay(iso: string) {
    const picked = [matchDate, secondMatchDate].filter(Boolean);
    const next = picked.includes(iso)
      ? picked.filter((date) => date !== iso)
      : [...picked, iso].sort().slice(-2);
    setMatchDate(next[0] ?? "");
    setSecondMatchDate(next[1] ?? "");
  }

  const canSave =
    noMatch || (matchDate !== "" && (secondMatchDate === "" || secondMatchDate > matchDate));

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
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
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać tygodnia. Spróbuj ponownie.",
      );
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
          Zaznacz dzień meczu, a ułożymy treningi wokół niego.
        </p>

        <div className="mt-1 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Kolejny tydzień: {formatDate(nextWeekStart)} – {formatDate(nextWeekEnd)}
        </div>

        {/* Dni tygodnia: jedno dotknięcie wybiera mecz, drugie dodaje drugi mecz. */}
        <fieldset className="mt-2 min-w-0" disabled={noMatch}>
          <legend className="mb-1.5 text-sm font-medium">
            Kiedy grasz mecz? Możesz zaznaczyć dwa dni.
          </legend>
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day) => {
              const selected = matchDate === day.iso || secondMatchDate === day.iso;
              return (
                <button
                  key={day.iso}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${day.label} ${day.day}`}
                  onClick={() => toggleDay(day.iso)}
                  className={`flex min-w-0 flex-col items-center rounded-xl border py-2 text-xs transition disabled:opacity-40 ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-foreground"
                  }`}
                >
                  <span className="font-medium">{day.short}</span>
                  <span className="text-base font-semibold leading-6">{day.day}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {matchDate
              ? `Mecz: ${formatDateFull(matchDate).toLocaleLowerCase("pl-PL")}${secondMatchDate ? `, drugi: ${formatDateFull(secondMatchDate).toLocaleLowerCase("pl-PL")}` : ""}. Dotknij dzień jeszcze raz, żeby go odznaczyć.`
              : "Dotknij dzień meczu. Jeśli grasz dwa mecze, dotknij też drugi dzień."}
          </p>
        </fieldset>

        {/* Tryb bez meczu — tylko poza sezonem / przejściowy */}
        {allowNoMatch && (
          <button
            type="button"
            onClick={() => setNoMatch((v) => !v)}
            className={`mt-3 flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
              noMatch
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground"
            }`}
          >
            <CheckCircle2 className={`h-4 w-4 ${noMatch ? "opacity-100" : "opacity-30"}`} />
            Nie mam meczu w tym tygodniu
          </button>
        )}

        <Button className="mt-3 w-full" disabled={!canSave || saving} onClick={handleSave}>
          {saving ? "Układamy…" : "Zapisz i ułóż kolejny tydzień"}
        </Button>

        {!canSave && (
          <p className="text-center text-xs text-muted-foreground">
            {allowNoMatch
              ? "Wybierz datę meczu albo zaznacz tydzień bez meczu."
              : "Najpierw wybierz datę kolejnego meczu."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
