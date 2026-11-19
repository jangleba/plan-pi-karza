import type { Audience, BirthYearRule, Eligibility, Evaluation, ListingKind, PositionRule, RadarListing, RadarSession, ReasonCode, SignupStatus } from "./lib";
import { LISTING_KINDS } from "./lib";
import { POSITION_LABEL } from "../engine/profile";

export const kindLabel = (k: ListingKind) => LISTING_KINDS.find(([x]) => x === k)![1];

const DAYS = ["nd.", "pn.", "wt.", "śr.", "cz.", "pt.", "sob."];
const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

/** „pn., 24 lis” z daty ISO (dzień tygodnia liczony kalendarzowo, bez stref). */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const sessionLabel = (s: Pick<RadarSession, "date" | "startTime">) => `${dayLabel(s.date)}${s.startTime ? `, ${s.startTime}` : ""}`;

function yearRule(r: BirthYearRule): string {
  switch (r.op) {
    case "in": return r.years.length > 1 && r.years.every((y, i) => i === 0 || y === r.years[i - 1]! + 1) ? `${r.years[0]}–${r.years[r.years.length - 1]}` : r.years.join(", ");
    case "range": return r.from === r.to ? String(r.from) : `${r.from}–${r.to}`;
    case "gte": return `${r.year} i młodsi`;
    case "lte": return `${r.year} i starsi`;
  }
}

/** Zasady wieku po polsku (tak, jak je rozumie dopasowanie). */
export function eligibilityText(e: Eligibility | null | undefined): string {
  if (!e) return "wiek nieznany";
  const parts: string[] = [];
  if (e.birthYears?.length) {
    const text = e.birthYears.map(yearRule).join("; ");
    parts.push(`${/[–;,]|i (młodsi|starsi)/.test(text) ? "roczniki" : "rocznik"} ${text}`);
  }
  const sym = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=" } as const;
  for (const a of e.ageLimits ?? []) {
    const when = a.ref.type === "date" ? ` na ${dayLabel(a.ref.date)}` : a.ref.type === "session_start" ? " w dniu sesji" : "";
    parts.push(`wiek ${sym[a.op]} ${a.age}${when}`);
  }
  if (!parts.length && e.categoryLabel) parts.push(`kategoria ${e.categoryLabel}`);
  return parts.join(", ") || "wiek nieznany";
}

export function positionText(p: PositionRule): string | null {
  if (p.scope === "only") return `tylko: ${p.positions.map((x) => POSITION_LABEL[x].toLowerCase()).join(", ")}`;
  return null;
}

export function costText(l: Pick<RadarListing, "costState" | "costPln">): string {
  if (l.costState === "free") return "bezpłatne";
  if (l.costState === "paid") return l.costPln ? `${String(l.costPln).replace(".", ",")} zł` : "płatne";
  return "koszt nieznany";
}

export const signupStatusText = (s: SignupStatus): string =>
  ({ open: "zapisy otwarte", closed: "zapisy zamknięte", cancelled: "odwołane", full: "brak miejsc", unknown: "zapisy: brak potwierdzenia" })[s];

export function ago(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "brak daty";
  const m = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000));
  if (m < 60) return `${Math.max(1, m)} min temu`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} godz. temu` : `${Math.round(h / 24)} dni temu`;
}

/** Wiersz „termin” dla karty: najbliższa pasująca sesja i liczba kolejnych. */
export function nextSessionText(e: Evaluation): { when: string; elig: string; more: number } {
  const first = e.matching[0];
  if (first) return { when: sessionLabel(first.session), elig: eligibilityText(first.session.eligibility ?? e.listing.eligibility), more: e.matching.length - 1 };
  return { when: "nabór ciągły", elig: eligibilityText(e.listing.eligibility), more: 0 };
}

export const distanceText = (km: number | null) => (km === null ? null : km <= 2 ? "w Twojej miejscowości" : `ok. ${km} km`);

export const audienceText = (a: Audience | undefined): string | null =>
  a === "male" ? "kategoria: chłopcy/mężczyźni" : a === "female" ? "kategoria: dziewczęta/kobiety" : a === "mixed" ? "kategoria: otwarta dla obu" : null;

/** Dodatkowe informacje z ogłoszenia, których nie wolno pominąć przy ocenie szans (wyjątek za zgodą, dokumenty, kategoria). */
export function eligibilityNotes(e: Eligibility | null | undefined): string[] {
  if (!e) return [];
  const notes: string[] = [];
  const aud = audienceText(e.audience);
  if (aud) notes.push(aud);
  if (e.consentException) notes.push(`wyjątek za zgodą organizatora: „${e.consentException}”${e.consentScope === "outside_base" ? " (dotyczy osób spoza podanych kryteriów)" : " – sprawdź u organizatora, czy dotyczy także Ciebie"}`);
  if (e.requiredDocuments?.length) notes.push(`przy zapisie: ${e.requiredDocuments.join(", ")}`);
  return notes;
}

/** Dlaczego oferta nie jest pokazana jako „pasuje”, a wymaga Twojego ruchu (nie braku danych profilu). */
export const REASON_TEXT: Partial<Record<ReasonCode, string>> = {
  consent_exception: "Wiek się zgadza, ale organizator opisuje zgodę/akceptację jako warunek udziału. Sprawdź u organizatora, czy dotyczy także Ciebie.",
  audience_missing: "Ogłoszenie nie podaje kategorii (chłopcy/dziewczęta) albo nie wybrano jej w kryteriach. Sprawdź u organizatora.",
};

/** Daty aktualności: aktualizacja STRONY to co innego niż potwierdzenie ogłoszenia przez organizatora. */
export function freshnessLines(l: Pick<RadarListing, "pageUpdatedAt" | "organizerConfirmedAt" | "organizerConfirmation">, nowMs: number): string[] {
  const out: string[] = [];
  if (l.pageUpdatedAt) out.push(`strona zaktualizowana: ${ago(l.pageUpdatedAt, nowMs)} (data ze strony, to nie potwierdzenie organizatora)`);
  if (l.organizerConfirmedAt) {
    const how = l.organizerConfirmation?.method === "admin_contact" ? "kontakt z organizatorem zapisany przez nas" : "oświadczenie organizatora na stronie";
    out.push(`potwierdzone przez organizatora: ${ago(l.organizerConfirmedAt, nowMs)} (${how})`);
  }
  return out;
}
