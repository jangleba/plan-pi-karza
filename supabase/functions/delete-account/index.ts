// @ts-nocheck – uruchamiane w Deno (Supabase Edge Functions); klucz administracyjny istnieje tylko tutaj, nigdy w kliencie.
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { deleteAccount } from "../_shared/account.ts";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, apikey, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || null;
  const out = await deleteAccount({
    verifyUser: async (t) => { const { data, error } = await admin.auth.getUser(t); return error || !data.user ? null : { id: data.user.id }; },
    eraseData: async (id) => { const { data, error } = await admin.rpc("erase_user_data", { p_user: id }); if (error) throw new Error(error.message); return data as { logId: string; deleted: Record<string, number> }; },
    deleteAuthUser: async (id) => { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw new Error(error.message); },
    finish: async (log, ok) => { await admin.rpc("finish_account_deletion", { p_log: log, p_ok: ok }); },
  }, jwt);
  return json(out.status, out.body);
});
