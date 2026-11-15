import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { FuelFoodSafety } from "@/lib/fuel/practical";

const STATUS: ReadonlyArray<{ value: FuelFoodSafety["status"]; label: string }> = [
  { value: "unconfirmed", label: "Nie chcę teraz odpowiadać" },
  { value: "confirmed_none", label: "Nie mam zgłoszonych alergii" },
  { value: "has_allergies", label: "Mam alergie" },
];
const toList = (text: string) =>
  text
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 40);

/**
 * Three separate lists: allergies and intolerances (health data, need the health-data consent)
 * and ordinary exclusions (a preference). Not a medical questionnaire.
 */
export function FoodSafetySheet({
  open,
  value,
  healthConsent,
  onSave,
  onClose,
}: {
  open: boolean;
  value: FuelFoodSafety;
  healthConsent: boolean;
  onSave(value: FuelFoodSafety): Promise<void>;
  onClose(): void;
}) {
  const [status, setStatus] = useState(value.status);
  const [allergies, setAllergies] = useState("");
  const [intolerances, setIntolerances] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setStatus(value.status);
    setAllergies(value.allergies.join(", "));
    setIntolerances(value.intolerances.join(", "));
    setExclusions(value.exclusions.join(", "));
    setError("");
  }, [open, value]);
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="fuel-sheet fuel-safety-sheet">
        <SheetTitle>Alergie i wykluczenia</SheetTitle>
        <SheetDescription>
          Fuel pominie te produkty w propozycjach. Brak wykrytego konfliktu nie gwarantuje
          bezpieczeństwa; niepełny skład produktu oznacza niepewność.
        </SheetDescription>
        <form
          className="fuel-safety-body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onSave({
                status,
                allergies: status === "has_allergies" ? toList(allergies) : [],
                intolerances: healthConsent ? toList(intolerances) : [],
                exclusions: toList(exclusions),
              });
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Nie zapisano.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {healthConsent ? (
            <>
              <fieldset>
                <legend>Alergie pokarmowe</legend>
                {STATUS.map((s) => (
                  <label key={s.value} className="fuel-safety-option">
                    <input
                      type="radio"
                      name="fuel-allergy-status"
                      checked={status === s.value}
                      onChange={() => setStatus(s.value)}
                    />
                    {s.label}
                  </label>
                ))}
              </fieldset>
              {status === "has_allergies" && (
                <label>
                  Na co? (oddziel przecinkami)
                  <input
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="np. orzechy, sezam"
                  />
                </label>
              )}
              <label>
                Nietolerancje (opcjonalnie)
                <input
                  value={intolerances}
                  onChange={(e) => setIntolerances(e.target.value)}
                  placeholder="np. laktoza"
                />
              </label>
            </>
          ) : (
            <p className="fuel-day-fine">
              Alergie i nietolerancje to dane o zdrowiu. Zapiszesz je po włączeniu zgody na dane o
              zdrowiu w Profilu. Do tego czasu sprawdzaj skład każdej propozycji.
            </p>
          )}
          <label>
            Czego nie jem (preferencje, bez zgody zdrowotnej)
            <input
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              placeholder="np. wieprzowina, grzyby"
            />
          </label>
          {error && (
            <p className="bw-inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="fuel-primary" disabled={busy}>
            Zapisz
          </button>
          <button type="button" className="fuel-fit-back" onClick={onClose}>
            Wróć
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
