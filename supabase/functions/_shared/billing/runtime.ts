import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { deletedBillingOwner, revenueCatEntitlement, type BillingDependencies } from "./handler.ts";
export function billingDependencies(): BillingDependencies {
  const url = Deno.env.get("SUPABASE_URL") ?? "",
    publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
    service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const secret = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "",
    entitlement = Deno.env.get("REVENUECAT_ENTITLEMENT_ID") ?? "pro";
  const products = new Set(
    (Deno.env.get("REVENUECAT_PRODUCT_IDS") ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  return {
    enabled: !!(url && publicKey && service && secret && products.size),
    webhookSecret: Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "",
    allowedOrigins: new Set(
      (Deno.env.get("BILLING_ALLOWED_ORIGINS") ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
    async authenticate(request) {
      const client = createClient(url, publicKey, {
        global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser();
      return error || !data.user || data.user.is_anonymous ? null : data.user.id;
    },
    async lookup(userId, signal) {
      const response = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
        {
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          signal,
        },
      );
      if (!response.ok) throw new Error("provider_unavailable");
      return revenueCatEntitlement(userId, await response.json(), entitlement, products);
    },
    async commit(value, eventId) {
      const client = createClient(url, service, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await client.rpc("record_billing_entitlement", {
        p_user_id: value.userId,
        p_status: value.status,
        p_expires_at: value.expiresAt,
        p_verified_at: value.verifiedAt,
        p_product_id: value.productId,
        p_store: value.store,
        p_event_id: eventId,
      });
      if (error && !deletedBillingOwner(error)) throw new Error("billing_persistence_unavailable");
    },
  };
}
