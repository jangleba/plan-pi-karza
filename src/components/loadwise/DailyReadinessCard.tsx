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
import { readinessImpact } from "@/lib/loadwise/readinessImpact";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { SessionDay } from "@/lib/loadwise/types";
import "./daily-readiness.css";

interface DailyReadinessProps {
  ownerId?: string;
  todayIso: string;
  enabled: boolean;
  value?: Readiness;
  /** Today's own session, to show the real effect of the answers on it. */
  todaySession?: SessionDay | null;
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

function ReadinessEditor({ ownerId, todayIso, value, todaySession, onSave }: DailyReadinessProps) {
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
  function setScale(key: Scale, next: number) {
    setDraft((previous) => {
      const updated = { ...previous, [key]: next };
      // Pain details belong only to a reported pain; clear them with the form state, so a
      // hidden answer cannot change the saved score later.
      return key === "jointPain" && next === 0
        ? { ...updated, painLocation: "" as const, painOnset: "" as const, altersMovement: false }
        : updated;
    });
  }
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
  const impact = saved ? readinessImpact(saved, todaySession) : null;
  const close = () => {
    if (saving) return;
    if (!saved) skipped.setValue(true);
    setEditing(false);
    setDraft(draftFrom(saved));
    setError(null);
  };
  return (
    <section className="bw-readiness-card" aria-label="Dzisiejszy check-in" data-compact>
      <div className="bw-readiness-row">
        <div>
          <h2>Samopoczucie</h2>
          <p>Krótki check-in przed treningiem</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(draftFrom(saved));
            setError(null);
            setEditing(true);
          }}
        >
          {saved ? "Edytuj" : "Uzupełnij"}
        </button>
      </div>
      {saved && impact ? (
        <div className="bw-readiness-result" data-kind={impact.kind}>
          <p className="bw-readiness-saved" role="status">
            Check-in zapisany
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
          <p
            className={impact.kind === "none" ? undefined : "bw-readiness-warning"}
            role={impact.kind === "stop" ? "alert" : "status"}
            aria-label="Wpływ na dzisiejszy trening"
          >
            {impact.text}
          </p>
        </div>
      ) : skipped.value ? (
        <p>Check-in pominięty na dziś. Możesz do niego wrócić.</p>
      ) : null}
      <Drawer
        open={editing}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        initialDetent="large"
      >
        <DrawerContent aria-describedby={undefined} className="bw-readiness-sheet">
          <DrawerTitle>Samopoczucie</DrawerTitle>
          <form
            onSubmit={(event) => void save(event)}
            aria-label="Check-in samopoczucia"
            aria-busy={saving}
            className="bw-readiness-card"
          >
            <p>Zapis dotyczy dzisiaj. Nie zmienia planu poza pokazanym wpływem po zapisie.</p>
            <fieldset disabled={saving}>
              <legend className="sr-only">Dzisiejsze samopoczucie</legend>
              {SCALES.map(({ key, label, hint, min }) => (
                <fieldset className="bw-scale" key={key} aria-label={label}>
                  <legend>
                    {label}
                    <small>{hint}</small>
                  </legend>
                  <div className="bw-scale-options" data-count={11 - min}>
                    {Array.from({ length: 11 - min }, (_, index) => min + index).map((number) => (
                      <label key={number}>
                        <input
                          type="radio"
                          name={`readiness-${key}`}
                          value={number}
                          checked={draft[key] === number}
                          onChange={() => setScale(key, number)}
                        />
                        <span>{number}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
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
              <button type="button" disabled={saving} onClick={close}>
                {saved ? "Anuluj" : "Pomiń na dziś"}
              </button>
            </div>
          </form>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
