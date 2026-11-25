import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import type { Profile } from "./engine";
import { localISO } from "./engine";
import { supabase } from "./lib/supabase";
import type { Scope } from "./lib/store";
import { evaluate } from "./lib/profileGuard";
import { loadPrivate } from "./lib/private";
import { buildExport, deleteAccountRemote, deleteAllLocalData, deleteGuestData, deleteLocalData, guardianLink, guardianState, guestHasData, guestKeys, importGuestData, requestGuardian, type DeleteReport, type GuardianState } from "./legal/account";
import { loadConsent, setHealthSync, type ConsentState } from "./legal/consent";
import { CONTRACT_VERSION, CURRENT, OPERATOR_LABEL, legalReadiness, mayCreateAccounts, type DocKind } from "./legal/config";
import { COMMERCE, purchaseAvailable } from "./legal/commerce";
import { LICENSES } from "./legal/licenses";
import { DraftBanner, LegalLinks, LegalSheet } from "./legal/LegalUi";
import { InstallSheet } from "./pwa/PwaUi";
import { disablePush, enablePush, pushState, type PushState } from "./pwa/push";

/** Aplikacja na telefonie: ikona na ekranie głównym i powiadomienia (za zgodą, wyłączalne). */
function AppOnPhone({ user, card, h, btn }: { user: boolean; card: string; h: string; btn: string }) {
  const [install, setInstall] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => { void pushState().then(setPush).catch(() => setPush("unsupported")); }, []);
  const PUSH_TEXT: Record<PushState, string> = {
    on: "Włączone: wiadomość trenera, zmiana planu, przypomnienie.",
    off: "Wyłączone.",
    denied: "Zablokowane w ustawieniach telefonu (Ustawienia → Powiadomienia → BallWise).",
    "needs-install": "Na iPhonie powiadomienia działają po dodaniu ikony do ekranu początkowego (iOS 16.4 lub nowszy).",
    unconfigured: "Powiadomienia nie są jeszcze skonfigurowane na serwerze.",
    unsupported: "Ta przeglądarka nie obsługuje powiadomień.",
  };
  return (
    <section className={card}>
      <h3 className={h}>Aplikacja na telefonie</h3>
      <button className={btn} onClick={() => setInstall(true)}>Ikona na ekranie głównym – instrukcja</button>
      {user && push && (
        <div className="mt-4">
          <p className="text-[15px] font-medium">Powiadomienia</p>
          <p className="mt-1 text-sm text-muted">{PUSH_TEXT[push]}</p>
          {push === "off" && <button className={`${btn} mt-2`} onClick={() => void enablePush().then(setPush)}>Włącz powiadomienia</button>}
          {push === "on" && <button className={`${btn} mt-2`} onClick={() => void disablePush().then(() => setPush("off"))}>Wyłącz powiadomienia</button>}
        </div>
      )}
      {install && <InstallSheet onClose={() => setInstall(false)} />}
    </section>
  );
}

const card = "mb-4 rounded-3xl border border-hairline bg-card p-5";
const h = "mb-2 text-xs font-semibold uppercase tracking-wide text-muted";
const btn = "rounded-2xl bg-canvas px-4 py-3 text-sm font-medium";
const danger = "rounded-2xl bg-pink px-4 py-3 text-sm font-semibold text-pink-ink";

