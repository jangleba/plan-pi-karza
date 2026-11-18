import { useEffect, useMemo, useState } from "react";
import { calcMas, datesForWeek, formatPace, levelOf, planWeek, weekInCycle } from "./engine";
import type { CheckIn, DayPlan, Mas, Profile, SessionKind } from "./engine";
import { Onboarding } from "./Onboarding";
import { Auth } from "./Auth";
import { supabase } from "./lib/supabase";
import { pullAll, pushCheckIn, pushMas, pushProfile } from "./lib/sync";
import { loadLog, saveLog } from "./engine";
import { SessionSheet } from "./SessionSheet";

const KIND_LABEL: Record<SessionKind, string> = {
  strength: "Siła",
  run: "Bieganie",
  sprint: "Sprint",
  technique: "Technika z piłką",
  activation: "Aktywacja",
  recovery: "Regeneracja",
};

/** Kolory znaczeniowe: zielony = mocna praca, żółty = lekka, czerwony = mecz. */
const KIND_TONE: Record<SessionKind, string> = {
  strength: "bg-green-soft text-green-ink",
  run: "bg-green-soft text-green-ink",
  sprint: "bg-green-soft text-green-ink",
  technique: "bg-blue-soft text-blue-ink",
  activation: "bg-yellow-soft text-yellow-ink",
  recovery: "bg-yellow-soft text-yellow-ink",
};

const WEEKDAY = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function mondayOf(d: Date): string {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const shift = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - shift);
  return copy.toISOString().slice(0, 10);
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`self-start rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{children}</span>;
}

function DayRow({ day, index, onOpen }: { day: DayPlan; index: number; onOpen: () => void }) {
  const s = day.session;
  return (
    <li
      onClick={s ? onOpen : undefined}
      className={`flex items-center gap-4 rounded-2xl bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${s ? "cursor-pointer active:scale-[0.99]" : ""}`}
    >
      <div className="w-10 text-center">
        <div className="text-[11px] uppercase tracking-wide text-muted">{WEEKDAY[index]}</div>
        <div className="text-lg font-semibold">{Number(day.date.slice(8))}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {day.isMatch && <Chip tone="bg-red-soft text-red-ink">Mecz</Chip>}
        {day.isClub && <Chip tone="bg-blue-soft text-blue-ink">Trening klubowy</Chip>}
        {s && (
          <div className="flex flex-col">
            <Chip tone={KIND_TONE[s.kind]}>
              {KIND_LABEL[s.kind]}
              {s.variant === "upper" ? " · góra" : s.variant === "light" ? " · lekki" : ""}
            </Chip>
            {s.reason && <p className="mt-1 text-xs text-muted">{s.reason}</p>}
          </div>
        )}
        {!day.isMatch && !day.isClub && !s && <span className="text-sm text-muted">Wolne</span>}
      </div>
    </li>
  );
}

const OPTIONS: Array<[1 | 2 | 3, string]> = [[1, "Słabo"], [2, "Średnio"], [3, "Dobrze"]];

function Pick({ label, value, onChange }: { label: string; value: 1 | 2 | 3; onChange: (v: 1 | 2 | 3) => void }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      <div className="flex gap-1.5 rounded-xl bg-canvas p-1">
        {OPTIONS.map(([v, t]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`flex-1 rounded-lg py-1.5 text-sm transition ${value === v ? "bg-card font-medium shadow-sm" : "text-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function loadDistance(): number | null {
  try {
    const v = Number(localStorage.getItem("masDistance"));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function MasCard({ distance, onSave }: { distance: number | null; onSave: (d: number) => void }) {
  const [text, setText] = useState("");
  const mas: Mas | null = distance ? calcMas(distance) : null;
  return (
    <section className="mb-5 rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h2 className="mb-1 text-base font-semibold">Twoje MAS</h2>
      {mas ? (
        <p className="text-sm text-muted">
          {mas.kmh.toFixed(1)} km/h · tempo {formatPace(mas.paceSecPerKm)} ({distance} m w 5 min)
        </p>
      ) : (
        <p className="text-sm text-muted">Wpisz dystans z biegu 5-minutowego.</p>
      )}
      <div className="mt-3 flex gap-2">
        <input
          inputMode="numeric"
          placeholder="dystans w metrach"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-canvas px-3 py-2 text-sm outline-none"
        />
        <button
          onClick={() => {
            const d = Number(text);
            if (d >= 500 && d <= 2500) { onSave(d); setText(""); }
          }}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white"
        >
          Zapisz
        </button>
      </div>
    </section>
  );
}

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem("profile");
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [session, setSession] = useState<"loading" | "out" | "in">(supabase ? "loading" : "in");
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ? "in" : "out"));
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess ? "in" : "out"));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === "loading") return null;
  if (session === "out") return <Auth />;
  return <Gate />;
}

