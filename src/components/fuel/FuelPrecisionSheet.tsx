import { useEffect, useState } from "react";
import { LockKeyhole, Scale, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FuelPrecisionSheet({
  open,
  age,
  enabled,
  currentWeightKg,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  age: number;
  enabled: boolean;
  currentWeightKg: number | null;
  saving: boolean;
  onClose: () => void;
  onSave: (enabled: boolean, weightKg: number | null) => Promise<void>;
}) {
  const [weight, setWeight] = useState(currentWeightKg?.toString() ?? "");
  const [consent, setConsent] = useState(enabled);

  useEffect(() => {
    if (!open) return;
    setWeight(currentWeightKg?.toString() ?? "");
    setConsent(enabled);
  }, [open, enabled, currentWeightKg]);

  if (!open) return null;
  const parsedWeight = Number(weight.replace(",", "."));
  const validWeight = Number.isFinite(parsedWeight) && parsedWeight >= 25 && parsedWeight <= 250;

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-foreground/20 backdrop-blur-[2px]">
      <button className="absolute inset-0" aria-label="Zamknij" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fuel-precision-title"
        className="relative mx-auto w-full max-w-[30rem] rounded-t-[1.75rem] border-t border-border bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-2xl"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-border" />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              <Scale className="h-4 w-4" /> Fuel Precision
            </div>
            <h2 id="fuel-precision-title" className="mt-2 text-xl font-medium tracking-[-0.03em]">
              Dokładniejszy zakres, tylko jeśli chcesz
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Fuel działa bez tych danych. Masa pomaga oszacować zakres węglowodanów, ale nadal
              pokazujemy przedział — nie pozornie dokładną liczbę.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-muted/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Wiek z profilu
            </div>
            <div className="mt-1 text-lg font-medium">{age} lat</div>
          </div>
          <div className="rounded-2xl bg-muted/60 p-3">
            <Label htmlFor="fuel-weight" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Masa ciała
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="fuel-weight"
                inputMode="decimal"
                type="number"
                min={25}
                max={250}
                step={0.1}
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                className="h-9 border-0 bg-transparent p-0 text-lg shadow-none focus-visible:ring-0"
                placeholder="np. 72"
              />
              <span className="text-sm text-muted-foreground">kg</span>
            </div>
          </div>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Nie pytamy o wzrost: nie poprawia rekomendacji posiłku przed treningiem, więc go nie
          zbieramy.
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background/50 p-3.5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" /> Zgadzam się na Fuel Precision
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              BallWise użyje wieku i masy tylko do zakresów paliwa. Zgodę można wycofać; masa
              zostanie wtedy usunięta.
            </span>
          </span>
        </label>

        <div className="mt-4 space-y-2">
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={saving || !consent || !validWeight}
            onClick={() => onSave(true, parsedWeight)}
          >
            {saving ? "Zapisuję…" : enabled ? "Zapisz zakres" : "Włącz dokładniejszy zakres"}
          </Button>
          {enabled ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              disabled={saving}
              onClick={() => onSave(false, null)}
            >
              Wyłącz i usuń masę
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
              Nie teraz — użyj zakresu ogólnego
            </Button>
          )}
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" /> Osobna, odwracalna zgoda
        </div>
      </section>
    </div>
  );
}
