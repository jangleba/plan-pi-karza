import type { User } from "@supabase/supabase-js";
const ACTIVE = "ballwise:offline-owner:active";
const key = (id: string) => `ballwise:offline-owner:v1:${id}`;
const MAX_AGE = 7 * 86400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A local cache owner, never an access token or proof accepted by the server. */
export function rememberOfflineOwner(
  user: Pick<User, "id">,
  storage: Storage = localStorage,
  now = Date.now(),
) {
  if (!UUID.test(user.id)) return;
  try {
    storage.setItem(key(user.id), JSON.stringify({ id: user.id, authenticatedAt: now }));
    storage.setItem(ACTIVE, user.id);
  } catch {
    /* Offline mode is optional when storage is unavailable. */
  }
}
export function forgetOfflineOwner(id?: string, storage: Storage = localStorage) {
  try {
    const active = storage.getItem(ACTIVE);
    if (!id || active === id) storage.removeItem(ACTIVE);
    if (id) storage.removeItem(key(id));
  } catch {
    /* Logout must still work. */
  }
}
export function loadOfflineOwner(storage: Storage = localStorage, now = Date.now()): User | null {
  try {
    const id = storage.getItem(ACTIVE);
    if (!id || !UUID.test(id)) return null;
    const record: unknown = JSON.parse(storage.getItem(key(id)) ?? "null");
    if (
      !record ||
      typeof record !== "object" ||
      !("id" in record) ||
      record.id !== id ||
      !("authenticatedAt" in record) ||
      typeof record.authenticatedAt !== "number" ||
      record.authenticatedAt > now ||
      now - record.authenticatedAt > MAX_AGE
    )
      return null;
    return {
      id,
      aud: "offline-local-owner",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(record.authenticatedAt).toISOString(),
    };
  } catch {
    return null;
  }
}
