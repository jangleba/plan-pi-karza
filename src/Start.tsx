import { Suspense, lazy, useEffect, useState } from "react";
import { readinessScore, restSuggested, strainOf } from "./engine";
import type { CheckIn, Profile } from "./engine";
import { Sheet } from "./Sheet";
import { LegalSheet } from "./legal/LegalUi";
import { EnglishCard } from "./english/EnglishCard";
import { DaySkipToggle } from "./DaySkipToggle";

// Moduł nauki ładuje się dopiero po otwarciu (osobny fragment pakietu): nie spowalnia strony głównej.
const EnglishModule = lazy(() => import("./english/EnglishModule"));

const LEVELS: Array<[1 | 2 | 3, string]> = [[1, "Słabo"], [2, "Średnio"], [3, "Dobrze"]];
const STRAIN = { none: "Pełna sesja", light: "Trochę lżej", heavy: "Wyraźnie lżej" } as const;

/** Pierścień gotowości; dotknięcie otwiera check-in. */
/** Liczba „doliczająca się” do celu (easeOutCubic). */
function useCountUp(to: number, run: boolean, ms = 800): number {
  const [v, setV] = useState(run ? 0 : to);
  useEffect(() => {
    if (!run) { setV(to); return; }
    let raf = 0;
    const from = 0, t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return v;
}

function Ring({ value, done, onTap }: { value: number; done: boolean; onTap: () => void }) {
  const r = 70, c = 2 * Math.PI * r;
  const shown = useCountUp(value, done);
  return (
    <button onClick={onTap} className="relative mx-auto block h-40 w-40" aria-label="Check-in">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="10" />
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={done ? c * (1 - value / 100) : c} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] font-semibold tabular-nums tracking-tight">{done ? shown : "?"}</span>
        <span className="mt-1 text-xs text-muted">{done ? "gotowość (orientacyjnie)" : "dotknij"}</span>
      </span>
    </button>
  );
}

function Choice({ label, value, onChange }: { label: string; value: 1 | 2 | 3; onChange: (v: 1 | 2 | 3) => void }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-sm text-muted">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map(([v, t]) => (
          <button key={v} onClick={() => onChange(v)}
            className={`rounded-2xl py-3.5 text-sm font-medium ${value === v ? "bw-sel" : "bg-canvas text-ink"}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}

export function Start({ profile, checkIn, checkedIn, onCheckIn, onSettings }: {
  profile: Profile; checkIn: CheckIn; checkedIn: boolean; onCheckIn: (c: CheckIn) => void; onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [safety, setSafety] = useState(false);
  const [english, setEnglish] = useState(false);
  const [englishTick, setEnglishTick] = useState(0);

  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-14">
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted">{new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</p>
        <button onClick={onSettings} aria-label="Ustawienia" className="-mr-2 -mt-2 rounded-full p-2 text-muted"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></button>
      </div>
      <h1 className="mb-6 text-[32px] font-semibold tracking-tight">{profile.name ? `Cześć, ${profile.name}` : "Dziś"}</h1>

      <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card px-5 py-5">
        <Ring value={readinessScore(checkIn)} done={checkedIn} onTap={() => setOpen(true)} />
        <p className="mt-3 text-center text-sm text-muted">{!checkedIn ? "Jak się czujesz? Dotknij, by odpowiedzieć" : restSuggested(checkIn) ? "Wyraźnie lżej: dziś proponujemy regenerację" : STRAIN[strainOf(checkIn)]}</p>
        <p className="mt-2 text-center text-[11px] leading-snug text-muted">
          Wynik jest orientacyjny, liczony z Twojej odpowiedzi (samopoczucie, regeneracja po wczoraj), bez gwarancji. Przy bólu lub złym samopoczuciu odpuść.{" "}
          <button onClick={() => setSafety(true)} className="underline">Zasady bezpieczeństwa</button>
        </p>
      </section>

      <EnglishCard onOpen={() => setEnglish(true)} refreshKey={englishTick} />
      {english && (
        <Suspense fallback={<div className="fixed inset-0 z-30 flex items-center justify-center bg-canvas text-sm text-muted" role="status">Ładowanie…</div>}>
          <EnglishModule onClose={() => { setEnglish(false); setEnglishTick((t) => t + 1); }} />
        </Suspense>
      )}


      {safety && <LegalSheet kind="safety" onClose={() => setSafety(false)} />}
      {open && (
        <Sheet title="Jak się czujesz?" onClose={() => setOpen(false)}>
          <Choice label="Samopoczucie" value={checkIn.feeling} onChange={(v) => onCheckIn({ ...checkIn, feeling: v })} />
          <Choice label="Regeneracja po wczoraj" value={checkIn.recovery} onChange={(v) => onCheckIn({ ...checkIn, recovery: v })} />
          <div className="mb-6 flex flex-col gap-3">
            <button onClick={() => onCheckIn({ ...checkIn, less: !checkIn.less })}
              className={`w-full rounded-2xl py-3.5 text-sm font-medium ${checkIn.less ? "bw-sel" : "bg-canvas text-ink"}`}>
              Dziś mniej
            </button>
            <DaySkipToggle profile={profile} />
          </div>
          <button onClick={() => { onCheckIn(checkIn); setOpen(false); }} className="w-full bw-grad rounded-2xl py-4 text-base font-medium">Gotowe</button>
        </Sheet>
      )}
    </main>
  );
}
