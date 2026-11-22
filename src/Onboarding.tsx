import { useEffect, useRef, useState, type ReactNode } from "react";
import { FEEL_NOW, GEAR, HOME_GEAR, LEAGUES, MIN_AGE, saveFeeling } from "./engine";
import type { FeelNow, Position, Profile } from "./engine";
import { Wheel } from "./Wheel";
import { Sheet } from "./Sheet";
import { scoped } from "./lib/store";
import { saveHeight } from "./lib/private";
import { DRAFT_KEY, LAST_STEP, buildProfile, initialAnswers, restoreDraft, WEEKDAY_SHORT, nextDayState, understood, validateStep, type Answers, type DayState } from "./onboarding/answers";
import { PRIMARY, SECONDARY, STEP_TONES, toneVars } from "./onboarding/tones";
import { BUTTON, DAY_LABEL, EQUIPMENT, GOALS, INTRO, LABEL, POSITIONS, PREVIEW, SEASONS, STEP_HINT, STEP_TITLE, dayHelp, yearsText } from "./onboarding/copy";

const range = (a: number, b: number, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const tap = () => { try { navigator.vibrate?.(8); } catch { /* brak wibracji */ } };

const DAY_STYLE: Record<DayState, string> = {
  free: "border border-hairline bg-card text-ink",
  club: "bg-[#fdf3ea] text-[#8a5428] shadow-[inset_0_0_0_1px_#f0c29d]",
  match: "bw-sel",
  off: "bg-hairline text-muted line-through",
};

/** Znacznik „✓” rysowany po zaznaczeniu. */
const Check = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path className="bw-check" d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

/** Przycisk wyboru: wybrany „podskakuje” i podświetla się. */
function Pick({ on, onTap, children, className = "" }: { on: boolean; onTap: () => void; children: ReactNode; className?: string }) {
  return (
    <button key={on ? "on" : "off"} type="button" aria-pressed={on} onClick={() => { tap(); onTap(); }}
      className={`${on ? "bw-pop bw-sel-tone font-semibold" : "border border-hairline bg-card text-ink"} ${className}`}>
      {children}
    </button>
  );
}

/** Kafel wyboru: znacznik po prawej (rysowane ✓ albo numer kolejności). */
function Tile({ on, onTap, title, sub, badge, alt }: { on: boolean; onTap: () => void; title: string; sub?: string; badge?: string; alt?: boolean }) {
  return (
    <button key={on ? "on" : "off"} type="button" aria-pressed={on} onClick={() => { tap(); onTap(); }}
      style={alt ? toneVars(SECONDARY) : undefined}
      className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-transform active:scale-[0.985] ${on ? "bw-pop bw-sel-tone" : "border border-hairline bg-card"}`}>
      <span className="min-w-0 flex-1">
        <span className={`block text-[14.5px] leading-snug ${on ? "font-semibold" : "font-medium text-ink"}`}>{title}</span>
        {sub && <span className={`mt-0.5 block text-[11.5px] leading-snug ${on ? "opacity-75" : "text-muted"}`}>{sub}</span>}
      </span>
      <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${on ? "text-white" : "border border-hairline"}`} style={on ? { background: "var(--tone-solid)" } : undefined}>
        {on ? badge ?? <Check /> : null}
      </span>
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-hairline bg-card p-4">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Mały animowany szkic przy tytule kroku. */
function StepArt({ step }: { step: number }) {
  const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "var(--tone-soft)" }}>
      <svg viewBox="0 0 64 64" className="h-9 w-9" style={{ color: "var(--tone)" }} aria-hidden="true">
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
    </span>
  );
}

