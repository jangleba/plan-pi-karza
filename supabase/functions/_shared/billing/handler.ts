export type BillingStatus = "trialing" | "active" | "grace" | "expired" | "no_subscription";
export interface VerifiedEntitlement {
  userId: string;
  status: BillingStatus;
  expiresAt: string | null;
  verifiedAt: string;
  productId: string | null;
  store: string | null;
}
type Row = Record<string, unknown>;
const record = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const date = (v: unknown): number => (typeof v === "string" ? Date.parse(v) : NaN);
export function revenueCatEntitlement(
  userId: string,
  data: unknown,
  entitlementId: string,
  products: ReadonlySet<string>,
): VerifiedEntitlement {
  const root = record(data),
    subscriber = record(root.subscriber),
    ent = record(record(subscriber.entitlements)[entitlementId]);
  const verified = date(root.request_date);
  if (!Number.isFinite(verified)) throw new Error("provider_invalid_date");
  const product = typeof ent.product_identifier === "string" ? ent.product_identifier : null;
  const sub = record(record(subscriber.subscriptions)[product ?? ""]);
  const expiry = date(ent.expires_date),
    grace = date(sub.grace_period_expires_date);
  let status: BillingStatus = "no_subscription",
    end: number = NaN;
  if (product && products.has(product)) {
    if (Number.isFinite(date(sub.refunded_at))) status = "expired";
    else if (expiry > verified) {
      status = sub.period_type === "trial" ? "trialing" : "active";
      end = expiry;
    } else if (grace > verified) {
      status = "grace";
      end = grace;
    } else status = "expired";
  }
  return {
    userId,
    status,
    expiresAt: Number.isFinite(end) ? new Date(end).toISOString() : null,
    verifiedAt: new Date(verified).toISOString(),
    productId: product,
    store: typeof sub.store === "string" ? sub.store : null,
  };
}
export interface BillingDependencies {
  authenticate(request: Request): Promise<string | null>;
  lookup(userId: string, signal: AbortSignal): Promise<VerifiedEntitlement>;
  commit(value: VerifiedEntitlement, eventId: string | null): Promise<void>;
  enabled: boolean;
  webhookSecret: string;
  allowedOrigins: ReadonlySet<string>;
}
// A delayed store webhook must not recreate a deleted account or retry forever.
// Only these two known owner FKs are safe to acknowledge as deleted owners.
export function deletedBillingOwner(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23503" &&
    /\b(?:billing_entitlements|billing_events)_user_id_fkey\b/.test(error.message ?? "")
  );
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
function secretEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
async function body(request: Request): Promise<unknown> {
  if (Number(request.headers.get("Content-Length") ?? 0) > 32_768) throw new Error("too_large");
  const reader = request.body?.getReader();
  if (!reader) return {};
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    bytes += r.value.byteLength;
    if (bytes > 32_768) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(r.value);
  }
  const all = new Uint8Array(bytes);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
async function refresh(
  deps: BillingDependencies,
  users: string[],
  eventId: string | null,
  request: Request,
) {
  const controller = new AbortController(),
    abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const timer = setTimeout(abort, 12_000);
  try {
    const results = [];
    for (const user of users) {
      const value = await deps.lookup(user, controller.signal);
      controller.signal.throwIfAborted();
      await deps.commit(value, eventId);
      results.push(value);
    }
    return results;
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createBillingStatusHandler(deps: BillingDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const cors: Record<string, string> =
      origin && deps.allowedOrigins.has(origin)
        ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
        : {};
    if (origin && !deps.allowedOrigins.has(origin))
      return json(403, { error: "origin_not_allowed" });
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
      });
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, cors);
    if (!deps.enabled) return json(503, { error: "billing_not_configured" }, cors);
    let user: string | null = null;
    try {
      user = await deps.authenticate(request);
    } catch {
      /*unauthenticated*/
    }
    if (!user || !uuid.test(user)) return json(401, { error: "authentication_required" }, cors);
    try {
      const [entitlement] = await refresh(deps, [user], null, request);
      return json(200, entitlement, cors);
    } catch {
      return json(503, { error: "billing_verification_unavailable" }, cors);
    }
  };
}
export function createBillingWebhookHandler(deps: BillingDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (!deps.enabled || deps.webhookSecret.length < 32)
      return json(503, { error: "billing_not_configured" });
    if (!secretEqual(request.headers.get("Authorization") ?? "", `Bearer ${deps.webhookSecret}`))
      return json(401, { error: "authentication_required" });
    let payload: Row;
    try {
      payload = record(await body(request));
    } catch {
      return json(400, { error: "invalid_body" });
    }
    const event = record(payload.event);
    if (typeof event.id !== "string" || event.id.length > 200 || !event.id)
      return json(400, { error: "invalid_event" });
    if (event.type === "TEST") return json(200, { received: true });
    const ids = [
      event.app_user_id,
      event.original_app_user_id,
      ...(Array.isArray(event.aliases) ? event.aliases : []),
      ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
      ...(Array.isArray(event.transferred_to) ? event.transferred_to : []),
    ];
    const users = [
      ...new Set(ids.filter((v): v is string => typeof v === "string" && uuid.test(v))),
    ];
    if (users.length > 20) return json(400, { error: "too_many_accounts" });
    if (users.length === 0) return json(200, { received: true, ignored: "anonymous_subscriber" });
    // Treat webhook fields as hints. Always retrieve current verified state, including
    // both sides of transfers; never revive access from an older RENEWAL payload.
    try {
      await refresh(deps, users, event.id, request);
      return json(200, { received: true });
    } catch {
      return json(503, { error: "retry_later" });
    }
  };
}
