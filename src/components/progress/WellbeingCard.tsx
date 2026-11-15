import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { WellbeingReport } from "@/lib/progress/wellbeing";

const WORD = { better: "lepiej", worse: "gorzej", stable: "bez zmian" } as const;

/** Own trends from the daily check-in. Only with the health-data consent; no norms, no diagnosis. */
export function WellbeingCard({ report }: { report: WellbeingReport }) {
  if (report.entries === 0) return null;
  return (
    <section className="soft-card p-4" aria-labelledby="wellbeing-title">
      <h2 id="wellbeing-title" className="text-sm font-semibold">
        Samopoczucie · {report.days} dni
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Twoje wpisy w porównaniu z poprzednimi {report.days} dniami. Skala 1–10.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {report.trends.map((t) => (
          <div key={t.key} className="rounded-lg bg-muted/50 p-2.5">
            <dt className="text-xs text-muted-foreground">{t.label}</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              {t.current ?? "—"}
              {t.direction && (
                <span className="flex items-center gap-0.5 text-xs font-normal text-muted-foreground">
                  {t.direction === "stable" ? (
                    <Minus size={13} aria-hidden="true" />
                  ) : (t.direction === "better") === (t.key === "sleep" || t.key === "energy") ? (
                    <ArrowUpRight size={13} aria-hidden="true" />
                  ) : (
                    <ArrowDownRight size={13} aria-hidden="true" />
                  )}
                  {WORD[t.direction]}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {report.enough
          ? report.painDays
            ? `Ból zgłoszony w ${report.painDays} z ${report.entries} wpisów. Plan dopasowuje obciążenie w dniu zgłoszenia; przy utrzymującym się bólu skonsultuj się ze specjalistą.`
            : "Plan dopasowuje obciążenie do dziennego wpisu."
          : "Za mało wpisów, aby pokazać trend — wystarczą 3 w tygodniu."}
      </p>
    </section>
  );
}
