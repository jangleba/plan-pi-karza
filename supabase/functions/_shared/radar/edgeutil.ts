/** Czyste pomocnicze funkcje dla funkcji Edge (bez API Deno), żeby można je było testować. */

/** Porównanie w stałym czasie (odporne na ataki czasowe). */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Adresy IP z odpowiedzi DNS-over-HTTPS (format JSON: Answer[] z type 1 = A, 28 = AAAA). */
export function parseDohAnswers(json: unknown): string[] {
  const answers = (json as { Answer?: Array<{ type?: number; data?: string }> } | null)?.Answer;
  return (answers ?? []).filter((a) => (a.type === 1 || a.type === 28) && typeof a.data === "string").map((a) => a.data!);
}

export interface EdgeConfig {
  cronSecret: string;
  anthropicKey: string | null;
  braveKey: string | null;
  model: string;
  userAgent: string;
  runtimeMs: number;
  alertWebhook: string | null;
}

export function readConfig(env: (k: string) => string | undefined): EdgeConfig {
  const contact = env("RADAR_CONTACT_URL");
  return {
    cronSecret: env("RADAR_CRON_SECRET") ?? "",
    anthropicKey: env("ANTHROPIC_API_KEY") || null,
    braveKey: env("BRAVE_SEARCH_API_KEY") || null,
    model: env("RADAR_EXTRACT_MODEL") || "claude-haiku-5-5",
    userAgent: `BallwiseRadar/1.0${contact ? ` (+${contact})` : ""}`,
    runtimeMs: Math.min(Math.max(Number(env("RADAR_RUNTIME_MS") ?? 100_000), 10_000), 140_000),
    alertWebhook: env("RADAR_ALERT_WEBHOOK_URL") || null,
  };
}

/** Brakujące sekrety potrzebne do pracy (bez ujawniania wartości). */
export function missingSecrets(c: EdgeConfig): string[] {
  const m: string[] = [];
  if (!c.cronSecret) m.push("RADAR_CRON_SECRET");
  return m;
}
