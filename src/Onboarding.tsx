import { useEffect, useState, type ReactNode } from "react";
import { FEEL_NOW, LEAGUES, MIN_AGE, saveFeeling, suggestGoals } from "./engine";
import type { Equipment, FeelNow, League, Position, Profile, Season, SeasonGoal } from "./engine";
import { Wheel } from "./Wheel";
import { Sheet } from "./Sheet";

const DAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const POSITIONS: Array<[Position, string]> = [
  ["bramkarz", "Bramkarz"], ["obronca", "Obrońca"], ["pomocnik", "Pomocnik"], ["skrzydlowy", "Skrzydłowy"], ["napastnik", "Napastnik"],
];
const SEASONS: Array<[Season, string, string]> = [
  ["preseason", "Okres przygotowawczy", "Budujemy formę"],
  ["inseason", "W trakcie sezonu", "Plan wokół meczu"],
  ["offseason", "Przerwa", "Utrzymanie formy, lżej"],
];
const GOALS: Array<[SeasonGoal, string, string]> = [
  ["speed", "Szybszy", "Wygrywać starty i powroty"],
  ["strength", "Silniejszy", "Wygrywać pojedynki"],
  ["endurance", "Wytrzymalszy", "Mieć parę do końca"],
  ["return", "W formie po przerwie", "Spokojny powrót"],
];
const range = (a: number, b: number, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
const EQUIPMENT: Array<[Equipment, string]> = [["gym", "Siłownia"], ["bodyweight", "Masa ciała"], ["field", "Boisko / bieżnia"]];

/** Stan dnia w kalendarzu tygodnia. */
type DayState = "free" | "club" | "match" | "off";
const CYCLE: DayState[] = ["free", "club", "match", "off"];
const DAY_STYLE: Record<DayState, string> = {
  free: "border border-hairline bg-card text-ink",
  club: "bg-club-soft text-club shadow-[inset_0_0_0_1px_#bfe5cf]",
  match: "bw-sel",
  off: "bg-hairline text-muted line-through",
};
const DAY_LABEL: Record<DayState, string> = { free: "wolny", club: "klub", match: "mecz", off: "brak" };

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/** Przycisk wyboru: wybrany „podskakuje” i dostaje gradient. */
function Pick({ on, onTap, children, className = "" }: { on: boolean; onTap: () => void; children: ReactNode; className?: string }) {
  return (
    <button key={on ? "on" : "off"} type="button" onClick={onTap}
      className={`${on ? "bw-pop bw-sel font-semibold" : "border border-hairline bg-card text-ink"} ${className}`}>
      {children}
    </button>
  );
}

/** Duży kafel wyboru: znacznik po prawej (✓ albo numer kolejności). */
function Tile({ on, onTap, title, sub, badge }: { on: boolean; onTap: () => void; title: string; sub?: string; badge?: string }) {
  return (
    <button key={on ? "on" : "off"} type="button" onClick={onTap}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left ${on ? "bw-pop bw-sel" : "border border-hairline bg-card"}`}>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] ${on ? "font-semibold" : "font-medium text-ink"}`}>{title}</span>
        {sub && <span className={`block text-xs ${on ? "text-accent/75" : "text-muted"}`}>{sub}</span>}
      </span>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${on ? "bg-accent text-white" : "border border-hairline"}`}>
        {on ? badge ?? "✓" : ""}
      </span>
    </button>
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
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas px-8 text-ink">
      <div className="mb-8 flex h-24 items-end gap-2">
        {[44, 70, 56, 88, 62, 96, 40].map((h, i) => (
          <span key={i} className="bw-fill w-5 rounded-full bg-accent-soft shadow-[inset_0_0_0_1px_#c9def6]" style={{ height: h, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <h1 className="bw-rise text-2xl font-semibold tracking-tight">Układam Twój tydzień</h1>
      <p className="bw-rise mt-2 text-sm text-muted" style={{ animationDelay: "300ms" }}>{name ? `${name}, ` : ""}za chwilę zaczynamy</p>
    </main>
  );
}

const input = "w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-base outline-none focus:border-accent";

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState(18);
  const [weight, setWeight] = useState(75);
  const [position, setPosition] = useState<Position | undefined>();
  const [feelNow, setFeelNow] = useState<FeelNow[]>([]);
  const [goals, setGoals] = useState<SeasonGoal[]>([]);
  const [season, setSeason] = useState<Season | undefined>();
  const [league, setLeague] = useState<League | undefined>();
  const [leagueSheet, setLeagueSheet] = useState(false);
  const [years, setYears] = useState(1);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [limited, setLimited] = useState(false);
  const [days, setDays] = useState<DayState[]>(Array(7).fill("free"));
  const [error, setError] = useState("");
  const [building, setBuilding] = useState<Profile | null>(null);

  const idx = (st: DayState) => days.map((d, i) => (d === st ? i : -1)).filter((i) => i >= 0);
  const matches = idx("match");
  const checks: Array<() => string | null> = [
    () => null,
    () => !name.trim() ? "Podaj imię." : null,
    () => !position ? "Wybierz pozycję." : null,
    () => !goals.length ? "Wybierz przynajmniej jeden cel." : null,
    () => !season ? "Wybierz moment w sezonie." : !league ? "Wybierz poziom rozgrywek." : null,
    () => !equipment.length ? "Wybierz, gdzie trenujesz." : null,
    () => season === "inseason" && !matches.length ? "Zaznacz dzień meczu."
      : matches.length > 2 ? "Maksymalnie dwa mecze w tygodniu."
      : idx("off").length > 4 ? "Zostaw przynajmniej 3 dni na trening." : null,
  ];
  const last = checks.length - 1;

  const go = (n: number) => { setDir(n > step ? 1 : -1); setError(""); setStep(n); };
  const next = () => {
    const e = checks[step]!();
    if (e) { setError(e); return; }
    // cele podpowiedziane z odpowiedzi „jak się czujesz”, jeśli jeszcze nic nie wybrano
    if (step === 2 && !goals.length) setGoals(suggestGoals(feelNow));
    if (step < last) { go(step + 1); return; }
    setBuilding({
      name: name.trim(), age, weightKg: weight, position: position!, season, goal: goals[0], goal2: goals[1], league,
      strengthYears: years, equipment, limitedGymAccess: limited,
      clubWeekdays: idx("club"), matchWeekdays: season === "offseason" ? [] : matches, offWeekdays: idx("off"),
    });
    saveFeeling({ date: new Date().toLocaleDateString("sv-SE"), now: feelNow });
  };

  const toggleGoal = (g: SeasonGoal) =>
    setGoals(goals.includes(g) ? goals.filter((x) => x !== g) : goals.length >= 2 ? [goals[0]!, g] : [...goals, g]);

  if (building) return <Building name={building.name ?? ""} onDone={() => onDone(building)} />;

  if (step === 0) {
    return (
      <main className="bw-grad-soft mx-auto flex h-[100dvh] max-w-md flex-col px-6 pb-10 pt-24">
        <div className="bw-rise"><StepArt step={1} /></div>
        <h1 className="bw-rise mt-8 text-[44px] font-semibold leading-none tracking-tight text-ink" style={{ animationDelay: "80ms" }}>Ballwise</h1>
        <p className="bw-rise mt-4 text-lg text-muted" style={{ animationDelay: "160ms" }}>Trening, który układa się wokół Twojego meczu.</p>
        <div className="flex-1" />
        <button onClick={next} className="bw-grad w-full rounded-2xl py-4 text-base font-medium text-white shadow-sm">Zaczynamy</button>
      </main>
    );
  }

  const titles = ["", "O Tobie", "Na boisku", "Jak chcesz się czuć?", "Sezon", "Trening", "Twój tydzień"];
  const art = [1, 1, 1, 2, 2, 3, 4][step]!;
  const seasonOff = season === "offseason";

  return (
    <main className="bw-grad-soft mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden px-5 pb-5 pt-5">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => go(step - 1)} className="px-1 text-lg text-muted" aria-label="Wstecz">‹</button>
        <div className="flex flex-1 gap-1">
          {range(1, last).map((k) => (
            <div key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-hairline">
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: k <= step ? "100%" : "0%" }} />
            </div>
          ))}
        </div>
      </div>

      <div key={step} className={`${dir === 1 ? "bw-step" : "bw-step-back"} flex min-h-0 flex-1 flex-col overflow-y-auto`}>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">{titles[step]}</h1>
          <StepArt step={art} />
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div><Label>Imię</Label><input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <Wheel label="Wiek" values={range(MIN_AGE, 45)} value={age} onChange={setAge} />
              <Wheel label="Masa" values={range(45, 130)} value={weight} onChange={setWeight} format={(v) => `${v} kg`} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <Label>Pozycja</Label>
              <div className="grid grid-cols-3 gap-2">
                {POSITIONS.map(([v, t]) => (
                  <Pick key={v} on={position === v} onTap={() => setPosition(v)} className="rounded-2xl px-1 py-2.5 text-[13px] font-medium">{t}</Pick>
                ))}
              </div>
            </div>
            <div>
              <Label>Jak czujesz się teraz na boisku? (możesz kilka)</Label>
              <div className="flex flex-col gap-1.5">
                {FEEL_NOW.map(([v, t]) => (
                  <Tile key={v} on={feelNow.includes(v)} onTap={() => setFeelNow(toggle(feelNow, v))} title={t} />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-2">
            <p className="mb-1 text-xs text-muted">Pierwszy wybór to cel główny, drugi – dodatkowy.</p>
            {GOALS.map(([v, t, d]) => (
              <Tile key={v} on={goals.includes(v)} onTap={() => toggleGoal(v)} title={t} sub={d}
                badge={goals.indexOf(v) === 0 ? "1" : "2"} />
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <Label>Moment w sezonie</Label>
              <div className="flex flex-col gap-1.5">
                {SEASONS.map(([v, t, d]) => <Tile key={v} on={season === v} onTap={() => setSeason(v)} title={t} sub={d} />)}
              </div>
            </div>
            <div>
              <Label>Poziom rozgrywek</Label>
              <button onClick={() => setLeagueSheet(true)} className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-card px-4 py-3 text-left">
                <span className={league ? "font-medium" : "text-muted"}>{league ?? "Wybierz"}</span>
                <span className="text-lg text-accent">›</span>
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <Wheel label="Staż treningu siłowego" values={range(0, 15)} value={years} onChange={setYears}
              format={(v) => (v === 0 ? "mniej niż rok" : `${v} ${v === 1 ? "rok" : v < 5 ? "lata" : "lat"}`)} />
            <div>
              <Label>Gdzie trenujesz</Label>
              <div className="grid grid-cols-3 gap-2">
                {EQUIPMENT.map(([v, t]) => (
                  <Pick key={v} on={equipment.includes(v)} onTap={() => setEquipment(toggle(equipment, v))} className="rounded-2xl px-1 py-3 text-[13px] font-medium">{t}</Pick>
                ))}
              </div>
            </div>
            <Tile on={limited} onTap={() => setLimited(!limited)} title="Mam mało dni na siłownię" />
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-col gap-5">
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
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-club-soft shadow-[inset_0_0_0_1px_#bfe5cf]" />klub</span>
              {!seasonOff && <span className="flex items-center gap-1.5"><span className="bw-sel h-2.5 w-2.5 rounded-full" />mecz</span>}
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-hairline" />brak – bez naszych treningów</span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="bw-pop mt-2 shrink-0 text-center text-sm text-red-ink">{error}</p>}
      <button onClick={next} className="bw-grad mt-3 w-full shrink-0 rounded-2xl py-3.5 text-base font-medium text-white shadow-sm">
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