/** Mini boisko: wybrana pozycja „wskakuje” na swoje miejsce (przejście CSS), reszta to blade punkty. */
const PITCH_SPOTS: Record<Position, [number, number]> = { bramkarz: [24, 55], obronca: [84, 55], pomocnik: [150, 55], skrzydlowy: [212, 20], napastnik: [272, 55] };
function PitchPicker({ value, onPick }: { value?: Position; onPick: (p: Position) => void }) {
  const spot = value ? PITCH_SPOTS[value] : null;
  return (
    <svg viewBox="0 0 300 110" className="w-full" role="img" aria-label={value ? `Wybrana pozycja: ${POSITIONS.find(([v]) => v === value)![1]}` : "Boisko: wybierz pozycję"}>
      <g fill="none" stroke="var(--color-sel-border)" strokeWidth="1.5">
        <rect x="4" y="4" width="292" height="102" rx="12" />
        <path d="M150 4 v102" />
        <circle cx="150" cy="55" r="18" />
        <rect x="4" y="30" width="34" height="50" rx="4" />
        <rect x="262" y="30" width="34" height="50" rx="4" />
      </g>
      {POSITIONS.map(([v, t]) => (
        <g key={v} onClick={() => { tap(); onPick(v); }} style={{ cursor: "pointer" }}>
          <circle cx={PITCH_SPOTS[v][0]} cy={PITCH_SPOTS[v][1]} r="13" fill="transparent" />
          <circle cx={PITCH_SPOTS[v][0]} cy={PITCH_SPOTS[v][1]} r="4" fill="var(--color-sel-border)" />
          <title>{t}</title>
        </g>
      ))}
      {spot && (
        <g style={{ transform: `translate(${spot[0]}px, ${spot[1]}px)`, transition: "transform 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.25)" }}>
          <circle className="bw-ring" r="10" fill="var(--tone)" opacity="0.35" />
          <circle r="9" fill="var(--tone)" stroke="#fff" strokeWidth="2.5" />
        </g>
      )}
    </svg>
  );
}

/** Ekran przejścia: tydzień „się układa”, a pod spodem to, co zrozumieliśmy z odpowiedzi. */
function Building({ name, lines, onDone }: { name: string; lines: string[]; onDone: () => void }) {
  const ms = Math.min(3600, 2700 + lines.length * 260);
  const done = useRef(onDone);
  done.current = onDone; // stabilny timer: nowa funkcja z rodzica nie restartuje animacji
  useEffect(() => { const t = setTimeout(() => done.current(), ms); return () => clearTimeout(t); }, [ms]);
  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas px-8 text-ink">
      <div className="relative mb-8 w-[188px] pt-8" aria-hidden="true">
        {/* Tymczasowe logo (B w piłce) przeskakuje po słupkach tygodnia. Podmienić na docelowe. */}
        <svg viewBox="0 0 24 24" className="bw-hop absolute left-0 top-0 h-6 w-6">
          <circle cx="12" cy="12" r="11" fill="var(--color-accent)" stroke="var(--color-card)" strokeWidth="2" />
          <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill="#fff" style={{ fontFamily: "inherit" }}>B</text>
        </svg>
        <div className="flex h-24 items-end gap-2">
          {[44, 70, 56, 88, 62, 96, 40].map((h, i) => (
            <span key={i} className="bw-grow w-5 rounded-full bg-accent-soft shadow-[inset_0_0_0_1px_#c9def6]" style={{ height: h, animationDelay: `${i * 110}ms` }} />
          ))}
        </div>
      </div>
      <h1 className="bw-rise text-2xl font-semibold tracking-tight">{PREVIEW.building}</h1>
      <p className="bw-rise mt-2 text-sm text-muted" style={{ animationDelay: "250ms" }}>{name ? `${name}, ` : ""}{PREVIEW.soon}</p>
      <ul className="mt-6 flex w-full max-w-xs flex-col gap-2 text-sm" aria-label="Co zrozumieliśmy z Twoich odpowiedzi">
        {lines.map((l, i) => (
          <li key={l} className="bw-rise flex items-center gap-2.5 text-ink/80" style={{ animationDelay: `${600 + i * 260}ms` }}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Check /></span>{l}
          </li>
        ))}
      </ul>
    </main>
  );
}

