import type { IQEvaluation, IQRating } from "@/lib/football-iq/types";
import { AlertTriangle, CheckCircle2, Shield, XCircle } from "lucide-react";

const STYLES: Record<
  IQRating,
  { icon: typeof CheckCircle2; chip: string }
> = {
  optimal: { icon: CheckCircle2, chip: "bg-primary text-primary-foreground" },
  safe: { icon: Shield, chip: "bg-accent text-accent-foreground" },
  risky: {
    icon: AlertTriangle,
    chip: "bg-secondary text-secondary-foreground",
  },
  wrong: { icon: XCircle, chip: "bg-destructive/10 text-destructive" },
};

export function DecisionFeedback({
  evaluation,
  onNext,
}: {
  evaluation: IQEvaluation;
  onNext: () => void;
}) {
  const { icon: Icon, chip } = STYLES[evaluation.rating];
  return (
    <div className="space-y-3">
      <div className="soft-card p-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${chip}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {evaluation.label}
        </span>
        <p className="mt-3 text-sm leading-relaxed text-foreground">
          {evaluation.explanation}
        </p>
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Możliwa konsekwencja
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {evaluation.consequence}
          </p>
        </div>
      </div>

      <div className="soft-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Najlepsze rozwiązanie
        </div>
        <p className="mt-1 text-sm font-medium text-foreground">
          {evaluation.best.label}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Zaznaczone na boisku przerywaną linią. To nie jest jedyna dopuszczalna
          decyzja — liczy się kontekst sytuacji.
        </p>
      </div>

      <button
        onClick={onNext}
        className="soft-card flex w-full items-center justify-center gap-2 bg-primary p-4 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
      >
        Następna sytuacja
      </button>
    </div>
  );
}