function download(file: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function Guardian({ profile }: { profile: Profile }) {
  const band = evaluate(profile, loadPrivate(), localISO()).band;
  const [st, setSt] = useState<GuardianState | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (band === "16-17") void guardianState().then(setSt); }, [band]);
  if (band !== "16-17") return null;
  const label = { none: "nie poproszono", pending: "oczekuje na opiekuna", confirmed: "potwierdzone", revoked: "cofnięte", expired: "link wygasł" }[st?.state ?? "none"];
  return (
    <section className={card}>
      <h3 className={h}>Potwierdzenie opiekuna (umowa płatna)</h3>
      <p className="mb-2 text-sm text-ink/80">Przy osobie w wieku 16–17 lat <b>płatna umowa</b> wymaga potwierdzenia przez przedstawiciela ustawowego albo zawarcia jej przez pełnoletniego nabywcę. Bezpłatne funkcje działają bez potwierdzenia. To potwierdzenie dotyczy warunków umowy (wersja {CONTRACT_VERSION}) – <b>nie jest zgodą na przetwarzanie danych</b>.</p>
      <p className="mb-3 text-sm">Status: <b>{label}</b></p>
      {err && <p className="mb-2 text-sm text-pink-ink">{err}</p>}
      {link ? (
        <div className="rounded-2xl bg-lemon p-3 text-xs text-lemon-ink">
          <p className="mb-1">Link jest pokazany <b>tylko teraz</b> (ważny do {new Date(link.expiresAt).toLocaleString("pl-PL")}). Przekaż go opiekunowi własnym kanałem.</p>
          <p className="break-all font-mono">{link.url}</p>
          <button className="mt-2 rounded-xl bg-white px-3 py-2 font-semibold" onClick={async () => { try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { /* ręcznie */ } }}>{copied ? "Skopiowano" : "Skopiuj link"}</button>
        </div>
      ) : (
        <button className={btn} onClick={async () => { setErr(""); const r = await requestGuardian(); if (r.ok) { setLink({ url: guardianLink(r.token), expiresAt: r.expiresAt }); setSt(await guardianState()); } else setErr(r.error); }}>
          {st?.state === "pending" || st?.state === "expired" ? "Wygeneruj nowy link dla opiekuna" : "Wygeneruj link dla opiekuna"}
        </button>
      )}
      <p className="mt-3 text-xs text-muted">Nie zbieramy danych opiekuna. To deklaracja opiekuna, a nie weryfikacja tożsamości – metoda weryfikacji wymaga zatwierdzenia przez operatora.</p>
    </section>
  );
}

