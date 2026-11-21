/**
 * Zaproszenie partnera na trening jako zwykły link (bez serwera, bez katalogu osób): cała treść zaproszenia jest w adresie
 * (ćwiczenie, termin, rodzaj miejsca, opcjonalnie nazwa miejsca, imię i krótka notatka). Nic nie jest wysyłane do nas ani zapisywane
 * na serwerze; link użytkownik wysyła sam, wybranym kanałem. Odczyt jest ostrożny: dane z linku są niezaufane (obcy może podać
 * dowolny adres), więc każde pole jest sprawdzane, skracane i oczyszczane, a ćwiczenie musi istnieć w bibliotece.
 */
export type PlaceKind = "public" | "orlik" | "club" | "hall" | "other";
export const PLACES: Array<[PlaceKind, string]> = [["public", "Boisko ogólnodostępne"], ["orlik", "Orlik"], ["club", "Boisko klubowe"], ["hall", "Hala"], ["other", "Inne miejsce"]];

export interface Invite {
  v: 1;
  /** Id ćwiczenia z biblioteki. */
  drill: string;
  /** Termin: lokalnie, „RRRR-MM-DDTGG:MM”. */
  at: string;
  place: PlaceKind;
  /** Nazwa miejsca (np. „Orlik przy ul. Szkolnej”), do 60 znaków. */
  where?: string;
  /** Imię zapraszającego (tylko, gdy zdecydował), do 30 znaków. */
  from?: string;
  /** Krótka notatka, do 80 znaków. */
  note?: string;
}

export const LIMITS = { where: 60, from: 30, note: 80, url: 1800 } as const;

/** Tekst bez znaków sterujących i dziwnych odstępów, przycięty do limitu; pusty → undefined. */
export function clean(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return t || undefined;
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string): string => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export const encodeInvite = (i: Invite): string => b64(JSON.stringify(i));

/** Poprawne zaproszenie z parametru linku albo null. `knownDrills` – id ćwiczeń z biblioteki. */
export function decodeInvite(param: string | null | undefined, knownDrills: readonly string[], now: Date = new Date()): Invite | null {
  if (!param || param.length > LIMITS.url) return null;
  let raw: unknown;
  try { raw = JSON.parse(unb64(param)); } catch { return null; }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.drill !== "string" || !knownDrills.includes(r.drill)) return null;
  if (typeof r.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.at)) return null;
  const when = new Date(r.at);
  if (Number.isNaN(when.getTime()) || r.at !== toLocalInput(when)) return null; // np. 31 lutego
  const diff = when.getTime() - now.getTime();
  if (diff < -366 * 86_400_000 || diff > 366 * 86_400_000) return null;
  const place = PLACES.some(([k]) => k === r.place) ? (r.place as PlaceKind) : "other";
  const out: Invite = { v: 1, drill: r.drill, at: r.at, place };
  const where = clean(r.where, LIMITS.where), from = clean(r.from, LIMITS.from), note = clean(r.note, LIMITS.note);
  if (where) out.where = where;
  if (from) out.from = from;
  if (note) out.note = note;
  return out;
}

/** „RRRR-MM-DDTGG:MM” w czasie lokalnym. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const inviteUrl = (base: string, i: Invite): string => `${base}${base.includes("?") ? "&" : "?"}invite=${encodeInvite(i)}`;

const DAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
/** „sobota, 22 listopada, 17:00”. */
export function whenLabel(at: string): string {
  const d = new Date(at);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}, ${at.slice(11, 16)}`;
}

export const placeLabel = (i: Pick<Invite, "place" | "where">): string => {
  const kind = PLACES.find(([k]) => k === i.place)![1];
  return i.where ? `${kind}: ${i.where}` : kind;
};

/** Wiadomość do wysłania razem z linkiem (bez formy zależnej od płci). */
export function inviteText(i: Invite, drillTitle: string, url: string): string {
  const who = i.from ? `Tu ${i.from}. ` : "";
  return `${who}Zapraszam Cię na trening z piłką: „${drillTitle}”.\n${whenLabel(i.at)}\n${placeLabel(i)}${i.note ? `\n${i.note}` : ""}\nUkład ćwiczenia: ${url}`;
}

export type Answer = "yes" | "no";
export function replyText(a: Answer, i: Invite, drillTitle: string): string {
  return a === "yes"
    ? `Chętnie, będę. „${drillTitle}”, ${whenLabel(i.at)}, ${placeLabel(i)}.`
    : `Dziękuję za zaproszenie, tym razem nie dam rady. „${drillTitle}”, ${whenLabel(i.at)}.`;
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsStamp = (at: string) => at.replace(/[-:]/g, "") + "00";

/** Plik kalendarza (.ics): 1 godzina, czas lokalny („pływający”), bez strefy. */
export function buildIcs(i: Invite, drillTitle: string, now: Date = new Date()): string {
  const end = toLocalInput(new Date(new Date(i.at).getTime() + 3_600_000));
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ballwise//Trening//PL", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${i.drill}-${i.at.replace(/\D/g, "")}@ballwise`, `DTSTAMP:${stamp}`,
    `DTSTART:${icsStamp(i.at)}`, `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(`Trening z piłką: ${drillTitle}`)}`, `LOCATION:${icsEscape(placeLabel(i))}`,
    ...(i.note ? [`DESCRIPTION:${icsEscape(i.note)}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}
