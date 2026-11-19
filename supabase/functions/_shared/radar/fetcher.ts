import { checkUrl, isPublicIp, sameSite, type UrlRejection } from "./urlsafe.ts";

export type FetchError =
  | UrlRejection | "dns_private" | "dns_failed" | "timeout" | "too_large" | "bad_type" | "redirect_loop" | "redirect_offsite" | "http_error" | "network";

export type FetchResult =
  | { ok: true; status: number; finalUrl: string; contentType: string; body: string; bytes: number }
  | { ok: false; error: FetchError; status?: number; finalUrl?: string; detail?: string };

export interface FetchDeps {
  fetch: typeof fetch;
  /** Rozwiązywanie nazw (A/AAAA); w Deno `Deno.resolveDns`. Brak = pomijamy kontrolę DNS (tylko w testach). */
  resolve?: (host: string) => Promise<string[]>;
  userAgent: string;
}

export interface FetchOpts { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; accept?: string; types?: RegExp }

const DEFAULT_TYPES = /^(text\/(html|plain|xml)|application\/(xhtml\+xml|xml|rss\+xml|atom\+xml|json))\b/i;

/**
 * Bezpieczne pobranie dokumentu: tylko publiczny https, kontrola DNS (żadnych adresów prywatnych), ręczna obsługa
 * przekierowań (maks. 3, w obrębie tej samej witryny), limit rozmiaru i czasu, lista dozwolonych typów treści.
 * Ograniczenie: między sprawdzeniem DNS a połączeniem środowisko wykonawcze rozwiązuje nazwę ponownie (rebinding) –
 * ryzyko ograniczają: https, brak danych logowania, redirect tylko w obrębie witryny i brak przekazywania treści użytkownikowi.
 */
export async function fetchSafe(rawUrl: string, deps: FetchDeps, opts: FetchOpts = {}): Promise<FetchResult> {
  const { maxBytes = 1_500_000, timeoutMs = 10_000, maxRedirects = 3, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5", types = DEFAULT_TYPES } = opts;
  let current = rawUrl;
  const origin = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safe = checkUrl(current);
    if (!safe.ok) return { ok: false, error: safe.reason, finalUrl: current };
    if (hop > 0 && !sameSite(origin, current)) return { ok: false, error: "redirect_offsite", finalUrl: current };
    if (deps.resolve) {
      let addrs: string[];
      try { addrs = await deps.resolve(safe.url.hostname); } catch { return { ok: false, error: "dns_failed", finalUrl: current }; }
      if (!addrs.length) return { ok: false, error: "dns_failed", finalUrl: current };
      if (!addrs.every(isPublicIp)) return { ok: false, error: "dns_private", finalUrl: current };
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await deps.fetch(current, { redirect: "manual", signal: ctl.signal, headers: { "user-agent": deps.userAgent, accept, "accept-language": "pl,en;q=0.5" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "http_error", status: res.status, finalUrl: current };
        try { current = new URL(loc, current).toString(); } catch { return { ok: false, error: "bad_url", finalUrl: current }; }
        continue;
      }
      if (res.status < 200 || res.status >= 300) return { ok: false, error: "http_error", status: res.status, finalUrl: current };
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!types.test(contentType)) return { ok: false, error: "bad_type", status: res.status, finalUrl: current, detail: contentType };
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > maxBytes) { void res.body?.cancel(); return { ok: false, error: "too_large", status: res.status, finalUrl: current }; }
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      const reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) { void reader.cancel(); return { ok: false, error: "too_large", status: res.status, finalUrl: current }; }
          chunks.push(value);
        }
      }
      const all = new Uint8Array(bytes);
      let off = 0;
      for (const c of chunks) { all.set(c, off); off += c.byteLength; }
      const label = /charset\s*=\s*"?([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
      let body: string;
      try { body = new TextDecoder(label).decode(all); } catch { body = new TextDecoder("utf-8").decode(all); }
      return { ok: true, status: res.status, finalUrl: current, contentType, body, bytes };
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
      return { ok: false, error: aborted ? "timeout" : "network", finalUrl: current, detail: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: "redirect_loop", finalUrl: current };
}
