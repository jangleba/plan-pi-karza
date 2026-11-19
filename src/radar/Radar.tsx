import { useMemo, useState } from "react";
import type { Profile } from "../engine";
import { Sheet } from "../Sheet";
import { reportStale } from "./api";
import { ago, costText, distanceText, eligibilityText, kindLabel, nextSessionText, positionText, sessionLabel, signupStatusText } from "./format";
import { LISTING_KINDS, matchesOnly, sortEvaluations, type Evaluation, type RadarListing } from "./lib";
import { loadPrefs, savePrefs, type RadarPrefs } from "./prefs";
import { RadarSetup } from "./RadarSetup";
import { loadSaved, refreshSaved, savedStatusText, toggleSaved, type SavedOffer } from "./saved";
import {
  criteriaParts, hasBirth, missingProfile, nextRadius, playerFacts, profileGaps, radiusLabel, sourcesDegraded, visibleList, type ListFilters,
} from "./state";
import { useClubs, useRadar } from "./useRadar";
import { clubsForPlayer, loadSent, type Club, type ClubView } from "./clubs";
import { Ball, ClubCard, Envelope, Inquiry } from "./ClubUi";
import { RadarViz } from "./RadarViz";
import { tintOf } from "./viz";

type View = { t: "list" } | { t: "detail"; id: string } | { t: "setup" } | { t: "inquiry"; id: string };

