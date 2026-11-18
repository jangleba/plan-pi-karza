import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { localISO, addDays, datesForWeek, levelOf, matchesAround, nextWeekUnlocked, planWeek, weekInCycle } from "./engine";
import type { CheckIn, DayPlan, Profile, SessionKind } from "./engine";
import { Onboarding } from "./Onboarding";
import { Start } from "./Start";
import { Backdrop, PageHeader } from "./Sketch";
import { Auth } from "./Auth";
import { Progress } from "./Progress";
import { Lab } from "./Lab";
import { Fuel } from "./Fuel";

// Three.js ładowane dopiero po wejściu w zakładkę IQ
const IQ = lazy(() => import("./IQ"));
import { Soon, TabBar, type Tab } from "./Tabs";
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

/** Etykiety są neutralne; kolor niesie tylko mała kropka: ciemna = mocna praca, jasna = lekka, czerwona = mecz. */
const KIND_DOT: Record<SessionKind, string> = {
  strength: "#2a2a28",
  run: "#2a2a28",
  sprint: "#2a2a28",
  technique: "#8a8578",
  activation: "#c9c2b2",
  recovery: "#c9c2b2",
};

const WEEKDAY = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function mondayOf(d: Date): string {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const shift = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - shift);
  return copy.toISOString().slice(0, 10);
}

function Chip({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-hairline bg-canvas px-3 py-1 text-xs font-medium text-ink">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

function DayRow({ day, index, onOpen }: { day: DayPlan; index: number; onOpen: () => void }) {
  const s = day.session;
  return (
    <li
      onClick={s ? onOpen : undefined}
      className={`flex items-center gap-4 rounded-2xl bg-card px-4 py-3.5 border border-hairline ${s ? "cursor-pointer active:scale-[0.99]" : ""}`}
    >
      <div className="w-10 text-center">
        <div className="text-[11px] uppercase tracking-wide text-muted">{WEEKDAY[index]}</div>
        <div className="text-lg font-semibold">{Number(day.date.slice(8))}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {day.isMatch && <Chip dot="#b45f55">Mecz</Chip>}
        {day.isClub && <Chip dot="#8a8578">Trening klubowy</Chip>}
        {s && (
          <div className="flex flex-col">
            <Chip dot={KIND_DOT[s.kind]}>
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
  const setCheckIn = (c: CheckIn) => {
    setCheckInState(c);
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
          window.scrollTo(0, 0);
        }}
      />
    );
  }
  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <div className="relative">
      {tab === "start" && (
        <Start profile={profile} checkIn={checkIn} onCheckIn={setCheckIn} onOpenDay={(d) => { setTab("plan"); setOpenDay(d); }} />
      )}
      {tab === "plan" && (
        <Home profile={profile} checkIn={checkIn} initialOpen={openDay} onOpened={() => setOpenDay(null)} onReset={() => {
          try { localStorage.removeItem("profile"); } catch { /* brak pamięci */ }
          setProfile(null);
        }} />
      )}
      {tab === "lab" && <Lab />}
      {tab === "iq" && (
        <Suspense fallback={<Soon title="IQ" text="Ładowanie sceny…" />}>
          <IQ />
        </Suspense>
      )}
      {tab === "fuel" && <Fuel profile={profile} />}
      {tab === "progres" && <Progress />}
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
      planWeek({
        weekStart,
        matches: matchesAround(weekStart, profile.matchWeekdays),
        clubDays: datesForWeek(weekStart, profile.clubWeekdays),
        level: levelOf(profile.age, profile.strengthYears),
        limitedGymAccess: profile.limitedGymAccess,
      }),
    [weekStart, profile],
  );

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-14">
      <PageHeader
        kind="plan"
        title="Plan tygodnia"
        sub={<>Plan dopasowany do meczu. <button onClick={onReset} className="underline">Zmień profil</button></>}
      />
      <div className="mb-3 flex gap-1.5 rounded-xl bg-card p-1 border border-hairline">
        <button onClick={() => setViewNext(false)} className={`flex-1 rounded-lg py-1.5 text-sm ${!viewNext ? "bg-canvas font-medium" : "text-muted"}`}>Ten tydzień</button>
        <button
          disabled={!unlocked}
          onClick={() => setViewNext(true)}
          className={`flex-1 rounded-lg py-1.5 text-sm ${viewNext && unlocked ? "bg-canvas font-medium" : "text-muted"} disabled:opacity-40`}
        >
          Kolejny tydzień{!unlocked ? " (po meczu)" : ""}
        </button>
      </div>
      <ul className="flex flex-col gap-2.5">
        {plan.days.map((d, i) => (
          <DayRow key={d.date} day={d} index={i} onOpen={() => setOpen(d)} />
        ))}
      </ul>
      {open && (
        <SessionSheet day={open} checkIn={checkIn} weekInCycle={weekInCycle(profile.startDate, weekStart)} level={levelOf(profile.age, profile.strengthYears)} position={profile.position} hasGym={profile.equipment.includes("gym")} onClose={() => setOpen(null)} />
      )}
      {plan.warnings.length > 0 && (
        <p className="mt-4 rounded-2xl border border-hairline bg-canvas p-3 text-sm text-muted">
          {plan.warnings.join(" ")}
        </p>
      )}
    </main>
  );
}
