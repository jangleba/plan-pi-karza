import { useState } from "react";
import { useGymEvidence } from "@/lib/loadwise/useGymEvidence";
import { equipmentFor, validGymEquipment, type GymEquipment } from "@/lib/loadwise/gymEvidence";
import { parseTrainingNumber } from "@/lib/loadwise/trainingDetails";

export function GymEquipmentEditor({
  exerciseId,
  disabled = false,
}: {
  exerciseId?: string;
  disabled?: boolean;
}) {
  const evidence = useGymEvidence();
  const [open, setOpen] = useState(false);
  if (!exerciseId || !evidence.available) return null;
  const current = equipmentFor(evidence.records, exerciseId);
  return (
    <div className="my-2 text-sm">
      <button
        type="button"
        className="py-2 underline"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        {current ? `Sprzęt: ${current.label}` : "Ustaw dostępne ciężary"}
      </button>
      {open && (
        <EquipmentForm
          key={current?.id ?? exerciseId}
          exerciseId={exerciseId}
          equipment={current}
          onDone={() => setOpen(false)}
          disabled={disabled}
        />
      )}
    </div>
  );
}
function EquipmentForm({
  exerciseId,
  equipment,
  onDone,
  disabled,
}: {
  exerciseId: string;
  equipment?: GymEquipment;
  onDone: () => void;
  disabled: boolean;
}) {
  const evidence = useGymEvidence();
  const [label, setLabel] = useState(equipment?.label ?? "");
  const [convention, setConvention] = useState(equipment?.convention ?? "");
  const [step, setStep] = useState(String(equipment?.incrementKg ?? ""));
  const [weights, setWeights] = useState(equipment?.availableWeightsKg?.join("; ") ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function save() {
    const list = weights.trim()
      ? weights.split(/[;\n]+/).map((s) => parseTrainingNumber(s.trim()))
      : undefined;
    const increment = parseTrainingNumber(step);
    const data: GymEquipment = {
      kind: "equipment",
      version: 1,
      exerciseId,
      id:
        equipment && equipment.label === label.trim() && equipment.convention === convention
          ? equipment.id
          : crypto.randomUUID(),
      label: label.trim(),
      convention: convention as GymEquipment["convention"],
      ...(list
        ? { availableWeightsKg: list as number[] }
        : increment !== null
          ? { incrementKg: increment }
          : {}),
    };
    if (!validGymEquipment(data)) {
      setError(
        "Podaj nazwę stanowiska, sposób liczenia kg i rzeczywiście dostępny krok lub listę ciężarów.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await evidence.save(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie zapisano sprzętu.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy || disabled} className="space-y-3 rounded-xl border p-3">
      <legend>Ciężary dla tego ćwiczenia</legend>
      <label className="block">
        Stanowisko / sprzęt
        <input
          className="block w-full rounded-lg border p-2"
          value={label}
          maxLength={160}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Np. hantle — klub"
        />
      </label>
      <label className="block">
        Co oznacza wpis w kg?
        <select
          className="block w-full rounded-lg border p-2"
          value={convention}
          onChange={(e) => setConvention(e.target.value)}
        >
          <option value="">Wybierz</option>
          <option value="total">Cały ciężar, np. sztanga z talerzami</option>
          <option value="per_hand">Jedna hantla / jedna ręka</option>
          <option value="machine">Wskazanie tej konkretnej maszyny</option>
        </select>
      </label>
      <label className="block">
        Najmniejszy dostępny przyrost kg
        <input
          className="block w-full rounded-lg border p-2"
          inputMode="decimal"
          value={step}
          onChange={(e) => setStep(e.target.value)}
          placeholder="Np. 0,5"
        />
      </label>
      <label className="block">
        Lub dokładna lista ciężarów (pierwszeństwo przed krokiem)
        <input
          className="block w-full rounded-lg border p-2"
          value={weights}
          onChange={(e) => setWeights(e.target.value)}
          placeholder="Np. 10; 12,5; 15; 17,5"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Używaj tej samej konwencji. Zmiana stanowiska lub sposobu liczenia kg rozpoczyna nową bazę
        porównania.
      </p>
      <button type="button" className="min-h-11 font-medium" onClick={() => void save()}>
        Zapisz sprzęt
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
