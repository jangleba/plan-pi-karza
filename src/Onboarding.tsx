import { useState, type ReactNode } from "react";
import { LEAGUES, MIN_AGE } from "./engine";
import type { Equipment, League, Position, Profile, Season, SeasonGoal } from "./engine";
import { Sketch } from "./Sketch";

const DAYS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
const POSITIONS: Array<[Position, string]> = [
  ["bramkarz", "Bramkarz"], ["obronca", "Obrońca"], ["pomocnik", "Pomocnik"], ["skrzydlowy", "Skrzydłowy"], ["napastnik", "Napastnik"],
];
const SEASONS: Array<[Season, string, string]> = [
  ["preseason", "Okres przygotowawczy", "Budujemy formę, sparingi opcjonalne"],
  ["inseason", "W trakcie sezonu", "Plan wokół meczu"],
  ["offseason", "Przerwa", "Utrzymanie formy, lżej"],
];
const GOALS: Array<[SeasonGoal, string]> = [
  ["speed", "Szybkość"], ["strength", "Siła"], ["endurance", "Wydolność"], ["return", "Powrót po przerwie"],
];
const EQUIPMENT: Array<[Equipment, string]> = [["gym", "Siłownia"], ["bodyweight", "Masa ciała"], ["field", "Boisko / bieżnia"]];

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Chips<T extends string | number>({ options, value, onToggle }: { options: Array<[T, string]>; value: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, t]) => (
        <button key={String(v)} type="button" onClick={() => onToggle(v)}
          className={`rounded-full px-4 py-2.5 text-sm ${value.includes(v) ? "bg-accent font-medium text-white" : "bg-card text-ink border border-hairline"}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-sm text-muted">{label}</div>
      {children}
    </div>
  );
}

const input = "w-full rounded-2xl border border-hairline bg-card px-4 py-3.5 text-base outline-none focus:border-accent";

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [position, setPosition] = useState<Position | undefined>();
  const [season, setSeason] = useState<Season | undefined>();
  const [goal, setGoal] = useState<SeasonGoal | undefined>();
  const [league, setLeague] = useState<League | undefined>();
  const [years, setYears] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [limited, setLimited] = useState(false);
  const [club, setClub] = useState<number[]>([]);
  const [matches, setMatches] = useState<number[]>([]);
  const [error, setError] = useState("");

  const ageN = Number(age), weightN = Number(weight.replace(",", ".")), yearsN = Number(years.replace(",", "."));
  const checks: Array<() => string | null> = [
    () => null,
    () => !name.trim() ? "Podaj imię."
      : !(ageN >= MIN_AGE) ? `Aplikacja jest dla zawodników od ${MIN_AGE} lat.`
      : !(weightN >= 40 && weightN <= 160) ? "Podaj masę ciała (40–160 kg)."
      : !position ? "Wybierz pozycję." : null,
    () => !season ? "Wybierz moment w sezonie." : !goal ? "Wybierz cel." : !league ? "Wybierz poziom rozgrywek." : null,
    () => years === "" || !(yearsN >= 0) ? "Podaj staż treningu siłowego." : !equipment.length ? "Wybierz sprzęt." : null,
    () => season === "inseason" && !matches.length ? "Zaznacz dzień meczu."
      : matches.length > 2 ? "Maksymalnie dwa mecze w tygodniu." : null,
  ];
  const last = checks.length - 1;

  const next = () => {
    const e = checks[step]!();
    if (e) { setError(e); return; }
    setError("");
    if (step < last) { setStep(step + 1); window.scrollTo(0, 0); return; }
    onDone({
      name: name.trim(), age: ageN, weightKg: weightN, position: position!, season, goal, league,
      strengthYears: yearsN, equipment, limitedGymAccess: limited, clubWeekdays: club,
      matchWeekdays: season === "offseason" ? [] : matches,
    });
  };

  if (step === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pb-12 pt-24">
        <Sketch kind="plan" className="h-24 w-24" />
        <h1 className="mt-8 text-[40px] font-semibold leading-none tracking-tight">Ballwise</h1>
        <p className="mt-4 text-lg text-muted">Trening, który układa się wokół Twojego meczu.</p>
        <div className="flex-1" />
        <button onClick={next} className="w-full rounded-2xl bg-accent py-4 text-base font-medium text-white">Zaczynamy</button>
      </main>
    );
  }

  const titles = ["", "O Tobie", "Sezon i cel", "Trening", "Twój tydzień"];
  const dayOpts = DAYS.map((d, i) => [i, d] as [number, string]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pb-10 pt-12">
      <div className="mb-8 flex items-center gap-3">
        <button onClick={() => { setError(""); setStep(step - 1); }} className="text-sm text-muted" aria-label="Wstecz">‹ Wstecz</button>
        <div className="flex flex-1 gap-1.5">
          {[1, 2, 3, 4].map((k) => <div key={k} className={`h-1 flex-1 rounded-full ${k <= step ? "bg-accent" : "bg-hairline"}`} />)}
        </div>
      </div>
      <h1 className="mb-8 text-[28px] font-semibold tracking-tight">{titles[step]}</h1>

      <div key={step} className="bw-step flex-1">
        {step === 1 && (
          <>
            <Field label="Imię"><input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Wiek"><input className={input} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></Field>
              <Field label="Masa (kg)"><input className={input} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
            </div>
            <Field label="Pozycja"><Chips options={POSITIONS} value={position ? [position] : []} onToggle={setPosition} /></Field>
          </>
        )}
        {step === 2 && (
          <>
            <Field label="Moment w sezonie">
              <div className="flex flex-col gap-2">
                {SEASONS.map(([v, t, d]) => (
                  <button key={v} onClick={() => setSeason(v)}
                    className={`rounded-2xl px-4 py-3.5 text-left ${season === v ? "bg-accent text-white" : "border border-hairline bg-card"}`}>
                    <div className="text-base font-medium">{t}</div>
                    <div className={`text-xs ${season === v ? "text-white/80" : "text-muted"}`}>{d}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Cel na sezon"><Chips options={GOALS} value={goal ? [goal] : []} onToggle={setGoal} /></Field>
            <Field label="Poziom rozgrywek"><Chips options={LEAGUES.map((l) => [l, l] as [League, string])} value={league ? [league] : []} onToggle={setLeague} /></Field>
          </>
        )}
        {step === 3 && (
          <>
            <Field label="Staż treningu siłowego (lata)"><input className={input} inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} /></Field>
            <Field label="Gdzie trenujesz"><Chips options={EQUIPMENT} value={equipment} onToggle={(v) => setEquipment(toggle(equipment, v))} /></Field>
            <button onClick={() => setLimited(!limited)}
              className={`w-full rounded-2xl py-3.5 text-sm font-medium ${limited ? "bg-accent text-white" : "border border-hairline bg-card text-ink"}`}>
              Mam mało dni na siłownię
            </button>
          </>
        )}
        {step === 4 && (
          <>
            <Field label="Treningi w klubie"><Chips options={dayOpts} value={club} onToggle={(v) => setClub(toggle(club, v))} /></Field>
            {season !== "offseason" && (
              <Field label={season === "preseason" ? "Sparingi (opcjonalnie, maks. dwa)" : "Mecz (maks. dwa)"}>
                <Chips options={dayOpts} value={matches} onToggle={(v) => setMatches(toggle(matches, v))} />
              </Field>
            )}
          </>
        )}
      </div>

      {error && <p className="mb-3 text-center text-sm text-red-ink">{error}</p>}
      <button onClick={next} className="w-full rounded-2xl bg-accent py-4 text-base font-medium text-white">
        {step === last ? "Gotowe" : "Dalej"}
      </button>
    </main>
  );
}
