import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AgeGate } from "./AgeGate";
import { Splash } from "./AppBoundary";
import { Settings } from "./Settings";
import { AgreementGate } from "./legal/LegalUi";
import { hasCurrentAgreement, resumePendingWithdraw } from "./legal/consent";
import { useAuthState } from "./lib/session";
import { changeBirth, finalizeNewProfile, loadGuardedProfile, saveProfile, type GuardResult } from "./lib/profileGuard";
import { copyScope, getScope, listKeys, migrateLegacy, peekScoped, purgeRemovedFeatures, sameScope, scopeId, storageAvailable, type Scope } from "./lib/store";
import { ImportOffer, LoadError, StorageNotice } from "./GateScreens";
import { DEFAULT_CHECK_IN, localISO, addDays, cycleWeekFor, levelOf, nextWeekUnlocked, normalizeCheckIn, planForProfile, weekdayGen } from "./engine";
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
import { InviteReceiver } from "./InviteSheets";
import { clearInviteParam, readInviteParam } from "./lib/inviteLink";
import type { Invite } from "./engine";

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
  const [noStorage] = useState(() => !storageAvailable());
  return <>{noStorage && <StorageNotice />}<AppInner /></>;
}

function AppInner() {
  useState(() => { migrateLegacy(); purgeRemovedFeatures(); return 0; }); // stare, wspólne klucze → przestrzeń GOŚCIA (nigdy do bieżącego konta)
  const auth = useAuthState();
  const [loginOpen, setLoginOpen] = useState(false);
  // zaproszenie na trening z linku (?invite=…): czeka, aż zawodnik skończy onboarding, i otwiera się po wejściu do aplikacji
  const [invite, setInvite] = useState<Invite | null>(readInviteParam);
  const closeInvite = () => { clearInviteParam(); setInvite(null); };
  if (auth.status === "loading") return <Splash />;
  const guest = auth.scope.kind === "guest";
  if (guest && (REQUIRE_LOGIN || loginOpen)) return <Auth onBack={REQUIRE_LOGIN ? undefined : () => setLoginOpen(false)} />;
  return <Gate key={scopeId(auth.scope)} scope={auth.scope} email={auth.email} onLogin={() => setLoginOpen(true)} invite={invite} onInviteClose={closeInvite} />;
}

const today = () => localISO();

function store(key: string, value: string) {
  scoped.setItem(key, value);
}

function loadCheckIn(): CheckIn {
  try {
    const raw = scoped.getItem(`checkIn:${today()}`);
    if (raw) return normalizeCheckIn(JSON.parse(raw));
  } catch { /* użyj domyślnego */ }
  return { ...DEFAULT_CHECK_IN };
}

const TAB_KEY = "lastTab";
const TAB_NAMES: Tab[] = ["start", "plan", "lab", "iq", "fuel", "progres"];
/** Ostatnia zakładka, jeśli zawodnik był w aplikacji przed chwilą (30 min); inaczej Start. */
function loadTab(): Tab {
  try {
    const v = JSON.parse(scoped.getItem(TAB_KEY) ?? "null") as { tab?: unknown; at?: unknown } | null;
    if (v && typeof v.at === "number" && Date.now() - v.at < 30 * 60_000 && TAB_NAMES.includes(v.tab as Tab)) return v.tab as Tab;
  } catch { /* użyj domyślnej */ }
  return "start";
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);
/** Dane z tego urządzenia (gość), które zawodnik może JAWNIE przenieść na konto. Zgody i potwierdzenia nigdy się nie kopiują (store.ts). */
const IMPORT_KEYS = ["profile", "private", "history", "weightLog", "masDistance", "feelings", "runs", "look", "iqAttempts"];
const GUEST: Scope = { kind: "guest" };
function guestProfileName(): string | null | undefined {
  if (!listKeys(GUEST).includes("profile")) return undefined;
  try { const p = JSON.parse(peekScoped(GUEST, "profile") ?? "null") as { name?: unknown } | null; return p && typeof p.name === "string" ? p.name : null; } catch { return null; }
}

