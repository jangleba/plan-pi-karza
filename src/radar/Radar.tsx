import { useMemo, useState } from "react";
import type { Profile } from "../engine";
import type { PrivateProfile } from "../lib/private";
import { Sheet } from "../Sheet";
import { reportStale } from "./api";
import { ago, costText, distanceText, eligibilityNotes, eligibilityText, freshnessLines, kindLabel, nextSessionText, positionText, REASON_TEXT, sessionLabel, signupStatusText } from "./format";
import { LISTING_KINDS, matchesOnly, sortEvaluations, type Evaluation, type RadarListing } from "./lib";
import { loadPrefs, savePrefs, type RadarPrefs } from "./prefs";
import { RadarSetup } from "./RadarSetup";
import { loadSaved, refreshSaved, savedStatusText, toggleSaved, type SavedOffer } from "./saved";
import {
  criteriaParts, hasBirth, missingProfile, needsOrganizerCheck, nextRadius, playerFacts, profileGaps, radiusLabel, sourcesDegraded, visibleList, type ListFilters,
} from "./state";
import { useClubs, useRadar } from "./useRadar";
import { clubsForPlayer, loadSent, type Club, type ClubView } from "./clubs";
import { ClubCard, Inquiry } from "./ClubUi";
import { tintOf } from "./viz";

type View = { t: "list" } | { t: "detail"; id: string } | { t: "setup" } | { t: "inquiry"; id: string };

const pill = "rounded-full bg-white/80 px-2.5 py-1 text-xs text-ink";

function Stat({ n, label }: { n: number; label: string }) {
  return <div className="rounded-2xl bg-canvas px-4 py-3"><div className="text-[28px] font-semibold leading-none tabular-nums">{n}</div><div className="mt-1 text-xs text-muted">{label}</div></div>;
}

function Card({ e, saved, nowMs, onDetail, onSave }: { e: Evaluation; saved: boolean; nowMs: number; onDetail: () => void; onSave: () => void }) {
  const l = e.listing, s = nextSessionText(e), pos = positionText(l.positions), dist = distanceText(e.distanceKm);
  return (
    <article className={`bw-rise bw-t${tintOf(l.id)} bw-tint rounded-3xl p-5`}>
      <div className="bw-tint-ink text-xs font-semibold opacity-80">{kindLabel(l.kind)}</div>
      <h3 className="mt-0.5 text-[17px] font-semibold leading-snug">{s.when}{s.more > 0 && <span className="ml-2 text-xs font-normal text-muted">+{s.more} {s.more === 1 ? "termin" : "terminy"}</span>}</h3>
      <p className="mt-0.5 text-sm text-muted">{l.organizer} · {l.city ?? "miejscowość nieznana"}{dist ? ` · ${dist}` : ""}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={pill}>{s.elig}</span>
        {pos && <span className={pill}>{pos}</span>}
        <span className={pill}>{costText(l)}</span>
      </div>
      {eligibilityNotes(l.eligibility).length > 0 && <p className="mt-2 text-xs text-ink/80">{eligibilityNotes(l.eligibility).join(" · ")}</p>}
      <p className="mt-3 text-xs text-muted">Sprawdzono {ago(l.sourceCheckedAt, nowMs)}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={onDetail} className="bw-grad flex-1 rounded-2xl py-3 text-sm font-medium">Szczegóły</button>
        <button onClick={onSave} aria-pressed={saved} className={`rounded-2xl px-4 py-3 text-sm ${saved ? "bw-sel font-medium" : "border border-hairline bg-card"}`}>{saved ? "Zapisano" : "Zapisz"}</button>
      </div>
    </article>
  );
}

