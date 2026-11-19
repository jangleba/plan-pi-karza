import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { localISO, addDays, cycleWeekFor, levelOf, nextWeekUnlocked, planForProfile } from "./engine";
import type { CheckIn, DayPlan, Profile, SessionKind } from "./engine";
import { Onboarding } from "./Onboarding";
import { Start } from "./Start";
import { Backdrop } from "./Sketch";
import { Group, LargeTitle, ListRow } from "./ui";
import { Auth } from "./Auth";
import { Progress } from "./Progress";
import { Lab } from "./Lab";
import { Fuel } from "./Fuel";

// Three.js ładowane dopiero po wejściu w zakładkę IQ
const IQ = lazy(() => import("./IQ"));
import { Skeleton, TabBar, type Tab } from "./Tabs";
import { supabase } from "./lib/supabase";
import { pullAll, pushCheckIn, pushProfile } from "./lib/sync";
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

const WEEKDAY = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function mondayOf(d: Date): string {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const shift = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - shift);
  return copy.toISOString().slice(0, 10);
}

function DayRow({ day, index, isToday, onOpen }: { day: DayPlan; index: number; isToday: boolean; onOpen: () => void }) {
  const s = day.session;
  const title = day.isOff ? "Niedostępny" : day.isMatch ? "Mecz" : s ? KIND_LABEL[s.kind] + (s.variant === "upper" ? " · góra" : s.variant === "light" ? " · lekko" : "") : day.isClub ? "Trening klubowy" : "Wolne";
  return (
    <ListRow
      index={index}
      onTap={s || day.isClub ? onOpen : undefined}
      accent={day.isMatch}
      title={<span className={(!s && !day.isMatch && !day.isClub) || day.isOff ? "text-muted" : ""}>{title}</span>}
      sub={s && day.isClub ? "+ trening klubowy" : undefined}
      lead={
        <span className={`flex w-11 shrink-0 flex-col items-center rounded-2xl py-1 ${isToday ? "bw-sel" : ""}`}>
          <span className={`text-[10px] uppercase tracking-wide ${isToday ? "text-accent/80" : "text-muted"}`}>{WEEKDAY[index]}</span>
          <span className="text-lg font-semibold leading-tight tabular-nums">{Number(day.date.slice(8))}</span>
        </span>
      }
    />
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

const today = () => localISO();

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
  const [tab, setTab] = useState<Tab>("start");
  const [checkIn, setCheckInState] = useState<CheckIn>(loadCheckIn);
  const [checkedIn, setCheckedIn] = useState(() => {
    try { return localStorage.getItem(`checkIn:${today()}`) !== null; } catch { return false; }
  });
  const setCheckIn = (c: CheckIn) => {
    setCheckInState(c);
    setCheckedIn(true);
    store(`checkIn:${today()}`, JSON.stringify(c));
    void pushCheckIn(today(), c);
  };
  const [openDay, setOpenDay] = useState<DayPlan | null>(null);
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  if (!profile) {
    return (
      <Onboarding
        onDone={(raw) => {
          const p = { ...raw, startDate: localISO() };
          store("profile", JSON.stringify(p));
          void pushProfile(p);
          setProfile(p);
          setTab("start");
          window.scrollTo(0, 0);
        }}
      />
    );
  }
  return (
    <div className="bw-backdrop relative isolate min-h-screen">
      <Backdrop />
      <div key={tab} className="bw-tab relative">
      {tab === "start" && (
        <Start profile={profile} checkIn={checkIn} checkedIn={checkedIn} onCheckIn={setCheckIn} />
      )}
      {tab === "plan" && (
        <Home profile={profile} checkIn={checkIn} initialOpen={openDay} onOpened={() => setOpenDay(null)} onReset={() => {
          try { localStorage.removeItem("profile"); } catch { /* brak pamięci */ }
          setProfile(null);
        }} />
      )}
      {tab === "lab" && <Lab />}
      {tab === "iq" && (
        <Suspense fallback={<Skeleton title="IQ" />}>
          <IQ />
        </Suspense>
      )}
      {tab === "fuel" && <Fuel profile={profile} />}
      {tab === "progres" && <Progress profile={profile} />}
      </div>
      <TabBar tab={tab} onChange={(t) => { setTab(t); window.scrollTo(0, 0); }} />
    </div>
  );
}

function Home({ profile, checkIn, initialOpen, onOpened, onReset }: {
  profile: Profile; checkIn: CheckIn; initialOpen: DayPlan | null; onOpened: () => void; onReset: () => void;
}) {
  const [open, setOpen] = useState<DayPlan | null>(initialOpen);
  useEffect(() => { if (initialOpen) onOpened(); }, [initialOpen, onOpened]);
  const thisWeek = mondayOf(new Date());
  const unlocked = nextWeekUnlocked(thisWeek, profile.matchWeekdays, today());
  const [viewNext, setViewNext] = useState(false);
  const weekStart = viewNext && unlocked ? addDays(thisWeek, 7) : thisWeek;
  const plan = useMemo(
    () =>
      planForProfile(profile, weekStart),
    [weekStart, profile],
  );

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <LargeTitle kind="plan" title="Plan" sub={<button onClick={onReset} className="text-muted">Zmień profil</button>} />
      <div className="bw-rise mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-hairline/70 p-1">
        <button onClick={() => setViewNext(false)} className={`rounded-xl py-2 text-sm ${!viewNext ? "bg-card font-medium shadow-sm" : "text-muted"}`}>Ten tydzień</button>
        <button
          disabled={!unlocked}
          onClick={() => setViewNext(true)}
          className={`rounded-xl py-2 text-sm ${viewNext && unlocked ? "bg-card font-medium shadow-sm" : "text-muted"} disabled:opacity-40`}
        >
          {unlocked ? "Kolejny" : "Kolejny po meczu"}
        </button>
      </div>
      <Group>
        {plan.days.map((d, i) => (
          <DayRow key={`${weekStart}-${d.date}`} day={d} index={i} isToday={d.date === today()} onOpen={() => setOpen(d)} />
        ))}
      </Group>
      {open && (
        <SessionSheet day={open} checkIn={checkIn} weekInCycle={cycleWeekFor(profile, weekStart)} level={levelOf(profile.age, profile.strengthYears)} position={profile.position} hasGym={profile.equipment.includes("gym")} onClose={() => setOpen(null)} />
      )}
      {plan.warnings.length > 0 && (
        <p className="mt-4 rounded-2xl border border-hairline bg-canvas p-3 text-sm text-muted">
          {plan.warnings.join(" ")}
        </p>
      )}
    </main>
  );
}