const pill = "rounded-full bg-white/80 px-2.5 py-1 text-xs text-ink";

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

      <h4 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Terminy</h4>
      <ul className="flex flex-col gap-2">
        {l.indefinite && <li className="rounded-2xl border border-hairline px-4 py-3 text-sm">Nabór ciągły · {eligibilityText(l.eligibility)}</li>}
        {l.sessions.filter((s) => s.status === "active").map((s) => (
          <li key={s.id} className={`rounded-2xl border px-4 py-3 text-sm ${matchIds.has(s.id) ? "border-sel-border bg-accent-soft" : "border-hairline"}`}>
            <div className="font-medium">{sessionLabel(s)}</div>
            <div className="text-muted">{eligibilityText(s.eligibility ?? l.eligibility)}{matchIds.has(s.id) ? " · pasuje do Ciebie" : e ? " · nie dotyczy Twojego rocznika" : ""}</div>
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
        sprawdzono: {ago(l.sourceCheckedAt, nowMs)}{l.organizerConfirmedAt ? <><br />potwierdzone przez organizatora: {ago(l.organizerConfirmedAt, nowMs)}</> : null}
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
export function Radar({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const [prefs, setPrefsState] = useState<RadarPrefs>(loadPrefs);
  const setPrefs = (p: RadarPrefs) => { setPrefsState(p); savePrefs(p); };
  const facts = useMemo(() => playerFacts(profile, prefs), [profile, prefs]);
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
  const openClubs = () => { setStartTab("clubs"); setView({ t: "list" }); };
  const sentCount = Object.keys(sent).length;
  const clubsReady = clubsFeed.feed.state === "ok";
  const canShowClubs = clubsReady && (prefs.radiusKm === null || !!prefs.place);
  return (
    <section className="mb-6" aria-label="Piłkarskie szanse">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-semibold tracking-tight">Piłkarskie szanse</h2>
          {sentCount > 0 && <span className="bw-pop flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 text-xs font-semibold text-mint-ink"><Envelope className="h-3.5 w-3.5" />{sentCount}</span>}
        </div>
        <button onClick={() => setView({ t: "setup" })} className="rounded-full bg-lav px-3.5 py-1.5 text-sm font-semibold text-lav-ink">Kryteria</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5 px-1">
        {criteriaParts(facts).map((p, i) => <span key={p} className={`bw-t${(i + 1) % 6} bw-tint bw-tint-ink rounded-full px-2.5 py-1 text-xs font-medium`}>{p}</span>)}
      </div>

      <RadarViz place={prefs.place} radiusKm={prefs.radiusKm} clubs={canShowClubs ? clubViews : []} sent={sent}
        scanning={feed.state !== "unconfigured"} onPick={(id) => setView({ t: "inquiry", id })} onSetup={() => setView({ t: "setup" })} />
      <div className="mb-4 mt-3 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Promień">
        {([25, 50, 100, 200, null] as const).map((r) => (
          <button key={String(r)} aria-pressed={prefs.radiusKm === r} onClick={() => setPrefs({ ...prefs, radiusKm: r })}
            className={`rounded-full px-3 py-1.5 text-sm ${prefs.radiusKm === r ? "bw-sel bw-pop font-semibold" : "bg-white text-ink ring-1 ring-hairline"}`}>{radiusLabel(r)}</button>
        ))}
      </div>

      {feed.state === "loading" && clubsFeed.feed.state === "loading" && <p className="mb-3 text-center text-sm text-muted">Radar nasłuchuje…</p>}
      {feed.state === "unconfigured" && <p className="mb-3 rounded-3xl bg-peach p-5 text-sm text-peach-ink">Radar nie jest jeszcze połączony z serwerem – zobacz jak będzie wyglądał, a kluby pojawią się po konfiguracji. Reszta aplikacji działa bez zmian.</p>}
      {feed.state === "error" && (
        <div className="mb-3 rounded-3xl bg-pink p-5 text-sm">
          <p className="text-pink-ink">Nie udało się pobrać ofert (błąd połączenia).</p>
          <button onClick={() => void reload()} className="mt-3 rounded-2xl bg-white px-4 py-2.5 font-medium">Spróbuj ponownie</button>
        </div>
      )}
      {degraded && <p className="mb-3 rounded-2xl bg-lemon px-4 py-3 text-xs text-lemon-ink">Aktualizacja ofert z części źródeł chwilowo nie działa – pokazujemy tylko oferty sprawdzone w ciągu ostatnich 48 godzin.</p>}

      {hasOffers && !hasBirth(facts) && (
        <div className="mb-3 rounded-3xl bg-lav p-5">
          <p className="text-sm text-lav-ink">Uzupełnij datę urodzenia – oferty dobieramy do rocznika i nie pokazujemy ofert dla niewłaściwego wieku.</p>
          <button onClick={() => setView({ t: "setup" })} className="mt-3 rounded-2xl bg-white px-5 py-3 text-sm font-semibold">Uzupełnij dane</button>
        </div>
      )}
      {hasOffers && hasBirth(facts) && missing.includes("place") && (
        <div className="mb-3 rounded-3xl bg-lav p-5">
          <p className="text-sm text-lav-ink">Wybierz miejscowość (ręcznie, bez GPS) albo ustaw „cała Polska”.</p>
          <button onClick={() => setView({ t: "setup" })} className="mt-3 rounded-2xl bg-white px-5 py-3 text-sm font-semibold">Wybierz miejscowość</button>
        </div>
      )}
      {hasOffers && missing.length === 0 && (
        <div className="mb-4">
          {matches.length > 0 ? (
            <div className="flex flex-col gap-3">
              {matches.slice(0, 2).map((e) => <Card key={e.listing.id} e={e} saved={saved.some((s) => s.id === e.listing.id)} nowMs={nowMs} onDetail={() => setView({ t: "detail", id: e.listing.id })} onSave={() => toggle(e.listing)} />)}
              <button onClick={() => setView({ t: "list" })} className="rounded-2xl bg-white py-3.5 text-sm font-semibold ring-1 ring-hairline">Zobacz wszystkie oferty{matches.length > 2 ? ` (${matches.length})` : ""}</button>
            </div>
          ) : (
            <div className="rounded-3xl bg-lemon p-5">
              <p className="text-sm text-lemon-ink">{gaps ? "Część ofert wymaga uzupełnienia danych profilu." : `Brak pasujących ofert${prefs.radiusKm !== null ? ` w promieniu ${prefs.radiusKm} km` : ""}.`}</p>
              {!gaps && next !== undefined && <button onClick={() => setPrefs({ ...prefs, radiusKm: next })} className="mt-3 rounded-2xl bg-white px-5 py-3 text-sm font-semibold">Zwiększ promień: {radiusLabel(next)}</button>}
              {gaps && <button onClick={() => setView({ t: "setup" })} className="mt-3 rounded-2xl bg-white px-5 py-3 text-sm font-semibold">Uzupełnij dane</button>}
            </div>
          )}
        </div>
      )}

      {clubsFeed.feed.state !== "loading" && feed.state !== "unconfigured" && (
        <div>
          <div className="mb-1 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold">Kluby, do których możesz napisać</h3>
            {canShowClubs && clubViews.length > 0 && <span className="bw-pop rounded-full bg-mint px-2.5 py-0.5 text-xs font-semibold text-mint-ink">{clubViews.length}</span>}
          </div>
          <p className="mb-3 px-1 text-xs text-muted">Radar na bieżąco szuka klubów i sprawdza ich oficjalne adresy. Zapytanie wysyłasz Ty, ze swojej poczty.</p>
          {clubsFeed.feed.state === "error" && <div className="rounded-3xl bg-pink p-5 text-sm"><p className="text-pink-ink">Nie udało się pobrać listy klubów (błąd połączenia).</p><button onClick={() => void clubsFeed.reload()} className="mt-3 rounded-2xl bg-white px-4 py-2.5 font-medium">Spróbuj ponownie</button></div>}
          {clubsReady && !canShowClubs && (
            <div className="rounded-3xl bg-lav p-5"><p className="text-sm text-lav-ink">Wybierz miejscowość (ręcznie, bez GPS) albo ustaw „cała Polska”, by zobaczyć kluby w okolicy.</p><button onClick={() => setView({ t: "setup" })} className="mt-3 rounded-2xl bg-white px-5 py-3 text-sm font-semibold">Wybierz miejscowość</button></div>
          )}
          {canShowClubs && (clubViews.length > 0 ? (
            <div className="flex flex-col gap-3">
              {clubViews.slice(0, 2).map((v) => <ClubCard key={v.club.id} v={v} sentAt={sent[v.club.id]} nowMs={nowMs} onWrite={() => setView({ t: "inquiry", id: v.club.id })} />)}
              <button onClick={openClubs} className="rounded-2xl bg-white py-3.5 text-sm font-semibold ring-1 ring-hairline">Zobacz kluby{clubViews.length > 2 ? ` (${clubViews.length})` : ""}</button>
            </div>
          ) : (
            <div className="rounded-3xl bg-accent-soft p-5 text-center">
              <span className="bw-float mx-auto block w-fit text-accent"><Ball className="h-12 w-12" /></span>
              <p className="mt-2 text-sm text-accent">{clubList.length === 0 ? "Radar szuka klubów w całej Polsce – na razie nie ma jeszcze zweryfikowanych adresów. Zaglądaj tu, kluby pojawiają się na bieżąco." : `Brak klubów z zweryfikowanym adresem${prefs.radiusKm !== null ? ` w promieniu ${prefs.radiusKm} km` : ""}.`}</p>
              {clubList.length > 0 && next !== undefined && <button onClick={() => setPrefs({ ...prefs, radiusKm: next })} className="mt-3 rounded-2xl bg-white px-5 py-3 text-sm font-semibold">Zwiększ promień: {radiusLabel(next)}</button>}
            </div>
          ))}
        </div>
      )}

      {view && (
        <Sheet title={title} onClose={() => setView(null)}>
          {view.t === "setup" && <RadarSetup profile={profile} prefs={prefs} onProfile={onProfile} onPrefs={setPrefs} onDone={() => setView(null)} />}
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
