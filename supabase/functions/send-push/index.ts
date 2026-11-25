// @ts-nocheck – uruchamiane w Deno (Supabase Edge Functions).
// Wywoływane przez Database Webhook „INSERT na public.coach_messages” (panel Supabase → Database → Webhooks),
// z nagłówkiem x-webhook-secret = sekret PUSH_WEBHOOK_SECRET. Klucze VAPID i service role istnieją tylko tutaj.
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import webpush from "npm:web-push@3.6.7";
import { notifyPlayer, parseWebhook, sameSecret } from "../_shared/push.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:kontakt@example.invalid", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!sameSecret(req.headers.get("x-webhook-secret"), Deno.env.get("PUSH_WEBHOOK_SECRET"))) return json(401, { error: "unauthorized" });
  const msg = parseWebhook(await req.json().catch(() => null));
  if (!msg) return json(200, { skipped: true });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const out = await notifyPlayer(msg, {
    subscriptions: async (id) => {
      const { data, error } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth,topics").eq("user_id", id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    // TTL 24 h: wiadomość trenera ma sens jeszcze następnego dnia; urgency normal (nie budzimy telefonu w nocy priorytetem)
    send: (s, payload) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "normal" }),
    remove: async (endpoint) => { await admin.from("push_subscriptions").delete().eq("endpoint", endpoint); },
  });
  return json(200, out);
});
