import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getScope, scoped } from "../lib/store";

/**
 * Wiadomości od trenera dla zawodnika. Ostatnie 20 trzymamy na urządzeniu, żeby „Dziś” pokazywało je także offline.
 * Dostęp pilnuje RLS: zawodnik czyta tylko swoje, trener pisze tylko do przypisanych (migracja 0010).
 */
export interface CoachMessage { id: string; kind: "message" | "plan_change"; body: string; createdAt: string; readAt: string | null }
interface Cache { fetchedAt: number; items: CoachMessage[] }
const KEY = "coachInbox";

function load(): Cache | null {
  try {
    const v = JSON.parse(scoped.getItem(KEY) ?? "null") as Cache | null;
    return v && Array.isArray(v.items) ? v : null;
  } catch { return null; }
}
const save = (c: Cache) => scoped.setItem(KEY, JSON.stringify(c));

export async function fetchInbox(): Promise<Cache | null> {
  if (!supabase || getScope().kind !== "user") return null;
  const { data, error } = await supabase.from("coach_messages").select("id,kind,body,created_at,read_at").order("created_at", { ascending: false }).limit(20);
  if (error || !data) return null;
  const c: Cache = { fetchedAt: Date.now(), items: (data as Array<{ id: string; kind: CoachMessage["kind"]; body: string; created_at: string; read_at: string | null }>).map((m) => ({ id: m.id, kind: m.kind, body: m.body, createdAt: m.created_at, readAt: m.read_at })) };
  save(c);
  return c;
}

export function useInbox() {
  const [cache, setCache] = useState<Cache | null>(load);
  const refresh = useCallback(async () => { const c = await fetchInbox().catch(() => null); if (c) setCache(c); }, []);
  useEffect(() => {
    void refresh();
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", refresh);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", refresh); };
  }, [refresh]);
  const markRead = useCallback(async (id: string) => {
    setCache((c) => { if (!c) return c; const n = { ...c, items: c.items.map((m) => (m.id === id ? { ...m, readAt: m.readAt ?? new Date().toISOString() } : m)) }; save(n); return n; });
    if (supabase) await supabase.rpc("mark_coach_message_read", { p_id: id }).then(() => undefined, () => undefined);
  }, []);
  return { items: cache?.items ?? [], fetchedAt: cache?.fetchedAt ?? null, refresh, markRead };
}
