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
import { useRadar } from "./useRadar";

type View = { t: "list" } | { t: "detail"; id: string } | { t: "setup" };

const pill = "rounded-full bg-canvas px-2.5 py-1 text-xs text-ink";

function Card({ e, saved, nowMs, onDetail, onSave }: { e: Evaluation; saved: boolean; nowMs: number; onDetail: () => void; onSave: () => void }) {
  const l = e.listing, s = nextSessionText(e), pos = positionText(l.positions), dist = distanceText(e.distanceKm);
  return (
    <article className="bw-rise rounded-3xl border border-hairline bg-card p-5">
      <div className="text-xs text-muted">{kindLabel(l.kind)}</div>
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

function FullList({ evals, nowMs, prefs, onPrefs, saved, onSave, onOpen, onRefreshSaved }: {
  evals: Evaluation[]; nowMs: number; prefs: RadarPrefs; onPrefs: (p: RadarPrefs) => void; saved: SavedOffer[]; onSave: (l: RadarListing) => void;
  onOpen: (id: string) => void; onRefreshSaved: () => void;
}) {
  const [tab, setTab] = useState<"match" | "saved">("match");
  const [filters, setFilters] = useState<ListFilters>({ kinds: prefs.kinds, freeOnly: false, sort: "distance" });
  const list = useMemo(() => visibleList(evals, filters), [evals, filters]);
  const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "bg-canvas text-ink"}`;
  const savedIds = new Set(saved.map((x) => x.id));
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-hairline/70 p-1" role="tablist">
        <SegBtn on={tab === "match"} onClick={() => setTab("match")}>Dla Ciebie</SegBtn>
        <SegBtn on={tab === "saved"} onClick={() => { setTab("saved"); onRefreshSaved(); }}>Zapisane{saved.length ? ` (${saved.length})` : ""}</SegBtn>
      </div>
      {tab === "match" ? (
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
  const [view, setView] = useState<View | null>(null);
  const [saved, setSaved] = useState<SavedOffer[]>(loadSaved);

  const matches = useMemo(() => sortEvaluations(matchesOnly(evals)), [evals]);
  const missing = missingProfile(facts);
  const next = nextRadius(prefs.radiusKm);
  const degraded = feed.state === "ok" && sourcesDegraded(feed.health, nowMs);
  const gaps = profileGaps(evals);
  const toggle = (l: RadarListing) => setSaved(toggleSaved(l));
  const evalOf = (id: string) => evals.find((e) => e.listing.id === id) ?? null;

  const title = view?.t === "setup" ? "Kryteria" : view?.t === "detail" ? "Szczegóły" : "Piłkarskie szanse";
  return (
    <section className="mb-6" aria-label="Piłkarskie szanse">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <h2 className="text-[19px] font-semibold tracking-tight">Piłkarskie szanse</h2>
        <button onClick={() => setView({ t: "setup" })} className="text-sm text-accent">Kryteria</button>
      </div>
      <p className="mb-3 px-1 text-xs text-muted">{criteriaParts(facts).join(" · ")}</p>

      {feed.state === "loading" && <div className="h-24 animate-pulse rounded-3xl bg-hairline/60" aria-label="Ładowanie ofert" />}
      {feed.state === "unconfigured" && <p className="rounded-3xl border border-hairline bg-card p-5 text-sm text-muted">Radar nie jest jeszcze połączony z serwerem. Reszta aplikacji działa bez zmian.</p>}
      {feed.state === "error" && (
        <div className="rounded-3xl border border-hairline bg-card p-5 text-sm">
          <p className="text-muted">Nie udało się pobrać ofert (błąd połączenia).</p>
          <button onClick={() => void reload()} className="mt-3 rounded-2xl bg-canvas px-4 py-2.5 font-medium">Spróbuj ponownie</button>
        </div>
      )}
      {degraded && <p className="mb-3 rounded-2xl bg-canvas px-4 py-3 text-xs text-muted">Aktualizacja ofert z części źródeł chwilowo nie działa – pokazujemy tylko oferty sprawdzone w ciągu ostatnich 48 godzin.</p>}

      {feed.state === "ok" && !hasBirth(facts) && (
        <div className="rounded-3xl border border-hairline bg-card p-5">
          <p className="text-sm text-muted">Uzupełnij datę urodzenia – oferty dobieramy do rocznika i nie pokazujemy ofert dla niewłaściwego wieku.</p>
          <button onClick={() => setView({ t: "setup" })} className="bw-grad mt-3 rounded-2xl px-5 py-3 text-sm font-medium">Uzupełnij dane</button>
        </div>
      )}
      {feed.state === "ok" && hasBirth(facts) && missing.includes("place") && (
        <div className="rounded-3xl border border-hairline bg-card p-5">
          <p className="text-sm text-muted">Wybierz miejscowość (ręcznie, bez GPS) albo ustaw „cała Polska”.</p>
          <button onClick={() => setView({ t: "setup" })} className="bw-grad mt-3 rounded-2xl px-5 py-3 text-sm font-medium">Wybierz miejscowość</button>
        </div>
      )}

      {feed.state === "ok" && missing.length === 0 && (
        <>
          {matches.length > 0 ? (
            <div className="flex flex-col gap-3">
              {matches.slice(0, 2).map((e) => <Card key={e.listing.id} e={e} saved={saved.some((s) => s.id === e.listing.id)} nowMs={nowMs} onDetail={() => setView({ t: "detail", id: e.listing.id })} onSave={() => toggle(e.listing)} />)}
              <button onClick={() => setView({ t: "list" })} className="rounded-2xl border border-hairline bg-card py-3.5 text-sm font-medium">Zobacz wszystkie{matches.length > 2 ? ` (${matches.length})` : ""}</button>
            </div>
          ) : (
            <div className="rounded-3xl border border-hairline bg-card p-5">
              <p className="text-sm text-muted">
                {feed.listings.length === 0
                  ? "Radar zbiera oferty – na razie nie ma aktywnych ogłoszeń."
                  : gaps ? "Część ofert wymaga uzupełnienia danych profilu."
                  : `Brak pasujących ofert${prefs.radiusKm !== null ? ` w promieniu ${prefs.radiusKm} km` : ""}.`}
              </p>
              {feed.listings.length > 0 && !gaps && next !== undefined && (
                <button onClick={() => setPrefs({ ...prefs, radiusKm: next })} className="bw-grad mt-3 rounded-2xl px-5 py-3 text-sm font-medium">Zwiększ promień: {radiusLabel(next)}</button>
              )}
              {gaps && <button onClick={() => setView({ t: "setup" })} className="bw-grad mt-3 rounded-2xl px-5 py-3 text-sm font-medium">Uzupełnij dane</button>}
              {saved.length > 0 && <button onClick={() => setView({ t: "list" })} className="mt-3 block text-sm text-accent">Zapisane oferty ({saved.length})</button>}
            </div>
          )}
        </>
      )}

      {view && (
        <Sheet title={title} onClose={() => setView(null)}>
          {view.t === "setup" && <RadarSetup profile={profile} prefs={prefs} onProfile={onProfile} onPrefs={setPrefs} onDone={() => setView(null)} />}
          {view.t === "list" && (
            <FullList evals={evals} nowMs={nowMs} prefs={prefs} onPrefs={setPrefs} saved={saved} onSave={toggle} onOpen={(id) => setView({ t: "detail", id })} onRefreshSaved={() => void refreshSaved().then(setSaved)} />
          )}
          {view.t === "detail" && (
            <Detail e={evalOf(view.id)} saved={saved.find((s) => s.id === view.id) ?? null} nowMs={nowMs}
              onSave={() => { const l = evalOf(view.id)?.listing ?? saved.find((s) => s.id === view.id)?.listing; if (l) toggle(l); }} onBack={() => setView({ t: "list" })} />
          )}
        </Sheet>
      )}
    </section>
  );
}
