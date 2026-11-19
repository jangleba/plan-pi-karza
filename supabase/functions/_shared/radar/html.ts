/** Lekkie parsery bez zależności (działają w Deno i przeglądarce): HTML → tekst, linki, RSS/Atom, mapy witryn, paginacja, ekrany blokad. */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", oacute: "ó" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]!.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

/** Widoczny tekst strony; skrypty, style i komentarze usuwane, bloki rozdzielane nowymi liniami. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/table|\/ul|\/ol)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface Link { url: string; text: string }

/** Linki https z tego samego dokumentu; względne rozwiązywane względem `base`. */
export function extractLinks(html: string, base: string): Link[] {
  const out = new Map<string, Link>();
  const re = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const href = decodeEntities((m[1] ?? m[2] ?? "").trim());
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      u.hash = "";
      if (u.protocol !== "https:") continue;
      const text = decodeEntities(m[3]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200);
      if (!out.has(u.toString())) out.set(u.toString(), { url: u.toString(), text });
    } catch { /* zły adres – pomijamy */ }
  }
  return [...out.values()];
}

export interface FeedItem { url: string; title: string; date: string | null }

const tag = (block: string, name: string): string | null => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeEntities(m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim() : null;
};

const isoOrNull = (s: string | null): string | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** RSS 2.0 i Atom. */
export function parseFeed(xml: string, base: string): FeedItem[] {
  const out: FeedItem[] = [];
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  for (const b of blocks) {
    const atomHref = /<link\b[^>]*?href\s*=\s*"([^"]+)"/i.exec(b)?.[1];
    const link = tag(b, "link") || atomHref || tag(b, "guid");
    if (!link) continue;
    try {
      const u = new URL(decodeEntities(link), base);
      if (u.protocol !== "https:") continue;
      out.push({ url: u.toString(), title: tag(b, "title") ?? "", date: isoOrNull(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated")) });
    } catch { /* pomijamy */ }
  }
  return out;
}

export interface SitemapResult { kind: "index" | "urlset"; urls: Array<{ url: string; lastmod: string | null }> }

export function parseSitemap(xml: string): SitemapResult {
  const kind = /<sitemapindex\b/i.test(xml) ? "index" : "urlset";
  const blockRe = kind === "index" ? /<sitemap\b[\s\S]*?<\/sitemap>/gi : /<url\b[\s\S]*?<\/url>/gi;
  const urls: SitemapResult["urls"] = [];
  for (const m of xml.matchAll(blockRe)) {
    const loc = tag(m[0], "loc");
    if (loc && /^https:\/\//i.test(loc)) urls.push({ url: loc, lastmod: isoOrNull(tag(m[0], "lastmod")) });
  }
  return { kind, urls };
}

/** Następna strona listy ogłoszeń (rel=next albo link „Następna/Starsze/Next/»”). */
export function findNextPage(html: string, base: string): string | null {
  const rel = /<(?:link|a)\b[^>]*\brel\s*=\s*["'][^"']*\bnext\b[^"']*["'][^>]*>/i.exec(html);
  const href = rel ? /href\s*=\s*["']([^"']+)["']/i.exec(rel[0])?.[1] : null;
  const pick = href ?? extractLinks(html, base).find((l) => /^(następn|starsze|dalej|next|»|›)/i.test(l.text))?.url;
  if (!pick) return null;
  try {
    const u = new URL(decodeEntities(pick), base);
    return u.protocol === "https:" && u.toString() !== new URL(base).toString() ? u.toString() : null;
  } catch { return null; }
}

export type PageClass = "ok" | "captcha" | "login_wall" | "empty";

/**
 * Czy odpowiedź jest prawdziwą treścią. HTTP 200 nie wystarcza: ekran logowania, CAPTCHA, strona „Just a moment”
 * lub prawie pusta strona NIE potwierdzają treści (i nie odnawiają znacznika aktualności).
 */
export function classifyPage(html: string): PageClass {
  const text = htmlToText(html);
  const challenge = /g-recaptcha|h-captcha|hcaptcha|cf-turnstile|cf-challenge|captcha-container|px-captcha|Just a moment|Checking your browser|Sprawdzamy, czy jesteś człowiekiem|Verify you are human/i.test(html);
  if (challenge && text.length < 4000) return "captcha";
  const hasPassword = /<input\b[^>]*type\s*=\s*["']?password/i.test(html);
  if (hasPassword && text.length < 1200 && /zaloguj|logowanie|log in|sign in|login/i.test(text)) return "login_wall";
  if (text.length < 200) return "empty";
  return "ok";
}
