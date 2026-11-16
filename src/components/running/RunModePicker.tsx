import { MapPin, Timer } from "lucide-react";
import "./run-tools.css";

export function RunModePicker({
  mode,
  busy,
  onChange,
}: {
  mode: "gps" | "timer";
  busy: boolean;
  onChange: (mode: "gps" | "timer") => void;
}) {
  return (
    <section className="bw-run-measurement" aria-label="Pomiar biegu">
      <div className="bw-run-mode" role="group" aria-label="Sposób pomiaru biegu">
        <button
          type="button"
          disabled={busy}
          aria-pressed={mode === "gps"}
          onClick={() => onChange("gps")}
        >
          <MapPin size={16} aria-hidden="true" />
          <span>Z GPS</span>
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={mode === "timer"}
          onClick={() => onChange("timer")}
        >
          <Timer size={16} aria-hidden="true" />
          <span>Bez GPS</span>
        </button>
      </div>
      <p className="bw-run-measurement-note">
        {mode === "gps"
          ? "Czas, dystans i tempo na trasie."
          : "Licznik odcinków i przerw, bez pomiaru dystansu."}
      </p>
    </section>
  );
}
