import { decodeEntities, extractLinks, extractTitle, htmlToText } from "./html.ts";
import { sameSite } from "./urlsafe.ts";

/**
 * Research kontaktów do klubów. Tylko adresy ORGANIZACYJNE znalezione dosłownie na stronie klubu (z cytatem i adresem strony).
 * Nic nie jest zgadywane ani konstruowane (np. z wzorca imie.nazwisko@domena). Adresy wyglądające na osobiste są pomijane.
 */

const GENERIC = /^(biuro|kontakt|info|sekretariat|nabor|rekrutacja|rekrutacje|akademia|klub|zarzad|administracja|office|contact|mail|zapisy|szkolka|szkolenie|sekcja|pilka|futbol|football|mlodziez|juniorzy|dyrektor)([._-][a-z0-9._-]+)?$/;
const NOT_CONTACT = /^(noreply|no-reply|donotreply|postmaster|abuse|webmaster|admin|root|hostmaster|privacy|rodo|iod|inspektor|newsletter|marketing|reklama|sprzedaz|sklep|faktury|ksiegowosc|hr|praca|kariera)(\b|[._-]|$)/;
const VOCAB = new Set(["biuro", "kontakt", "info", "sekretariat", "nabor", "rekrutacja", "akademia", "klub", "zarzad", "pilka", "football", "futbol", "szkolka", "mlodziez", "juniorzy", "trampkarze", "orlik", "zaki", "mlodzik", "szkolenie", "zapisy", "sekcja", "administracja", "office", "contact", "mail"]);

const fold = (s: string) => s.toLowerCase().replace(/ł/g, "l").normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Czy adres wygląda na organizacyjny (biuro@, nabor@, ksorly@), a nie osobisty (imie.nazwisko@). */
export function isOrganizationalEmail(email: string): boolean {
  const m = /^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/i.exec(email.trim());
  if (!m) return false;
  const local = fold(m[1]!.split("+")[0]!);
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(m[2]!) || /^[0-9a-f]{16,}$/.test(local)) return false;
  if (NOT_CONTACT.test(local)) return false;
  if (GENERIC.test(local)) return true;
  const tokens = local.split(/[._-]+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.slice(0, 2).every((t) => /^[a-z]{3,}$/.test(t) && !VOCAB.has(t))) return false; // imie.nazwisko
  return true;
}

const EMAIL = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/gi;

/** Rozszyfrowuje popularne zapisy „kontakt [at] klub.pl”. */
const deobfuscate = (t: string) => t.replace(/\s*[\[(]\s*(at|@|małpa|malpa)\s*[\])]\s*/gi, "@").replace(/\s+(małpa|malpa)\s+/gi, "@");

/** Fragment tekstu wokół adresu (±70 znaków, w obrębie wiersza) – dowód, że adres jest na stronie. */
export function contextQuote(text: string, email: string): string | null {
  const idx = text.toLowerCase().indexOf(email.toLowerCase());
  if (idx < 0) return null;
  const lineStart = text.lastIndexOf("\n", idx) + 1;
  const lineEnd = (() => { const n = text.indexOf("\n", idx); return n < 0 ? text.length : n; })();
  const from = Math.max(lineStart, idx - 70), to = Math.min(lineEnd, idx + email.length + 70);
  return text.slice(from, to).replace(/\s+/g, " ").trim();
}

export interface FoundEmail { email: string; quote: string; viaMailto: boolean; organizational: boolean; recruitment: boolean }

