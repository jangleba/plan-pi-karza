import { useState } from "react";
import { cycleWeekFor, levelOf, localISO, planForProfile, readinessScore, strainOf, weekStartOf } from "./engine";
import type { CheckIn, DayPlan, Profile, SessionKind } from "./engine";
import { Sheet } from "./Sheet";
import { SessionSheet } from "./SessionSheet";
import { MatchInMind } from "./MatchInMind";

const KIND: Record<SessionKind, string> = {
  strength: "Siła", run: "Bieganie", sprint: "Sprint", technique: "Technika", activation: "Aktywacja", recovery: "Regeneracja",
};
const LEVELS: Array<[1 | 2 | 3, string]> = [[1, "Słabo"], [2, "Średnio"], [3, "Dobrze"]];
const STRAIN = { none: "Pełna sesja", light: "Trochę lżej", heavy: "Wyraźnie lżej" } as const;

/** Pierścień gotowości; dotknięcie otwiera check-in. */
function Ring({ value, done, onTap }: { value: number; done: boolean; onTap: () => void }) {
  const r = 70, c = 2 * Math.PI * r;
  return (
    <button onClick={onTap} className="relative mx-auto block h-48 w-48" aria-label="Check-in">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="bw-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8ec1f0" /><stop offset="100%" stopColor="#2f6fb3" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="10" />
        <circle cx="80" cy="80" r={r} fill="none" stroke="url(#bw-ring)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={done ? c * (1 - value / 100) : c} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-semibold tabular-nums tracking-tight">{done ? value : "?"}</span>
        <span className="mt-1 text-xs text-muted">{done ? "gotowość" : "dotknij"}</span>
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

function Row({ title, detail, onTap }: { title: string; detail?: string; onTap?: () => void }) {
  return (
    <button onClick={onTap} disabled={!onTap}
      className="flex w-full items-center justify-between border-b border-hairline py-4 text-left last:border-0 disabled:active:scale-100">
      <span className="text-base font-medium">{title}</span>
      <span className="flex items-center gap-2 text-sm text-muted">{detail}{onTap && <span className="text-accent">›</span>}</span>
    </button>
  );
}

function matchIn(d: DayPlan): string | null {
  if (d.isMatch) return "Dziś mecz";
  const m = /^MD-(\d)$/.exec(d.phase);
  return m ? `Mecz za ${m[1]} ${m[1] === "1" ? "dzień" : "dni"}` : null;
}

export function Start({ profile, checkIn, checkedIn, onCheckIn }: {
  profile: Profile; checkIn: CheckIn; checkedIn: boolean; onCheckIn: (c: CheckIn) => void;
}) {
  const [sheet, setSheet] = useState<"checkin" | "session" | "mind" | null>(null);
  const today = localISO();
  const ws = weekStartOf(today);
  const day = planForProfile(profile, ws).days.find((d) => d.date === today);

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <p className="text-sm text-muted">{new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1 className="mb-8 text-[32px] font-semibold tracking-tight">{profile.name ? `Cześć, ${profile.name}` : "Dziś"}</h1>

      <Ring value={readinessScore(checkIn)} done={checkedIn} onTap={() => setSheet("checkin")} />
      <p className="mb-8 mt-3 text-center text-sm text-muted">{checkedIn ? STRAIN[strainOf(checkIn)] : "Jak się czujesz?"}</p>

      <div className="rounded-3xl border border-hairline bg-card px-5">
        {day && (
          <Row
            title={day.isMatch ? "Mecz" : day.session ? KIND[day.session.kind] : "Wolne"}
            detail={day.isClub ? "+ klub" : undefined}
            onTap={day.session ? () => setSheet("session") : undefined}
          />
        )}
        <Row title="Mecz w głowie" detail="3 min" onTap={() => setSheet("mind")} />
        {day && matchIn(day) && <Row title={matchIn(day)!} />}
      </div>

      {sheet === "checkin" && (
        <Sheet title="Jak się czujesz?" onClose={() => setSheet(null)}>
          <Choice label="Sen" value={checkIn.sleep} onChange={(v) => onCheckIn({ ...checkIn, sleep: v })} />
          <Choice label="Samopoczucie" value={checkIn.feeling} onChange={(v) => onCheckIn({ ...checkIn, feeling: v })} />
          <button onClick={() => onCheckIn({ ...checkIn, less: !checkIn.less })}
            className={`mb-6 w-full rounded-2xl py-3.5 text-sm font-medium ${checkIn.less ? "bw-sel" : "bg-canvas text-ink"}`}>
            Dziś mniej
          </button>
          <button onClick={() => { onCheckIn(checkIn); setSheet(null); }} className="w-full bw-grad rounded-2xl py-4 text-base font-medium text-white">Gotowe</button>
        </Sheet>
      )}
      {sheet === "session" && day && (
        <SessionSheet day={day} checkIn={checkIn} weekInCycle={cycleWeekFor(profile, ws)}
          level={levelOf(profile.age, profile.strengthYears)} position={profile.position}
          hasGym={profile.equipment.includes("gym")} onClose={() => setSheet(null)} />
      )}
      {sheet === "mind" && <MatchInMind position={profile.position} onClose={() => setSheet(null)} />}
    </main>
  );
}
