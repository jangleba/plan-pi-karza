// @ts-nocheck – plik uruchamiany w Deno (Supabase Edge Functions); aplikacja (Vite) go nie importuje.
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { checkUrl } from "./urlsafe.ts";
import { parseDohAnswers, readConfig, timingSafeEqual, missingSecrets } from "./edgeutil.ts";
import { runDiscover, runRefresh } from "./jobs.ts";

/** Rozwiązywanie nazw: Deno.resolveDns, a gdy niedostępne – DNS-over-HTTPS (Cloudflare). */
async function resolveHost(host: string): Promise<string[]> {
  try {
    const out: string[] = [];
    for (const type of ["A", "AAAA"] as const) {
      try { out.push(...(await Deno.resolveDns(host, type))); } catch { /* brak rekordu tego typu */ }
    }
    if (out.length) return out;
  } catch { /* przejdź do DoH */ }
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, { headers: { accept: "application/dns-json" } });
  return parseDohAnswers(await res.json());
}

/** Czy domena przyjmuje pocztę: rekord MX (typ 15) przez DNS-over-HTTPS. */
async function resolveMx(domain: string): Promise<boolean> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, { headers: { accept: "application/dns-json" } });
  const json = await res.json();
  return (json?.Answer ?? []).some((a: { type?: number }) => a.type === 15);
}

export function handler(job: "discover" | "refresh") {
  return async (req: Request): Promise<Response> => {
    const cfg = readConfig((k) => Deno.env.get(k));
    const provided = req.headers.get("x-radar-secret") ?? "";
    // Uwierzytelnienie wywołań z pg_cron: własny sekret (zapisany w Vault i w sekretach funkcji); bez niego – 403.
    if (!cfg.cronSecret || !timingSafeEqual(provided, cfg.cronSecret)) return new Response("forbidden", { status: 403 });
    const missing = missingSecrets(cfg);
    if (missing.length) return Response.json({ error: "brak sekretów", missing }, { status: 500 });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const rpc = async (fn: string, args?: Record<string, unknown>) => {
      const { data, error } = await sb.rpc(fn, args ?? {});
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data;
    };
    const alert = async (message: string) => {
      if (!cfg.alertWebhook || !checkUrl(cfg.alertWebhook).ok) return;
      try { await fetch(cfg.alertWebhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: message.slice(0, 500) }) }); } catch { /* alert nie może przerwać zadania */ }
    };
    const deps = {
      rpc,
      fetchDeps: { fetch, resolve: resolveHost, userAgent: cfg.userAgent },
      extractor: cfg.anthropicKey ? { fetch, apiKey: cfg.anthropicKey, model: cfg.model } : null,
      brave: cfg.braveKey ? { fetch, apiKey: cfg.braveKey } : null,
      nowMs: () => Date.now(),
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
      alert,
      resolveMx,
      deadlineMs: Date.now() + cfg.runtimeMs,
    };
    const result = job === "discover" ? await runDiscover(deps) : await runRefresh(deps);
    return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
  };
}
