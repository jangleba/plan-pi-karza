import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { AgeGate } from "./AgeGate";
import { Splash } from "./AppBoundary";
import { Settings } from "./Settings";
import { AgreementGate } from "./legal/LegalUi";
import { hasCurrentAgreement, resumePendingWithdraw } from "./legal/consent";
import { useAuthState } from "./lib/session";
import { changeBirth, finalizeNewProfile, loadGuardedProfile, saveProfile, type GuardResult } from "./lib/profileGuard";
import { getScope, migrateLegacy, purgeRemovedFeatures, sameScope, scopeId, type Scope } from "./lib/store";
import { localISO, addDays, cycleWeekFor, levelOf, nextWeekUnlocked, planForProfile, weekdayGen } from "./engine";
import type { CheckIn, DayPlan, Profile, SessionKind } from "./engine";
import { Onboarding } from "./Onboarding";
import { Start } from "./Start";
import { SkippedDays } from "./DaySkipToggle";
import { setSkipped, useSkippedVersion } from "./lib/skipped";
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
import { scoped } from "./lib/store";

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
      sub={s?.movedFrom ? `przełożona z ${weekdayGen(s.movedFrom)}${day.isClub ? " · + trening klubowy" : ""}` : s && day.isClub ? "+ trening klubowy" : undefined}
      lead={
        <span className={`flex w-11 shrink-0 flex-col items-center rounded-2xl py-1 ${isToday ? "bw-sel" : ""}`}>
          <span className={`text-[10px] uppercase tracking-wide ${isToday ? "text-accent/80" : "text-muted"}`}>{WEEKDAY[index]}</span>
          <span className="text-lg font-semibold leading-tight tabular-nums">{Number(day.date.slice(8))}</span>
        </span>
      }
    />
  );
}

/**
 * Logowanie jest wymagane dopiero po ustawieniu VITE_REQUIRE_LOGIN=true. Sama konfiguracja Supabase
 * NIE włącza logowania – aplikacja działa dalej bez konta (postęp zapisuje się wtedy lokalnie).
 */
const REQUIRE_LOGIN = import.meta.env.VITE_REQUIRE_LOGIN === "true";

export function App() {
  useState(() => { migrateLegacy(); purgeRemovedFeatures(); return 0; }); // stare, wspólne klucze → przestrzeń GOŚCIA (nigdy do bieżącego konta)
  const auth = useAuthState();
  const [loginOpen, setLoginOpen] = useState(false);
  if (auth.status === "loading") return <Splash />;
  const guest = auth.scope.kind === "guest";
  if (guest && (REQUIRE_LOGIN || loginOpen)) return <Auth onBack={REQUIRE_LOGIN ? undefined : () => setLoginOpen(false)} />;
  return <Gate key={scopeId(auth.scope)} scope={auth.scope} email={auth.email} onLogin={() => setLoginOpen(true)} />;
}

const today = () => localISO();

function store(key: string, value: string) {
  scoped.setItem(key, value);
}

function loadCheckIn(): CheckIn {
  try {
    const raw = scoped.getItem(`checkIn:${today()}`);
    if (raw) return JSON.parse(raw) as CheckIn;
  } catch { /* użyj domyślnego */ }
  return { sleep: 3, feeling: 3, less: false };
}