const input = "w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-base outline-none transition focus:border-accent";

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  // rozpoczęty onboarding wraca po przeładowaniu karty (np. gdy system zamknie ją w tle), zamiast zaczynać od zera
  const [draft] = useState(() => { try { return restoreDraft(JSON.parse(scoped.getItem(DRAFT_KEY) ?? "null")); } catch { return null; } });
  const [step, setStep] = useState(draft?.step ?? 0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState(false);
  const [a, setA] = useState<Answers>(draft?.a ?? initialAnswers);
  useEffect(() => { if (step > 0) scoped.setItem(DRAFT_KEY, JSON.stringify({ step, a })); }, [step, a]);
  const [leagueSheet, setLeagueSheet] = useState(false);
  const [error, setError] = useState("");
  const [errorKey, setErrorKey] = useState(0);
  const [building, setBuilding] = useState<Profile | null>(null);
  const busy = useRef(false);
  const set = (patch: Partial<Answers>) => { setError(""); setA((cur) => ({ ...cur, ...patch })); };

  /** Przejście do kroku: krótkie wyjście bieżącego, potem wejście następnego (z kierunkiem). */
  const go = (n: number) => {
    if (busy.current) return;
    busy.current = true;
    setDir(n > step ? 1 : -1);
    setError("");
    setLeaving(true);
    setTimeout(() => { setStep(n); setLeaving(false); busy.current = false; }, 150);
  };
  const next = () => {
    if (busy.current) return;
    const e = validateStep(step, a);
    if (e) { setError(e); setErrorKey((k) => k + 1); tap(); return; }
    if (step < LAST_STEP) { go(step + 1); return; }
    const profile = buildProfile(a);
    if (!profile) { setError("Uzupełnij brakujące odpowiedzi."); setErrorKey((k) => k + 1); return; }
    saveFeeling({ date: new Date().toLocaleDateString("sv-SE"), now: a.feelNow });
    setBuilding(profile);
  };

  const toggleGoal = (g: Answers["goals"][number]) =>
    set({ goals: a.goals.includes(g) ? a.goals.filter((x) => x !== g) : a.goals.length >= 2 ? [a.goals[0]!, g] : [...a.goals, g] });

  if (building) return <Building name={building.name ?? ""} lines={understood(a)} onDone={() => { saveHeight(a.height ?? undefined); scoped.removeItem(DRAFT_KEY); onDone(building); }} />;

  if (step === 0) {
    return (
      <main className="bw-grad-soft relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden px-6 pb-10 pt-[2.85rem]">
        <div className="pointer-events-none absolute -right-24 top-6 h-60 w-60 rounded-full opacity-60 blur-3xl" style={{ background: "#e3edf9" }} aria-hidden="true" />
        <div className="pointer-events-none absolute -left-28 bottom-28 h-56 w-56 rounded-full opacity-50 blur-3xl" style={{ background: "#f9e9db" }} aria-hidden="true" />
        <div className={`relative ${leaving ? "bw-step-out" : ""}`}>
          <svg viewBox="0 0 220 120" className="h-28 w-full text-accent" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <g opacity="0.45">
              <rect className="bw-draw" pathLength={100} x="10" y="10" width="200" height="100" rx="10" />
              <path className="bw-draw" pathLength={100} d="M110 10 v100" style={{ animationDelay: "250ms" }} />
              <circle className="bw-draw" pathLength={100} cx="110" cy="60" r="18" style={{ animationDelay: "450ms" }} />
            </g>
            <ellipse className="bw-shadow" cx="110" cy="77" rx="11" ry="2.4" fill="currentColor" stroke="none" opacity="0.25" />
            {/* Tymczasowe logo: litera „B” w piłce. Podmienić na docelowe, gdy będzie plik. */}
            <g className="bw-bounce">
              <g className="bw-logo-spin">
                <circle cx="110" cy="62" r="14" fill="var(--color-accent)" stroke="var(--color-card)" strokeWidth="2.5" />
                <text x="110" y="62" textAnchor="middle" dominantBaseline="central" fontSize="17" fontWeight="700" fill="#fff" stroke="none" style={{ fontFamily: "inherit" }}>B</text>
              </g>
            </g>
          </svg>
          <h1 className="bw-rise mt-6 text-[44px] font-semibold leading-none tracking-tight text-ink" style={{ animationDelay: "120ms" }}>Ballwise</h1>
          <p className="bw-rise mt-4 text-lg text-ink/70" style={{ animationDelay: "200ms" }}>{INTRO.tagline.split(". ")[0]}. <span className="font-medium" style={{ color: "var(--color-accent)" }}>{INTRO.tagline.split(". ")[1]}</span></p>
          <ul className="bw-stagger mt-8 flex flex-col gap-3">
            {INTRO.promises.map((t, i) => {
              const tn = PRIMARY; void i;
              return (
                <li key={t} className="flex items-center gap-3 text-[15px] text-ink/85">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: tn.s, color: tn.solid, boxShadow: `inset 0 0 0 1px ${tn.c}` }}><Check /></span>{t}
                </li>
              );
            })}
          </ul>
          <p className="bw-rise mt-6 flex items-center gap-2 text-xs text-muted" style={{ animationDelay: "420ms" }}>
            <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: SECONDARY.s, color: SECONDARY.i, boxShadow: `inset 0 0 0 1px ${SECONDARY.c}` }}>16+</span>{INTRO.ageNote}
          </p>
        </div>
        <div className="flex-1" />
        <button onClick={() => go(1)} className="bw-grad bw-rise relative w-full rounded-2xl py-4 text-base font-medium shadow-sm" style={{ animationDelay: "500ms" }}>{INTRO.start}</button>
      </main>
    );
  }

  const art = [1, 1, 1, 2, 2, 3, 4][step]!;
  const tone = STEP_TONES[step]!;

  return (
    <main className="bw-grad-soft mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden px-5 pb-5 pt-5" style={{ "--tone": tone.c, "--tone-soft": tone.s, "--tone-ink": tone.i, "--tone-solid": tone.solid } as React.CSSProperties}>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => go(step - 1)} className="-ml-1 rounded-xl px-2 py-1 text-xl text-muted active:scale-90" aria-label={BUTTON.back}>‹</button>
        <div className="flex flex-1 gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={LAST_STEP} aria-valuenow={step} aria-label={`Krok ${step} z ${LAST_STEP}`}>
          {range(1, LAST_STEP).map((k) => (
            <div key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-hairline">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: k <= step ? "100%" : "0%", background: STEP_TONES[k]!.c }} />
            </div>
          ))}
        </div>
        <span className="w-9 text-right text-xs tabular-nums text-muted">{step}/{LAST_STEP}</span>
      </div>

      <div key={`step-${step}`} className={`${leaving ? (dir === 1 ? "bw-step-out" : "bw-step-out-back") : dir === 1 ? "bw-step" : "bw-step-back"} flex min-h-0 flex-1 flex-col overflow-y-auto pb-2`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-ink">{STEP_TITLE[step]}</h1>
            <p className="mt-1 text-[13.5px] leading-snug text-muted">{STEP_HINT[step]}</p>
          </div>
          <StepArt step={art} />
        </div>

        {step === 1 && (
          <div className="bw-stagger flex flex-col gap-3">
            <Section title={LABEL.name}>
              <input className={input} value={a.name} placeholder={LABEL.namePlaceholder} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") next(); }}
                autoComplete="given-name" aria-label={LABEL.name} maxLength={40} />
            </Section>
            <Section title={`${LABEL.age}, ${LABEL.weight.toLowerCase()} i ${LABEL.height.toLowerCase()}`} hint={LABEL.ageNote}>
              <div className="grid grid-cols-3 gap-2">
                <Wheel label={LABEL.age} values={range(MIN_AGE, 45)} value={a.age} onChange={(v) => set({ age: v })} />
                <Wheel label={LABEL.weight} values={range(45, 130)} value={a.weight} onChange={(v) => set({ weight: v })} format={(v) => `${v} kg`} />
                {a.height === null ? (
                  <div className="flex flex-col items-center">
                    <span className="text-sm text-muted">{LABEL.height}</span>
                    <button type="button" onClick={() => { tap(); set({ height: 175 }); }} className="mt-3 w-full rounded-2xl bg-canvas px-1 py-6 text-[13px] text-muted">{LABEL.heightAdd}</button>
                  </div>
                ) : (
                  <Wheel label={LABEL.height} values={range(140, 210)} value={a.height} onChange={(v) => set({ height: v })} format={(v) => `${v} cm`} />
                )}
              </div>
              <p className="mt-3 text-xs leading-snug text-muted">
                {LABEL.heightNote}{" "}
                {a.height !== null && <button type="button" onClick={() => { tap(); set({ height: null }); }} className="underline">{LABEL.heightSkip}</button>}
              </p>
            </Section>
            {!a.equipment.includes("gym") && (
              <Section title="Masz w domu hantle lub gumę? (opcjonalnie)">
                <div className="grid grid-cols-2 gap-2">
                  {HOME_GEAR.map(([v, t]) => (
                    <Pick key={v} on={a.homeGear.includes(v)} onTap={() => set({ homeGear: toggle(a.homeGear, v) })} className="rounded-2xl px-2 py-3 text-[14px] font-medium">{t}</Pick>
                  ))}
                </div>
              </Section>
            )}
            {a.equipment.includes("gym") && (
              <Section title="Czego brakuje na Twojej siłowni? (nie wiesz? pomiń)">
                <div className="flex flex-wrap gap-2">
                  {GEAR.map(([v, t]) => (
                    <Pick key={v} on={a.missingGear.includes(v)} onTap={() => set({ missingGear: toggle(a.missingGear, v) })} className="rounded-2xl px-3 py-2 text-[13px] font-medium">{t}</Pick>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="bw-stagger flex flex-col gap-3">
            <Section title={LABEL.position}>
              <PitchPicker value={a.position} onPick={(p) => set({ position: p })} />
              <div className="mt-2 grid grid-cols-3 gap-2">
                {POSITIONS.map(([v, t]) => (
                  <Pick key={v} on={a.position === v} onTap={() => set({ position: v })} className="rounded-2xl px-1 py-2 text-[12.5px] font-medium">{t}</Pick>
                ))}
              </div>
            </Section>
            <Section title={LABEL.feel}>
              <div className="flex flex-col gap-1.5">
                {FEEL_NOW.map(([v, t]) => (
                  <Tile key={v} on={a.feelNow.includes(v)} onTap={() => set({ feelNow: toggle<FeelNow>(a.feelNow, v) })} title={t} />
                ))}
              </div>
              {a.feelNow.includes("other") && <p className="bw-rise mt-2 px-1 text-xs leading-snug text-muted">{LABEL.feelOtherNote}</p>}
            </Section>
          </div>
        )}

        {step === 3 && (
          <div className="bw-stagger flex flex-col gap-2">
            {GOALS.map(([v, t, d]) => (
              <Tile key={v} on={a.goals.includes(v)} onTap={() => toggleGoal(v)} title={t} sub={d} badge={a.goals.indexOf(v) === 0 ? "1" : "2"} alt={a.goals.indexOf(v) === 1} />
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="bw-stagger flex flex-col gap-3">
            <Section title={LABEL.season}>
              <div className="flex flex-col gap-1.5">
                {SEASONS.map(([v, t, d]) => <Tile key={v} on={a.season === v} onTap={() => set({ season: v })} title={t} sub={d} />)}
              </div>
            </Section>
            <Section title={LABEL.league}>
              <button onClick={() => setLeagueSheet(true)} className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-card px-4 py-3 text-left active:scale-[0.985]">
                <span className={a.league ? "font-medium" : "text-muted"}>{a.league ?? LABEL.leagueEmpty}</span>
                <span className="text-lg" style={{ color: "var(--tone)" }}>›</span>
              </button>
            </Section>
          </div>
        )}

        {step === 5 && (
          <div className="bw-stagger flex flex-col gap-3">
            <Section title={LABEL.years}>
              <Wheel label="Staż siłowy" values={range(0, 15)} value={a.years} onChange={(v) => set({ years: v })} format={yearsText} />
            </Section>
            <Section title={LABEL.equipment}>
              <div className="grid grid-cols-2 gap-2">
                {EQUIPMENT.map(([v, t]) => (
                  <Pick key={v} on={a.equipment.includes(v)} onTap={() => set({ equipment: toggle(a.equipment, v) })} className="rounded-2xl px-2 py-3 text-[14px] font-medium">{t}</Pick>
                ))}
              </div>
            </Section>
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-col gap-3">
            <Section title="Twoje dni" hint={dayHelp(a.season)}>
              <div className="grid grid-cols-7 gap-1.5">
                {a.days.map((d, i) => {
                  const st: DayState = d;
                  return (
                    <button key={`${i}-${st}`} aria-label={`${WEEKDAY_SHORT[i]!}: ${st === "match" && a.season && a.season !== "inseason" ? "sparing" : DAY_LABEL[st]}`} onClick={() => { tap(); set({ days: a.days.map((x, k) => (k === i ? nextDayState(st, a.season) : x)) }); }}
                      className={`bw-pop flex h-16 flex-col items-center justify-center rounded-2xl ${DAY_STYLE[st]}`}>
                      <span className="text-sm font-semibold no-underline">{WEEKDAY_SHORT[i]!}</span>
                      <span className={`mt-1 text-[9px] ${st === "free" ? "text-muted" : ""}`}>{st === "match" && a.season && a.season !== "inseason" ? "sparing" : DAY_LABEL[st]}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#fdf3ea] shadow-[inset_0_0_0_1px_#f0c29d]" />trening w klubie</span>
                <span className="flex items-center gap-1.5"><span className="bw-sel h-2.5 w-2.5 rounded-full" />{a.season && a.season !== "inseason" ? "sparing" : "mecz"}</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-hairline" />zajęty: bez naszych treningów</span>
              </div>
            </Section>
          </div>
        )}
      </div>

      {error && <p key={`err-${errorKey}`} className="bw-shake mt-2 shrink-0 text-center text-sm text-red-ink" role="alert">{error}</p>}
      <button onClick={next} className="bw-grad mt-3 w-full shrink-0 rounded-2xl py-3.5 text-base font-medium shadow-sm active:scale-[0.99]">
        {step === LAST_STEP ? BUTTON.done : BUTTON.next}
      </button>

      {leagueSheet && (
        <Sheet title="Poziom rozgrywek" onClose={() => setLeagueSheet(false)}>
          <div className="flex flex-col">
            {LEAGUES.map((l) => (
              <button key={l} onClick={() => { set({ league: l }); setLeagueSheet(false); }}
                className="flex items-center justify-between border-b border-hairline py-3.5 text-left last:border-0">
                <span className={a.league === l ? "font-semibold text-accent" : ""}>{l}</span>
                {a.league === l && <span className="text-accent"><Check /></span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </main>
  );
}
