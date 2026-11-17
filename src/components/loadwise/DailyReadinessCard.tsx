import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  buildReadiness,
  hasMedicalRedFlag,
  PAIN_LOCATION_OPTIONS,
  READINESS_RED_FLAG_OPTIONS,
  type ShortReadinessInput,
} from "@/lib/loadwise/readinessModel";
import type { PainLocation, Readiness } from "@/lib/loadwise/types";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import "./daily-readiness.css";

interface DailyReadinessProps {
  ownerId?: string;
  todayIso: string;
  enabled: boolean;
  value?: Readiness;
  onSave: (value: Readiness) => Promise<void>;
  onManageConsent: () => void;
}
type Scale = "sleep" | "fatigue" | "soreness" | "jointPain";
type Draft = Record<Scale, number | null> & {
  painLocation: PainLocation | "";
  painOnset: NonNullable<ShortReadinessInput["painOnset"]> | "";
  altersMovement: boolean;
  redFlags: string[];
};
const SCALES: { key: Scale; label: string; hint: string; min: number }[] = [
  { key: "sleep", label: "Jakość snu", hint: "1 — bardzo słaba · 10 — bardzo dobra", min: 1 },
  { key: "fatigue", label: "Zmęczenie", hint: "1 — brak · 10 — skrajne", min: 1 },
  { key: "soreness", label: "Ból mięśni", hint: "1 — brak · 10 — bardzo silny", min: 1 },
  {
    key: "jointPain",
    label: "Ból stawów lub urazowy",
    hint: "0 — brak · 10 — najsilniejszy",
    min: 0,
  },
];
function draftFrom(value?: Readiness): Draft {
  return {
    sleep: value?.sleep ?? null,
    fatigue: value?.fatigue ?? null,
    soreness: value?.soreness ?? null,
    jointPain: value?.jointPain ?? null,
    painLocation: value?.painLocation ?? "",
    painOnset: value?.painOnset ?? "",
    altersMovement: value?.altersMovement ?? false,
    redFlags: value?.redFlags ?? [],
  };
}
const parseSkipped = (value: unknown) => (typeof value === "boolean" ? value : undefined);

/** Health answers stay in memory until a separate, explicit save. */
export function DailyReadinessCard(props: DailyReadinessProps) {
  if (!props.enabled || !props.ownerId)
    return (
      <section className="bw-readiness-card" aria-label="Dzisiejszy check-in">
        <header>
          <h2>Jak się dziś czujesz?</h2>
          <span>Opcjonalnie</span>
        </header>
        <p>
          Check-in jest dostępny po włączeniu opcjonalnej zgody na personalizację zdrowotną. Możesz
          ją zmienić podczas edycji profilu. Trening pozostaje dostępny bez check-inu.
        </p>
        <button type="button" onClick={props.onManageConsent}>
          Edytuj profil i zgody
        </button>
      </section>
    );
  return <ReadinessEditor key={`${props.ownerId}:${props.todayIso}`} {...props} />;
}

