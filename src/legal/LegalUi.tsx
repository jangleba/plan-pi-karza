import { useState } from "react";
import { Sheet } from "../Sheet";
import { CURRENT, DOCS, OPERATOR_LABEL, isDevLegalMode, legalReadiness, type DocKind } from "./config";
import { legalText } from "./docs";
import { AGREEMENT_VERSION, acceptAgreement, hasCurrentAgreement } from "./consent";
import { supabase } from "../lib/supabase";
import { assessAge } from "../lib/age";
import type { Profile } from "../engine";
import { loadPrivate } from "../lib/private";
import { localISO } from "../engine";

export const DOC_TITLE: Record<DocKind, string> = { terms: "Regulamin", privacy: "Informacja o prywatności", safety: "Zasady bezpiecznego korzystania" };

/** Widoczne ostrzeżenie, gdy konfiguracja prawna jest niekompletna lub niezatwierdzona (szkic ≠ dokument zatwierdzony). */
export function DraftBanner() {
  const r = legalReadiness();
  if (r.ready) return null;
  return (
    <div className="mb-4 rounded-2xl bg-lemon px-4 py-3 text-xs leading-snug text-lemon-ink" role="note">
      <b>Wersja robocza – wymaga uzupełnienia i zatwierdzenia prawnego.</b>{" "}
      {r.missingOperator.length > 0 && <>Brak danych operatora: {r.missingOperator.map((f) => OPERATOR_LABEL[f]).join("; ")}. </>}
      {r.unapproved.length > 0 && <>Niezatwierdzone dokumenty: {r.unapproved.map((k) => DOC_TITLE[k]).join("; ")}. </>}
      {isDevLegalMode() ? "Tryb deweloperski: konta można zakładać do testów." : "Zakładanie kont jest wyłączone do czasu uzupełnienia."}
    </div>
  );
}

export function LegalDoc({ kind }: { kind: DocKind }) {
  const t = legalText(kind), meta = DOCS[kind];
  return (
    <article>
      <p className="mb-3 text-xs text-muted">Wersja: {meta.version} · status: {meta.status === "approved" ? `zatwierdzony (${meta.approvedBy}, ${meta.approvedAt})` : "szkic, niezatwierdzony"}</p>
      <DraftBanner />
      {t.sections.map((s) => (
        <section key={s.h} className="mb-4">
          <h3 className="mb-1 text-[15px] font-semibold">{s.h}</h3>
          {s.p.map((x, i) => <p key={i} className="mb-2 text-sm leading-relaxed text-ink/85">{x}</p>)}
        </section>
      ))}
    </article>
  );
}

/** Dokumenty dostępne w każdej chwili (przed zawarciem umowy, w ustawieniach). */
export function LegalSheet({ kind, onClose }: { kind: DocKind; onClose: () => void }) {
  const [k, setK] = useState<DocKind>(kind);
  return (
    <Sheet title={DOC_TITLE[k]} onClose={onClose}>
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(DOCS) as DocKind[]).map((d) => <button key={d} aria-pressed={k === d} onClick={() => setK(d)} className={`rounded-full px-3.5 py-2 text-sm ${k === d ? "bw-sel font-medium" : "bg-canvas text-ink"}`}>{DOC_TITLE[d]}</button>)}
      </div>
      <LegalDoc kind={k} />
      <p className="mt-2 text-xs text-muted">Kontakt do operatora: {CURRENT.operator.email ?? "[do uzupełnienia: e-mail kontaktowy]"}</p>
    </Sheet>
  );
}

export function LegalLinks({ onOpen }: { onOpen: (k: DocKind) => void }) {
  return (
    <p className="text-xs text-muted">
      {(["terms", "privacy", "safety"] as DocKind[]).map((k, i) => <span key={k}>{i > 0 && " · "}<button className="underline" onClick={() => onOpen(k)}>{DOC_TITLE[k]}</button></span>)}
    </p>
  );
}

/**
 * Akceptacja warunków umowy i potwierdzenie zapoznania się z zasadami bezpieczeństwa – DWA odrębne oświadczenia, bez zbiorczej zgody.
 * Informacja o prywatności jest dostępna jako informacja (bez pola wyboru). Dowód: użytkownik, wersja, czas, zakres, metoda (serwer).
 */
export function AgreementGate({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [terms, setTerms] = useState(hasCurrentAgreement("terms"));
  const [safety, setSafety] = useState(hasCurrentAgreement("safety"));
  const [doc, setDoc] = useState<DocKind | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      if (!hasCurrentAgreement("terms")) { const r = await acceptAgreement("terms"); if (!r.ok) throw new Error(r.error); }
      if (!hasCurrentAgreement("safety")) { const r = await acceptAgreement("safety"); if (!r.ok) throw new Error(r.error); }
      const a = assessAge({ ...loadPrivate(), declaredAge: profile.age, declaredOn: profile.ageAsOf }, localISO());
      if (a.band && supabase) await supabase.rpc("declare_age_band", { p_band: a.band }); // minimalny zapis: grupa wieku, nie data urodzenia
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Nie udało się zapisać."); } finally { setBusy(false); }
  };
  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-16">
      <h1 className="text-[28px] font-semibold tracking-tight">Zanim zaczniesz</h1>
      <p className="mb-4 mt-1 text-sm text-muted">Dwa osobne potwierdzenia dla konta. Dokumenty możesz przeczytać przed zaakceptowaniem.</p>
      <DraftBanner />
      <label className="mb-3 flex gap-3 rounded-2xl border border-hairline bg-card p-4 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
        <span>Akceptuję warunki umowy: <button className="underline" onClick={() => setDoc("terms")}>Regulamin</button> (wersja {AGREEMENT_VERSION.terms}).</span></label>
      <label className="mb-3 flex gap-3 rounded-2xl border border-hairline bg-card p-4 text-sm"><input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} className="mt-0.5" />
        <span>Zapoznałem/zapoznałam się z <button className="underline" onClick={() => setDoc("safety")}>Zasadami bezpiecznego korzystania</button> (wersja {AGREEMENT_VERSION.safety}).</span></label>
      <p className="mb-4 text-xs text-muted">Sposób przetwarzania danych opisuje <button className="underline" onClick={() => setDoc("privacy")}>Informacja o prywatności</button> – to informacja, nie zgoda. Zgodę na synchronizację danych o samopoczuciu i masie ciała możesz opcjonalnie włączyć w ustawieniach.</p>
      {err && <p className="mb-3 rounded-2xl bg-pink px-4 py-3 text-sm text-pink-ink">{err}</p>}
      <button disabled={!terms || !safety || busy} onClick={() => void submit()} className="bw-grad w-full rounded-2xl py-4 text-base font-medium disabled:opacity-40">{busy ? "Zapisuję…" : "Dalej"}</button>
      {doc && <LegalSheet kind={doc} onClose={() => setDoc(null)} />}
    </main>
  );
}
