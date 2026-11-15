import { useState } from "react";
import { useGymEvidence } from "@/lib/loadwise/useGymEvidence";
import { validGymRecordData } from "@/lib/loadwise/gymEvidence";
import type { GymBandSetup } from "@/lib/loadwise/engineV2/gymProgression";
import { parseTrainingNumber } from "@/lib/loadwise/trainingDetails";
import type { Profile } from "@/lib/loadwise/types";
import { eligibleExercise } from "@/lib/loadwise/engineV2/exercises";
const exercises = [
  ["gym_cmj_resisted", "CMJ — opór od dołu"],
  ["gym_cmj_assisted", "CMJ — asysta z góry"],
  ["gym_fast_band_curl", "Szybkie uginanie z gumą"],
] as const;

export function GymBandSetupPanel({
  date,
  onChanged,
  profile,
}: {
  date: string;
  onChanged?: () => void;
  profile?: Profile;
}) {
  const evidence = useGymEvidence();
  const allowed = profile ? exercises.filter(([id]) => eligibleExercise(id, profile)) : exercises;
  const [selectedId, setId] = useState<string>(exercises[0][0]);
  const id = allowed.some(([id]) => id === selectedId) ? selectedId : allowed[0]?.[0];
  const [band, setBand] = useState(""),
    [station, setStation] = useState("");
  const [values, setValues] = useState(["", "", "", "", "", ""]);
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  if (!evidence.available || !id) return null;
  const options = evidence.records.flatMap((r) =>
    r.payload.kind === "band_setup" && r.payload.setup.exerciseId === id ? [r.payload.setup] : [],
  );
  const selected = evidence.records.find((r) => r.record_key === `band_selection:${id}`)?.payload;
  async function select(setupId: string | null) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await evidence.save({ kind: "band_selection", version: 1, exerciseId: id, setupId });
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie zapisano ustawienia.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!id) return;
    const setup: GymBandSetup = {
      id: crypto.randomUUID(),
      exerciseId: id,
      bandId: band.trim(),
      stationId: station.trim(),
      direction: id === "gym_cmj_assisted" ? "assistance" : "resistance",
      measuredOn: date,
      positions: [values[0].trim(), values[3].trim()],
      lengthsCm: [parseTrainingNumber(values[1])!, parseTrainingNumber(values[4])!],
      forceNewtons: [parseTrainingNumber(values[2])!, parseTrainingNumber(values[5])!],
    };
    const data = { kind: "band_setup" as const, version: 1 as const, setup };
    if (!confirmed || !validGymRecordData(data)) {
      setError(
        "Podaj dwa rzeczywiście zmierzone ustawienia: opis pozycji, długość i siłę w N. Potwierdź pomiar.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await evidence.save(data);
      setBand("");
      setStation("");
      setValues(["", "", "", "", "", ""]);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie zapisano pomiaru.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="my-4 rounded-xl border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2">
        Ustawienia gum · opcjonalne pomiary
      </summary>
      <p className="mb-3 text-xs text-muted-foreground">
        Bez pomiaru możesz trenować i zapisywać jakość. Automatyczna sugestia większego oporu wymaga
        porównywalnych sił i wyników; kolor gumy nie określa kilogramów.
      </p>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block">
          Ćwiczenie
          <select
            className="block w-full rounded-lg border p-2"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setError(null);
            }}
          >
            {allowed.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Wybrane stanowisko dla przyszłego planu
          <select
            className="block w-full rounded-lg border p-2"
            value={selected?.kind === "band_selection" ? (selected.setupId ?? "") : ""}
            onChange={(e) => void select(e.target.value || null)}
          >
            <option value="">Bez skalibrowanego stanowiska</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.bandId} · {s.stationId} · {s.forceNewtons.join(" / ")} N · {s.measuredOn}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>Dodaj rzeczywisty pomiar gumy</summary>
          <label className="mt-2 block">
            Identyfikator konkretnej gumy
            <input
              className="block w-full rounded-lg border p-2"
              maxLength={160}
              value={band}
              onChange={(e) => setBand(e.target.value)}
            />
          </label>
          <label className="block">
            Stanowisko i mocowania (ta sama geometria)
            <input
              className="block w-full rounded-lg border p-2"
              maxLength={160}
              value={station}
              onChange={(e) => setStation(e.target.value)}
            />
          </label>
          {[0, 3].map((offset, index) => (
            <fieldset key={offset} className="mt-2 space-y-2 rounded-lg border p-2">
              <legend>Pozycja ruchu {index + 1}</legend>
              {["Opis pozycji", "Długość gumy w cm", "Zmierzona siła w N"].map((label, j) => (
                <label className="block" key={label}>
                  {label}
                  <input
                    className="block w-full rounded-lg border p-2"
                    maxLength={160}
                    inputMode={j ? "decimal" : "text"}
                    value={values[offset + j]}
                    onChange={(e) =>
                      setValues((v) => v.map((s, i) => (i === offset + j ? e.target.value : s)))
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <label className="my-2 flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            To dzisiejszy pomiar siły, nie wartość oszacowana z koloru gumy.
          </label>
          <button type="button" className="min-h-11 font-medium" onClick={() => void save()}>
            Zapisz kalibrację
          </button>
        </details>
      </fieldset>
      <p className="mt-2 text-xs text-muted-foreground">
        Wybór nie zmienia rozpoczętego treningu. Po zmianie sprawdź i zatwierdź nowy podgląd
        przyszłych sesji. Każde stanowisko zachowuje własny zapis.
      </p>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