/** Wejście do aplikacji dla jednej przestrzeni danych (gość albo konkretne konto). Dane innych przestrzeni są tu niedostępne. */
function Gate({ scope, email, onLogin }: { scope: Scope; email: string | null; onLogin: () => void }) {
  const [ready, setReady] = useState(scope.kind === "guest" || !supabase);
  useEffect(() => {
    if (scope.kind !== "user" || !supabase) return;
    let alive = true;
    (async () => {
      void resumePendingWithdraw();
      const r = await pullAll(today());
      if (r && alive && getScope().kind === "user" && sameScope(getScope(), scope)) {
        // dane z serwera trafiają do przestrzeni TEGO konta; lokalne dane gościa nigdy nie są wysyłane automatycznie
        if (r.profile) saveProfile(r.profile);
        else { const local = loadGuardedProfile(); if (local.kind === "ok") void pushProfile(local.profile); }
        if (r.masDistance) store("masDistance", String(r.masDistance));
        if (Object.keys(r.weightLog).length) saveLog({ ...loadLog(), ...r.weightLog });
        if (r.checkIn) store(`checkIn:${today()}`, JSON.stringify(r.checkIn));
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [scope]);
  if (!ready) return <Splash />;
  return <Main scope={scope} email={email} onLogin={onLogin} />;
}

function Main({ scope, email, onLogin }: { scope: Scope; email: string | null; onLogin: () => void }) {
  const [tab, setTab] = useState<Tab>("start");
  const [checkIn, setCheckInState] = useState<CheckIn>(loadCheckIn);
  const [checkedIn, setCheckedIn] = useState(() => scoped.getItem(`checkIn:${today()}`) !== null);
  const setCheckIn = (c: CheckIn) => {
    setCheckInState(c);
    setCheckedIn(true);
    store(`checkIn:${today()}`, JSON.stringify(c));
    void pushCheckIn(today(), c);
  };
  const [openDay, setOpenDay] = useState<DayPlan | null>(null);
  const [guard, setGuard] = useState<GuardResult>(() => loadGuardedProfile());
  const [settings, setSettings] = useState(false);
  const [agreed, setAgreed] = useState(() => scope.kind === "guest" || (hasCurrentAgreement("terms") && hasCurrentAgreement("safety")));

  // wiek rośnie z czasem; ponowna ocena po powrocie do aplikacji i co pół godziny (zmiana doby, urodziny)
  useEffect(() => {
    const recheck = () => setGuard((g) => { const n = loadGuardedProfile(); return n.kind === "ok" && g.kind === "ok" && n.profile.age === g.profile.age && n.birth.birthDate === g.birth.birthDate ? g : n; });
    const onVis = () => { if (document.visibilityState === "visible") recheck(); };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(recheck, 30 * 60_000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(id); };
  }, []);

  if (guard.kind === "blocked") {
    return <AgeGate reason={guard.reason} onBirthDate={(d) => setGuard(guard.profile ? changeBirth({ birthDate: d }, guard.profile) : guard)} />;
  }
  if (guard.kind === "none") {
    return (
      <Onboarding
        onDone={(raw) => {
          const r = finalizeNewProfile({ ...raw, startDate: localISO() });
          if (r.kind === "ok") { void pushProfile(r.profile); setTab("start"); window.scrollTo(0, 0); }
          setGuard(r);
        }}
      />
    );
  }
  if (!agreed) return <AgreementGate profile={guard.profile} onDone={() => setAgreed(true)} />;

  const { profile } = guard;
  return (
    <div className="bw-backdrop relative isolate min-h-screen">
      <Backdrop />
      <div key={tab} className="bw-tab relative">
      {tab === "start" && (
        <Start profile={profile} checkIn={checkIn} checkedIn={checkedIn} onCheckIn={setCheckIn} onSettings={() => setSettings(true)} />
      )}
      {tab === "plan" && (
        <Home profile={profile} checkIn={checkIn} initialOpen={openDay} onOpened={() => setOpenDay(null)} onReset={() => {
          // to NIE usuwa konta ani danych: tylko ponownie przechodzi pytania profilu (usuwanie danych – w Ustawieniach)
          scoped.removeItem("profile");
          setGuard({ kind: "none" });
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
      {settings && <Settings scope={scope} email={email} profile={profile} onClose={() => setSettings(false)} onLogin={onLogin} />}
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
  const skippedVersion = useSkippedVersion(); // zgłoszenie „nie mogę” przelicza plan od razu
  const plan = useMemo(
    () =>
      planForProfile(profile, weekStart),
    [weekStart, profile, skippedVersion],
  );

  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-14">
      <LargeTitle kind="plan" title="Plan" sub={<button onClick={onReset} className="text-muted">Zmień dane profilu (nie usuwa konta)</button>} />
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
        <SessionSheet day={open} checkIn={checkIn} weekInCycle={cycleWeekFor(profile, weekStart)} level={levelOf(profile.age, profile.strengthYears)} position={profile.position} hasGym={profile.equipment.includes("gym")}
          onSkipDay={open.date >= today() ? () => { setSkipped(open.date, true, today()); setOpen(null); } : undefined} onClose={() => setOpen(null)} />
      )}
      <SkippedDays profile={profile} weekStart={weekStart} />
      {plan.warnings.length > 0 && (
        <p className="mt-4 rounded-2xl border border-hairline bg-canvas p-3 text-sm text-muted">
          {plan.warnings.join(" ")}
        </p>
      )}
    </main>
  );
}
