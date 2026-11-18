import { useState } from "react";
import { validateProfile } from "./engine";
import type { Equipment, Position, Profile } from "./engine";

const DAYS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
const POSITIONS: Array<[Position, string]> = [
  ["bramkarz", "Bramkarz"], ["obronca", "Obrońca"], ["pomocnik", "Pomocnik"],
  ["skrzydlowy", "Skrzydłowy"], ["napastnik", "Napastnik"],
];
const EQUIPMENT: Array<[Equipment, string]> = [
  ["gym", "Pełna siłownia"], ["bodyweight", "Masa ciała"], ["field", "Bieżnia / boisko"],
];

function Chips<T extends string | number>({
  options, value, onToggle,
}: { options: Array<[T, string]>; value: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, t]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onToggle(v)}
          className={`rounded-full px-3.5 py-1.5 text-sm transition ${value.includes(v) ? "bg-green-soft font-medium text-green-ink" : "bg-canvas text-muted"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-xs text-muted">{label}</div>
      {children}
    </div>
  );
}

const input = "w-full rounded-xl bg-canvas px-3 py-2.5 text-sm outline-none";

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [age, setAge] = useState("");
  const [years, setYears] = useState("");
  const [weight, setWeight] = useState("");
  const [position, setPosition] = useState<Position | undefined>();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [club, setClub] = useState<number[]>([]);
  const [matches, setMatches] = useState<number[]>([]);
  const [limited, setLimited] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const submit = () => {
    const p: Partial<Profile> = {
      age: Number(age), strengthYears: years === "" ? undefined : Number(years),
      weightKg: Number(weight), position, equipment,
      clubWeekdays: club, matchWeekdays: matches, limitedGymAccess: limited,
    };
    const e = validateProfile(p);
    setErrors(e);
    if (e.length === 0) onDone(p as Profile);
  };

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-14">
      <h1 className="text-3xl font-semibold tracking-tight">Zaczynamy</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Kilka pytań, żeby dopasować plan.</p>
      <section className="rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <Field label="Wiek"><input className={input} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></Field>
        <Field label="Staż treningu siłowego (lata)"><input className={input} inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} /></Field>
        <Field label="Masa ciała (kg)"><input className={input} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
        <Field label="Pozycja">
          <Chips options={POSITIONS} value={position ? [position] : []} onToggle={(v) => setPosition(v)} />
        </Field>
        <Field label="Dostępny sprzęt">
          <Chips options={EQUIPMENT} value={equipment} onToggle={(v) => setEquipment(toggle(equipment, v))} />
        </Field>
        <Field label="Dni treningów klubowych">
          <Chips options={DAYS.map((d, i) => [i, d] as [number, string])} value={club} onToggle={(v) => setClub(toggle(club, v))} />
        </Field>
        <Field label="Dzień meczu (maks. dwa)">
          <Chips options={DAYS.map((d, i) => [i, d] as [number, string])} value={matches} onToggle={(v) => setMatches(toggle(matches, v))} />
        </Field>
        <button
          type="button"
          onClick={() => setLimited(!limited)}
          className={`mb-1 w-full rounded-xl py-2 text-sm ${limited ? "bg-yellow-soft font-medium text-yellow-ink" : "bg-canvas text-muted"}`}
        >
          Mam mało dni na siłownię
        </button>
      </section>
      {errors.length > 0 && (
        <ul className="mt-4 rounded-2xl bg-red-soft p-3 text-sm text-red-ink">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <button onClick={submit} className="mt-5 w-full rounded-2xl bg-ink py-3 text-sm font-medium text-white">
        Zacznij
      </button>
    </main>
  );
}
