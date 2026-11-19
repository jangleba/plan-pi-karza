import { useEffect, useState } from "react";
import { FEEL_NOW, cycleWeekFor, feelDue, levelOf, loadFeelings, localISO, planForProfile, readinessScore, saveFeeling, strainOf, weekStartOf } from "./engine";
import type { CheckIn, DayPlan, FeelNow, Profile, SessionKind } from "./engine";
import { Sheet } from "./Sheet";
import { SessionSheet } from "./SessionSheet";
import { MatchInMind } from "./MatchInMind";
import { Group, ListRow } from "./ui";

const KIND: Record<SessionKind, string> = {
  strength: "Siła", run: "Bieganie", sprint: "Sprint", technique: "Technika", activation: "Aktywacja", recovery: "Regeneracja",
};
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
        <span className="text-5xl font-semibold tabular-nums tracking-tight">{done ? shown : "?"}</span>
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

function matchIn(d: DayPlan): string | null {
  if (d.isMatch) return "Dziś mecz";
  const m = /^MD-(\d)$/.exec(d.phase);
  return m ? `Mecz za ${m[1]} ${m[1] === "1" ? "dzień" : "dni"}` : null;
}

export function Start({ profile, checkIn, checkedIn, onCheckIn }: {
  profile: Profile; checkIn: CheckIn; checkedIn: boolean; onCheckIn: (c: CheckIn) => void;
}) {
  const [sheet, setSheet] = useState<"checkin" | "session" | "mind" | "feel" | null>(null);
  const [feel, setFeel] = useState<FeelNow[]>([]);
  const [feelTick, setFeelTick] = useState(0);
  void feelTick;
  const feelings = loadFeelings();
  const today = localISO();
  const ws = weekStartOf(today);
  const day = planForProfile(profile, ws).days.find((d) => d.date === today);

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <p className="text-sm text-muted">{new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1 className="mb-8 text-[32px] font-semibold tracking-tight">{profile.name ? `Cześć, ${profile.name}` : "Dziś"}</h1>

      <Ring value={readinessScore(checkIn)} done={checkedIn} onTap={() => setSheet("checkin")} />
      <p className="mb-8 mt-3 text-center text-sm text-muted">{checkedIn ? STRAIN[strainOf(checkIn)] : "Jak się czujesz?"}</p>

      <Group>
        {day && (
          <ListRow
            index={0}
            title={day.isOff ? "Dzień wolny od treningu" : day.isMatch ? "Mecz" : day.session ? KIND[day.session.kind] : "Wolne"}
            sub={day.session?.reason || undefined}
            detail={day.isClub ? "+ klub" : undefined}
            onTap={day.session ? () => setSheet("session") : undefined}
          />
        )}
        <ListRow index={1} title="Mecz w głowie" detail="3 min" onTap={() => setSheet("mind")} />
        {feelDue(feelings.at(-1), today) && <ListRow index={2} title="Jak czujesz się na boisku?" detail="co 5 tyg." onTap={() => { setFeel([]); setSheet("feel"); }} />}
        {day && matchIn(day) && <ListRow index={3} title={matchIn(day)!} />}
      </Group>

      {sheet === "checkin" && (
        <Sheet title="Jak się czujesz?" onClose={() => setSheet(null)}>
          <Choice label="Sen" value={checkIn.sleep} onChange={(v) => onCheckIn({ ...checkIn, sleep: v })} />
          <Choice label="Samopoczucie" value={checkIn.feeling} onChange={(v) => onCheckIn({ ...checkIn, feeling: v })} />
          <button onClick={() => onCheckIn({ ...checkIn, less: !checkIn.less })}
            className={`mb-6 w-full rounded-2xl py-3.5 text-sm font-medium ${checkIn.less ? "bw-sel" : "bg-canvas text-ink"}`}>
            Dziś mniej
          </button>
          <button onClick={() => { onCheckIn(checkIn); setSheet(null); }} className="w-full bw-grad rounded-2xl py-4 text-base font-medium">Gotowe</button>
        </Sheet>
      )}
      {sheet === "session" && day && (
        <SessionSheet day={day} checkIn={checkIn} weekInCycle={cycleWeekFor(profile, ws)}
          level={levelOf(profile.age, profile.strengthYears)} position={profile.position}
          hasGym={profile.equipment.includes("gym")} onClose={() => setSheet(null)} />
      )}
      {sheet === "mind" && <MatchInMind position={profile.position} onClose={() => setSheet(null)} />}
      {sheet === "feel" && (
        <Sheet title="Jak czujesz się na boisku?" onClose={() => setSheet(null)}>
          <div className="mb-6 flex flex-col gap-2">
            {FEEL_NOW.map(([v, t]) => {
              const on = feel.includes(v);
              return (
                <button key={`${v}-${on}`} onClick={() => setFeel(on ? feel.filter((x) => x !== v) : [...feel, v])}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-left ${on ? "bw-pop bw-sel font-semibold" : "border border-hairline bg-card"}`}>
                  {t}<span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${on ? "bw-grad" : "border border-hairline"}`}>{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => { saveFeeling({ date: today, now: feel }); setFeelTick((x) => x + 1); setSheet(null); }}
            className="bw-grad w-full rounded-2xl py-4 text-base font-medium">{feel.length ? "Zapisz" : "Wszystko gra – zapisz"}</button>
        </Sheet>
      )}
    </main>
  );
}