/** Adresy ze strony: z widocznego tekstu i z odnośników mailto:. Tylko jedno wystąpienie na adres. */
export function extractEmails(html: string): FoundEmail[] {
  const text = deobfuscate(htmlToText(html));
  const found = new Map<string, FoundEmail>();
  for (const m of text.matchAll(EMAIL)) {
    const email = m[0].toLowerCase().replace(/[.,;:)]+$/, "");
    if (found.has(email)) continue;
    const quote = contextQuote(text, email);
    if (quote) found.set(email, { email, quote, viaMailto: false, organizational: isOrganizationalEmail(email), recruitment: /nab[oó]r|rekrutac|testy|zapis/i.test(quote) || /^(nabor|rekrutacja|zapisy)/.test(email) });
  }
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) {
    const email = decodeEntities(decodeURIComponent(m[1]!)).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) || found.has(email)) continue;
    found.set(email, { email, quote: "adres w odnośniku e-mail na stronie kontaktowej", viaMailto: true, organizational: isOrganizationalEmail(email), recruitment: /^(nabor|rekrutacja|zapisy)/.test(email) });
  }
  return [...found.values()];
}

/** Strona z wieloma adresami to najpewniej katalog/portal, a nie strona jednego klubu. */
export const looksLikeDirectory = (emails: FoundEmail[]): boolean => new Set(emails.map((e) => e.email)).size >= 6;

const CONTACT_HINT = /(kontakt|contact|o-nas|o-klubie|klub|nabor|nab[oó]r|rekrutac|akademia|szkolka|szkółka|zapisy)/i;
const NOT_PAGE = /\.(pdf|jpe?g|png|gif|webp|zip|docx?|xlsx?|mp4)(\?|$)|\/(login|logowanie|koszyk|sklep|wp-json|feed|tag|kategoria|author)(\/|$|\?)/i;
const RECRUIT_HINT = /(nab[oó]r|rekrutac|testy|trening(i)? otwart|zapisy|dolacz|dołącz)/i;

/** Podstrony kontaktowe/o klubie z tej samej witryny (maks. 3, „kontakt” najpierw). */
export function findContactLinks(html: string, base: string): string[] {
  const links = extractLinks(html, base).filter((l) => sameSite(base, l.url) && !NOT_PAGE.test(l.url) && (CONTACT_HINT.test(new URL(l.url).pathname) || CONTACT_HINT.test(l.text)));
  const rank = (u: string, t: string) => (/kontakt|contact/i.test(u + t) ? 0 : /nab|rekrut/i.test(u + t) ? 1 : 2);
  return [...new Set(links.sort((a, b) => rank(a.url, a.text) - rank(b.url, b.text)).map((l) => l.url))].slice(0, 3);
}

/** Odnośnik do podstrony klubu o naborze/testach – zapamiętujemy sam link, bez treści. */
export function findRecruitmentLink(html: string, base: string): string | null {
  const l = extractLinks(html, base).find((x) => sameSite(base, x.url) && !NOT_PAGE.test(x.url) && (RECRUIT_HINT.test(x.text) || RECRUIT_HINT.test(new URL(x.url).pathname)));
  return l?.url ?? null;
}

/** Nazwa klubu: og:site_name albo pierwszy człon tytułu strony. */
export function clubName(html: string, domain: string): string {
  const og = /<meta[^>]+property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:site_name["']/i.exec(html);
  const raw = og ? decodeEntities(og[1]!) : extractTitle(html).split(/\s+[|–—-]\s+/)[0] ?? "";
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 120);
  return name.length >= 3 ? name : domain;
}

const words = (s: string) => ` ${fold(s).replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Czy miejscowość występuje w tekście strony jako osobne słowo (potwierdza, że klub faktycznie jest stamtąd). */
export const cityInText = (text: string, city: string): boolean => words(text).includes(words(city));

export const SKIP_DOMAINS = /(^|\.)(facebook|fb|instagram|twitter|x|tiktok|linkedin|youtube|youtu|pinterest|wikipedia|google|olx|allegro|gumtree|onet|wp|interia|pzpn|laczynaspilka|sportowefakty|pilkanozna|90minut|transfermarkt|flashscore|livesport|tuttur)\.(com|be|pl|org|net|eu)$/i;
export const clubDomainSkipped = (domain: string): boolean => SKIP_DOMAINS.test(domain);
