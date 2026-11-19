import { useEffect, useState, type ReactNode } from "react";
import { LEAGUES, MIN_AGE } from "./engine";
import type { Equipment, League, Position, Profile, Season, SeasonGoal } from "./engine";
import { Sheet } from "./Sheet";

const DAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const POSITIONS: Array<[Position, string]> = [
  ["bramkarz", "Bramkarz"], ["obronca", "Obrońca"], ["pomocnik", "Pomocnik"], ["skrzydlowy", "Skrzydłowy"], ["napastnik", "Napastnik"],
];
const SEASONS: Array<[Season, string, string]> = [
  ["preseason", "Przygotowania", "Budujemy formę"],
  ["inseason", "Sezon", "Plan wokół meczu"],
  ["offseason", "Przerwa", "Utrzymanie, lżej"],
];
const GOALS: Array<[SeasonGoal, string]> = [["speed", "Szybkość"], ["strength", "Siła"], ["endurance", "Wydolność"], ["return", "Powrót po przerwie"]];
const EQUIPMENT: Array<[Equipment, string]> = [["gym", "Siłownia"], ["bodyweight", "Masa ciała"], ["field", "Boisko / bieżnia"]];

/** Stan dnia w kalendarzu tygodnia. */
type DayState = "free" | "club" | "match" | "off";
const CYCLE: DayState[] = ["free", "club", "match", "off"];
const DAY_STYLE: Record<DayState, string> = {
  free: "border border-hairline bg-card text-ink",
  club: "bg-club text-white",
  match: "bw-grad text-white",
  off: "bg-hairline text-muted line-through",
};
const DAY_LABEL: Record<DayState, string> = { free: "wolny", club: "klub", match: "mecz", off: "brak" };

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/** Przycisk wyboru: wybrany „podskakuje” i dostaje gradient. */
function Pick({ on, onTap, children, className = "" }: { on: boolean; onTap: () => void; children: ReactNode; className?: string }) {
  return (
    <button key={on ? "on" : "off"} type="button" onClick={onTap}
      className={`${on ? "bw-pop bw-grad text-white shadow-md shadow-accent/20" : "border border-hairline bg-card text-ink"} ${className}`}>
      {children}
    </button>
  );
}

function Chips<T extends string>({ options, value, onToggle }: { options: Array<[T, string]>; value: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, t]) => (
        <Pick key={v} on={value.includes(v)} onTap={() => onToggle(v)} className="rounded-full px-3.5 py-2 text-sm font-medium">{t}</Pick>
      ))}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-xs text-muted">{children}</div>;
}

/** Mały animowany szkic na każdym kroku. */
function StepArt({ step }: { step: number }) {
  const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 64 64" className="h-11 w-11 shrink-0 text-accent" aria-hidden="true">
      {step === 1 && (
        <g {...P}>
          <ellipse className="bw-shadow" cx="32" cy="56" rx="10" ry="2" fill="currentColor" stroke="none" opacity="0.3" />
          <g className="bw-bounce"><circle cx="32" cy="30" r="13" /><path d="M32 23 l6 4 -2 7 h-8 l-2 -7 z" /></g>
        </g>
      )}
      {step === 2 && (
        <g {...P}>
          <circle cx="32" cy="32" r="22" opacity="0.25" />
          <path className="bw-draw" pathLength={100} d="M32 10 a22 22 0 1 1 -22 22" />
          <path d="M32 32 l9 -9" />
        </g>
      )}
      {step === 3 && (
        <g {...P}>
          <g className="bw-lift"><path d="M10 26 h44" /><rect x="8" y="20" width="6" height="12" rx="1.5" /><rect x="50" y="20" width="6" height="12" rx="1.5" /></g>
          <path d="M14 56 h36" strokeDasharray="1 3" />
        </g>
      )}
      {step === 4 && (
        <g>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} className="bw-fill" x={6 + i * 8} y={20 + (i % 3) * 6} width="5" height={30 - (i % 3) * 6} rx="2.5"
              fill="currentColor" opacity={i === 5 ? 1 : 0.55} style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </g>
      )}
    </svg>
  );
}

