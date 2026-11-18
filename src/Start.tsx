import { useState } from "react";
import { localISO, planForProfile, strainOf, weekStartOf } from "./engine";
import type { CheckIn, DayPlan, Profile, SessionKind } from "./engine";
import { PageHeader } from "./Sketch";
import { MatchInMind, imageryMinutes } from "./MatchInMind";

const OPTIONS: Array<[1 | 2 | 3, string]> = [[1, "Słabo"], [2, "Średnio"], [3, "Dobrze"]];
const KIND: Record<SessionKind, string> = {
  strength: "Siła", run: "Bieganie", sprint: "Sprint", technique: "Technika z piłką", activation: "Aktywacja", recovery: "Regeneracja",
};

function Pick({ label, value, onChange }: { label: string; value: 1 | 2 | 3; onChange: (v: 1 | 2 | 3) => void }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      <div className="flex gap-1.5 rounded-xl bg-canvas p-1">
        {OPTIONS.map(([v, t]) => (
          <button key={v} onClick={() => onChange(v)}
            className={`flex-1 rounded-lg py-1.5 text-sm transition ${value === v ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}

const STRAIN_TEXT = {
  none: "Dziś pełna sesja zgodnie z planem.",
  light: "Dziś lżej: mniej serii, ten sam plan.",
  heavy: "Dziś wyraźnie lżej: łatwiejsze ćwiczenia i krótsza sesja.",
} as const;

function phaseText(d: DayPlan): string {
  if (d.isMatch) return "Dzień meczu";
  const m = /^MD-(\d)$/.exec(d.phase);
  if (m) return `Mecz za ${m[1]} ${m[1] === "1" ? "dzień" : "dni"}`;
  if (d.phase === "MD+1") return "Dzień po meczu";
  return "";
}

export function Start({ profile, checkIn, onCheckIn, onOpenDay }: {
  profile: Profile; checkIn: CheckIn; onCheckIn: (c: CheckIn) => void; onOpenDay: (d: DayPlan) => void;
}) {
  const [imagery, setImagery] = useState(false);
  const todayISO = localISO();
  const day = planForProfile(profile, weekStartOf(todayISO)).days.find((d) => d.date === todayISO);
  const matchSoon = !!day && (day.isMatch || day.phase === "MD-1");

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-14">
      <PageHeader kind="start" title="Dziś" sub={new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })} />

      <section className="mb-4 rounded-2xl border border-hairline bg-card p-4">
        <h2 className="mb-3 text-base font-semibold">Jak się czujesz?</h2>
        <Pick label="Sen" value={checkIn.sleep} onChange={(v) => onCheckIn({ ...checkIn, sleep: v })} />
        <Pick label="Samopoczucie" value={checkIn.feeling} onChange={(v) => onCheckIn({ ...checkIn, feeling: v })} />
        <button onClick={() => onCheckIn({ ...checkIn, less: !checkIn.less })}
          className={`w-full rounded-xl py-2 text-sm transition ${checkIn.less ? "bg-ink font-medium text-card" : "bg-canvas text-muted"}`}>
          Dziś mniej / brak czasu
        </button>
        <p className="mt-3 text-sm text-muted">{STRAIN_TEXT[strainOf(checkIn)]}</p>
      </section>

      {day && (
        <button onClick={() => day.session && onOpenDay(day)}
          className="mb-4 flex w-full items-center justify-between rounded-2xl border border-hairline bg-card p-4 text-left">
          <div>
            <div className="text-xs text-muted">{phaseText(day) || "Dzisiejsza sesja"}{day.isClub ? " · trening klubowy" : ""}</div>
            <div className="mt-0.5 text-base font-semibold">
              {day.isMatch ? "Mecz" : day.session ? KIND[day.session.kind] : "Wolne"}
            </div>
            {day.session?.reason && <div className="mt-0.5 text-xs text-muted">{day.session.reason}</div>}
          </div>
          {day.session && <span className="shrink-0 whitespace-nowrap text-sm text-muted">Otwórz ›</span>}
        </button>
      )}

      <section className="rounded-2xl border border-hairline bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Mecz w głowie</h2>
            <p className="mt-1 text-sm text-muted">
              {imageryMinutes(profile.position)} min prowadzonej wizualizacji akcji Twojej pozycji.
              {matchSoon ? " Najlepszy moment to dziś." : " Najlepiej dzień przed meczem i w dniu meczu."}
            </p>
          </div>
        </div>
        <button onClick={() => setImagery(true)}
          className={`mt-3 w-full rounded-xl py-2.5 text-sm font-medium ${matchSoon ? "bg-ink text-card" : "border border-hairline bg-canvas text-ink"}`}>
          Zacznij
        </button>
        <p className="mt-2 text-[11px] text-muted">Treści to szkice do przeglądu trenera.</p>
      </section>

      {imagery && <MatchInMind position={profile.position} onClose={() => setImagery(false)} />}
    </main>
  );
}
