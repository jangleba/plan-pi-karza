/** Ochrona przed SSRF: tylko publiczne adresy https, bez danych logowania, nietypowych portów i adresów IP z sieci wewnętrznych. */

export type UrlRejection =
  | "bad_url" | "not_https" | "credentials" | "bad_port" | "private_host" | "ip_literal" | "too_long";

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".test", ".invalid", ".example"];

function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/** Czy adres IPv4/IPv6 jest publicznie routowalny (odrzuca prywatne, pętlę zwrotną, link-local, CGNAT, dokumentacyjne, multicast). */
export function isPublicIp(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) {
    const [a, b, c] = v4 as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false; // link-local, w tym metadane chmury
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  const h = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(":")) return false;
  const mapped = /^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h) ?? /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (mapped) return isPublicIp(mapped[1]!);
  const mappedHex = /^(?:0{0,4}:){0,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1]!, 16), lo = parseInt(mappedHex[2]!, 16);
    return isPublicIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (h === "::" || h === "::1") return false;
  const first = parseInt(h.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // ULA fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && /^2001:0?db8:/.test(h)) return false; // dokumentacyjne
  if ((first & 0xe000) !== 0x2000) return false; // poza 2000::/3 nie jest globalnym unicastem
  return true;
}

export type SafeUrl = { ok: true; url: URL } | { ok: false; reason: UrlRejection };

/** Walidacja ADRESU (przed DNS). Nazwy wskazujące IP w nietypowej postaci (dziesiętnej, szesnastkowej) są odrzucane. */
export function checkUrl(raw: string): SafeUrl {
  if (typeof raw !== "string" || raw.length > 2048) return { ok: false, reason: "too_long" };
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: "bad_url" }; }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  if (url.port && url.port !== "443") return { ok: false, reason: "bad_port" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".") && !host.startsWith("[")) return { ok: false, reason: "private_host" };
  if (host.startsWith("[")) return { ok: false, reason: "ip_literal" }; // literały IPv6 nie są potrzebne
  if (/^[\d.]+$/.test(host) || /^0x[0-9a-f]+/i.test(host) || host.split(".").some((p) => /^0x[0-9a-f]*$/i.test(p))) return { ok: false, reason: "ip_literal" };
  return { ok: true, url };
}

/** Adres po przekierowaniu musi pozostać w tej samej witrynie (host lub jego wariant z/bez „www.”). */
export function sameSite(a: string, b: string): boolean {
  const n = (h: string) => h.toLowerCase().replace(/^www\./, "");
  try { return n(new URL(a).hostname) === n(new URL(b).hostname); } catch { return false; }
}