/** Ekran przejścia: tydzień „się układa”, potem wchodzimy do aplikacji. */
function Building({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1900); return () => clearTimeout(t); }, [onDone]);
  return (
    <main className="bw-grad fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-white">
      <div className="mb-8 flex h-24 items-end gap-2">
        {[44, 70, 56, 88, 62, 96, 40].map((h, i) => (
          <span key={i} className="bw-fill w-5 rounded-full bg-white/90" style={{ height: h, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <h1 className="bw-rise text-2xl font-semibold tracking-tight">Układam Twój tydzień</h1>
      <p className="bw-rise mt-2 text-sm text-white/80" style={{ animationDelay: "300ms" }}>{name ? `${name}, ` : ""}za chwilę zaczynamy</p>
    </main>
  );
}

const input = "w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-base outline-none focus:border-accent";

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [position, setPosition] = useState<Position | undefined>();
  const [season, setSeason] = useState<Season | undefined>();
  const [goal, setGoal] = useState<SeasonGoal | undefined>();
  const [league, setLeague] = useState<League | undefined>();
  const [leagueSheet, setLeagueSheet] = useState(false);
  const [years, setYears] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [limited, setLimited] = useState(false);
  const [days, setDays] = useState<DayState[]>(Array(7).fill("free"));
  const [error, setError] = useState("");
  const [building, setBuilding] = useState<Profile | null>(null);

  const ageN = Number(age), weightN = Number(weight.replace(",", ".")), yearsN = Number(years.replace(",", "."));
  const idx = (s: DayState) => days.map((d, i) => (d === s ? i : -1)).filter((i) => i >= 0);
  const matches = idx("match");
  const checks: Array<() => string | null> = [
    () => null,
    () => !name.trim() ? "Podaj imię."
      : !(ageN >= MIN_AGE) ? `Aplikacja jest dla zawodników od ${MIN_AGE} lat.`
      : !(weightN >= 40 && weightN <= 160) ? "Podaj masę ciała (40–160 kg)."
      : !position ? "Wybierz pozycję." : null,
    () => !season ? "Wybierz moment w sezonie." : !goal ? "Wybierz cel." : !league ? "Wybierz poziom rozgrywek." : null,
    () => years === "" || !(yearsN >= 0) ? "Podaj staż treningu siłowego." : !equipment.length ? "Wybierz, gdzie trenujesz." : null,
    () => season === "inseason" && !matches.length ? "Zaznacz dzień meczu."
      : matches.length > 2 ? "Maksymalnie dwa mecze w tygodniu."
      : idx("off").length > 4 ? "Zostaw przynajmniej 3 dni na trening." : null,
  ];
  const last = checks.length - 1;

  const go = (n: number) => { setDir(n > step ? 1 : -1); setError(""); setStep(n); };
  const next = () => {
    const e = checks[step]!();
    if (e) { setError(e); return; }
    if (step < last) { go(step + 1); return; }
    setBuilding({
      name: name.trim(), age: ageN, weightKg: weightN, position: position!, season, goal, league,
      strengthYears: yearsN, equipment, limitedGymAccess: limited,
      clubWeekdays: idx("club"), matchWeekdays: season === "offseason" ? [] : matches, offWeekdays: idx("off"),
    });
  };

  if (building) return <Building name={building.name ?? ""} onDone={() => onDone(building)} />;

  if (step === 0) {
    return (
      <main className="bw-grad-soft mx-auto flex h-[100dvh] max-w-md flex-col px-6 pb-10 pt-24">
        <div className="bw-rise"><StepArt step={1} /></div>
        <h1 className="bw-rise mt-8 text-[44px] font-semibold leading-none tracking-tight text-navy" style={{ animationDelay: "80ms" }}>Ballwise</h1>
        <p className="bw-rise mt-4 text-lg text-muted" style={{ animationDelay: "160ms" }}>Trening, który układa się wokół Twojego meczu.</p>
        <div className="flex-1" />
        <button onClick={next} className="bw-grad w-full rounded-2xl py-4 text-base font-medium text-white shadow-lg shadow-accent/25">Zaczynamy</button>
      </main>
    );
  }

  const titles = ["", "O Tobie", "Sezon i cel", "Trening", "Twój tydzień"];
  const seasonOff = season === "offseason";

  return (
    <main className="bw-grad-soft mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden px-5 pb-5 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => go(step - 1)} className="text-sm text-muted" aria-label="Wstecz">‹</button>
        <div className="flex flex-1 gap-1.5">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-hairline">
              <div className="bw-grad h-full rounded-full transition-all duration-500" style={{ width: k <= step ? "100%" : "0%" }} />
            </div>
          ))}
        </div>
      </div>

      <div key={step} className={`${dir === 1 ? "bw-step" : "bw-step-back"} flex min-h-0 flex-1 flex-col overflow-y-auto`}>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[26px] font-semibold tracking-tight text-navy">{titles[step]}</h1>
          <StepArt step={step} />
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div><Label>Imię</Label><input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Wiek</Label><input className={input} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></div>
              <div><Label>Masa (kg)</Label><input className={input} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            </div>
            <div><Label>Pozycja</Label><Chips options={POSITIONS} value={position ? [position] : []} onToggle={setPosition} /></div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <Label>Moment w sezonie</Label>
              <div className="grid grid-cols-3 gap-2">
                {SEASONS.map(([v, t, d]) => (
                  <Pick key={v} on={season === v} onTap={() => setSeason(v)} className="rounded-2xl px-2 py-2.5 text-center">
                    <div className="text-sm font-semibold">{t}</div>
                    <div className={`mt-0.5 text-[11px] leading-tight ${season === v ? "text-white/80" : "text-muted"}`}>{d}</div>
                  </Pick>
                ))}
              </div>
            </div>
            <div><Label>Cel na sezon</Label><Chips options={GOALS} value={goal ? [goal] : []} onToggle={setGoal} /></div>
            <div>
              <Label>Poziom rozgrywek</Label>
              <button onClick={() => setLeagueSheet(true)} className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-card px-4 py-3 text-left">
                <span className={league ? "font-medium" : "text-muted"}>{league ?? "Wybierz"}</span>
                <span className="text-lg text-accent">›</span>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div><Label>Staż treningu siłowego (lata)</Label><input className={input} inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} /></div>
            <div><Label>Gdzie trenujesz</Label><Chips options={EQUIPMENT} value={equipment} onToggle={(v) => setEquipment(toggle(equipment, v))} /></div>
            <Pick on={limited} onTap={() => setLimited(!limited)} className="w-full rounded-2xl py-3 text-sm font-medium">Mam mało dni na siłownię</Pick>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">Dotknij dzień: wolny → klub → mecz → brak (dzień niedostępny).</p>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((d, i) => {
                const st: DayState = seasonOff && d === "match" ? "free" : d;
                return (
                  <button key={`${i}-${st}`} onClick={() => {
                    const order = seasonOff ? CYCLE.filter((c) => c !== "match") : CYCLE;
                    const n = order[(order.indexOf(st) + 1) % order.length]!;
                    setDays(days.map((x, k) => (k === i ? n : x)));
                  }}
                    className={`bw-pop flex h-16 flex-col items-center justify-center rounded-2xl ${DAY_STYLE[st]}`}>
                    <span className="text-sm font-semibold no-underline">{DAYS[i]}</span>
                    <span className={`mt-1 text-[9px] ${st === "free" ? "text-muted" : ""}`}>{DAY_LABEL[st]}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-club" />klub</span>
              {!seasonOff && <span className="flex items-center gap-1.5"><span className="bw-grad h-2.5 w-2.5 rounded-full" />mecz</span>}
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-hairline" />niedostępny – bez naszych treningów</span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="bw-pop mt-2 shrink-0 text-center text-sm text-red-ink">{error}</p>}
      <button onClick={next} className="bw-grad mt-3 w-full shrink-0 rounded-2xl py-3.5 text-base font-medium text-white shadow-lg shadow-accent/25">
        {step === last ? "Gotowe" : "Dalej"}
      </button>

      {leagueSheet && (
        <Sheet title="Poziom rozgrywek" onClose={() => setLeagueSheet(false)}>
          <div className="flex flex-col">
            {LEAGUES.map((l) => (
              <button key={l} onClick={() => { setLeague(l); setLeagueSheet(false); }}
                className="flex items-center justify-between border-b border-hairline py-3.5 text-left last:border-0">
                <span className={league === l ? "font-semibold text-accent" : ""}>{l}</span>
                {league === l && <span className="text-accent">✓</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </main>
  );
}
