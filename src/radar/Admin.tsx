import { useCallback, useEffect, useState } from "react";
import { Auth } from "../Auth";
import { Sheet } from "../Sheet";
import { supabase } from "../lib/supabase";
import { eligibilityText, kindLabel, sessionLabel } from "./format";
import type { Eligibility, ListingKind } from "./lib";

/**
 * Panel administratora radaru. Dostęp egzekwuje SERWER (RLS + sprawdzanie roli w funkcjach); ten ekran jedynie nie pokazuje
 * przycisków osobom bez roli. Klucze i uprawnienia administracyjne nigdy nie trafiają do przeglądarki.
 */

type Tab = "clubs" | "sources" | "review" | "reports" | "jobs";
const TABS: Array<[Tab, string]> = [["clubs", "Kluby"], ["sources", "Źródła"], ["review", "Oferty"], ["reports", "Zgłoszenia"], ["jobs", "Zadania"]];

interface Source {
  id: string; domain: string; name: string | null; kind: string; status: string; license_basis: string | null; allowed_scope: { fetch: boolean; publish_facts: boolean; images: boolean };
  entry_urls: string[]; check_interval_minutes: number; seen_count: number; sample_url: string | null; sample_title: string | null; found_query: string | null;
  last_ok_at: string | null; consecutive_failures: number; last_error: string | null; robots_block_all: boolean;
}
interface Sess { id: string; date: string; start_time: string; status: string; eligibility: Eligibility | null; evidence: string | null }
interface Listing {
  id: string; url: string; kind: ListingKind; organizer: string; summary: string; status: string; review_reasons: string[]; requirements_text: string | null; city: string | null;
  source_checked_at: string | null; radar_sessions: Sess[]; radar_evidence: Array<{ field: string; quote: string }>;
}
interface Report { id: string; reason: string; created_at: string; radar_listings: { id: string; organizer: string; url: string; status: string } | null }
interface Run { id: string; job: string; started_at: string; finished_at: string | null; status: string; stats: Record<string, number>; error: string | null }

const btn = "rounded-xl px-3.5 py-2 text-sm";
const when = (s: string | null) => (s ? new Date(s).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "—");

function useLoad<T>(fn: () => PromiseLike<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setErr(null);
    Promise.resolve(fn()).then((d) => { if (alive) setData(d); }, (e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, err, reload: () => setTick((x) => x + 1) };
}

const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T; };

