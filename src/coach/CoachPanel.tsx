import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Panel trenera (adres /trener), projektowany pod komputer, działa też na tablecie i telefonie.
 * Trener widzi wyłącznie przypisanych zawodników z aktywną usługą (RLS i funkcja coach_players w migracji 0010):
 * imię, pozycja, wykonanie treningów i swoje wiadomości. Pełnego profilu zawodnika nie widzi.
 */
interface Player { player_id: string; name: string; player_position: string | null; scope: "loadwise" | "club"; club: string | null; last_day: string | null; last_status: string | null; last_sets: string | null; sessions_7d: number; unread: number }
interface Log { id: string; day: string; session_key: string; status: "done" | "partial"; sets_done: number; sets_total: number; duration_s: number; finished_at: string }
interface Msg { id: string; kind: string; body: string; created_at: string; read_at: string | null }

const KIND: Record<string, string> = { strength: "Siła", sprint: "Sprint", run: "Bieganie", technique: "Technika", activation: "Aktywacja", recovery: "Regeneracja" };

export function CoachPanel({ email }: { email: string | null }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<Player | null>(null);
  const load = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("coach_players");
    if (error) { setErr("Nie udało się pobrać listy zawodników."); setPlayers([]); return; }
    setPlayers((data ?? []) as Player[]);
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="sticky top-0 z-10 border-b border-hairline bg-card/90 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight">BallWise · panel trenera</h1>
          <span className="ml-auto hidden text-sm text-muted sm:inline">{email}</span>
          <button onClick={() => void supabase?.auth.signOut()} className="rounded-xl bg-canvas px-3 py-2 text-sm">Wyloguj</button>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section className={sel ? "hidden lg:block" : ""} aria-label="Zawodnicy">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Twoi zawodnicy</h2>
          {err && <p className="mb-3 rounded-2xl bg-red-soft px-4 py-3 text-sm text-red-ink">{err}</p>}
          {players === null ? <div className="bw-shimmer h-64 rounded-3xl" /> : players.length === 0 ? (
            <p className="rounded-3xl border border-hairline bg-card p-5 text-sm text-muted">Nie masz przypisanych zawodników z aktywną usługą (LoadWise lub klub). Przypisania nadaje administrator.</p>
          ) : (
            <ul className="overflow-hidden rounded-3xl border border-hairline bg-card">
              {players.map((p) => (
                <li key={p.player_id + p.scope}>
                  <button onClick={() => setSel(p)} className={`flex w-full items-center gap-3 border-b border-hairline px-4 py-3.5 text-left last:border-0 hover:bg-canvas ${sel?.player_id === p.player_id ? "bg-accent-soft" : ""}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted">{p.player_position ?? "—"} · {p.scope === "club" ? p.club ?? "klub" : "LoadWise"}</span>
                    </span>
                    <span className="text-right text-xs text-muted">
                      <span className="block tabular-nums">{p.sessions_7d} tr. / 7 dni</span>
                      <span className="block">{p.last_day ? `ost. ${p.last_day.slice(5).split("-").reverse().join(".")}` : "brak zapisów"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Szczegóły zawodnika">{sel ? <PlayerDetail p={sel} onBack={() => setSel(null)} onSent={load} /> : <p className="hidden rounded-3xl border border-dashed border-hairline p-10 text-center text-sm text-muted lg:block">Wybierz zawodnika z listy.</p>}</section>
      </div>
    </div>
  );
}

function PlayerDetail({ p, onBack, onSent }: { p: Player; onBack: () => void; onSent: () => void }) {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"message" | "plan_change">("message");
  const [state, setState] = useState<"" | "sending" | "sent" | "error">("");
  const load = async () => {
    if (!supabase) return;
    const [l, m] = await Promise.all([
      supabase.from("session_logs").select("id,day,session_key,status,sets_done,sets_total,duration_s,finished_at").eq("user_id", p.player_id).order("day", { ascending: false }).limit(28),
      supabase.from("coach_messages").select("id,kind,body,created_at,read_at").eq("player_id", p.player_id).order("created_at", { ascending: false }).limit(20),
    ]);
    setLogs((l.data ?? []) as Log[]);
    setMsgs((m.data ?? []) as Msg[]);
  };
  useEffect(() => { setLogs(null); void load(); }, [p.player_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!supabase || !body.trim()) return;
    setState("sending");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("coach_messages").insert({ player_id: p.player_id, coach_id: u.user?.id, kind, body: body.trim() });
    if (error) { setState("error"); return; }
    setBody(""); setState("sent"); void load(); onSent();
  };

  return (
    <div>
      <button onClick={onBack} className="mb-3 text-sm text-accent lg:hidden">‹ Zawodnicy</button>
      <h2 className="text-2xl font-semibold tracking-tight">{p.name}</h2>
      <p className="mb-5 text-sm text-muted">{p.player_position ?? "—"} · {p.scope === "club" ? p.club ?? "klub" : "prowadzenie LoadWise"}</p>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-hairline bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Wykonane treningi (ostatnie 4 tygodnie)</h3>
          {logs === null ? <div className="bw-shimmer h-40 rounded-2xl" /> : logs.length === 0 ? <p className="text-sm text-muted">Brak zapisów. Zawodnik mógł nie włączyć synchronizacji treningów w Ustawieniach.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-medium">Dzień</th><th className="pb-2 font-medium">Sesja</th><th className="pb-2 text-right font-medium">Serie</th><th className="pb-2 text-right font-medium">Czas</th></tr></thead>
              <tbody>{logs.map((l) => (
                <tr key={l.id} className="border-t border-hairline">
                  <td className="py-2 tabular-nums">{l.day.slice(5).split("-").reverse().join(".")}</td>
                  <td className="py-2">{KIND[l.session_key] ?? l.session_key}{l.status === "partial" && <span className="ml-1.5 rounded-full bg-lemon px-2 py-0.5 text-[11px] text-lemon-ink">częściowo</span>}</td>
                  <td className="py-2 text-right tabular-nums">{l.sets_done}/{l.sets_total}</td>
                  <td className="py-2 text-right tabular-nums">{Math.round(l.duration_s / 60)} min</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
        <section className="rounded-3xl border border-hairline bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Wiadomość do zawodnika</h3>
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-2xl bg-hairline/70 p-1">
            <button onClick={() => setKind("message")} className={`rounded-xl py-2 text-sm ${kind === "message" ? "bg-card font-medium shadow-sm" : "text-muted"}`}>Wiadomość</button>
            <button onClick={() => setKind("plan_change")} className={`rounded-xl py-2 text-sm ${kind === "plan_change" ? "bg-card font-medium shadow-sm" : "text-muted"}`}>Zmiana planu</button>
          </div>
          <textarea value={body} onChange={(e) => { setBody(e.target.value); setState(""); }} maxLength={1000} rows={4} placeholder={kind === "plan_change" ? "Co zmienia się w planie i od kiedy" : "Np. Dobra technika w nagraniu. Jutro lżej."} className="w-full rounded-2xl bg-canvas p-3 text-[15px] outline-none focus:ring-2 focus:ring-sel-border" />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => void send()} disabled={!body.trim() || state === "sending"} className="h-11 rounded-2xl bw-grad px-5 text-sm font-medium disabled:opacity-50">Wyślij</button>
            <span className="text-xs text-muted">{state === "sent" ? "Wysłano. Zawodnik zobaczy ją na ekranie „Dziś” (i w powiadomieniu, jeśli je włączył)." : state === "error" ? "Nie udało się wysłać." : `${body.length}/1000`}</span>
          </div>
          {msgs.length > 0 && (
            <ul className="mt-4 space-y-2">
              {msgs.map((m) => (
                <li key={m.id} className="rounded-2xl bg-canvas p-3 text-sm">
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className="mt-1 text-xs text-muted">{m.kind === "plan_change" ? "Zmiana planu · " : ""}{new Date(m.created_at).toLocaleString("pl-PL")} · {m.read_at ? "przeczytana" : "nieprzeczytana"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