/** Wejście do aplikacji dla jednej przestrzeni danych (gość albo konkretne konto). Dane innych przestrzeni są tu niedostępne. */
function Gate({ scope, email, onLogin, invite, onInviteClose }: { scope: Scope; email: string | null; onLogin: () => void; invite: Invite | null; onInviteClose: () => void }) {
  const needsPull = scope.kind === "user" && !!supabase;
  // loading → ready | retry (nie wiemy, czy konto ma profil) | offer (jest profil gościa do przeniesienia)
  const [phase, setPhase] = useState<"loading" | "ready" | "retry" | "offer">(needsPull ? "loading" : "ready");
  const [attempt, setAttempt] = useState(0);
  const [offerName, setOfferName] = useState<string | undefined>();
  useEffect(() => {
    if (!needsPull) return;
    let alive = true;
    (async () => {
      void resumePendingWithdraw();
      const hadLocal = loadGuardedProfile().kind !== "none";
      // bez limitu czasu słabe połączenie zostawiało wieczny ekran ładowania; z profilem na urządzeniu czekamy krócej
      const r = await withTimeout(pullAll(today()), hadLocal ? 4000 : 12000);
      if (!alive || !(getScope().kind === "user" && sameScope(getScope(), scope))) return;
      if (r) {
        // dane z serwera trafiają do przestrzeni TEGO konta; dane gościa nigdy nie są wysyłane automatycznie
        if (r.profile) saveProfile(r.profile);
        else if (r.profileOk) { const local = loadGuardedProfile(); if (local.kind === "ok") void pushProfile(local.profile); }
        if (r.masDistance) store("masDistance", String(r.masDistance));
        if (Object.keys(r.weightLog).length) saveLog({ ...loadLog(), ...r.weightLog });
        if (r.checkIn) store(`checkIn:${today()}`, JSON.stringify(r.checkIn));
      }
      if (loadGuardedProfile().kind === "none") {
        // bez profilu lokalnie i bez pewności, że konto go nie ma, onboarding nadpisałby profil z chmury
        if (!r || !r.profileOk) { setPhase("retry"); return; }
        const guestName = guestProfileName();
        if (guestName !== undefined) { setOfferName(guestName ?? undefined); setPhase("offer"); return; }
      }
      setPhase("ready");
    })();
    return () => { alive = false; };
  }, [scope, needsPull, attempt]);
  if (phase === "loading") return <Splash />;
  if (phase === "retry") return <LoadError onRetry={() => { setPhase("loading"); setAttempt((n) => n + 1); }} onSkip={() => setPhase("ready")} />;
  if (phase === "offer") {
    return (
      <ImportOffer
        name={offerName}
        onSkip={() => setPhase("ready")}
        onImport={() => {
          copyScope(GUEST, scope, { keys: IMPORT_KEYS });
          const g = loadGuardedProfile();
          if (g.kind === "ok") void pushProfile(g.profile);
          setPhase("ready");
        }}
      />
    );
  }
  return <Main scope={scope} email={email} onLogin={onLogin} invite={invite} onInviteClose={onInviteClose} />;
}

function Main({ scope, email, onLogin, invite, onInviteClose }: { scope: Scope; email: string | null; onLogin: () => void; invite: Invite | null; onInviteClose: () => void }) {
  // aktywna zakładka przeżywa ponowne zamontowanie aplikacji (odświeżenie sesji, przeładowanie karty): bez cofania na Start
  const [tab, setTabState] = useState<Tab>(loadTab);
  const setTab = (t: Tab) => { setTabState(t); scoped.setItem(TAB_KEY, JSON.stringify({ tab: t, at: Date.now() })); };
  const [checkIn, setCheckInState] = useState<CheckIn>(loadCheckIn);
  const [checkedIn, setCheckedIn] = useState(() => scoped.getItem(`checkIn:${today()}`) !== null);
  // aplikacja bywa otwarta przez noc: o zmianie doby check-in ma być dzisiejszy (albo pusty), nie wczorajszy
  const checkDay = useRef(today());
  useEffect(() => {
    const sync = () => {
      const n = today();
      if (n === checkDay.current) return;
      checkDay.current = n;
      setCheckInState(loadCheckIn());
      setCheckedIn(scoped.getItem(`checkIn:${n}`) !== null);
    };
    const onVis = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(sync, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(id); };
  }, []);
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
        <Home profile={profile} checkIn={checkIn} checkedIn={checkedIn} initialOpen={openDay} onOpened={() => setOpenDay(null)} onReset={() => {
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
      {invite && <InviteReceiver invite={invite} age={profile.age} onClose={onInviteClose} />}
      {settings && <Settings scope={scope} email={email} profile={profile} onClose={() => setSettings(false)} onLogin={onLogin} />}
    </div>
  );
}

function Home({ profile, checkIn, checkedIn, initialOpen, onOpened, onReset }: {
  profile: Profile; checkIn: CheckIn; checkedIn: boolean; initialOpen: DayPlan | null; onOpened: () => void; onReset: () => void;
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
        <SessionSheet day={open} checkIn={checkIn} checkedIn={checkedIn} weekInCycle={cycleWeekFor(profile, weekStart)} level={levelOf(profile.age, profile.strengthYears)} position={profile.position} hasGym={profile.equipment.includes("gym")} inviterName={profile.name} age={profile.age}
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