function SourceForm({ s, onDone, onClose }: { s: Source; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState(s.name ?? s.domain);
  const [kind, setKind] = useState(s.kind === "other" ? "club" : s.kind);
  const [basis, setBasis] = useState(s.license_basis ?? "");
  const [scope, setScope] = useState(s.allowed_scope);
  const [urls, setUrls] = useState(s.entry_urls.join("\n"));
  const [interval, setInterval] = useState(s.check_interval_minutes);
  const [msg, setMsg] = useState("");
  const save = async (status: "approved" | "rejected" | "suspended") => {
    if (!supabase) return;
    try {
      must(await supabase.rpc("radar_admin_set_source", { p_id: s.id, p_status: status, p_basis: basis.trim() || null, p_scope: scope, p_entry_urls: urls.split("\n").map((x) => x.trim()).filter(Boolean), p_name: name, p_kind: kind }) as never);
      must(await supabase.from("radar_sources").update({ check_interval_minutes: Math.max(15, interval) }).eq("id", s.id).select() as never);
      onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : "błąd"); }
  };
  const field = "w-full rounded-xl bg-canvas px-3 py-2.5 text-sm";
  return (
    <Sheet title={s.domain} onClose={onClose}>
      {s.sample_url && <p className="mb-3 text-xs text-muted">Znaleziono: <a className="underline" href={s.sample_url} target="_blank" rel="noopener noreferrer">{s.sample_title ?? s.sample_url}</a> · zapytanie: {s.found_query ?? "—"} · {s.seen_count}×</p>}
      <p className="mb-4 rounded-2xl bg-canvas p-3 text-xs text-muted">Publiczna dostępność, oficjalna domena, RSS ani robots.txt same nie są licencją. Wpisz faktyczną podstawę (umowa, zgoda organizatora, licencja) i zakres. Bez nieautoryzowanego pobierania Facebooka ani kopiowania baz agregatorów.</p>
      <label className="mb-1 block text-xs text-muted">Nazwa</label><input className={`${field} mb-3`} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="mb-1 block text-xs text-muted">Rodzaj</label>
      <select className={`${field} mb-3`} value={kind} onChange={(e) => setKind(e.target.value)}>{["club", "academy", "federation", "organizer", "other"].map((k) => <option key={k}>{k}</option>)}</select>
      <label className="mb-1 block text-xs text-muted">Podstawa dopuszczenia (min. 10 znaków)</label>
      <textarea className={`${field} mb-3`} rows={3} value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="np. Zgoda organizatora z 2026-11-18 (e-mail) na publikację faktów z ogłoszeń z linkiem" />
      <div className="mb-3 flex flex-col gap-1.5 text-sm">
        {(["fetch", "publish_facts", "images"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={scope[k]} onChange={(e) => setScope({ ...scope, [k]: e.target.checked })} />{{ fetch: "Wolno pobierać", publish_facts: "Wolno publikować własne opisy faktów z linkiem", images: "Wolno używać grafik" }[k]}</label>
        ))}
      </div>
      <label className="mb-1 block text-xs text-muted">Adresy wejściowe (RSS/Atom, mapa witryny, dział aktualności – po jednym w wierszu)</label>
      <textarea className={`${field} mb-3`} rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://klub.pl/feed" />
      <label className="mb-1 block text-xs text-muted">Odstęp sprawdzeń (min, ≥ 15)</label>
      <input className={`${field} mb-4`} type="number" min={15} value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
      {msg && <p className="mb-3 text-sm text-red-700">{msg}</p>}
      <div className="flex gap-2">
        <button className={`${btn} bw-grad flex-1 font-medium`} onClick={() => void save("approved")}>Zatwierdź</button>
        <button className={`${btn} border border-hairline`} onClick={() => void save("suspended")}>Zawieś</button>
        <button className={`${btn} border border-hairline`} onClick={() => void save("rejected")}>Odrzuć</button>
      </div>
    </Sheet>
  );
}

interface ClubRow {
  id: string; domain: string; name: string; city: string | null; website: string; recruitment_url: string | null; status: string; review_note: string | null; last_ok_at: string | null;
  radar_club_contacts: Array<{ email: string; kind: string; evidence_quote: string; evidence_url: string; mx_ok: boolean; status: string; checked_at: string }>;
}
interface ClubReport { id: string; reason: string; created_at: string; radar_clubs: { id: string; name: string; domain: string } | null }