const today = () => new Date().toISOString().slice(0, 10);

function store(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* brak pamięci */ }
}

function loadCheckIn(): CheckIn {
  try {
    const raw = localStorage.getItem(`checkIn:${today()}`);
    if (raw) return JSON.parse(raw) as CheckIn;
  } catch { /* użyj domyślnego */ }
  return { sleep: 3, feeling: 3, less: false };
}

function Gate() {
  const [ready, setReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const r = await pullAll(today());
      if (r && alive) {
        if (r.profile) store("profile", JSON.stringify(r.profile));
        else { const local = loadProfile(); if (local) void pushProfile(local); }
        if (r.masDistance) store("masDistance", String(r.masDistance));
        if (Object.keys(r.weightLog).length) saveLog({ ...loadLog(), ...r.weightLog });
        if (r.checkIn) store(`checkIn:${today()}`, JSON.stringify(r.checkIn));
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);
  if (!ready) return null;
  return <Main />;
}

function Main() {
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  if (!profile) {
    return (
      <Onboarding
        onDone={(raw) => {
          const p = { ...raw, startDate: new Date().toISOString().slice(0, 10) };
          store("profile", JSON.stringify(p));
          void pushProfile(p);
          setProfile(p);
        }}
      />
    );
  }
  return <Home profile={profile} onReset={() => {
    try { localStorage.removeItem("profile"); } catch { /* brak pamięci */ }
    setProfile(null);
  }} />;
}

function Home({ profile, onReset }: { profile: Profile; onReset: () => void }) {
  const [distance, setDistance] = useState<number | null>(loadDistance);
  const mas = useMemo(() => (distance ? calcMas(distance) : null), [distance]);
  const [checkIn, setCheckInState] = useState<CheckIn>(loadCheckIn);
  const setCheckIn = (c: CheckIn) => {
    setCheckInState(c);
    store(`checkIn:${today()}`, JSON.stringify(c));
    void pushCheckIn(today(), c);
  };
  const [open, setOpen] = useState<DayPlan | null>(null);
  const weekStart = useMemo(() => mondayOf(new Date()), []);
  const plan = useMemo(
    () =>
      planWeek({
        weekStart,
        matches: datesForWeek(weekStart, profile.matchWeekdays),
        clubDays: datesForWeek(weekStart, profile.clubWeekdays),
        level: levelOf(profile.age, profile.strengthYears),
        limitedGymAccess: profile.limitedGymAccess,
      }),
    [weekStart, profile],
  );

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-14">
      <h1 className="text-3xl font-semibold tracking-tight">Twój tydzień</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Plan dopasowany do meczu. <button onClick={onReset} className="underline">Zmień profil</button>
      </p>
      <MasCard
        distance={distance}
        onSave={(d) => {
          setDistance(d);
          store("masDistance", String(d));
          void pushMas(d);
        }}
      />
      <section className="mb-5 rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="mb-3 text-base font-semibold">Jak dziś?</h2>
        <Pick label="Sen" value={checkIn.sleep} onChange={(v) => setCheckIn({ ...checkIn, sleep: v })} />
        <Pick label="Samopoczucie" value={checkIn.feeling} onChange={(v) => setCheckIn({ ...checkIn, feeling: v })} />
        <button
          onClick={() => setCheckIn({ ...checkIn, less: !checkIn.less })}
          className={`w-full rounded-xl py-2 text-sm transition ${checkIn.less ? "bg-yellow-soft font-medium text-yellow-ink" : "bg-canvas text-muted"}`}
        >
          Dziś mniej / brak czasu
        </button>
      </section>
      <ul className="flex flex-col gap-2.5">
        {plan.days.map((d, i) => (
          <DayRow key={d.date} day={d} index={i} onOpen={() => setOpen(d)} />
        ))}
      </ul>
      {open && (
        <SessionSheet day={open} checkIn={checkIn} weekInCycle={weekInCycle(profile.startDate, weekStart)} mas={mas} level={levelOf(profile.age, profile.strengthYears)} onClose={() => setOpen(null)} />
      )}
      {plan.warnings.length > 0 && (
        <p className="mt-4 rounded-2xl bg-yellow-soft p-3 text-sm text-yellow-ink">
          {plan.warnings.join(" ")}
        </p>
      )}
    </main>
  );
}
