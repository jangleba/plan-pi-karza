import { useEffect, useMemo, useRef, useState } from "react";
import { localISO, planForProfile, weekStartOf } from "../engine";
import type { DayPlan, Profile } from "../engine";
import { scoped } from "../lib/store";
import { useInbox } from "../coach/inbox";
import { InstallCard } from "../pwa/PwaUi";
import { enablePush, pushState, type PushState } from "../pwa/push";
import { dismiss, retry, useSyncView } from "../sync/client";
import { activeRun } from "../workout/store";
import { totals } from "../workout/run";

/**
 * Dodatki ekranu „Dziś” dla PWA: stan zapisu i data planu, trening do wznowienia, wiadomość od trenera,
 * powiadomienia i instrukcja dodania ikony. Wszystko działa także offline (z pamięci urządzenia).
 */
const time = (ms: number) => new Date(ms).toLocaleString("pl-PL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

export function SyncLine() {
  const { mode, status, notices } = useSyncView();
  const pulled = Number(scoped.getItem("lastPullAt") ?? 0) || null;
  let text: string, tone = "text-muted", action: (() => void) | null = null;
  if (mode === "guest" || mode === "unconfigured") text = "Zapis na tym urządzeniu (bez konta)";
  else if (mode === "no_consent") text = "Treningi zapisane na tym urządzeniu · synchronizacja wyłączona w Ustawieniach";
  else if (status.kind === "synced") text = status.at ? `Wszystko zapisane na koncie · ${time(status.at)}` : "Wszystko zapisane na koncie";
  else if (status.kind === "pending") text = status.offline ? `Offline · ${status.count} ${status.count === 1 ? "zapis czeka" : "zapisy czekają"} na wysłanie` : `Wysyłanie ${status.count} ${status.count === 1 ? "zapisu" : "zapisów"}…`;
  else { text = `Nie udało się wysłać (${status.count}) – zapis jest bezpieczny na telefonie`; tone = "text-red-ink"; action = retry; }
  return (
    <div className="mb-4 -mt-3" aria-live="polite">
      <p className={`text-[12px] ${tone}`}>
        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${status.kind === "synced" && mode === "account" ? "bg-club" : status.kind === "error" ? "bg-red-ink" : "bg-sky"}`} />
        {text}{action && <button onClick={action} className="ml-2 underline">Ponów</button>}
      </p>
      {mode === "account" && <p className="mt-0.5 text-[12px] text-muted">Plan z danych konta pobranych {pulled ? time(pulled) : "– jeszcze nie pobrano"}</p>}
      {notices.map((n) => (
        <p key={n.id} className="mt-2 flex items-start gap-2 rounded-2xl bg-lemon px-3 py-2 text-[13px] text-lemon-ink">
          <span className="flex-1">{n.text}</span><button onClick={() => dismiss(n.id)} className="font-medium">OK</button>
        </p>
      ))}
    </div>
  );
}

function ResumeCard({ profile, onOpenDay }: { profile: Profile; onOpenDay: (d: DayPlan) => void }) {
  const run = useMemo(() => activeRun(), []);
  const day = useMemo(() => (run ? planForProfile(profile, weekStartOf(run.date)).days.find((d) => d.date === run.date) ?? null : null), [run, profile]);
  if (!run || !day) return null;
  const t = totals(run);
  return (
    <button onClick={() => onOpenDay(day)} className="bw-rise mb-3 flex w-full items-center gap-4 rounded-3xl border border-sel-border bg-accent-soft p-4 text-left active:scale-[0.99]" aria-label="Wznów trening">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg text-white" aria-hidden="true">▶</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-tight">Trening w toku: {run.title}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{t.done}/{t.total} serii · dotknij, żeby wznowić</span>
      </span>
    </button>
  );
}

function CoachCard({ focus }: { focus: boolean }) {
  const { items, markRead } = useInbox();
  const ref = useRef<HTMLElement | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [focus, items.length]);
  if (!items.length) return null;
  const unread = items.filter((m) => !m.readAt);
  const shown = all ? items.slice(0, 10) : unread.length ? unread.slice(0, 3) : items.slice(0, 1);
  return (
    <section ref={ref} className={`bw-rise mb-3 rounded-3xl border bg-card p-4 ${focus || unread.length ? "border-sel-border" : "border-hairline"}`} aria-label="Wiadomości od trenera">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-accent">Od trenera{unread.length ? ` · ${unread.length} nowe` : ""}</p>
        {items.length > 1 && <button onClick={() => setAll(!all)} className="text-[13px] text-muted">{all ? "Mniej" : "Wszystkie"}</button>}
      </div>
      {shown.map((m) => (
        <div key={m.id} className="mt-2 border-t border-hairline pt-2 first-of-type:border-0 first-of-type:pt-0">
          {m.kind === "plan_change" && <p className="text-[12px] font-medium text-lav-ink">Zmiana planu</p>}
          <p className="whitespace-pre-line text-[15px] leading-snug">{m.body}</p>
          <div className="mt-1 flex items-center justify-between text-[12px] text-muted">
            <span>{new Date(m.createdAt).toLocaleString("pl-PL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            {!m.readAt && <button onClick={() => void markRead(m.id)} className="rounded-full bg-btn px-3 py-1.5 font-medium text-btn-ink">Przeczytane</button>}
          </div>
        </div>
      ))}
    </section>
  );
}

function PushCard() {
  const { mode } = useSyncView();
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(() => scoped.getItem("pushCardHidden") === "1");
  useEffect(() => { void pushState().then(setState).catch(() => setState("unsupported")); }, []);
  if (hidden || mode === "guest" || mode === "unconfigured" || state !== "off") return null;
  return (
    <section className="bw-rise mb-3 rounded-3xl border border-hairline bg-card p-4" aria-label="Powiadomienia">
      <p className="text-[17px] font-semibold leading-tight">Powiadomienia od trenera</p>
      <p className="mt-1 text-[13px] text-muted">Wiadomość trenera, zmiana planu i przypomnienie o treningu. Możesz je wyłączyć w każdej chwili.</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => void enablePush().then(setState)} className="h-12 flex-1 rounded-2xl bw-grad text-sm font-medium">Włącz</button>
        <button onClick={() => { scoped.setItem("pushCardHidden", "1"); setHidden(true); }} className="h-12 rounded-2xl bg-canvas px-4 text-sm text-muted">Nie teraz</button>
      </div>
    </section>
  );
}

export function TodayPanel({ profile, onOpenDay, focus }: { profile: Profile; onOpenDay: (d: DayPlan) => void; focus: "message" | "workout" | null }) {
  const run = activeRun();
  const today = useMemo(() => planForProfile(profile, weekStartOf(run?.date ?? localISO())).days.find((d) => d.date === run?.date) ?? null, [profile, run?.date]);
  useEffect(() => { if (focus === "workout" && run && today) onOpenDay(today); }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <InstallCard />
      <ResumeCard profile={profile} onOpenDay={onOpenDay} />
      <CoachCard focus={focus === "message"} />
      <PushCard />
    </>
  );
}