/** Kluby: kandydaci do akceptacji (adres, cytat i strona, z której pochodzi, wynik sprawdzenia poczty), opublikowane i zgłoszenia. */
function Clubs() {
  const q = useLoad(async () => must(await supabase!.from("radar_clubs").select("id,domain,name,city,website,recruitment_url,status,review_note,last_ok_at,radar_club_contacts(email,kind,evidence_quote,evidence_url,mx_ok,status,checked_at)").order("status").order("first_seen_at", { ascending: false }).limit(150) as never) as ClubRow[], []);
  const reports = useLoad(async () => must(await supabase!.from("radar_club_reports").select("id,reason,created_at,radar_clubs(id,name,domain)").is("handled_at", null).order("created_at", { ascending: false }).limit(50) as never) as ClubReport[], []);
  const act = async (id: string, action: "publish" | "withdraw") => {
    const reason = action === "withdraw" ? window.prompt("Powód (np. prośba klubu, błędny adres)") ?? "" : null;
    if (action === "withdraw" && !reason) return;
    must(await supabase!.rpc("radar_admin_set_club", { p_id: id, p_action: action, p_reason: reason }) as never);
    q.reload();
  };
  const [addUrl, setAddUrl] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const addClub = async () => {
    try {
      const u = new URL(/^https?:\/\//i.test(addUrl.trim()) ? addUrl.trim() : `https://${addUrl.trim()}`);
      must(await supabase!.from("radar_club_candidates").upsert({ domain: u.hostname.toLowerCase().replace(/^www\./, ""), sample_url: u.toString(), state: "pending", tries: 0 }, { onConflict: "domain" }).select() as never);
      setAddMsg("Dodano – radar zbada stronę przy najbliższym uruchomieniu (discover co 12 h).");
      setAddUrl("");
    } catch (e) { setAddMsg(e instanceof Error ? e.message : "Nieprawidłowy adres"); }
  };
  const closeReport = async (id: string) => { must(await supabase!.from("radar_club_reports").update({ handled_at: new Date().toISOString() }).eq("id", id).select() as never); reports.reload(); };
  if (q.err) return <p className="text-sm text-red-700">{q.err}</p>;
  const group = (st: string[], label: string) => {
    const list = (q.data ?? []).filter((c) => st.includes(c.status));
    return (
      <section className="mb-5"><h3 className="mb-2 text-xs uppercase tracking-wide text-muted">{label} ({list.length})</h3>
        {list.map((c) => (
          <article key={c.id} className="mb-2 rounded-2xl border border-hairline bg-card p-4 text-sm">
            <a href={c.website} target="_blank" rel="noopener noreferrer" className="font-medium underline">{c.name}</a> <span className="text-xs text-muted">{c.domain} · {c.city ?? "miejscowość niepotwierdzona"} · {c.status}</span>
            <ul className="mt-2">{c.radar_club_contacts.map((k) => (
              <li key={k.email} className="mb-1 rounded-xl bg-canvas p-2 text-xs"><b>{k.email}</b> · {k.kind} · poczta (MX): {k.mx_ok ? "tak" : "NIE"} · {k.status}<br />„{k.evidence_quote}” – <a className="underline" href={k.evidence_url} target="_blank" rel="noopener noreferrer">strona</a></li>
            ))}</ul>
            {c.recruitment_url && <div className="mt-1 text-xs text-muted">Podstrona o naborze: {c.recruitment_url}</div>}
            <div className="mt-2 flex gap-2">
              {c.status !== "published" && c.status !== "withdrawn" && <button className={`${btn} bw-grad font-medium`} onClick={() => void act(c.id, "publish")}>Akceptuj</button>}
              {c.status !== "withdrawn" && <button className={`${btn} border border-hairline`} onClick={() => void act(c.id, "withdraw")}>Odrzuć / wycofaj (blokuje domenę)</button>}
            </div>
          </article>
        ))}
      </section>
    );
  };
  return (
    <>
      <p className="mb-4 rounded-2xl bg-canvas p-3 text-xs text-muted">Akceptuj tylko kluby, których adres jest organizacyjny (biuro@, nabor@…) i faktycznie widoczny w cytowanym fragmencie strony. Wycofany klub trafia na listę zablokowanych domen i nie wraca z wyszukiwarki. Automatyczną akceptację włączysz poleceniem: <code>update radar_settings set value = 'true' where key = 'club_auto_publish'</code>.</p>
      <div className="mb-5 rounded-2xl border border-hairline bg-card p-4">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Dodaj klub do zbadania (bez wyszukiwarki)</h3>
        <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-xl bg-canvas px-3 py-2.5 text-sm" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="adres strony klubu, np. orly.pl" aria-label="Adres strony klubu" /><button className={`${btn} bw-grad font-medium`} onClick={() => void addClub()}>Dodaj</button></div>
        {addMsg && <p className="mt-2 text-xs text-muted">{addMsg}</p>}
      </div>
      {(reports.data ?? []).length > 0 && (
        <section className="mb-5"><h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Zgłoszenia dotyczące klubów</h3>
          {(reports.data ?? []).map((r) => <div key={r.id} className="mb-2 rounded-2xl border border-hairline bg-card p-3 text-sm"><b>{r.radar_clubs?.name}</b> ({r.radar_clubs?.domain}): {r.reason}<div className="mt-2 flex gap-2"><button className={`${btn} border border-hairline`} onClick={() => void closeReport(r.id)}>Zamknij</button>{r.radar_clubs && <button className={`${btn} border border-hairline`} onClick={() => void act(r.radar_clubs!.id, "withdraw").then(() => closeReport(r.id))}>Wycofaj klub</button>}</div></div>)}
        </section>
      )}
      {group(["pending_review"], "Do akceptacji")}
      {group(["published"], "Opublikowane")}
      {group(["stale"], "Nieaktualne (brak świeżo potwierdzonego adresu)")}
      {group(["withdrawn"], "Wycofane")}
    </>
  );
}

function Sources() {
  const q = useLoad(async () => must(await supabase!.from("radar_sources").select("*").order("status").order("seen_count", { ascending: false }).limit(200) as never) as Source[], []);
  const [edit, setEdit] = useState<Source | null>(null);
  if (q.err) return <p className="text-sm text-red-700">{q.err}</p>;
  const list = q.data ?? [];
  const group = (st: string[], label: string) => (
    <section className="mb-5"><h3 className="mb-2 text-xs uppercase tracking-wide text-muted">{label}</h3>
      {list.filter((s) => st.includes(s.status)).map((s) => (
        <button key={s.id} onClick={() => setEdit(s)} className="mb-2 block w-full rounded-2xl border border-hairline bg-card p-4 text-left">
          <div className="font-medium">{s.domain} <span className="text-xs text-muted">{s.status}</span></div>
          <div className="text-xs text-muted">{s.status === "candidate" ? `${s.seen_count}× · ${s.sample_title ?? ""}` : `ostatnio OK: ${when(s.last_ok_at)} · błędy z rzędu: ${s.consecutive_failures}${s.robots_block_all ? " · robots blokuje" : ""}`}</div>
          {s.last_error && <div className="text-xs text-red-700">{s.last_error}</div>}
        </button>
      ))}
    </section>
  );
  return <>{group(["candidate"], "Kandydaci do oceny")}{group(["approved"], "Zatwierdzone")}{group(["suspended", "rejected"], "Zawieszone / odrzucone")}{edit && <SourceForm s={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); q.reload(); }} />}</>;
}

