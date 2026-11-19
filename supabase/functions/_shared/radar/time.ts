/** Strefa lokalna ogłoszeń: Europe/Warsaw (czas letni/zimowy liczony przez Intl). */
const TZ = "Europe/Warsaw";
const DAY_MS = 86_400_000;

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Przesunięcie Warszawy względem UTC (minuty) w danym momencie. */
export function warsawOffsetMinutes(utcMs: number): number {
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(new Date(utcMs))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export const addDaysISO = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Moment (UTC ms) lokalnej godziny `hh:mm` w dniu `iso` w Warszawie. */
export function warsawInstant(iso: string, hh = 0, mm = 0): number {
  const guess = Date.parse(`${iso}T00:00:00Z`) + (hh * 60 + mm) * 60_000;
  let utc = guess - warsawOffsetMinutes(guess) * 60_000;
  utc = guess - warsawOffsetMinutes(utc) * 60_000; // doprecyzowanie na granicy zmiany czasu
  return utc;
}

/** Początek dnia lokalnego (UTC ms). */
export const warsawStartOfDay = (iso: string): number => warsawInstant(iso, 0, 0);

/** Wykluczający koniec dnia lokalnego = początek następnego dnia. Termin podany tylko datą obejmuje cały ten dzień. */
export const warsawDayEndExclusive = (iso: string): number => warsawStartOfDay(addDaysISO(iso, 1));

/** Data lokalna (Warszawa) dla momentu. */
export function warsawDateOf(utcMs: number): string {
  const off = warsawOffsetMinutes(utcMs);
  return new Date(utcMs + off * 60_000).toISOString().slice(0, 10);
}
