/**
 * Logika powiadomień (bez zależności od Deno – testowana w Node): z nowej wiadomości trenera powstaje treść
 * powiadomienia, wybór subskrypcji zawodnika i sprzątanie nieaktualnych adresów (404/410 od usługi push).
 */
export interface MessageRecord { id: string; player_id: string; coach_id: string; kind: "message" | "plan_change"; body: string }
export interface Subscription { endpoint: string; p256dh: string; auth: string; topics: string[] }
export interface Payload { title: string; body: string; open: "message" | "plan" | "today"; id?: string; tag: string }

export function payloadFor(m: MessageRecord): Payload {
  const text = m.body.replace(/\s+/g, " ").trim();
  return {
    title: m.kind === "plan_change" ? "Zmiana planu od trenera" : "Wiadomość od trenera",
    body: text.length > 140 ? `${text.slice(0, 137)}…` : text,
    open: "message",
    id: m.id,
    tag: m.kind === "plan_change" ? "plan" : "coach",
  };
}

export const topicOf = (m: MessageRecord): string => (m.kind === "plan_change" ? "plan_change" : "message");

export interface SendDeps {
  subscriptions: (userId: string) => Promise<Subscription[]>;
  send: (s: Subscription, payload: string) => Promise<{ status: number }>;
  remove: (endpoint: string) => Promise<void>;
}

/** Wysyła do wszystkich urządzeń zawodnika, które subskrybują dany temat; martwe subskrypcje usuwa. */
export async function notifyPlayer(m: MessageRecord, deps: SendDeps): Promise<{ sent: number; removed: number; failed: number }> {
  const topic = topicOf(m);
  const subs = (await deps.subscriptions(m.player_id)).filter((s) => s.topics.includes(topic));
  const body = JSON.stringify(payloadFor(m));
  let sent = 0, removed = 0, failed = 0;
  for (const s of subs) {
    try {
      const r = await deps.send(s, body);
      if (r.status === 404 || r.status === 410) { await deps.remove(s.endpoint); removed++; }
      else if (r.status >= 200 && r.status < 300) sent++;
      else failed++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) { await deps.remove(s.endpoint); removed++; } else failed++;
    }
  }
  return { sent, removed, failed };
}

/** Webhook bazy danych (Database Webhooks): przyjmujemy tylko INSERT do coach_messages z poprawnym kształtem. */
export function parseWebhook(body: unknown): MessageRecord | null {
  const b = body as { type?: string; table?: string; record?: Partial<MessageRecord> } | null;
  if (!b || b.type !== "INSERT" || b.table !== "coach_messages" || !b.record) return null;
  const r = b.record;
  if (typeof r.id !== "string" || typeof r.player_id !== "string" || typeof r.coach_id !== "string" || typeof r.body !== "string") return null;
  return { id: r.id, player_id: r.player_id, coach_id: r.coach_id, body: r.body, kind: r.kind === "plan_change" ? "plan_change" : "message" };
}

/** Porównanie sekretu w stałym czasie (nagłówek od webhooka). */
export function sameSecret(a: string | null, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
