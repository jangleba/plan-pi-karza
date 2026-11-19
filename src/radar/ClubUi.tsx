import { useMemo, useState } from "react";
import type { Profile } from "../engine";
import { ago, distanceText } from "./format";
import { bestContact, loadForm, markSent, reportClub, saveForm, type Club, type ClubView, type InquiryForm } from "./clubs";
import { buildInquiry, mailtoUrl } from "../../supabase/functions/_shared/radar/inquiry";
import type { PlayerFacts } from "./lib";

const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "bg-canvas text-ink"}`;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function ClubCard({ v, sentAt, nowMs, onWrite }: { v: ClubView; sentAt?: string; nowMs: number; onWrite: () => void }) {
  const c = v.club, contact = bestContact(c)!;
  const dist = distanceText(v.distanceKm);
  return (
    <article className="bw-rise rounded-3xl border border-hairline bg-card p-5">
      <h3 className="text-[17px] font-semibold leading-snug">{c.name}</h3>
      <p className="mt-0.5 text-sm text-muted">{c.city ?? "miejscowość nieznana"}{dist ? ` · ${dist}` : ""}</p>
      <p className="mt-3 break-all text-[15px]">{contact.email}</p>
      <p className="mt-1 text-xs text-muted">Adres z oficjalnej strony klubu ({host(contact.evidenceUrl)}), sprawdzono {ago(contact.checkedAt, nowMs)}</p>
      {c.recruitmentUrl && <a href={c.recruitmentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm text-accent">Strona klubu o naborze ›</a>}
      <div className="mt-3 flex gap-2">
        <button onClick={onWrite} className="bw-grad flex-1 rounded-2xl py-3 text-sm font-medium">{sentAt ? "Napisz ponownie" : "Napisz zapytanie"}</button>
        <a href={c.website} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-hairline bg-card px-4 py-3 text-sm">Strona</a>
      </div>
      {sentAt && <p className="mt-2 text-xs text-muted">Wysłano {ago(sentAt, nowMs)}</p>}
    </article>
  );
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } catch { return false; }
  }
}

/** Wiadomość do klubu: pola, podgląd do edycji, kopiowanie, otwarcie w poczcie. Niczego nie wysyłamy w imieniu zawodnika. */
export function Inquiry({ club, profile, facts, nowMs, onSent, onBack }: {
  club: Club; profile: Profile; facts: PlayerFacts; nowMs: number; onSent: () => void; onBack: () => void;
}) {
  const contact = bestContact(club);
  const [form, setForm] = useState<InquiryForm>(() => loadForm(profile.name ?? ""));
  const [custom, setCustom] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reported, setReported] = useState<null | "ok" | "fail">(null);
  const set = <K extends keyof InquiryForm>(k: K, v: InquiryForm[K]) => { const n = { ...form, [k]: v }; setForm(n); saveForm(n); };
  const year = facts.birthDate ? Number(facts.birthDate.slice(0, 4)) : facts.birthYear ?? null;
  const gen = useMemo(() => buildInquiry({
    clubName: club.name, fullName: form.fullName, birthYear: year, birthDate: form.withBirthDate ? facts.birthDate ?? null : null, position: facts.position,
    city: facts.place?.name ?? null, currentClub: form.currentClub, experience: form.experience, videoUrl: form.videoUrl, phone: form.phone, minor: profile.age < 18, purpose: form.purpose,
  }), [club.name, form, year, facts, profile.age]);
  if (!contact) return <button onClick={onBack} className="text-sm text-accent">‹ Wróć</button>;
  const body = custom ?? gen.body;
  const href = mailtoUrl(contact.email, gen.subject, body);
  const field = "w-full rounded-2xl bg-canvas px-4 py-3 text-base placeholder:text-muted/70";
  const done = async (what: string, ok: boolean) => setNote(ok ? `${what} – gotowe.` : "Nie udało się skopiować – zaznacz tekst ręcznie.");

  return (
    <>
      <button onClick={onBack} className="mb-3 text-sm text-accent">‹ Wróć</button>
      <h3 className="text-xl font-semibold leading-snug">{club.name}</h3>
      <p className="mt-1 break-all text-[15px]">{contact.email}</p>
      <p className="mt-1 text-xs text-muted">
        Adres znaleziony na stronie klubu: <a href={contact.evidenceUrl} target="_blank" rel="noopener noreferrer" className="underline">{host(contact.evidenceUrl)}</a>, sprawdzono {ago(contact.checkedAt, nowMs)}.
        {contact.evidenceQuote ? <> Fragment: „{contact.evidenceQuote}”</> : null}
      </p>

      <h4 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Uzupełnij (opcjonalnie)</h4>
      <input className={`${field} mb-2`} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Imię i nazwisko" aria-label="Imię i nazwisko" />
      <input className={`${field} mb-2`} value={form.currentClub} onChange={(e) => set("currentClub", e.target.value)} placeholder="Obecny klub" aria-label="Obecny klub" />
      <input className={`${field} mb-2`} value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder="Krótko o sobie (opcjonalnie)" aria-label="Doświadczenie" />
      <input className={`${field} mb-2`} value={form.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="Link do nagrania (opcjonalnie)" aria-label="Link do nagrania" inputMode="url" />
      <input className={`${field} mb-3`} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Telefon (opcjonalnie)" aria-label="Telefon" inputMode="tel" />
      <div className="mb-3 flex flex-wrap gap-2">
        {([["testy", "Testy / nabór"], ["trening", "Trening otwarty"], ["oba", "Wszystko"]] as const).map(([k, t]) => <button key={k} aria-pressed={form.purpose === k} onClick={() => set("purpose", k)} className={chip(form.purpose === k)}>{t}</button>)}
      </div>
      {facts.birthDate && <label className="mb-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.withBirthDate} onChange={(e) => set("withBirthDate", e.target.checked)} />Dodaj pełną datę urodzenia (domyślnie tylko rocznik)</label>}

      <h4 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Wiadomość</h4>
      <input className={`${field} mb-2`} readOnly value={gen.subject} aria-label="Temat" />
      <textarea className={`${field} min-h-[260px] leading-snug`} value={body} onChange={(e) => setCustom(e.target.value)} aria-label="Treść wiadomości" />
      {custom !== null && <button onClick={() => setCustom(null)} className="mt-1 text-xs text-accent">Przywróć automatyczną treść</button>}

      <div className="mt-4 flex flex-col gap-2">
        {href ? <a href={href} className="bw-grad block rounded-2xl py-4 text-center text-base font-medium" onClick={() => setNote("Otworzyłem Twoją pocztę. Po wysłaniu oznacz zapytanie jako wysłane.")}>Otwórz w poczcie</a>
          : <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-muted">Wiadomość jest zbyt długa na odnośnik – skopiuj ją i wklej w swojej poczcie.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={async () => done("Wiadomość skopiowana", await copy(`Temat: ${gen.subject}\n\n${body}`))} className="rounded-2xl border border-hairline bg-card py-3.5 text-sm">Skopiuj wiadomość</button>
          <button onClick={async () => done("Adres skopiowany", await copy(contact.email))} className="rounded-2xl border border-hairline bg-card py-3.5 text-sm">Skopiuj adres</button>
        </div>
        <button onClick={() => { markSent(club.id); onSent(); setNote("Zapisano na tym urządzeniu, że wysłano zapytanie."); }} className="rounded-2xl bg-canvas py-3.5 text-sm font-medium">Oznacz jako wysłane</button>
      </div>
      {note && <p className="mt-3 text-center text-sm text-muted" role="status">{note}</p>}
      <p className="mt-4 text-xs text-muted">Wiadomość wysyłasz Ty, ze swojej poczty – aplikacja niczego nie wysyła w Twoim imieniu i nie widzi tego, co napiszesz. Odpowiedź i zapisy zależą od klubu.</p>
      {reported === null
        ? <button onClick={async () => setReported((await reportClub(club.id, "Zgłoszony błąd adresu lub prośba o usunięcie")) ? "ok" : "fail")} className="mt-3 text-xs text-muted underline">Adres nieprawidłowy lub klub prosi o usunięcie</button>
        : <p className="mt-3 text-xs text-muted">{reported === "ok" ? "Dziękujemy – sprawdzimy." : "Nie udało się wysłać zgłoszenia."}</p>}
    </>
  );
}