function Review() {
  const q = useLoad(async () => must(await supabase!.from("radar_listings").select("id,url,kind,organizer,summary,status,review_reasons,requirements_text,city,source_checked_at,radar_sessions(*),radar_evidence(field,quote)").in("status", ["pending_review", "published"]).order("status").order("updated_at", { ascending: false }).limit(60) as never) as Listing[], []);
  const act = async (id: string, action: "publish" | "withdraw" | "confirm") => {
    const reason = action === "withdraw" ? window.prompt("Powód wycofania") ?? "" : null;
    if (action === "withdraw" && !reason) return;
    must(await supabase!.rpc("radar_admin_set_listing", { p_id: id, p_action: action, p_reason: reason }) as never);
    q.reload();
  };
  if (q.err) return <p className="text-sm text-red-700">{q.err}</p>;
  return (
    <>
      {(q.data ?? []).map((l) => (
        <article key={l.id} className="mb-3 rounded-3xl border border-hairline bg-card p-5">
          <div className="text-xs text-muted">{l.status === "pending_review" ? "DO KONTROLI" : "opublikowane"} · {kindLabel(l.kind)} · sprawdzono {when(l.source_checked_at)}</div>
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-base font-semibold underline">{l.organizer}{l.city ? `, ${l.city}` : ""}</a>
          {l.review_reasons.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{l.review_reasons.map((r) => <li key={r} className="rounded-full bg-yellow-soft px-2.5 py-1 text-xs text-yellow-ink">{r}</li>)}</ul>}
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><div className="mb-1 text-xs uppercase tracking-wide text-muted">Oryginalne wymagania</div><blockquote className="whitespace-pre-line rounded-2xl bg-canvas p-3 text-xs">{l.requirements_text ?? "—"}</blockquote></div>
            <div><div className="mb-1 text-xs uppercase tracking-wide text-muted">Interpretacja (po sesjach)</div>
              <ul className="rounded-2xl bg-canvas p-3 text-xs">{l.radar_sessions.filter((s) => s.status === "active").map((s) => <li key={s.id}>{sessionLabel({ date: s.date, startTime: s.start_time || null })}: <b>{eligibilityText(s.eligibility)}</b></li>)}{l.radar_sessions.length === 0 && <li>brak sesji</li>}</ul></div>
          </div>
          {l.radar_evidence.length > 0 && <details className="mt-2 text-xs text-muted"><summary>Dowody ({l.radar_evidence.length})</summary><ul className="mt-1">{l.radar_evidence.map((e, i) => <li key={i}><b>{e.field}:</b> „{e.quote}”</li>)}</ul></details>}
          <div className="mt-3 flex flex-wrap gap-2">
            {l.status === "pending_review" && <button className={`${btn} bw-grad font-medium`} onClick={() => void act(l.id, "publish")}>Publikuj</button>}
            <button className={`${btn} border border-hairline`} onClick={() => void act(l.id, "confirm")}>Potwierdzono u organizatora</button>
            <button className={`${btn} border border-hairline`} onClick={() => void act(l.id, "withdraw")}>Wycofaj</button>
          </div>
        </article>
      ))}
      {q.data?.length === 0 && <p className="text-sm text-muted">Brak ogłoszeń.</p>}
    </>
  );
}

