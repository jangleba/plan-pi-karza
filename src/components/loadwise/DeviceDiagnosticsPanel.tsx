import { useState } from "react";
import { deviceCapabilityReport } from "@/lib/running/deviceCapabilities";
import { deliverExportFile } from "@/lib/loadwise/deliverExportFile";
export function DeviceDiagnosticsPanel() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const report = await deviceCapabilityReport();
      await deliverExportFile("ballwise-urzadzenie.json", JSON.stringify(report, null, 2));
    } catch {
      setError("Nie udało się przygotować raportu. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="soft-card space-y-3 p-4">
      <h2 className="font-semibold">Raport urządzenia</h2>
      <p className="text-xs text-muted-foreground">
        Informacje o dostępnych funkcjach pomagają sprawdzić problemy z GPS i filmami. Raport nie
        zawiera profilu ani lokalizacji i jest udostępniany dopiero po Twoim wyborze.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void download()}
        className="min-h-11 w-full rounded-xl border px-3"
      >
        {busy ? "Przygotowuję…" : "Pobierz raport urządzenia"}
      </button>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
