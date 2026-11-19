import { useEffect, useState } from "react";
import { FEEL_NOW, cycleWeekFor, feelDue, levelOf, loadFeelings, loadHistory, localISO, planForProfile, readinessScore, saveFeeling, strainOf, weekStartOf } from "./engine";
import type { CheckIn, DayPlan, FeelNow, Profile, SessionKind } from "./engine";
import { Sheet } from "./Sheet";
import { SessionSheet } from "./SessionSheet";
import { MatchInMind } from "./MatchInMind";
import { Group, ListRow } from "./ui";
import { fuelNow } from "./fuel/now";
import type { Tab } from "./Tabs";

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
    <button onClick={onTap} className="relative mx-auto block h-40 w-40" aria-label="Check-in">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="10" />
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={done ? c * (1 - value / 100) : c} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] font-semibold tabular-nums tracking-tight">{done ? shown : "?"}</span>
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

export function Start({ profile, checkIn, checkedIn, onCheckIn, onGo }: {
  profile: Profile; checkIn: CheckIn; checkedIn: boolean; onCheckIn: (c: CheckIn) => void; onGo: (t: Tab) => void;
}) {
  const [sheet, setSheet] = useState<"checkin" | "session" | "mind" | "feel" | null>(null);
  const [feel, setFeel] = useState<FeelNow[]>([]);
  const [feelTick, setFeelTick] = useState(0);
  void feelTick;
  const feelings = loadFeelings();
  const today = localISO();
  const ws = weekStartOf(today);
  const day = planForProfile(profile, ws).days.find((d) => d.date === today);

  const history = loadHistory();
  const week = planForProfile(profile, ws).days;
  const doneOn = (iso: string, kind?: string) => history.some((e) => e.type === "session" && e.date === iso && (!kind || e.key === kind));
  const fuel = fuelNow(profile, today, new Date());
  const WD = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
  const title = day ? (day.isOff ? "Dzień wolny od treningu" : day.isMatch ? "Mecz" : day.session ? KIND[day.session.kind] : day.isClub ? "Trening klubowy" : "Wolne") : "Dziś";
  const todayDone = !!day?.session && doneOn(today, day.session.kind);

  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-14">
      <p className="text-sm text-muted">{new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1 className="mb-6 text-[32px] font-semibold tracking-tight">{profile.name ? `Cześć, ${profile.name}` : "Dziś"}</h1>

      <section className="bw-rise mb-4 rounded-3xl border border-hairline bg-card px-5 py-5">
        <Ring value={readinessScore(checkIn)} done={checkedIn} onTap={() => setSheet("checkin")} />
        <p className="mt-3 text-center text-sm text-muted">{checkedIn ? STRAIN[strainOf(checkIn)] : "Jak się czujesz? Dotknij, by odpowiedzieć"}</p>
      </section>

      {day && (
        <section className="bw-rise mb-4 rounded-3xl border border-hairline bg-card p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-muted">Dziś</span>
            <span className="flex gap-2 text-xs">
              {day.isClub && <span className="rounded-full bg-club-soft px-2.5 py-0.5 font-medium text-club">+ klub</span>}
              {matchIn(day) && <span className="rounded-full bw-sel px-2.5 py-0.5 font-medium">{matchIn(day)}</span>}
            </span>
          </div>
          <h2 className="mt-1 text-[22px] font-semibold leading-tight">{title}{todayDone && <span className="ml-2 text-base font-normal text-green-ink">✓ zrobione</span>}</h2>
          {day.session?.reason && <p className="mt-1 text-sm leading-snug text-muted">{day.session.reason}</p>}
          {day.session && <button onClick={() => setSheet("session")} className="mt-4 w-full rounded-2xl bw-grad py-3.5 text-[15px] font-medium">{todayDone ? "Zobacz sesję" : "Otwórz sesję"}</button>}
        </section>
      )}

      <section className="bw-rise mb-4 rounded-3xl border border-hairline bg-card px-4 py-4">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <span className="text-xs uppercase tracking-wide text-muted">Tydzień</span>
          <button onClick={() => onGo("plan")} className="text-xs text-accent">Plan ›</button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((d, i) => {
            const isToday = d.date === today;
            const done = !!d.session && doneOn(d.date, d.session.kind);
            const past = d.date < today;
            return (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <span className={`text-[11px] ${isToday ? "font-semibold text-accent" : "text-muted"}`}>{WD[i]}</span>
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums ${isToday ? "bw-sel font-semibold" : done ? "bw-grad" : d.isMatch ? "border border-accent text-accent" : "text-ink"} ${past && !done && !d.isMatch ? "opacity-45" : ""}`}>{done ? "✓" : Number(d.date.slice(8))}</span>
                <span className="h-1 w-1 rounded-full" style={{ background: d.isMatch ? "var(--color-accent)" : d.session ? "var(--color-btn-line)" : d.isClub ? "var(--color-club)" : "transparent" }} />
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-btn-line" />sesja</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-club" />klub</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" />mecz</span>
        </div>
      </section>

      <Group>
        {fuel && <ListRow index={0} title={`Fuel: ${fuel.title}`} sub={`${fuel.time} · ${fuel.when} · ok. ${fuel.carb} g węgli`} onTap={() => onGo("fuel")} />}
        <ListRow index={1} title="Mecz w głowie" detail="3 min" onTap={() => setSheet("mind")} />
        {feelDue(feelings.at(-1), today) && <ListRow index={2} title="Jak czujesz się na boisku?" detail="co 5 tyg." onTap={() => { setFeel([]); setSheet("feel"); }} />}
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
