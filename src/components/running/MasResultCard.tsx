import { formatDistance, formatPace } from "@/lib/running/metrics";
import { masResultSummary, masTrainingPaces } from "@/lib/running/masZones";

const kmh = (v: number) => v.toLocaleString("pl-PL", { maximumFractionDigits: 1 });

/**
 * The real result of the 5-minute test and every training pace the plan derives from it.
 * The paces are computed automatically; the plan itself changes only after the athlete accepts
 * the proposal for future runs.
 */
export function MasResultCard({
  distanceM,
  masKmh,
  saved,
}: {
  distanceM: number;
  masKmh: number;
  saved: boolean;
}) {
  const result = masResultSummary(distanceM, masKmh);
  const paces = masTrainingPaces(masKmh);
  if (!paces) return null;
  return (
    <section className="space-y-3 rounded-2xl bg-muted/60 p-3" aria-label="Wynik testu MAS">
      <h3 className="text-sm font-semibold">Wynik testu 5 min</h3>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold tabular-nums" aria-label="Dystans w 5 minut">
            {formatDistance(result.distanceM)}
          </div>
          <div className="text-[11px] text-muted-foreground">w 5:00</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums" aria-label="MAS">
            {kmh(result.masKmh)} km/h
          </div>
          <div className="text-[11px] text-muted-foreground">MAS</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums" aria-label="Tempo MAS">
            {formatPace(result.paceSecPerKm)}
          </div>
          <div className="text-[11px] text-muted-foreground">tempo MAS</div>
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold">Twoje tempa treningowe</h4>
        <ul className="mt-2 space-y-2" aria-label="Tempa treningowe z MAS">
          {paces.map((zone) => (
            <li key={zone.id} className="rounded-xl bg-background/70 px-3 py-2 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <strong>{zone.label}</strong>
                <span className="font-semibold tabular-nums" data-zone={zone.id}>
                  {zone.pace.label}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between gap-2 text-muted-foreground">
                <span>
                  {zone.energy} · {zone.percent[0]}–{zone.percent[1]}% MAS
                </span>
                <span className="tabular-nums">
                  {kmh(zone.speedKmh[0])}–{kmh(zone.speedKmh[1])} km/h
                </span>
              </div>
              <div className="text-muted-foreground">Przykład: {zone.example}</div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Tempa wyliczamy automatycznie z dystansu przebiegniętego w 5 minut.{" "}
        {saved
          ? "Zmiany przyszłych biegów czekają jako propozycja do zatwierdzenia; plan nie zmienia się sam."
          : "Po zapisie zobaczysz propozycję zmian przyszłych biegów do zatwierdzenia; plan nie zmienia się sam."}{" "}
        To terenowe oszacowanie, nie pomiar VO₂max ani progów w laboratorium.
      </p>
    </section>
  );
}