function Reports() {
  const q = useLoad(async () => must(await supabase!.from("radar_reports").select("id,reason,created_at,radar_listings(id,organizer,url,status)").is("handled_at", null).order("created_at", { ascending: false }).limit(100) as never) as Report[], []);
  const close = async (id: string) => { must(await supabase!.from("radar_reports").update({ handled_at: new Date().toISOString() }).eq("id", id).select() as never); q.reload(); };
  const withdraw = async (id: string, listing: string) => { must(await supabase!.rpc("radar_admin_set_listing", { p_id: listing, p_action: "withdraw", p_reason: "zgłoszona nieaktualność" }) as never); await close(id); };
  if (q.err) return <p className="text-sm text-red-700">{q.err}</p>;
  return <>{(q.data ?? []).map((r) => (
    <div key={r.id} className="mb-2 rounded-2xl border border-hairline bg-card p-4 text-sm">
      <div className="text-xs text-muted">{when(r.created_at)} · {r.radar_listings?.status}</div>
      <a href={r.radar_listings?.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">{r.radar_listings?.organizer}</a>
      <p className="mt-1">{r.reason}</p>
      <div className="mt-2 flex gap-2"><button className={`${btn} border border-hairline`} onClick={() => void close(r.id)}>Zamknij zgłoszenie</button>{r.radar_listings && <button className={`${btn} border border-hairline`} onClick={() => void withdraw(r.id, r.radar_listings!.id)}>Wycofaj ofertę</button>}</div>
    </div>))}
    {q.data?.length === 0 && <p className="text-sm text-muted">Brak otwartych zgłoszeń.</p>}</>;
}

function Jobs() {
  const sched = useLoad(async () => must(await supabase!.rpc("radar_schedule_status") as never) as Array<{ name: string; schedule: string; active: boolean; lastStart: string | null; lastStatus: string | null }>, []);
  const runs = useLoad(async () => must(await supabase!.from("radar_job_runs").select("*").order("started_at", { ascending: false }).limit(30) as never) as Run[], []);
  const queue = useLoad(async () => must(await supabase!.from("radar_urls").select("state").in("state", ["failed", "review", "pending"]) as never) as Array<{ state: string }>, []);
  const counts = (queue.data ?? []).reduce<Record<string, number>>((a, x) => ({ ...a, [x.state]: (a[x.state] ?? 0) + 1 }), {});
  return (
    <>
      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Harmonogramy (pg_cron)</h3>
      {sched.err ? <p className="mb-4 rounded-2xl bg-canvas p-3 text-sm text-red-700">Brak odczytu harmonogramów: {sched.err}. Uruchom migrację 0003 i <code>select radar_register_schedules()</code>.</p> : (
        <ul className="mb-5">{(sched.data ?? []).map((j) => <li key={j.name} className="mb-1 rounded-2xl border border-hairline bg-card px-4 py-3 text-sm"><b>{j.name}</b> · {j.schedule} · {j.active ? "aktywne" : "wyłączone"} · ostatnio {when(j.lastStart)} ({j.lastStatus ?? "—"})</li>)}{(sched.data ?? []).length === 0 && <li className="text-sm text-red-700">Brak zarejestrowanych zadań!</li>}</ul>
      )}
      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Kolejka adresów</h3>
      <p className="mb-5 text-sm">oczekuje: {counts.pending ?? 0} · do kontroli: {counts.review ?? 0} · nieudane: {counts.failed ?? 0}</p>
      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Ostatnie przebiegi</h3>
      {(runs.data ?? []).map((r) => (
        <div key={r.id} className={`mb-1.5 rounded-2xl border px-4 py-3 text-xs ${r.status === "failed" ? "border-red-300 bg-card" : "border-hairline bg-card"}`}>
          <b>{r.job}</b> · {r.status} · {when(r.started_at)}{r.error ? ` · ${r.error}` : ""}<div className="text-muted">{JSON.stringify(r.stats)}</div>
        </div>
      ))}
    </>
  );
}

export function RadarAdmin() {
  const [auth, setAuth] = useState<"loading" | "unconfigured" | "out" | "denied" | "admin">("loading");
  const [tab, setTab] = useState<Tab>("clubs");
  const check = useCallback(async () => {
    if (!supabase) return setAuth("unconfigured");
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setAuth("out");
    const r = await supabase.from("radar_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
    setAuth(r.data ? "admin" : "denied");
  }, []);
  useEffect(() => {
    void check();
    const sub = supabase?.auth.onAuthStateChange(() => void check());
    return () => sub?.data.subscription.unsubscribe();
  }, [check]);

  if (auth === "loading") return null;
  if (auth === "unconfigured") return <main className="mx-auto max-w-md px-5 pt-24 text-sm text-muted">Brak połączenia z Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).</main>;
  if (auth === "out") return <Auth />;
  if (auth === "denied") return <main className="mx-auto max-w-md px-5 pt-24"><h1 className="text-2xl font-semibold">Brak dostępu</h1><p className="mt-2 text-sm text-muted">To konto nie ma roli administratora radaru.</p></main>;
  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-14">
      <h1 className="mb-1 text-[28px] font-semibold tracking-tight">Radar – administracja</h1>
      <p className="mb-5 text-sm text-muted">Uprawnienia sprawdza serwer; ten ekran niczego nie obchodzi.</p>
      <div className="mb-5 grid grid-cols-5 gap-1 rounded-2xl bg-hairline/70 p-1" role="tablist">
        {TABS.map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-xl py-2 text-sm ${tab === k ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>)}
      </div>
      {tab === "clubs" && <Clubs />}
      {tab === "sources" && <Sources />}
      {tab === "review" && <Review />}
      {tab === "reports" && <Reports />}
      {tab === "jobs" && <Jobs />}
    </main>
  );
}