function Detail({ e, saved, nowMs, onSave, onBack }: { e: Evaluation | null; saved: SavedOffer | null; nowMs: number; onSave: () => void; onBack: () => void }) {
  const [reported, setReported] = useState<null | "ok" | "fail">(null);
  const l: RadarListing | undefined = e?.listing ?? saved?.listing;
  if (!l) return <button onClick={onBack} className="text-sm text-accent">‹ Wróć</button>;
  const matchIds = new Set(e?.matching.map((m) => m.session.id) ?? []);
  const pos = positionText(l.positions);
  return (
    <>
      <button onClick={onBack} className="mb-3 text-sm text-accent">‹ Wróć</button>
      <div className="text-xs text-muted">{kindLabel(l.kind)} · {l.organizer}</div>
      <h3 className="mt-1 text-xl font-semibold leading-snug">{l.city ?? "Miejscowość nieznana"}{l.venue ? `, ${l.venue}` : ""}</h3>
      <p className="mt-2 text-[15px] leading-snug text-ink/80">{l.summary}</p>
      {saved && !saved.live && <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-sm">Status: <b>{savedStatusText(saved, nowMs)}</b></p>}
      {e && e.result === "NEEDS_INFORMATION" && e.reasons.map((r) => REASON_TEXT[r]).filter(Boolean).map((t) => <p key={t} className="mt-3 rounded-2xl bg-lemon px-4 py-3 text-sm text-lemon-ink">{t}</p>)}

      <h4 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Terminy</h4>
      <ul className="flex flex-col gap-2">
        {l.indefinite && <li className="rounded-2xl border border-hairline px-4 py-3 text-sm">Nabór ciągły · {eligibilityText(l.eligibility)}{eligibilityNotes(l.eligibility).map((n) => <div key={n} className="mt-0.5 text-xs text-ink/80">{n}</div>)}</li>}
        {l.sessions.filter((s) => s.status === "active").map((s) => (
          <li key={s.id} className={`rounded-2xl border px-4 py-3 text-sm ${matchIds.has(s.id) ? "border-sel-border bg-accent-soft" : "border-hairline"}`}>
            <div className="font-medium">{sessionLabel(s)}</div>
            <div className="text-muted">{eligibilityText(s.eligibility ?? l.eligibility)}{matchIds.has(s.id) ? " · pasuje do Ciebie" : e ? " · nie dotyczy Twojego rocznika" : ""}</div>
            {eligibilityNotes(s.eligibility ?? l.eligibility).map((n) => <div key={n} className="mt-0.5 text-xs text-ink/80">{n}</div>)}
          </li>
        ))}
      </ul>

      <h4 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Wymagania</h4>
      {l.requirementsText ? <blockquote className="whitespace-pre-line rounded-2xl bg-canvas px-4 py-3 text-sm leading-snug">„{l.requirementsText}”<div className="mt-1 text-xs text-muted">Fragment ogłoszenia organizatora</div></blockquote> : <p className="text-sm text-muted">Brak cytowanych wymagań – sprawdź u organizatora.</p>}

      <h4 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Zapisy</h4>
      <ul className="text-sm leading-relaxed">
        <li>{signupStatusText(l.signupStatus)}</li>
        <li>{l.signupMode === "individual" ? "zgłoszenie indywidualne" : l.signupMode === "team_only" ? "tylko zgłoszenie drużyny" : "tryb zgłoszenia niepotwierdzony"}</li>
        {l.signupClosesAt && <li>zgłoszenia do: {new Date(l.signupClosesAt).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" })}</li>}
        <li>koszt: {costText(l)}</li>
        {pos && <li>pozycje: {pos}</li>}
      </ul>

      <h4 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Źródło</h4>
      <p className="text-sm leading-relaxed text-ink/80">
        {new URL(l.url).hostname.replace(/^www\./, "")}<br />
        sprawdzono źródło: {ago(l.sourceCheckedAt, nowMs)}
        {freshnessLines(l, nowMs).map((t) => <span key={t}><br />{t}</span>)}
      </p>
      <p className="mt-2 text-xs text-muted">Zapisy odbywają się u organizatora. Aplikacja tylko zbiera informacje – sprawdź je w ogłoszeniu.</p>

      <div className="mt-5 flex flex-col gap-2">
        <a href={l.url} target="_blank" rel="noopener noreferrer" className="bw-grad block rounded-2xl py-4 text-center text-base font-medium">Przejdź do organizatora</a>
        <button onClick={onSave} aria-pressed={!!saved} className={`rounded-2xl py-3.5 text-sm ${saved ? "bw-sel font-medium" : "border border-hairline bg-card"}`}>{saved ? "Zapisano" : "Zapisz"}</button>
        {reported === null ? (
          <button onClick={async () => setReported((await reportStale(l.id, "Zgłoszone jako nieaktualne")) ? "ok" : "fail")} className="py-2 text-sm text-muted">Zgłoś nieaktualność</button>
        ) : <p className="py-2 text-center text-sm text-muted">{reported === "ok" ? "Dziękujemy – sprawdzimy ogłoszenie." : "Nie udało się wysłać zgłoszenia."}</p>}
      </div>
    </>
  );
}

function SegBtn({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button role="tab" aria-selected={on} onClick={onClick} className={`rounded-xl py-2 text-sm ${on ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{children}</button>;
}

function FullList({ evals, nowMs, prefs, onPrefs, saved, onSave, onOpen, onRefreshSaved, clubs, sent, onWrite, startTab }: {
  evals: Evaluation[]; nowMs: number; prefs: RadarPrefs; onPrefs: (p: RadarPrefs) => void; saved: SavedOffer[]; onSave: (l: RadarListing) => void;
  onOpen: (id: string) => void; onRefreshSaved: () => void; clubs: ClubView[]; sent: Record<string, string>; onWrite: (id: string) => void; startTab: "match" | "clubs";
}) {
  const [tab, setTab] = useState<"match" | "clubs" | "saved">(startTab);
  const [filters, setFilters] = useState<ListFilters>({ kinds: prefs.kinds, freeOnly: false, sort: "distance" });
  const list = useMemo(() => visibleList(evals, filters), [evals, filters]);
  const check = useMemo(() => needsOrganizerCheck(evals).filter((e) => !filters.kinds.length || filters.kinds.includes(e.listing.kind)), [evals, filters.kinds]);
  const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "bg-canvas text-ink"}`;
  const savedIds = new Set(saved.map((x) => x.id));
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-hairline/70 p-1" role="tablist">
        <SegBtn on={tab === "match"} onClick={() => setTab("match")}>Oferty</SegBtn>
        <SegBtn on={tab === "clubs"} onClick={() => setTab("clubs")}>Kluby</SegBtn>
        <SegBtn on={tab === "saved"} onClick={() => { setTab("saved"); onRefreshSaved(); }}>Zapisane{saved.length ? ` (${saved.length})` : ""}</SegBtn>
      </div>
      {tab === "clubs" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {([25, 50, 100, 200, null] as const).map((r) => <button key={String(r)} aria-pressed={prefs.radiusKm === r} onClick={() => onPrefs({ ...prefs, radiusKm: r })} className={chip(prefs.radiusKm === r)}>{radiusLabel(r)}</button>)}
          </div>
          {clubs.length === 0 && <p className="py-6 text-center text-sm text-muted">Brak klubów z zweryfikowanym adresem w tym promieniu. Radar szuka dalej – spróbuj większego promienia.</p>}
          <div className="flex flex-col gap-3">{clubs.map((v) => <ClubCard key={v.club.id} v={v} sentAt={sent[v.club.id]} nowMs={nowMs} onWrite={() => onWrite(v.club.id)} />)}</div>
        </>
      ) : tab === "match" ? (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            {LISTING_KINDS.filter(([k]) => k !== "inne").map(([k, t]) => {
              const on = filters.kinds.includes(k);
              return <button key={k} aria-pressed={on} onClick={() => { const kinds = on ? filters.kinds.filter((x) => x !== k) : [...filters.kinds, k]; setFilters({ ...filters, kinds }); onPrefs({ ...prefs, kinds }); }} className={chip(on)}>{t}</button>;
            })}
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {([25, 50, 100, 200, null] as const).map((r) => <button key={String(r)} aria-pressed={prefs.radiusKm === r} onClick={() => onPrefs({ ...prefs, radiusKm: r })} className={chip(prefs.radiusKm === r)}>{radiusLabel(r)}</button>)}
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button aria-pressed={filters.freeOnly} onClick={() => setFilters({ ...filters, freeOnly: !filters.freeOnly })} className={chip(filters.freeOnly)}>Bezpłatne</button>
            <button aria-pressed={filters.sort === "date"} onClick={() => setFilters({ ...filters, sort: filters.sort === "date" ? "distance" : "date" })} className={chip(filters.sort === "date")}>Najbliższy termin</button>
          </div>
          {list.length === 0 && <p className="py-6 text-center text-sm text-muted">Brak ofert dla tych filtrów.</p>}
          <div className="flex flex-col gap-3">
            {list.map((e) => <Card key={e.listing.id} e={e} saved={savedIds.has(e.listing.id)} nowMs={nowMs} onDetail={() => onOpen(e.listing.id)} onSave={() => onSave(e.listing)} />)}
          </div>
          {check.length > 0 && (
            <div className="mt-6">
              <h4 className="mb-1 px-1 text-sm font-semibold">Do sprawdzenia u organizatora</h4>
              <p className="mb-3 px-1 text-xs text-muted">Wiek się zgadza, ale to, czy możesz wziąć udział, zależy od zgody organizatora albo od kategorii, której ogłoszenie nie podaje. Nie pokazujemy tego jako pewne dopasowanie.</p>
              <div className="flex flex-col gap-3">
                {check.map((e) => (
                  <button key={e.listing.id} onClick={() => onOpen(e.listing.id)} className="rounded-3xl border border-hairline bg-card p-5 text-left">
                    <div className="text-xs text-muted">{kindLabel(e.listing.kind)} · {e.listing.organizer}</div>
                    <div className="mt-0.5 text-base font-semibold">{e.listing.city ?? "—"} · {nextSessionText(e).when}</div>
                    <div className="mt-1 text-xs text-ink/80">{e.reasons.map((r) => REASON_TEXT[r]).filter(Boolean).join(" ")}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {saved.length === 0 && <p className="py-6 text-center text-sm text-muted">Nic jeszcze nie zapisano.</p>}
          {saved.map((s) => (
            <button key={s.id} onClick={() => onOpen(s.id)} className="rounded-3xl border border-hairline bg-card p-5 text-left">
              <div className="text-xs text-muted">{kindLabel(s.listing.kind)} · {s.listing.organizer}</div>
              <div className="mt-0.5 text-base font-semibold">{s.listing.city ?? "—"}{s.listing.sessions[0] ? ` · ${sessionLabel(s.listing.sessions[0])}` : ""}</div>
              <div className={`mt-1 text-sm ${s.live ? "text-muted" : "font-medium text-ink"}`}>{savedStatusText(s, nowMs)}</div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** „Piłkarskie szanse” pod check-inem: faktycznie użyte kryteria, maks. dwie pasujące karty, „Zobacz wszystkie”. Awaria radaru nie blokuje reszty Startu. */
export function Radar({ profile, birth, onBirth }: { profile: Profile; birth: PrivateProfile; onBirth: (b: PrivateProfile) => void }) {
  const [prefs, setPrefsState] = useState<RadarPrefs>(loadPrefs);
  const setPrefs = (p: RadarPrefs) => { setPrefsState(p); savePrefs(p); };
  const facts = useMemo(() => playerFacts(profile, birth, prefs), [profile, birth, prefs]);
  const { feed, evals, nowMs, reload } = useRadar(facts);
  const clubsFeed = useClubs();
  const [sent, setSent] = useState<Record<string, string>>(loadSent);
  const [view, setView] = useState<View | null>(null);
  const [startTab, setStartTab] = useState<"match" | "clubs">("match");
  const clubList: Club[] = clubsFeed.feed.state === "ok" ? clubsFeed.feed.clubs : [];
  const clubViews = useMemo(() => clubsForPlayer(clubList, facts), [clubList, facts]);
  const clubById = (id: string) => clubList.find((c) => c.id === id) ?? null;
  const [saved, setSaved] = useState<SavedOffer[]>(loadSaved);

  const matches = useMemo(() => sortEvaluations(matchesOnly(evals)), [evals]);
  const missing = missingProfile(facts);
  const next = nextRadius(prefs.radiusKm);
  const degraded = feed.state === "ok" && sourcesDegraded(feed.health, nowMs);
  const gaps = profileGaps(evals);
  const hasOffers = feed.state === "ok" && feed.listings.length > 0; // oferty są dodatkiem (wymagają dopuszczonych źródeł); bez nich pokazujemy same kluby
  const toggle = (l: RadarListing) => setSaved(toggleSaved(l));
  const evalOf = (id: string) => evals.find((e) => e.listing.id === id) ?? null;

  const title = view?.t === "setup" ? "Kryteria" : view?.t === "detail" ? "Szczegóły" : view?.t === "inquiry" ? "Zapytanie do klubu" : "Piłkarskie szanse";
  const sentCount = Object.keys(sent).length;
  const clubsReady = clubsFeed.feed.state === "ok";
  const canShowClubs = clubsReady && (prefs.radiusKm === null || !!prefs.place);
  const toCheck = useMemo(() => needsOrganizerCheck(evals).length, [evals]);
  const open = (tab: "match" | "clubs") => { setStartTab(tab); setView({ t: "list" }); };
  const loading = feed.state === "loading" && clubsFeed.feed.state === "loading";
  const ready = missing.length === 0;
  const clubCount = canShowClubs ? clubViews.length : 0;

  /** Jedna, spokojna treść kafelka zależnie od stanu (bez wykresów i animacji). */
  const body = (() => {
    if (feed.state === "unconfigured") return <p className="mt-4 text-sm text-muted">Radar nie jest jeszcze połączony z serwerem. Reszta aplikacji działa bez zmian.</p>;
    if (loading) return <p className="mt-4 text-sm text-muted">Szukam ofert i klubów…</p>;
    if (feed.state === "error") return (
      <div className="mt-4">
        <p className="text-sm text-muted">Nie udało się pobrać ofert (błąd połączenia).</p>
        <button onClick={() => void reload()} className="mt-3 rounded-2xl bg-canvas px-4 py-2.5 text-sm font-medium">Spróbuj ponownie</button>
      </div>
    );
    if (!hasBirth(facts)) return (
      <div className="mt-4">
        <p className="text-sm text-muted">Uzupełnij datę urodzenia – oferty dobieramy do rocznika i nie pokazujemy ofert dla niewłaściwego wieku.</p>
        <button onClick={() => setView({ t: "setup" })} className="bw-grad mt-3 w-full rounded-2xl py-3.5 text-sm font-medium">Uzupełnij dane</button>
      </div>
    );
    if (!ready) return (
      <div className="mt-4">
        <p className="text-sm text-muted">Wybierz miejscowość (ręcznie, bez GPS) albo ustaw „cała Polska”.</p>
        <button onClick={() => setView({ t: "setup" })} className="bw-grad mt-3 w-full rounded-2xl py-3.5 text-sm font-medium">Wybierz miejscowość</button>
      </div>
    );
    const empty = matches.length === 0 && clubCount === 0;
    return (
      <div className="mt-4">
        <div className="grid grid-cols-2 gap-2">
          {hasOffers && <Stat n={matches.length} label={matches.length === 1 ? "pasująca oferta" : "pasujące oferty"} />}
          <Stat n={clubCount} label={clubCount === 1 ? "klub z adresem" : "kluby z adresem"} />
        </div>
        {toCheck > 0 && <p className="mt-2 text-xs text-muted">+ {toCheck} {toCheck === 1 ? "oferta" : "oferty"} do sprawdzenia u organizatora</p>}
        {gaps && <p className="mt-2 text-xs text-muted">Część ofert wymaga uzupełnienia danych profilu.</p>}
        {degraded && <p className="mt-2 text-xs text-muted">Aktualizacja części źródeł chwilowo nie działa – pokazujemy oferty sprawdzone w ciągu ostatnich 48 godzin.</p>}
        {clubCount > 0 && <p className="mt-2 text-xs text-muted">Kluby: dane kontaktowe z ich stron, nie ogłoszenia naborów. Zapytanie wysyłasz Ty.</p>}
        {clubsFeed.feed.state === "error" && <p className="mt-2 text-xs text-muted">Nie udało się pobrać listy klubów. <button onClick={() => void clubsFeed.reload()} className="underline">Spróbuj ponownie</button></p>}
        {empty ? (
          <>
            <p className="mt-3 text-sm text-muted">Na razie brak wyników{prefs.radiusKm !== null ? ` w promieniu ${prefs.radiusKm} km` : ""}. Radar sprawdza źródła na bieżąco.</p>
            {next !== undefined && <button onClick={() => setPrefs({ ...prefs, radiusKm: next })} className="mt-3 w-full rounded-2xl bg-canvas py-3.5 text-sm font-medium">Zwiększ promień: {radiusLabel(next)}</button>}
          </>
        ) : (
          <button onClick={() => open(matches.length > 0 ? "match" : "clubs")} className="bw-grad mt-3 w-full rounded-2xl py-3.5 text-sm font-medium">Zobacz</button>
        )}
        {sentCount > 0 && <p className="mt-2 text-center text-xs text-muted">Wysłane przez Ciebie zapytania: {sentCount}</p>}
      </div>
    );
  })();

  return (
    <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card p-5" aria-label="Piłkarskie szanse">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight">Piłkarskie szanse</h2>
          <p className="mt-0.5 text-xs text-muted">{criteriaParts(facts).join(" · ")}</p>
        </div>
        <button onClick={() => setView({ t: "setup" })} className="-mr-2 -mt-1 shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-accent">Kryteria</button>
      </div>
      {body}

      {view && (
        <Sheet title={title} onClose={() => setView(null)}>
          {view.t === "setup" && <RadarSetup profile={profile} birth={birth} prefs={prefs} onBirth={onBirth} onPrefs={setPrefs} onDone={() => setView(null)} />}
          {view.t === "list" && (
            <FullList evals={evals} nowMs={nowMs} prefs={prefs} onPrefs={setPrefs} saved={saved} onSave={toggle} onOpen={(id) => setView({ t: "detail", id })} onRefreshSaved={() => void refreshSaved().then(setSaved)}
              clubs={clubViews} sent={sent} onWrite={(id) => setView({ t: "inquiry", id })} startTab={startTab} />
          )}
          {view.t === "inquiry" && (() => { const c = clubById(view.id); return c ? <Inquiry club={c} profile={profile} facts={facts} nowMs={nowMs} onSent={() => setSent(loadSent())} onBack={() => setView(null)} /> : null; })()}
          {view.t === "detail" && (
            <Detail e={evalOf(view.id)} saved={saved.find((s) => s.id === view.id) ?? null} nowMs={nowMs}
              onSave={() => { const l = evalOf(view.id)?.listing ?? saved.find((s) => s.id === view.id)?.listing; if (l) toggle(l); }} onBack={() => setView({ t: "list" })} />
          )}
        </Sheet>
      )}
    </section>
  );
}