function ReadinessEditor({ ownerId, todayIso, value, onSave }: DailyReadinessProps) {
  const skipped = useTrainingLocalState(
    trainingStorageKey("readiness-skip", ownerId, todayIso),
    false,
    parseSkipped,
  );
  const persisted = value?.date === todayIso ? value : undefined;
  const [receipt, setReceipt] = useState<{ value: Readiness; previous?: Readiness } | null>(null);
  // Prefer the confirmed write while its store render is still queued.
  const saved = receipt && persisted === receipt.previous ? receipt.value : persisted;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(persisted));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const flight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const complete =
    SCALES.every(({ key }) => draft[key] !== null) &&
    (!(draft.jointPain && draft.jointPain > 0) || draft.painLocation !== "");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || flight.current) return;
    // buildReadiness normalizes pain-dependent answers before scoring.
    const record = buildReadiness(todayIso, {
      sleep: draft.sleep!,
      fatigue: draft.fatigue!,
      soreness: draft.soreness!,
      jointPain: draft.jointPain!,
      painLocation: draft.painLocation || null,
      painOnset: draft.painOnset || null,
      altersMovement: draft.altersMovement,
      redFlags: draft.redFlags,
    });
    flight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(record);
      if (!mounted.current) return;
      setReceipt({ value: record, previous: persisted });
      skipped.clear();
      setEditing(false);
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Nie udało się zapisać check-inu. Spróbuj ponownie.",
        );
    } finally {
      flight.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <section className="bw-readiness-card" aria-label="Dzisiejszy check-in">
      <header>
        <h2>Jak się dziś czujesz?</h2>
        <span>Opcjonalnie</span>
      </header>
      <p>Zapis dotyczy dzisiaj. Nie zmienia automatycznie planu.</p>
      {!editing ? (
        <>
          {saved ? (
            <>
              <p className="bw-readiness-saved" role="status">
                Dzisiejszy check-in zapisany
              </p>
              <dl className="bw-readiness-summary">
                {SCALES.map(({ key, label }) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{saved[key]}/10</dd>
                  </div>
                ))}
                {saved.jointPain > 0 && (
                  <div>
                    <dt>Miejsce bólu</dt>
                    <dd>
                      {PAIN_LOCATION_OPTIONS.find((option) => option.value === saved.painLocation)
                        ?.label ?? "Inny obszar"}
                    </dd>
                  </div>
                )}
              </dl>
              {hasMedicalRedFlag(saved) ? (
                <p className="bw-readiness-warning" role="alert">
                  Nie rozpoczynaj treningu. Zgłoszone objawy wymagają pilnego kontaktu z lekarzem. W
                  nagłym zagrożeniu zadzwoń pod 112.
                </p>
              ) : saved.jointPain > 0 || saved.altersMovement ? (
                <p className="bw-readiness-warning" role="status">
                  Zgłoszony ból wstrzymuje nowy trening własny. Nie wykonuj ruchu, który nasila ból.
                </p>
              ) : saved.overall <= 4 ? (
                <p className="bw-readiness-warning" role="status">
                  Dzisiejsze odpowiedzi wskazują potrzebę lżejszego treningu. Sprawdź plan przed
                  rozpoczęciem sesji.
                </p>
              ) : null}
            </>
          ) : skipped.value ? (
            <p>Check-in pominięty na dziś. Możesz do niego wrócić.</p>
          ) : (
            <p>Krótki check-in snu, zmęczenia i bólu. Możesz też przejść od razu do sesji.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setDraft(draftFrom(saved));
              setError(null);
              setEditing(true);
            }}
          >
            {saved ? "Edytuj check-in" : "Wypełnij check-in"}
          </button>
          {!saved && !skipped.value && (
            <button type="button" onClick={() => skipped.setValue(true)}>
              Pomiń na dziś
            </button>
          )}
        </>
      ) : (
        <form
          onSubmit={(event) => void save(event)}
          aria-label="Check-in samopoczucia"
          aria-busy={saving}
        >
          <fieldset disabled={saving}>
            <legend className="sr-only">Dzisiejsze samopoczucie</legend>
            {SCALES.map(({ key, label, hint, min }) => (
              <label className="bw-readiness-scale" key={key}>
                <span>
                  {label}
                  <small>{hint}</small>
                </span>
                <select
                  aria-label={label}
                  required
                  value={draft[key] ?? ""}
                  onChange={(event) =>
                    setDraft((previous) => {
                      const next = event.target.value === "" ? null : Number(event.target.value);
                      const updated = { ...previous, [key]: next };
                      // Pain details belong only to a reported pain; clear them with the form
                      // state, so a hidden answer cannot change the saved score later.
                      return key === "jointPain" && next === 0
                        ? { ...updated, painLocation: "", painOnset: "", altersMovement: false }
                        : updated;
                    })
                  }
                >
                  <option value="" disabled>
                    Wybierz
                  </option>
                  {Array.from({ length: 11 - min }, (_, index) => min + index).map((number) => (
                    <option value={number} key={number}>
                      {number}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {draft.jointPain !== null && draft.jointPain > 0 && (
              <div className="bw-readiness-pain">
                <label>
                  Miejsce bólu
                  <select
                    aria-label="Miejsce bólu"
                    required
                    value={draft.painLocation}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        painLocation: event.target.value as PainLocation,
                      }))
                    }
                  >
                    <option value="" disabled>
                      Wybierz miejsce
                    </option>
                    {PAIN_LOCATION_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Od kiedy czujesz ból?
                  <select
                    aria-label="Od kiedy czujesz ból?"
                    value={draft.painOnset}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        painOnset: event.target.value as Draft["painOnset"],
                      }))
                    }
                  >
                    <option value="">Nie wiem / nie podaję</option>
                    <option value="today">Od dzisiaj</option>
                    <option value="1_7_days">Od 1–7 dni</option>
                    <option value="over_7_days">Ponad 7 dni</option>
                  </select>
                </label>
                <label className="bw-readiness-check">
                  <input
                    type="checkbox"
                    checked={draft.altersMovement}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        altersMovement: event.target.checked,
                      }))
                    }
                  />
                  Ból zmienia mój ruch
                </label>
              </div>
            )}
            <details className="bw-readiness-symptoms">
              <summary>Objawy alarmowe, jeśli występują</summary>
              <p>Zaznacz objawy niezależnie od odpowiedzi o bólu stawów.</p>
              {READINESS_RED_FLAG_OPTIONS.map(({ value: flag, label }) => (
                <label className="bw-readiness-check" key={flag}>
                  <input
                    type="checkbox"
                    checked={draft.redFlags.includes(flag)}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        redFlags: event.target.checked
                          ? [...previous.redFlags, flag]
                          : previous.redFlags.filter((item) => item !== flag),
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </details>
            {hasMedicalRedFlag(draft) && (
              <p className="bw-readiness-warning" role="alert">
                Nie rozpoczynaj treningu. Skontaktuj się pilnie z lekarzem; w nagłym zagrożeniu
                zadzwoń pod 112.
              </p>
            )}
          </fieldset>
          {error && (
            <p className="bw-readiness-warning" role="alert">
              {error}
            </p>
          )}
          <div className="bw-readiness-actions">
            <button type="submit" disabled={!complete || saving}>
              {saving ? "Zapisywanie…" : "Zapisz check-in"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (!saved) skipped.setValue(true);
                setEditing(false);
                setDraft(draftFrom(saved));
                setError(null);
              }}
            >
              {saved ? "Anuluj" : "Pomiń na dziś"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