export function Settings({ scope, email, profile, onClose, onLogin }: { scope: Scope; email: string | null; profile: Profile; onClose: () => void; onLogin: () => void }) {
  const user = scope.kind === "user";
  const [consent, setConsent] = useState<ConsentState>(() => loadConsent("health_sync"));
  const [msg, setMsg] = useState("");
  const [doc, setDoc] = useState<DocKind | null>(null);
  const [lic, setLic] = useState(false);
  const [del, setDel] = useState<"" | "local" | "all" | "guest" | "account">("");
  const [typed, setTyped] = useState("");
  const [report, setReport] = useState<DeleteReport | null>(null);
  const [busy, setBusy] = useState(false);
  const guestData = user && guestHasData();
  const commerce = purchaseAvailable();
  const ready = legalReadiness();

  const doExport = async () => {
    setBusy(true); setMsg("");
    const r = await buildExport();
    download(r.file, r.json);
    setMsg(r.serverError ? `Pobrano dane lokalne. Danych serwerowych nie udało się pobrać: ${r.serverError}` : r.serverIncluded ? "Pobrano dane lokalne i serwerowe." : "Pobrano dane lokalne (tryb gościa).");
    setBusy(false);
  };
  const toggleSync = async (on: boolean) => {
    setBusy(true); setMsg("");
    const r = await setHealthSync(on);
    setConsent(loadConsent("health_sync"));
    setMsg(r.ok ? (on ? "Synchronizacja danych o samopoczuciu, masie i wynikach włączona." : "Zgoda wycofana. Synchronizacja zatrzymana, a dane z serwera usunięte.") : `${on ? "Nie udało się włączyć" : "Zgoda wycofana lokalnie (synchronizacja zatrzymana), ale usunięcie danych z serwera się nie powiodło"}: ${r.error}. ${on ? "" : "Spróbuj ponownie."}`);
    setBusy(false);
  };
  const doDelete = async () => {
    setBusy(true); setMsg("");
    if (del === "account") {
      const r = await deleteAccountRemote();
      setReport(r);
      if (r.complete) window.location.reload();
    } else {
      const n = del === "all" ? deleteAllLocalData() : del === "guest" ? deleteGuestData() : deleteLocalData();
      setMsg(`Usunięto ${n} wpisów lokalnych.`);
      if (del !== "guest") window.location.reload();
      setDel("");
    }
    setBusy(false);
  };

  return (
    <Sheet title="Ustawienia" onClose={onClose}>
      <DraftBanner />
      <section className={card}>
        <h3 className={h}>Konto</h3>
        <p className="mb-3 text-[15px]">{user ? <>Zalogowano: <b>{email ?? "konto"}</b></> : "Tryb gościa – dane tylko na tym urządzeniu."}</p>
        {user ? (
          <button className={btn} onClick={async () => { await supabase?.auth.signOut(); onClose(); }}>Wyloguj</button>
        ) : supabase ? (
          mayCreateAccounts() ? <button className={btn} onClick={() => { onClose(); onLogin(); }}>Zaloguj się lub załóż konto</button>
            : <p className="text-sm text-muted">Zakładanie kont jest niedostępne do czasu uzupełnienia danych operatora i zatwierdzenia dokumentów.</p>
        ) : <p className="text-sm text-muted">Konta wymagają połączenia z serwerem (nie skonfigurowano).</p>}
        {guestData && (
          <div className="mt-4 rounded-2xl bg-lav p-3 text-sm text-lav-ink">
            <p className="mb-2">Na tym urządzeniu są dane z trybu gościa ({guestKeys().length} wpisów). Nie zostały połączone z tym kontem. Możesz je <b>jawnie</b> zaimportować (nie nadpisuje danych konta) albo usunąć.</p>
            <div className="flex gap-2">
              <button className="rounded-xl bg-white px-3 py-2 font-semibold" onClick={() => { const r = importGuestData(); setMsg(`Zaimportowano ${r.copied.length} wpisów, pominięto ${r.skipped.length} (już istniały).`); setTimeout(() => window.location.reload(), 900); }}>Importuj do konta</button>
              <button className="rounded-xl bg-white px-3 py-2" onClick={() => setDel("guest")}>Usuń dane gościa</button>
            </div>
          </div>
        )}
      </section>

      <AppOnPhone user={user} card={card} h={h} btn={btn} />

      {user && (
        <section className={card}>
          <h3 className={h}>Synchronizacja danych o samopoczuciu i wynikach</h3>
          <p className="mb-3 text-sm text-ink/80">Opcjonalna zgoda na wysyłanie do chmury: check-in (sen, samopoczucie), ciężary i masę ciała w logu, wynik MAS oraz zapis wykonanych treningów (widoczny dla Twojego trenera, jeśli korzystasz z LoadWise lub klubu). Bez zgody te dane zostają na urządzeniu. Wycofanie zgody zatrzymuje synchronizację i usuwa te dane z serwera.</p>
          <label className="flex items-center gap-3 text-[15px]">
            <input type="checkbox" checked={consent.granted} disabled={busy} onChange={(e) => void toggleSync(e.target.checked)} />
            {consent.granted ? "Zgoda udzielona" : "Zgoda niewyrażona"}
          </label>
          {consent.pendingWithdraw && <p className="mt-2 text-sm text-pink-ink">Wycofanie czeka na usunięcie danych z serwera. <button className="underline" onClick={() => void toggleSync(false)}>Ponów</button></p>}
        </section>
      )}

      {user && <Guardian profile={profile} />}

      <section className={card}>
        <h3 className={h}>Twoje dane</h3>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={busy} onClick={() => void doExport()}>Pobierz moje dane (JSON)</button>
          <button className={btn} onClick={() => setDel("local")}>Usuń dane lokalne</button>
          <button className={btn} onClick={() => setDel("all")}>Usuń wszystko z tego urządzenia</button>
        </div>
        <p className="mt-3 text-xs text-muted">„Usuń dane lokalne” dotyczy bieżącej przestrzeni ({user ? "to konto" : "tryb gościa"}) na tym urządzeniu i nie usuwa konta ani danych na serwerze.</p>
        {user && (
          <div className="mt-4 border-t border-hairline pt-4">
            <h4 className="mb-1 text-sm font-semibold">Usuń konto</h4>
            <p className="mb-3 text-sm text-ink/80">Trwale usuwa konto i dane na serwerze (profil, wyniki, oświadczenia, potwierdzenia, zapisy). Nie anuluje subskrypcji u dostawcy płatności (gdy będzie) i nie jest ustawowym odstąpieniem od umowy – to osobne czynności. Kopie zapasowe dostawcy mogą istnieć ograniczony czas (okres do ustalenia); nie obiecujemy natychmiastowego usunięcia każdej kopii.</p>
            <button className={danger} onClick={() => { setDel("account"); setReport(null); }}>Usuń konto…</button>
          </div>
        )}
      </section>

      {del && (
        <section className={`${card} border-pink-ink/30`}>
          <h3 className="mb-2 text-[15px] font-semibold">{del === "account" ? "Potwierdź usunięcie konta" : "Potwierdź usunięcie danych"}</h3>
          {del === "account" && <><p className="mb-2 text-sm">Wpisz <b>USUŃ</b>, aby potwierdzić.</p><input value={typed} onChange={(e) => setTyped(e.target.value)} className="mb-3 w-full rounded-xl bg-canvas px-3 py-2.5 text-sm" aria-label="Potwierdzenie" /></>}
          {report && !report.complete && (
            <div className="mb-3 rounded-2xl bg-pink p-3 text-sm text-pink-ink">
              <p className="font-semibold">Usuwanie nie zostało dokończone.</p>
              <p>{report.error}</p>
              <ul className="mt-1 text-xs">{report.steps.map((s) => <li key={s.name}>{s.ok ? "✓" : "✗"} {s.name === "erase_data" ? "dane na serwerze" : "konto logowania"}{s.error ? ` – ${s.error}` : ""}</li>)}</ul>
              <p className="mt-1 text-xs">Operacja jest bezpieczna do powtórzenia – kliknij ponownie, aby dokończyć.</p>
            </div>
          )}
          <div className="flex gap-2">
            <button className={danger} disabled={busy || (del === "account" && typed.trim().toUpperCase() !== "USUŃ")} onClick={() => void doDelete()}>{busy ? "Trwa…" : report && !report.complete ? "Ponów usuwanie" : "Usuń"}</button>
            <button className={btn} onClick={() => { setDel(""); setTyped(""); setReport(null); }}>Anuluj</button>
          </div>
        </section>
      )}

      <section className={card}>
        <h3 className={h}>Subskrypcja i odstąpienie</h3>
        {commerce.available ? (
          <p className="text-sm">Plan: {COMMERCE.plan}. Zasady odnowienia, rezygnacji, reklamacji i odstąpienia podajemy przed zawarciem umowy.</p>
        ) : (
          <p className="text-sm text-ink/80">Płatne funkcje nie są jeszcze dostępne. Gdy się pojawią, przed zawarciem umowy poznasz cenę, okres rozliczeniowy, odnowienie, sposób rezygnacji, reklamacji i informację o odstąpieniu. Usunięcie konta, rezygnacja z subskrypcji i ustawowe odstąpienie to trzy odrębne czynności.</p>
        )}
        {commerce.missing.length > 0 && <p className="mt-2 text-xs text-muted">Do uzupełnienia przez operatora: {commerce.missing.join("; ")}.</p>}
      </section>

      <section className={card}>
        <h3 className={h}>Dokumenty i kontakt</h3>
        <LegalLinks onOpen={setDoc} />
        <p className="mt-3 text-sm">Operator: {CURRENT.operator.name ?? "[do uzupełnienia]"}<br />Kontakt w sprawie praw osób (dostęp, pobranie, usunięcie, wycofanie zgody): {CURRENT.operator.email ?? <span className="text-lemon-ink">[do uzupełnienia: {OPERATOR_LABEL.email}]</span>}</p>
        {!ready.ready && <p className="mt-2 text-xs text-muted">Dane operatora i dokumenty są w trakcie uzupełniania – patrz ostrzeżenie u góry.</p>}
        <button className="mt-3 text-sm text-accent" onClick={() => setLic(true)}>Źródła i licencje</button>
      </section>

      {msg && <p className="bw-pop mb-4 rounded-2xl bg-canvas px-4 py-3 text-sm" role="status">{msg}</p>}
      {doc && <LegalSheet kind={doc} onClose={() => setDoc(null)} />}
      {lic && (
        <Sheet title="Źródła i licencje" onClose={() => setLic(false)}>
          <ul className="flex flex-col gap-3">
            {LICENSES.map((l) => (
              <li key={l.id} className="rounded-2xl border border-hairline p-4 text-sm">
                <div className="font-semibold">{l.name}</div>
                <div className="text-xs text-muted">{l.license}{l.status === "do_ustalenia" ? " · warunki do ustalenia" : ""}</div>
                {l.attribution && <div className="mt-1">{l.attribution}</div>}
                <div className="mt-1 text-xs text-ink/70">{l.note}</div>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </Sheet>
  );
}
