import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "../engine";
import { ago, distanceText } from "./format";
import { bestContact, loadForm, markSent, reportClub, saveForm, type Club, type ClubView, type InquiryForm } from "./clubs";
import { buildInquiry, mailtoUrl } from "../../supabase/functions/_shared/radar/inquiry";
import type { PlayerFacts } from "./lib";
import { initials, tintOf } from "./viz";

const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "bg-canvas text-ink"}`;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/* ---------- małe ikony (własne SVG, bez zależności) ---------- */
export const Envelope = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
);
export const Ball = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m12 8 3.2 2.3-1.2 3.7h-4l-1.2-3.7zM12 8V3.2M15.2 10.3l4.4-1.4M14 14l2.6 3.6M10 14l-2.6 3.6M8.8 10.3 4.4 8.9" /></svg>
);
const Plane = () => (
  <svg viewBox="0 0 64 64" className="h-20 w-20" aria-hidden="true"><path d="M6 30 58 8 46 56 31 40 22 50 20 36z" fill="#dbe9fa" stroke="#2f6fb3" strokeWidth="2.5" strokeLinejoin="round" /><path d="M20 36 58 8 31 40" fill="none" stroke="#2f6fb3" strokeWidth="2.5" strokeLinejoin="round" /></svg>
);

export function Avatar({ club, size = 48 }: { club: Pick<Club, "id" | "name">; size?: number }) {
  return <span className={`bw-t${tintOf(club.id)} bw-tint-dot flex shrink-0 items-center justify-center rounded-full font-bold`} style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden="true">{initials(club.name)}</span>;
}

export function ClubCard({ v, sentAt, nowMs, onWrite }: { v: ClubView; sentAt?: string; nowMs: number; onWrite: () => void }) {
  const c = v.club, contact = bestContact(c)!;
  const dist = distanceText(v.distanceKm);
  return (
    <article className={`bw-rise bw-t${tintOf(c.id)} bw-tint bw-lift-card rounded-3xl p-5`}>
      <div className="flex items-center gap-3.5">
        <Avatar club={c} />
        <div className="min-w-0 flex-1">
          <h3 className="bw-tint-ink truncate text-[17px] font-semibold leading-snug">{c.name}</h3>
          <p className="bw-tint-ink text-sm opacity-80">{c.city ?? "miejscowość nieznana"}{dist ? ` · ${dist}` : ""}</p>
        </div>
        {sentAt && <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-mint-ink bw-pop">✓ wysłano</span>}
      </div>
      <div className="mt-3.5 rounded-2xl bg-white/75 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Dane kontaktowe klubu</p>
        <p className="break-all text-[15px] font-medium">{contact.email}</p>
        <p className="mt-0.5 text-xs text-muted">Z oficjalnej strony klubu ({host(contact.evidenceUrl)}), sprawdzono {ago(contact.checkedAt, nowMs)}</p>
      </div>
      <p className="bw-tint-ink mt-2 text-xs opacity-80">To informacja kontaktowa, nie oferta: nie potwierdzamy, że klub prowadzi obecnie nabór.</p>
      {c.recruitmentUrl && <a href={c.recruitmentUrl} target="_blank" rel="noopener noreferrer" className="bw-tint-ink mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium"><Ball className="h-4 w-4" />Strona klubu o naborze (sprawdź aktualność u klubu) ›</a>}
      <div className="mt-3.5 flex gap-2">
        <button onClick={onWrite} className="bw-wiggle flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-semibold text-ink shadow-[0_1px_0_rgba(0,0,0,0.04)]"><Envelope className="h-[18px] w-[18px]" />{sentAt ? "Napisz ponownie" : "Napisz zapytanie"}</button>
        <a href={c.website} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-white/60 px-4 py-3 text-sm font-medium">Strona</a>
      </div>
      {sentAt && <p className="bw-tint-ink mt-2 text-xs opacity-80">Wysłano {ago(sentAt, nowMs)}</p>}
    </article>
  );
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } catch { return false; }
  }
}

/** Wizytówka zawodnika: raz wpisane dane zostają na urządzeniu i podstawiają się do każdej wiadomości. */
export function useCardForm(defaultName: string) {
  const [form, setForm] = useState<InquiryForm>(() => loadForm(defaultName));
  const [flash, setFlash] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const set = <K extends keyof InquiryForm>(k: K, v: InquiryForm[K]) => {
    const n = { ...form, [k]: v };
    setForm(n); saveForm(n);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash((x) => x + 1), 500); // znaczek „zapamiętane” po przerwie w pisaniu
  };
  const reset = () => { const n = { ...loadForm(""), fullName: "", currentClub: "", experience: "", videoUrl: "", phone: "", withBirthDate: false }; setForm(n); saveForm(n); setFlash((x) => x + 1); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { form, set, flash, reset };
}

export function CardFields({ card, withPurpose = true }: { card: ReturnType<typeof useCardForm>; withPurpose?: boolean }) {
  const { form, set, flash } = card;
  const field = "w-full rounded-2xl bg-white px-4 py-3 text-base placeholder:text-muted/70";
  return (
    <div className="bw-t3 bw-tint rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="bw-tint-ink text-sm font-semibold">Moja wizytówka</h4>
        {flash > 0 && <span key={flash} className="bw-flash rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-mint-ink">✓ zapamiętane na tym urządzeniu</span>}
      </div>
      <input className={`${field} mb-2`} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Imię i nazwisko" aria-label="Imię i nazwisko" autoComplete="name" />
      <input className={`${field} mb-2`} value={form.currentClub} onChange={(e) => set("currentClub", e.target.value)} placeholder="Obecny klub" aria-label="Obecny klub" />
      <input className={`${field} mb-2`} value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder="Krótko o sobie (opcjonalnie)" aria-label="Doświadczenie" />
      <input className={`${field} mb-2`} value={form.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="Link do nagrania (opcjonalnie)" aria-label="Link do nagrania" inputMode="url" />
      <input className={field} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Telefon (opcjonalnie)" aria-label="Telefon" inputMode="tel" autoComplete="tel" />
      {withPurpose && (
        <div className="mt-3 flex flex-wrap gap-2">
          {([["testy", "Testy / nabór"], ["trening", "Trening otwarty"], ["oba", "Wszystko"]] as const).map(([k, t]) => <button key={k} aria-pressed={form.purpose === k} onClick={() => set("purpose", k)} className={chip(form.purpose === k)}>{t}</button>)}
        </div>
      )}
      <p className="bw-tint-ink mt-3 text-xs opacity-80">Zapisujemy to tylko na tym telefonie i podstawiamy do kolejnych wiadomości.</p>
    </div>
  );
}

/** Animacja po oznaczeniu wiadomości jako wysłanej: samolocik i pastelowe konfetti. */
function SentBurst({ onDone }: { onDone: () => void }) {
  const confetti = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ i, a: (i / 14) * 2 * Math.PI, d: 70 + (i % 3) * 22 })), []);
  const fills = ["#cfe3fa", "#c9ecd8", "#fbd9bf", "#ddd3f7", "#f7cfe0", "#f9e6a6"];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 px-8 text-center" role="dialog" aria-label="Wysłano">
      <div className="relative flex h-40 w-40 items-center justify-center">
        {confetti.map((c) => (
          <span key={c.i} className="bw-burst absolute h-3 w-3 rounded-full" style={{ background: fills[c.i % 6], ["--dx" as string]: `${Math.cos(c.a) * c.d}px`, ["--dy" as string]: `${Math.sin(c.a) * c.d}px`, animationDelay: `${(c.i % 4) * 60}ms` }} />
        ))}
        <span className="bw-fly absolute"><Plane /></span>
      </div>
      <h3 className="bw-rise mt-4 text-2xl font-semibold tracking-tight">Zapytanie wysłane!</h3>
      <p className="bw-rise mt-2 text-sm text-muted" style={{ animationDelay: "120ms" }}>Trzymam kciuki. Zapisaliśmy na tym telefonie, że napisano do klubu – nie wyślesz przypadkiem dwa razy.</p>
      <button onClick={onDone} className="bw-grad bw-rise mt-6 rounded-2xl px-10 py-3.5 text-base font-medium" style={{ animationDelay: "240ms" }}>Super</button>
    </div>
  );
}

/** Wiadomość do klubu: wizytówka, podgląd do edycji, kopiowanie, otwarcie w poczcie. Niczego nie wysyłamy w imieniu zawodnika. */
export function Inquiry({ club, profile, facts, nowMs, onSent, onBack }: {
  club: Club; profile: Profile; facts: PlayerFacts; nowMs: number; onSent: () => void; onBack: () => void;
}) {
  const contact = bestContact(club);
  const card = useCardForm(profile.name ?? "");
  const { form } = card;
  const filled = !!(form.fullName.trim() && (form.currentClub || form.experience || form.videoUrl || form.phone));
  const [editCard, setEditCard] = useState(!filled);
  const [custom, setCustom] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [burst, setBurst] = useState(false);
  const [reported, setReported] = useState<null | "ok" | "fail">(null);
  const year = facts.birthDate ? Number(facts.birthDate.slice(0, 4)) : facts.birthYear ?? null;
  const gen = useMemo(() => buildInquiry({
    clubName: club.name, fullName: form.fullName, birthYear: year, birthDate: form.withBirthDate ? facts.birthDate ?? null : null, position: facts.position,
    city: facts.place?.name ?? null, currentClub: form.currentClub, experience: form.experience, videoUrl: form.videoUrl, phone: form.phone, minor: profile.age < 18, purpose: form.purpose,
  }), [club.name, form, year, facts, profile.age]);
  if (!contact) return <button onClick={onBack} className="text-sm text-accent">‹ Wróć</button>;
  const body = custom ?? gen.body;
  const href = mailtoUrl(contact.email, gen.subject, body);
  const done = (what: string, ok: boolean) => setNote(ok ? `${what} – gotowe.` : "Nie udało się skopiować – zaznacz tekst ręcznie.");

  return (
    <>
      <button onClick={onBack} className="mb-3 text-sm text-accent">‹ Wróć</button>
      <div className={`bw-rise bw-t${tintOf(club.id)} bw-tint flex items-center gap-3.5 rounded-3xl p-4`}>
        <Avatar club={club} size={52} />
        <div className="min-w-0 flex-1">
          <h3 className="bw-tint-ink truncate text-lg font-semibold">{club.name}</h3>
          <p className="break-all text-[15px] font-medium">{contact.email}</p>
        </div>
      </div>
      <p className="mt-2 px-1 text-xs text-muted">
        Adres znaleziony na stronie klubu: <a href={contact.evidenceUrl} target="_blank" rel="noopener noreferrer" className="underline">{host(contact.evidenceUrl)}</a>, sprawdzono {ago(contact.checkedAt, nowMs)}.
        {contact.evidenceQuote ? <> Fragment: „{contact.evidenceQuote}”</> : null}
      </p>

      <div className="mt-4">
        {editCard ? (
          <>
            <CardFields card={card} />
            {filled && <button onClick={() => setEditCard(false)} className="mt-2 text-sm text-accent">Zwiń wizytówkę</button>}
          </>
        ) : (
          <div className="bw-t3 bw-tint flex items-center gap-3 rounded-3xl px-4 py-3.5">
            <span className="bw-tint-dot flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold">{(form.fullName.trim()[0] ?? "?").toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="bw-tint-ink truncate text-[15px] font-semibold">{form.fullName}{form.currentClub ? ` · ${form.currentClub}` : ""}</div>
              <div className="bw-tint-ink text-xs opacity-80">Twoja wizytówka – zapamiętana na tym urządzeniu</div>
            </div>
            <button onClick={() => setEditCard(true)} className="rounded-xl bg-white/80 px-3 py-2 text-sm font-medium">Edytuj</button>
          </div>
        )}
        {facts.birthDate && <label className="mt-3 flex items-center gap-2 px-1 text-sm"><input type="checkbox" checked={form.withBirthDate} onChange={(e) => card.set("withBirthDate", e.target.checked)} />Dodaj pełną datę urodzenia (domyślnie tylko rocznik)</label>}
      </div>

      <h4 className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Wiadomość</h4>
      <p className="mb-2 rounded-2xl bg-canvas px-4 py-3 text-sm"><span className="text-muted">Do: </span><b className="break-all">{club.name} &lt;{contact.email}&gt;</b></p>
      <p className="mb-2 px-1 text-xs text-muted">Poniższy tekst z Twoimi danymi (imię, rocznik{form.withBirthDate ? ", pełna data urodzenia" : ""}{form.phone ? ", telefon" : ""}) trafi do klubu dopiero wtedy, gdy sam(a) wyślesz wiadomość ze swojej poczty. Sprawdź go i popraw przed wysłaniem.</p>
      <input className="mb-2 w-full rounded-2xl bg-canvas px-4 py-3 text-base" readOnly value={gen.subject} aria-label="Temat" />
      <textarea className="min-h-[260px] w-full rounded-2xl bg-canvas px-4 py-3 text-base leading-snug" value={body} onChange={(e) => setCustom(e.target.value)} aria-label="Treść wiadomości" />
      {custom !== null && <button onClick={() => setCustom(null)} className="mt-1 text-xs text-accent">Przywróć automatyczną treść</button>}

      <div className="mt-4 flex flex-col gap-2">
        {href ? <a href={href} className="bw-grad bw-wiggle flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-medium" onClick={() => setNote("Otworzyłem Twoją pocztę. Po wysłaniu oznacz zapytanie jako wysłane.")}><Envelope />Otwórz w poczcie (nic nie wysyłamy za Ciebie)</a>
          : <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-muted">Wiadomość jest zbyt długa na odnośnik – skopiuj ją i wklej w swojej poczcie.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={async () => done("Wiadomość skopiowana", await copy(`Temat: ${gen.subject}\n\n${body}`))} className="bw-t2 bw-tint bw-tint-ink rounded-2xl py-3.5 text-sm font-semibold">Skopiuj wiadomość</button>
          <button onClick={async () => done("Adres skopiowany", await copy(contact.email))} className="bw-t1 bw-tint bw-tint-ink rounded-2xl py-3.5 text-sm font-semibold">Skopiuj adres</button>
        </div>
        <button onClick={() => { markSent(club.id); onSent(); setBurst(true); }} className="bw-t4 bw-tint bw-tint-ink rounded-2xl py-3.5 text-sm font-semibold">Oznacz jako wysłane</button>
      </div>
      {note && <p className="bw-pop mt-3 text-center text-sm text-muted" role="status">{note}</p>}
      <p className="mt-4 text-xs text-muted">Wiadomość wysyłasz Ty, ze swojej poczty – aplikacja niczego nie wysyła w Twoim imieniu i nie widzi tego, co napiszesz. Odpowiedź i zapisy zależą od klubu.</p>
      {reported === null
        ? <button onClick={async () => setReported((await reportClub(club.id, "Zgłoszony błąd adresu lub prośba o usunięcie")) ? "ok" : "fail")} className="mt-3 text-xs text-muted underline">Adres nieprawidłowy lub klub prosi o usunięcie</button>
        : <p className="mt-3 text-xs text-muted">{reported === "ok" ? "Dziękujemy – sprawdzimy." : "Nie udało się wysłać zgłoszenia."}</p>}
      {burst && <SentBurst onDone={() => { setBurst(false); onBack(); }} />}
    </>
  );
}
