import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Klient Supabase; null, gdy brak kluczy (aplikacja działa wtedy lokalnie bez logowania). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
