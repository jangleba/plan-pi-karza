import type { BirthYearRule, Eligibility, Evaluation, ListingKind, PositionRule, RadarListing, RadarSession, SignupStatus } from "./lib";
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
