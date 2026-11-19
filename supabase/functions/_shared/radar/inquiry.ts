import type { Position } from "./types.ts";

/**
 * Wiadomość do klubu z zapytaniem o testy/treningi. Układana lokalnie na urządzeniu zawodnika i wysyłana PRZEZ NIEGO
 * z jego poczty – aplikacja nic nie wysyła w jego imieniu. Bez form zależnych od płci.
 */
const POS: Record<Position, string> = { bramkarz: "bramkarza", obronca: "obrońcy", pomocnik: "pomocnika", skrzydlowy: "skrzydłowego", napastnik: "napastnika" };

export interface InquiryInput {
  clubName: string;
  /** Imię i nazwisko podpisu. */
  fullName: string;
  birthYear?: number | null;
  /** Pełna data urodzenia – tylko gdy zawodnik zaznaczy, że chce ją podać. */
  birthDate?: string | null;
  position?: Position | null;
  city?: string | null;
  currentClub?: string;
  experience?: string;
  videoUrl?: string;
  phone?: string;
  /** Niepełnoletni: dopisujemy zdanie o opiekunie. */
  minor: boolean;
  purpose: "testy" | "trening" | "oba";
}

const clean = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function buildInquiry(i: InquiryInput): { subject: string; body: string } {
  const club = clean(i.clubName, 120) || "Państwa klub";
  const what = i.purpose === "testy" ? "testy lub nabór" : i.purpose === "trening" ? "trening otwarty lub próbny" : "nabór, testy albo trening otwarty/próbny";
  const lines: string[] = ["Dzień dobry,", ""];
  const me: string[] = [];
  const name = clean(i.fullName, 80);
  me.push(name ? `Mam na imię ${name}` : "Piszę jako zawodnik");
  const bits: string[] = [];
  if (i.position) bits.push(`gram na pozycji ${POS[i.position]}`);
  const born = i.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(i.birthDate) ? `data urodzenia: ${i.birthDate.slice(8, 10)}.${i.birthDate.slice(5, 7)}.${i.birthDate.slice(0, 4)}` : i.birthYear ? `rocznik ${i.birthYear}` : "";
  if (born) bits.push(born);
  if (clean(i.city, 60)) bits.push(`mieszkam w miejscowości ${clean(i.city, 60)}`);
  if (clean(i.currentClub, 80)) bits.push(`obecnie gram w klubie ${clean(i.currentClub, 80)}`);
  lines.push(`${me.join("")}${bits.length ? `: ${bits.join(", ")}` : ""}.`);
  lines.push("");
  lines.push(`Piszę z pytaniem, czy ${club} prowadzi obecnie albo planuje wkrótce ${what} dla zawodników z mojego rocznika i czy mogę wziąć w tym udział.`);
  lines.push("Proszę o informację o terminach, wymaganym roczniku lub wieku, miejscu, kosztach oraz o tym, co należy zabrać.");
  if (clean(i.experience, 300)) lines.push("", `O sobie: ${clean(i.experience, 300)}`);
  if (/^https?:\/\//i.test(clean(i.videoUrl, 300))) lines.push("", `Nagranie z moją grą: ${clean(i.videoUrl, 300)}`);
  if (i.minor) lines.push("", "Jestem niepełnoletni/niepełnoletnia – w razie potrzeby przekażę dane i zgodę rodzica lub opiekuna.");
  lines.push("", "Dziękuję za odpowiedź i pozdrawiam");
  if (name) lines.push(name);
  if (clean(i.phone, 30)) lines.push(`tel. ${clean(i.phone, 30)}`);
  return { subject: `Zapytanie o ${i.purpose === "trening" ? "trening otwarty" : "testy i nabór"} – ${clean(i.birthYear ? `rocznik ${i.birthYear}` : "zawodnik", 40)}`, body: lines.join("\n") };
}

/** Odnośnik mailto: (otwiera pocztę zawodnika). Adres i treść są kodowane; zbyt długi odnośnik nie jest zwracany. */
export function mailtoUrl(to: string, subject: string, body: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)) return null;
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return url.length <= 1900 ? url : null;
}
